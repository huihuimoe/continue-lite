import { ChatMessage, PromptLog } from "..";
import { ConfigHandler } from "../config/ConfigHandler";
import { usesCreditsBasedApiKey } from "../config/usesFreeTrialApiKey";
import { FromCoreProtocol, ToCoreProtocol } from "../protocol";
import { IMessenger, Message } from "../protocol/messenger";
import { Telemetry } from "../util/posthog";
import { isOutOfStarterCredits } from "./utils/starterCredits";

type StreamChatPayload = {
  messages: ChatMessage[];
  completionOptions: any;
  title: string;
  messageOptions?: any;
};

export async function* llmStreamChat(
  configHandler: ConfigHandler,
  abortController: AbortController,
  msg: Message<StreamChatPayload>,
  messenger: IMessenger<ToCoreProtocol, FromCoreProtocol>,
): AsyncGenerator<ChatMessage, PromptLog> {
  const { config } = await configHandler.loadConfig();
  if (!config) {
    throw new Error("Config not loaded");
  }

  const { completionOptions, messages, messageOptions } = msg.data;

  const model = config.selectedModelByRole.autocomplete;

  if (!model) {
    throw new Error("No autocomplete model selected");
  }

  // Log to return in case of error
  const errorPromptLog = {
    modelTitle: model?.title ?? model?.model,
    modelProvider: model?.underlyingProviderName ?? "unknown",
    completion: "",
    prompt: "",
    completionOptions: {
      ...msg.data.completionOptions,
      model: model?.model,
    },
  };

  try {
    const gen = model.streamChat(
      messages,
      abortController.signal,
      completionOptions,
      messageOptions,
    );
    let next = await gen.next();
    while (!next.done) {
      if (abortController.signal.aborted) {
        next = await gen.return(errorPromptLog);
        break;
      }

      const chunk = next.value;

      yield chunk;
      next = await gen.next();
    }
    void Telemetry.capture(
      "chat",
      {
        model: model.model,
        provider: model.providerName,
      },
      true,
    );

    void checkForOutOfStarterCredits(configHandler, messenger);

    if (!next.done) {
      throw new Error("Will never happen");
    }

    return next.value;
  } catch (error) {
    // Moved error handling that was here to GUI, keeping try/catch for clean diff
    throw error;
  }
}

async function checkForOutOfStarterCredits(
  configHandler: ConfigHandler,
  messenger: IMessenger<ToCoreProtocol, FromCoreProtocol>,
) {
  try {
    const { config } = await configHandler.getSerializedConfig();
    const creditStatus =
      await configHandler.controlPlaneClient.getCreditStatus();

    if (
      config &&
      creditStatus &&
      isOutOfStarterCredits(usesCreditsBasedApiKey(config), creditStatus)
    ) {
      void messenger.request("freeTrialExceeded", undefined);
    }
  } catch (error) {
    console.error("Error checking free trial status:", error);
  }
}
