import { IdeInfo } from "../../index.js";

export type SentryClient = undefined;
export type SentryScope = undefined;
export type SentrySeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";
export type SentryExtras = Record<string, any>;

export class SentryLogger {
  static client: SentryClient = undefined;
  static scope: SentryScope = undefined;
  static uniqueId = "NOT_UNIQUE";
  static os: string | undefined = undefined;
  static ideInfo: IdeInfo | undefined = undefined;
  static allowTelemetry = false;

  static get lazyClient(): SentryClient {
    return undefined;
  }

  static get lazyScope(): SentryScope {
    return undefined;
  }

  static async setup(
    allowAnonymousTelemetry: boolean,
    uniqueId: string,
    ideInfo: IdeInfo,
    _userEmail?: string,
  ) {
    SentryLogger.allowTelemetry = allowAnonymousTelemetry;
    SentryLogger.uniqueId = uniqueId;
    SentryLogger.ideInfo = ideInfo;
    SentryLogger.client = undefined;
    SentryLogger.scope = undefined;
  }

  static shutdownSentryClient() {
    SentryLogger.client = undefined;
    SentryLogger.scope = undefined;
  }
}

export function initializeSentry(): {
  client: SentryClient;
  scope: SentryScope;
} {
  return {
    client: undefined,
    scope: undefined,
  };
}

export function createSpan<T>(
  _operation: string,
  _name: string,
  callback: () => T | Promise<T>,
): T | Promise<T> {
  return callback();
}

export function captureException(
  _error: Error,
  _context?: Record<string, any>,
) {
  return;
}

export function captureLog(
  _message: string,
  _level: SentrySeverityLevel = "info",
  _context?: SentryExtras,
) {
  return;
}
