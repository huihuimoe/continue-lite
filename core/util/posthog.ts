import os from "node:os";

import { IdeInfo } from "../index.js";

export enum PosthogFeatureFlag {
  AutocompleteTimeout = "autocomplete-timeout",
  RecentlyVisitedRangesNumSurroundingLines = "recently-visited-ranges-num-surrounding-lines",
}

export const EXPERIMENTS: {
  [key in PosthogFeatureFlag]: {
    [key: string]: { value: any };
  };
} = {
  [PosthogFeatureFlag.AutocompleteTimeout]: {
    control: { value: 150 },
    "250": { value: 250 },
    "350": { value: 350 },
    "450": { value: 450 },
  },
  [PosthogFeatureFlag.RecentlyVisitedRangesNumSurroundingLines]: {
    control: { value: null },
    "5": { value: 5 },
    "10": { value: 10 },
    "15": { value: 15 },
    "20": { value: 20 },
  },
};

type TelemetryClient = {
  capture(_payload: unknown): void;
  getFeatureFlag(_flag: string, _distinctId: string): unknown;
  shutdown(): void;
};

export class Telemetry {
  static client: TelemetryClient | undefined = undefined;
  static uniqueId = "NOT_UNIQUE";
  static os: string | undefined = undefined;
  static ideInfo: IdeInfo | undefined = undefined;

  static async captureError(_errorName: string, _error: unknown) {
    return;
  }

  static async capture(
    _event: string,
    _properties: { [key: string]: any },
    _sendToTeam: boolean = false,
    _isExtensionActivationError: boolean = false,
  ) {
    return;
  }

  static shutdownPosthogClient() {
    Telemetry.client = undefined;
  }

  static async getTelemetryClient(): Promise<TelemetryClient | undefined> {
    return undefined;
  }

  static async setup(_allow: boolean, uniqueId: string, ideInfo: IdeInfo) {
    Telemetry.uniqueId = uniqueId;
    Telemetry.os = os.platform();
    Telemetry.ideInfo = ideInfo;
    Telemetry.client = undefined;
  }

  private static featureValueCache: Record<string, any> = {};

  static async getFeatureFlag(flag: PosthogFeatureFlag) {
    const value = Telemetry.client?.getFeatureFlag(flag, Telemetry.uniqueId);
    Telemetry.featureValueCache[flag] = value;
    return value;
  }

  static async getValueForFeatureFlag(flag: PosthogFeatureFlag) {
    if (Telemetry.featureValueCache[flag]) {
      return Telemetry.featureValueCache[flag];
    }

    const userGroup = await Telemetry.getFeatureFlag(flag);
    if (typeof userGroup === "string") {
      return EXPERIMENTS[flag][userGroup].value;
    }

    return undefined;
  }
}
