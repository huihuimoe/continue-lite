import fs from "fs";
import path from "path";

import { ConfigHandler } from "core/config/ConfigHandler";
import { EXTENSION_NAME } from "core/control-plane/env";
import { Core } from "core/core";
import { FromCoreProtocol, ToCoreProtocol } from "core/protocol";
import { InProcessMessenger } from "core/protocol/messenger";
import {
  getConfigJsonPath,
  getConfigTsPath,
  getConfigYamlPath,
  getContinueGlobalPath,
} from "core/util/paths";
import * as vscode from "vscode";

import { ContinueCompletionProvider } from "../autocomplete/completionProvider";
import {
  monitorBatteryChanges,
  setupStatusBar,
  StatusBarStatus,
} from "../autocomplete/statusBar";
import {
  HandlerPriority,
  SelectionChangeManager,
} from "../activation/SelectionChangeManager";
import { JumpManager } from "../activation/JumpManager";
import setupNextEditWindowManager, {
  NextEditWindowManager,
} from "../activation/NextEditWindowManager";
import { GhostTextAcceptanceTracker } from "../autocomplete/GhostTextAcceptanceTracker";
import { getDefinitionsFromLsp } from "../autocomplete/lsp";
import { registerAllCommands } from "../commands";
import { Battery } from "../util/battery";
import {
  clearDocumentContentCache,
  handleTextDocumentChange,
  initDocumentContentCache,
} from "../util/editLoggingUtils";
import { VsCodeIdeUtils } from "../util/ideUtils";
import { VsCodeIde } from "../VsCodeIde";

import { modelSupportsNextEdit } from "core/llm/autodetect";
import { NEXT_EDIT_MODELS } from "core/llm/constants";
import { NextEditProvider } from "core/nextEdit/NextEditProvider";
import { isNextEditTest } from "core/nextEdit/utils";

export class VsCodeExtension {
  private readonly configHandler: ConfigHandler;
  private readonly ide: VsCodeIde;
  private readonly ideUtils = new VsCodeIdeUtils();
  private readonly core: Core;
  private readonly battery: Battery;
  private readonly completionProvider: ContinueCompletionProvider;
  private readonly ARBITRARY_TYPING_DELAY = 2000;

  private registerCoreRequestHandlers(
    messenger: InProcessMessenger<ToCoreProtocol, FromCoreProtocol>,
  ) {
    messenger.externalOn("getIdeInfo", () => this.ide.getIdeInfo());
    messenger.externalOn("getIdeSettings", () => this.ide.getIdeSettings());
  }

  private async getUsingFullFileDiff(): Promise<boolean> {
    const { config } = await this.configHandler.loadConfig();
    const autocompleteModel = config?.selectedModelByRole.autocomplete;

    if (!autocompleteModel) {
      return false;
    }

    if (
      !modelSupportsNextEdit(
        autocompleteModel.capabilities,
        autocompleteModel.model,
        autocompleteModel.title,
      )
    ) {
      return false;
    }

    return !autocompleteModel.model.includes(NEXT_EDIT_MODELS.INSTINCT);
  }

  private getStatusBarState(): StatusBarStatus {
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const enabled = config.get<boolean>("enableTabAutocomplete") ?? true;
    if (!enabled) {
      return StatusBarStatus.Disabled;
    }

    const pauseOnBattery =
      config.get<boolean>("pauseTabAutocompleteOnBattery") ?? false;
    return pauseOnBattery && !this.battery.isACConnected()
      ? StatusBarStatus.Paused
      : StatusBarStatus.Enabled;
  }

  private async updateNextEditState(
    context: vscode.ExtensionContext,
  ): Promise<void> {
    const { config: continueConfig } = await this.configHandler.loadConfig();
    const autocompleteModel = continueConfig?.selectedModelByRole.autocomplete;
    const vscodeConfig = vscode.workspace.getConfiguration(EXTENSION_NAME);

    const modelSupportsNext =
      autocompleteModel &&
      modelSupportsNextEdit(
        autocompleteModel.capabilities,
        autocompleteModel.model,
        autocompleteModel.title,
      );

    let nextEditEnabled = vscodeConfig.get<boolean>("enableNextEdit");
    if (nextEditEnabled === undefined) {
      nextEditEnabled = modelSupportsNext ?? false;
      await vscodeConfig.update(
        "enableNextEdit",
        nextEditEnabled,
        vscode.ConfigurationTarget.Global,
      );
    }

    if (
      nextEditEnabled &&
      !modelSupportsNext &&
      !isNextEditTest() &&
      process.env.CONTINUE_E2E_NON_NEXT_EDIT_TEST === "true"
    ) {
      void vscode.window
        .showWarningMessage(
          `The current autocomplete model (${autocompleteModel?.title || "unknown"}) does not support Next Edit.`,
          "Disable Next Edit",
          "Select different model",
        )
        .then((selection) => {
          if (selection === "Disable Next Edit") {
            void vscodeConfig.update(
              "enableNextEdit",
              false,
              vscode.ConfigurationTarget.Global,
            );
          } else if (selection === "Select different model") {
            void vscode.commands.executeCommand(
              "continue.openTabAutocompleteConfigMenu",
            );
          }
        });
    }

    const shouldEnableNextEdit =
      (modelSupportsNext && nextEditEnabled) || isNextEditTest();

    if (shouldEnableNextEdit) {
      await setupNextEditWindowManager(context);
      this.activateNextEdit();
      await NextEditWindowManager.freeTabAndEsc();

      JumpManager.getInstance().registerSelectionChangeHandler();
      GhostTextAcceptanceTracker.getInstance().registerSelectionChangeHandler();
      NextEditWindowManager.getInstance().registerSelectionChangeHandler();
      return;
    }

    NextEditWindowManager.clearInstance();
    this.deactivateNextEdit();
    await NextEditWindowManager.freeTabAndEsc();
    JumpManager.clearInstance();
    GhostTextAcceptanceTracker.clearInstance();
  }

  constructor(context: vscode.ExtensionContext) {
    this.ide = new VsCodeIde(context);

    const messenger = new InProcessMessenger<
      ToCoreProtocol,
      FromCoreProtocol
    >();
    this.registerCoreRequestHandlers(messenger);

    this.core = new Core(messenger, this.ide);
    this.configHandler = this.core.configHandler;
    void this.configHandler.loadConfig();

    const usingFullFileDiff = true;
    const selectionManager = SelectionChangeManager.getInstance();
    selectionManager.initialize(this.ide, usingFullFileDiff);
    selectionManager.registerListener(
      "typing",
      async (_event, state) => {
        const timeSinceLastDocChange =
          Date.now() - state.lastDocumentChangeTime;
        if (
          state.isTypingSession &&
          timeSinceLastDocChange < this.ARBITRARY_TYPING_DELAY &&
          !NextEditWindowManager.getInstance().hasAccepted()
        ) {
          return true;
        }

        return false;
      },
      HandlerPriority.NORMAL,
    );

    this.battery = new Battery();
    context.subscriptions.push(this.battery);
    context.subscriptions.push(monitorBatteryChanges(this.battery));

    setupStatusBar(this.getStatusBarState());
    this.completionProvider = new ContinueCompletionProvider(
      this.configHandler,
      this.ide,
      usingFullFileDiff,
    );

    context.subscriptions.push(
      vscode.languages.registerInlineCompletionItemProvider(
        [{ pattern: "**" }],
        this.completionProvider,
      ),
    );

    registerAllCommands(context, this.battery, this.configHandler);

    void this.configHandler.loadConfig().then(async () => {
      const shouldUseFullFileDiff = await this.getUsingFullFileDiff();
      this.completionProvider.updateUsingFullFileDiff(shouldUseFullFileDiff);
      selectionManager.updateUsingFullFileDiff(shouldUseFullFileDiff);
      await this.updateNextEditState(context);
    });

    this.configHandler.onConfigUpdate(
      async ({ config: newConfig, configLoadInterrupted }) => {
        const shouldUseFullFileDiff = await this.getUsingFullFileDiff();
        this.completionProvider.updateUsingFullFileDiff(shouldUseFullFileDiff);
        selectionManager.updateUsingFullFileDiff(shouldUseFullFileDiff);
        await this.updateNextEditState(context);

        if (configLoadInterrupted) {
          setupStatusBar(undefined, undefined, true);
        } else if (newConfig) {
          setupStatusBar(this.getStatusBarState(), undefined, false);
        }
      },
    );

    fs.watchFile(getConfigJsonPath(), { interval: 1000 }, async (stats) => {
      if (stats.size === 0) {
        return;
      }

      await this.configHandler.reloadConfig(
        "Global JSON config updated - fs file watch",
      );
    });

    fs.watchFile(
      getConfigYamlPath("vscode"),
      { interval: 1000 },
      async (stats) => {
        if (stats.size === 0) {
          return;
        }

        await this.configHandler.reloadConfig(
          "Global YAML config updated - fs file watch",
        );
      },
    );

    fs.watchFile(getConfigTsPath(), { interval: 1000 }, (stats) => {
      if (stats.size === 0) {
        return;
      }

      void this.configHandler.reloadConfig("config.ts updated - fs file watch");
    });

    const globalRulesDir = path.join(getContinueGlobalPath(), "rules");
    if (fs.existsSync(globalRulesDir)) {
      fs.watch(globalRulesDir, { recursive: true }, (_eventType, filename) => {
        if (filename && filename.endsWith(".md")) {
          void this.configHandler.reloadConfig(
            "Global rules directory updated - fs file watch",
          );
        }
      });
    }

    vscode.workspace.onDidOpenTextDocument((document) => {
      initDocumentContentCache(document);
    });

    for (const document of vscode.workspace.textDocuments) {
      initDocumentContentCache(document);
    }

    vscode.workspace.onDidChangeTextDocument(async (event) => {
      if (event.contentChanges.length > 0) {
        selectionManager.documentChanged();
      }

      const editInfo = await handleTextDocumentChange(
        event,
        this.configHandler,
        this.ide,
        this.completionProvider,
        getDefinitionsFromLsp,
      );

      if (editInfo) {
        this.core.invoke("files/smallEdit", editInfo);
      }
    });

    vscode.workspace.onDidSaveTextDocument(async (event) => {
      this.core.invoke("files/changed", {
        uris: [event.uri.toString()],
      });
    });

    vscode.workspace.onDidDeleteFiles(async (event) => {
      this.core.invoke("files/deleted", {
        uris: event.files.map((uri) => uri.toString()),
      });
    });

    vscode.workspace.onDidCloseTextDocument(async (event) => {
      clearDocumentContentCache(event.uri.toString());
      this.core.invoke("files/closed", {
        uris: [event.uri.toString()],
      });
    });

    vscode.workspace.onDidCreateFiles(async (event) => {
      this.core.invoke("files/created", {
        uris: event.files.map((uri) => uri.toString()),
      });
    });

    vscode.window.onDidChangeVisibleTextEditors(async () => {
      await NextEditProvider.getInstance().deleteChain();
    });

    vscode.window.onDidChangeTextEditorSelection(async (event) => {
      await selectionManager.handleSelectionChange(event);
    });

    this.ide.onDidChangeActiveTextEditor((filepath) => {
      void this.core.invoke("files/opened", { uris: [filepath] });
    });

    const initialOpenedFilePaths = this.ideUtils
      .getOpenFiles()
      .map((uri) => uri.toString());
    this.core.invoke("files/opened", { uris: initialOpenedFilePaths });

    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration(EXTENSION_NAME)) {
        return;
      }

      const settings = await this.ide.getIdeSettings();
      void this.core.invoke("config/ideSettingsUpdate", settings);

      if (
        event.affectsConfiguration(`${EXTENSION_NAME}.enableTabAutocomplete`) ||
        event.affectsConfiguration(
          `${EXTENSION_NAME}.pauseTabAutocompleteOnBattery`,
        )
      ) {
        setupStatusBar(this.getStatusBarState());
      }

      if (event.affectsConfiguration(`${EXTENSION_NAME}.enableNextEdit`)) {
        await this.updateNextEditState(context);
      }
    });
  }

  public activateNextEdit() {
    this.completionProvider.activateNextEdit();
  }

  public deactivateNextEdit() {
    this.completionProvider.deactivateNextEdit();
  }
}
