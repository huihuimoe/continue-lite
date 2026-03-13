import { RequestOptions } from "@continuedev/config-types";
import { Agent, Dispatcher, ProxyAgent } from "undici";
import { getAgentOptions } from "./getAgentOptions.js";
import { getProxy, shouldBypassProxy } from "./util.js";

type TlsConnectOptions = {
  ca?: string[];
  rejectUnauthorized?: boolean;
  cert?: string;
  key?: string;
  passphrase?: string;
};

type CompatAgentOptions = {
  ca?: string[];
  rejectUnauthorized?: boolean;
  cert?: string;
  key?: string;
  passphrase?: string;
  timeout?: number;
};

type CompatTimeoutOptions = {
  bodyTimeout?: number;
  connectTimeout?: number;
};

type CompatTransport = {
  dispatcher: Dispatcher;
  signal?: AbortSignal;
  proxy?: string;
  shouldBypassProxy: boolean;
  close: () => Promise<void>;
};

function toTlsConnectOptions(options: CompatAgentOptions): TlsConnectOptions {
  return {
    ca: options.ca,
    rejectUnauthorized: options.rejectUnauthorized,
    cert: options.cert,
    key: options.key,
    passphrase: options.passphrase,
  };
}

function toCompatTimeoutOptions(
  options: CompatAgentOptions,
): CompatTimeoutOptions {
  if (options.timeout === undefined) {
    return {};
  }

  return {
    bodyTimeout: options.timeout,
    connectTimeout: options.timeout,
  };
}

function mergeSignals(
  initSignal: AbortSignal | null | undefined,
  _timeoutMs: number | undefined,
): AbortSignal | undefined {
  return initSignal ?? undefined;
}

export async function createCompatTransport(
  url: URL,
  requestOptions?: RequestOptions,
  initSignal?: AbortSignal | null,
): Promise<CompatTransport> {
  const proxy = getProxy(url.protocol, requestOptions);
  const shouldBypass = shouldBypassProxy(url.host, requestOptions);
  const agentOptions = (await getAgentOptions(
    requestOptions,
  )) as CompatAgentOptions;
  const tlsOptions = toTlsConnectOptions(agentOptions);
  const timeoutOptions = toCompatTimeoutOptions(agentOptions);

  const dispatcher =
    proxy && !shouldBypass
      ? new ProxyAgent({
          uri: proxy,
          requestTls: tlsOptions,
          ...timeoutOptions,
        })
      : new Agent({
          connect: tlsOptions,
          ...timeoutOptions,
        });

  return {
    dispatcher,
    signal: mergeSignals(initSignal, agentOptions.timeout),
    proxy,
    shouldBypassProxy: shouldBypass,
    close: async () => {
      await dispatcher.close();
    },
  };
}
