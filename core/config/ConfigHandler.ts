import {
  ConfigResult,
  ConfigValidationError,
  ModelRole,
} from "@continuedev/config-yaml";

import EventEmitter from "node:events";

import { ControlPlaneClient } from "../control-plane/client.js";
import {
  BrowserSerializedContinueConfig,
  ContinueConfig,
  IDE,
  IdeSettings,
  ILLMLogger,
} from "../index.js";
import { GlobalContext } from "../util/GlobalContext.js";
import { Logger } from "../util/Logger.js";
import LocalProfileLoader from "./profile/LocalProfileLoader.js";
import {
  ProfileDescription,
  ProfileLifecycleManager,
} from "./ProfileLifecycleManager.js";

export type { ProfileDescription };

type ConfigUpdateFunction = (payload: ConfigResult<ContinueConfig>) => void;

export class ConfigHandler {
  controlPlaneClient: ControlPlaneClient;
  private readonly globalContext = new GlobalContext();
  private profileManager: ProfileLifecycleManager | null;
  totalConfigReloads = 0;

  public isInitialized: Promise<void>;
  private initter: EventEmitter;

  constructor(
    private readonly ide: IDE,
    private llmLogger: ILLMLogger,
    _initialSessionInfoPromise?: Promise<unknown>,
  ) {
    this.controlPlaneClient = new ControlPlaneClient(
      Promise.resolve(undefined),
      this.ide,
    );
    this.profileManager = this.createLocalProfileManager();

    this.initter = new EventEmitter();
    this.isInitialized = new Promise((resolve) => {
      this.initter.on("init", resolve);
    });

    void this.reloadConfig("Config handler initialization");
  }

  private createLocalProfileManager(): ProfileLifecycleManager {
    return new ProfileLifecycleManager(
      new LocalProfileLoader(this.ide, this.controlPlaneClient, this.llmLogger),
      this.ide,
    );
  }

  async refreshAll(reason?: string) {
    this.profileManager = this.createLocalProfileManager();
    await this.reloadConfig(reason ?? "External refresh all");
  }

  async updateIdeSettings(_ideSettings: IdeSettings) {
    await this.refreshAll("IDE settings update");
  }

  async reloadConfig(reason: string, injectErrors?: ConfigValidationError[]) {
    const startTime = performance.now();
    this.totalConfigReloads += 1;

    if (!this.profileManager) {
      const out = {
        config: undefined,
        errors: injectErrors,
        configLoadInterrupted: true,
      };
      this.notifyConfigListeners(out);
      return out;
    }

    const {
      config,
      errors = [],
      configLoadInterrupted,
    } = await this.profileManager.reloadConfig();

    if (injectErrors) {
      errors.unshift(...injectErrors);
    }

    this.notifyConfigListeners({ config, errors, configLoadInterrupted });
    this.initter.emit("init");

    const endTime = performance.now();
    const duration = endTime - startTime;
    const profileDescription = this.profileManager.profileDescription;

    if (errors.length) {
      Logger.error("Errors loading config: ", errors);
    }

    return {
      config,
      errors: errors.length ? errors : undefined,
      configLoadInterrupted,
    };
  }

  private notifyConfigListeners(result: ConfigResult<ContinueConfig>) {
    for (const listener of this.updateListeners) {
      listener(result);
    }
  }

  private updateListeners: ConfigUpdateFunction[] = [];

  onConfigUpdate(listener: ConfigUpdateFunction) {
    this.updateListeners.push(listener);
  }

  async getSerializedConfig(): Promise<
    ConfigResult<BrowserSerializedContinueConfig>
  > {
    await this.isInitialized;
    if (!this.profileManager) {
      return {
        config: undefined,
        errors: undefined,
        configLoadInterrupted: true,
      };
    }
    return await this.profileManager.getSerializedConfig();
  }

  async loadConfig(): Promise<ConfigResult<ContinueConfig>> {
    if (!this.profileManager) {
      return {
        config: undefined,
        errors: undefined,
        configLoadInterrupted: true,
      };
    }
    await this.isInitialized;
    return await this.profileManager.loadConfig();
  }

  getActiveProfile(): ProfileLifecycleManager | null {
    return this.profileManager;
  }

  async updateSelectedModel(
    role: ModelRole,
    title: string | null,
    profileId: string | undefined = this.profileManager?.profileDescription.id,
  ): Promise<void> {
    if (!profileId) {
      return;
    }

    this.globalContext.updateSelectedModel(profileId, role, title);
    await this.reloadConfig("Selected model update");
  }
}
