import * as URI from "uri-js";

import { CompletionProvider } from "./autocomplete/CompletionProvider";
import {
  openedFilesLruCache,
  prevFilepaths,
} from "./autocomplete/util/openedFilesLruCache";
import { ConfigHandler } from "./config/ConfigHandler";
import { DataLogger } from "./data/log";
import { isSecurityConcern } from "./util/ignore";
import { EditAggregator } from "./nextEdit/context/aggregateEdits";
import { GlobalContext } from "./util/GlobalContext";
import { migrateV1DevDataFiles } from "./util/paths";
import { Telemetry } from "./util/posthog";

import { IdeSettings, Position, type IDE } from ".";

import { getDiffFn, GitDiffCache } from "./autocomplete/snippets/gitDiffCache";
import {
  isColocatedRulesFile,
  isContinueAgentConfigFile,
  isContinueConfigRelatedUri,
} from "./config/loadLocalAssistants";
import { CodebaseRulesCache } from "./config/markdown/loadCodebaseRules";
import { walkDirCache } from "./util/walkDir";
import { LLMLogger } from "./llm/logger";
import { BeforeAfterDiff } from "./nextEdit/context/diffFormatting";
import { processSmallEdit } from "./nextEdit/context/processSmallEdit";
import { NextEditProvider } from "./nextEdit/NextEditProvider";
import type { FromCoreProtocol, ToCoreProtocol } from "./protocol";
import type { IMessenger, Message } from "./protocol/messenger";
import { Logger } from "./util/Logger.js";

async function shouldIgnore(uri: string, _ide: IDE): Promise<boolean> {
  return isSecurityConcern(uri);
}

export class Core {
  configHandler!: ConfigHandler;
  completionProvider!: CompletionProvider;
  nextEditProvider!: NextEditProvider;
  private globalContext = new GlobalContext();
  llmLogger = new LLMLogger();

  private messageAbortControllers = new Map<string, AbortController>();

  private abortById(messageId?: string) {
    if (!messageId) {
      return;
    }

    this.messageAbortControllers.get(messageId)?.abort();
    this.messageAbortControllers.delete(messageId);
  }

  invoke<T extends keyof ToCoreProtocol>(
    messageType: T,
    data: ToCoreProtocol[T][0],
  ): ToCoreProtocol[T][1] {
    return this.messenger.invoke(messageType, data);
  }

  send<T extends keyof FromCoreProtocol>(
    messageType: T,
    data: FromCoreProtocol[T][0],
    messageId?: string,
  ): string {
    return this.messenger.send(messageType, data, messageId);
  }

  // TODO: It shouldn't actually need an IDE type, because this can happen
  // through the messenger (it does in the case of any non-VS Code IDEs already)
  constructor(
    private readonly messenger: IMessenger<ToCoreProtocol, FromCoreProtocol>,
    private readonly ide: IDE,
  ) {
    try {
      // Ensure .continue directory is created
      migrateV1DevDataFiles();

      const ideInfoPromise = messenger.request("getIdeInfo", undefined);
      const ideSettingsPromise = messenger.request("getIdeSettings", undefined);
      const initialSessionInfoPromise = Promise.resolve(undefined);

      this.configHandler = new ConfigHandler(
        this.ide,
        this.llmLogger,
        initialSessionInfoPromise,
      );

      this.configHandler.onConfigUpdate((_result) => {
        void (async () => {
          const serializedResult =
            await this.configHandler.getSerializedConfig();
          this.messenger.send("configUpdate", {
            result: serializedResult,
          });
        })();
      });

      const dataLogger = DataLogger.getInstance();
      dataLogger.core = this;
      dataLogger.ideInfoPromise = ideInfoPromise;
      dataLogger.ideSettingsPromise = ideSettingsPromise;

      const getLlm = async () => {
        const { config } = await this.configHandler.loadConfig();
        if (!config) {
          return undefined;
        }
        return config.selectedModelByRole.autocomplete ?? undefined;
      };
      this.completionProvider = new CompletionProvider(
        this.configHandler,
        ide,
        getLlm,
        (e) => {},
        (..._) => Promise.resolve([]),
      );

      const codebaseRulesCache = CodebaseRulesCache.getInstance();
      void codebaseRulesCache
        .refresh(ide)
        .catch((e) =>
          Logger.error("Failed to initialize colocated rules cache"),
        )
        .then(() => {
          void this.configHandler.reloadConfig(
            "Initial codebase rules post-walkdir/load reload",
          );
        });
      this.nextEditProvider = NextEditProvider.initialize(
        this.configHandler,
        ide,
        getLlm,
        (e) => {},
        (..._) => Promise.resolve([]),
        "fineTuned",
      );

      this.registerMessageHandlers(ideSettingsPromise);
    } catch (error) {
      Logger.error(error);
      throw error; // Re-throw to prevent partially initialized core
    }
  }

  /* eslint-disable max-lines-per-function */
  private registerMessageHandlers(_ideSettingsPromise: Promise<IdeSettings>) {
    const on = this.messenger.on.bind(this.messenger);

    // Note, VsCode's in-process messenger doesn't do anything with this
    // It will only show for jetbrains
    this.messenger.onError((_message, err) => {
      void Telemetry.capture("core_messenger_error", {
        message: err.message,
        stack: err.stack,
      });

      void this.ide.showToast("error", err.message);
    });

    on("abort", (msg) => {
      this.abortById(msg.data ?? msg.messageId);
    });

    on("ping", (msg) => {
      if (msg.data !== "ping") {
        throw new Error("ping message incorrect");
      }
      return "pong";
    });

    on("devdata/log", async (msg) => {
      void DataLogger.getInstance().logDevData(msg.data);
    });

    on("config/ideSettingsUpdate", async (msg) => {
      await this.configHandler.updateIdeSettings(msg.data);
    });

    // Autocomplete
    on("autocomplete/complete", async (msg) => {
      const outcome =
        await this.completionProvider.provideInlineCompletionItems(
          msg.data,
          undefined,
        );
      return outcome ? [outcome.completion] : [];
    });
    on("autocomplete/accept", async (msg) => {
      this.completionProvider.accept(msg.data.completionId);
    });
    on("autocomplete/cancel", async (_msg) => {
      this.completionProvider.cancel();
    });

    // Next Edit
    on("nextEdit/predict", async (msg) => {
      const outcome = await this.nextEditProvider.provideInlineCompletionItems(
        msg.data.input,
        undefined,
        {
          withChain: msg.data.options?.withChain ?? false,
          usingFullFileDiff: msg.data.options?.usingFullFileDiff ?? true,
        },
      );
      return outcome;
      // ? [outcome.completion, outcome.originalEditableRange]
    });
    on("nextEdit/accept", async (msg) => {
      console.log("nextEdit/accept");
      this.nextEditProvider.accept(msg.data.completionId);
    });
    on("nextEdit/reject", async (msg) => {
      console.log("nextEdit/reject");
      this.nextEditProvider.reject(msg.data.completionId);
    });
    on("nextEdit/startChain", async (_msg) => {
      console.log("nextEdit/startChain");
      NextEditProvider.getInstance().startChain();
      return;
    });

    on("nextEdit/deleteChain", async (_msg) => {
      console.log("nextEdit/deleteChain");
      await NextEditProvider.getInstance().deleteChain();
      return;
    });

    on("nextEdit/isChainAlive", async (_msg) => {
      console.log("nextEdit/isChainAlive");
      return NextEditProvider.getInstance().chainExists();
    });

    // File changes - TODO - remove remaining logic for these from IDEs where possible
    on("files/changed", this.handleFilesChanged.bind(this));

    on("files/created", async ({ data }) => {
      if (!data?.uris?.length) {
        return;
      }

      walkDirCache.invalidate();

      const colocatedRulesUris = data.uris.filter(isColocatedRulesFile);
      const nonColocatedRuleUris = data.uris.filter(
        (uri) => !isColocatedRulesFile(uri),
      );
      if (colocatedRulesUris) {
        const rulesCache = CodebaseRulesCache.getInstance();
        void Promise.all(
          colocatedRulesUris.map((uri) => rulesCache.update(this.ide, uri)),
        ).then(() => {
          void this.configHandler.reloadConfig("Codebase rule file created");
        });
      }

      // If it's a local config being created, we want to reload all configs so it shows up in the list
      if (nonColocatedRuleUris.some(isContinueAgentConfigFile)) {
        await this.configHandler.refreshAll("Local config file created");
      } else if (nonColocatedRuleUris.some(isContinueConfigRelatedUri)) {
        await this.configHandler.reloadConfig(
          ".continue config-related file created",
        );
      }
    });

    on("files/deleted", async ({ data }) => {
      if (!data?.uris?.length) {
        return;
      }

      walkDirCache.invalidate();

      const colocatedRulesUris = data.uris.filter(isColocatedRulesFile);
      const nonColocatedRuleUris = data.uris.filter(
        (uri) => !isColocatedRulesFile(uri),
      );

      if (colocatedRulesUris) {
        const rulesCache = CodebaseRulesCache.getInstance();
        void Promise.all(
          colocatedRulesUris.map((uri) => rulesCache.remove(uri)),
        ).then(() => {
          void this.configHandler.reloadConfig("Codebase rule file deleted");
        });
      }

      // If it's a local config being deleted, we want to reload all configs so it disappears from the list
      if (nonColocatedRuleUris.some(isContinueAgentConfigFile)) {
        await this.configHandler.refreshAll("Local config file deleted");
      } else if (nonColocatedRuleUris.some(isContinueConfigRelatedUri)) {
        await this.configHandler.reloadConfig(
          ".continue config-related file deleted",
        );
      }
    });

    on("files/closed", async ({ data }) => {
      console.debug("deleteChain called from files/closed");
      await NextEditProvider.getInstance().deleteChain();

      try {
        const fileUris = await this.ide.getOpenFiles();
        if (fileUris) {
          const filepaths = fileUris.map((uri) => uri.toString());

          if (!prevFilepaths.filepaths.length) {
            prevFilepaths.filepaths = filepaths;
          }

          // If there is a removal, including if the number of tabs is the same (which can happen with temp tabs)
          if (filepaths.length <= prevFilepaths.filepaths.length) {
            // Remove files from cache that are no longer open (i.e. in the cache but not in the list of opened tabs)
            for (const [key, _] of openedFilesLruCache.entriesDescending()) {
              if (!filepaths.includes(key)) {
                openedFilesLruCache.delete(key);
              }
            }
          }
          prevFilepaths.filepaths = filepaths;
        }
      } catch (e) {
        Logger.error(
          `didChangeVisibleTextEditors: failed to update openedFilesLruCache`,
        );
      }

      if (data.uris) {
        this.messenger.send("didCloseFiles", {
          uris: data.uris,
        });
      }
    });

    on("files/opened", async ({ data: { uris } }) => {
      if (uris) {
        for (const filepath of uris) {
          try {
            const ignore = await shouldIgnore(filepath, this.ide);
            if (!ignore) {
              // Set the active file as most recently used (need to force recency update by deleting and re-adding)
              if (openedFilesLruCache.has(filepath)) {
                openedFilesLruCache.delete(filepath);
              }
              openedFilesLruCache.set(filepath, filepath);
            }
          } catch (e) {
            Logger.error(
              `files/opened: failed to update openedFiles cache for ${filepath}`,
            );
          }
        }
      }
    });

    on("files/smallEdit", async ({ data }) => {
      const EDIT_AGGREGATION_OPTIONS = {
        deltaT: 1.0,
        deltaL: 5,
        maxEdits: 500,
        maxDuration: 120.0,
        contextSize: 5,
      };

      EditAggregator.getInstance(
        EDIT_AGGREGATION_OPTIONS,
        (
          beforeAfterdiff: BeforeAfterDiff,
          cursorPosBeforeEdit: Position,
          cursorPosAfterPrevEdit: Position,
        ) => {
          void processSmallEdit(
            beforeAfterdiff,
            cursorPosBeforeEdit,
            cursorPosAfterPrevEdit,
            data.configHandler,
            data.getDefsFromLspFunction,
            this.ide,
          );
        },
      );

      const workspaceDir =
        data.actions.length > 0 ? data.actions[0].workspaceDir : undefined;

      // Store the latest context data
      const instance = EditAggregator.getInstance();
      (instance as any).latestContextData = {
        configHandler: data.configHandler,
        getDefsFromLspFunction: data.getDefsFromLspFunction,
        recentlyEditedRanges: data.recentlyEditedRanges,
        recentlyVisitedRanges: data.recentlyVisitedRanges,
        workspaceDir: workspaceDir,
      };

      // queueMicrotask prevents blocking the UI thread during typing
      queueMicrotask(() => {
        void EditAggregator.getInstance().processEdits(data.actions);
      });
    });
  }

  private async handleFilesChanged({
    data,
  }: Message<{
    uris?: string[];
  }>): Promise<void> {
    if (data?.uris?.length) {
      const diffCache = GitDiffCache.getInstance(getDiffFn(this.ide));
      diffCache.invalidate();
      walkDirCache.invalidate(); // safe approach for now - TODO - only invalidate on relevant changes
      const currentProfileUri =
        this.configHandler.getActiveProfile()?.profileDescription.uri ?? "";
      for (const uri of data.uris) {
        if (URI.equal(uri, currentProfileUri)) {
          // Trigger a toast notification to provide UI feedback that config has been updated
          const showToast =
            this.globalContext.get("showConfigUpdateToast") ?? true;
          if (showToast) {
            const selection = await this.ide.showToast(
              "info",
              "Config updated",
              "Don't show again",
            );
            if (selection === "Don't show again") {
              this.globalContext.update("showConfigUpdateToast", false);
            }
          }
          await this.configHandler.reloadConfig(
            "Current profile config file updated",
          );
          continue;
        }
        if (isColocatedRulesFile(uri)) {
          try {
            const codebaseRulesCache = CodebaseRulesCache.getInstance();
            void codebaseRulesCache.update(this.ide, uri).then(() => {
              void this.configHandler.reloadConfig("Codebase rule update");
            });
          } catch (e) {
            Logger.error(`Failed to update codebase rule: ${e}`);
          }
        } else if (isContinueConfigRelatedUri(uri)) {
          await this.configHandler.reloadConfig(
            "Local config-related file updated",
          );
        } else if (
          uri.endsWith(".continueignore") ||
          uri.endsWith(".gitignore")
        ) {
          walkDirCache.invalidate();
        }
      }
    }
  }
}
