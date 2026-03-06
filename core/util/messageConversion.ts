/**
 * Message conversion utilities for transitioning to unified ChatHistoryItem type.
 *
 * This module provides conversion functions between the OpenAI ChatCompletionMessageParam
 * format and the unified ChatHistoryItem format from the core package.
 */

import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import type { ChatHistoryItem } from "../index.js";
import type {
  AssistantChatMessage,
  ChatMessage,
  MessageContent,
  ToolCall,
} from "../llm/chatTypes.js";
import type { ContextItemWithId } from "../index.js";

/**
 * Convert ChatCompletionMessageParam to ChatMessage
 */
export function convertToUnifiedMessage(
  message: ChatCompletionMessageParam,
): ChatMessage {
  switch (message.role) {
    case "system":
      return {
        role: "system",
        content: typeof message.content === "string" ? message.content : "",
      };

    case "user":
      return {
        role: "user",
        content: convertMessageContent(message.content),
      };

    case "assistant": {
      const assistantMessage: AssistantChatMessage = {
        role: "assistant",
        content: convertMessageContent(message.content || ""),
      };

      // Convert tool calls if present
      if ("tool_calls" in message && message.tool_calls) {
        assistantMessage.toolCalls = message.tool_calls.map((tc: any) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.function?.name || "",
            arguments: tc.function?.arguments || "",
          },
        }));
      }

      return assistantMessage;
    }

    case "tool":
      return {
        role: "tool",
        content: typeof message.content === "string" ? message.content : "",
        toolCallId: message.tool_call_id,
      };

    default:
      throw new Error(`Unsupported message role: ${(message as any).role}`);
  }
}

/**
 * Convert ChatMessage to ChatCompletionMessageParam
 */
export function convertFromUnifiedMessage(
  message: ChatMessage,
): ChatCompletionMessageParam {
  switch (message.role) {
    case "system":
      return {
        role: "system",
        content: message.content,
      };

    case "user":
      return {
        role: "user",
        content: convertFromMessageContent(message.content),
      };

    case "assistant": {
      const assistantMessage: ChatCompletionMessageParam = {
        role: "assistant",
        content: convertFromMessageContent(message.content),
      };

      // Convert tool calls if present
      if (message.toolCalls && message.toolCalls.length > 0) {
        (assistantMessage as any).tool_calls = message.toolCalls.map(
          (tc: any) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.function?.name || "",
              arguments: tc.function?.arguments || "",
            },
          }),
        );
      }

      return assistantMessage;
    }

    case "tool":
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId,
      };

    case "thinking":
      // Thinking messages don't have a direct equivalent in OpenAI format
      // Convert to assistant message with content
      return {
        role: "assistant",
        content: convertFromMessageContent(message.content),
      };

    default:
      throw new Error(`Unsupported message role: ${(message as any).role}`);
  }
}

/**
 * Convert OpenAI message content to unified MessageContent format
 */
function convertMessageContent(
  content: string | null | Array<any>,
): MessageContent {
  if (content === null) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part: any) => {
      if (part.type === "text") {
        return {
          type: "text" as const,
          text: part.text,
        };
      } else if (part.type === "image_url") {
        return {
          type: "imageUrl" as const,
          imageUrl: { url: part.image_url.url },
        };
      }
      throw new Error(`Unsupported content part type: ${part.type}`);
    });
  }

  throw new Error(`Unsupported content type: ${typeof content}`);
}

/**
 * Convert unified MessageContent to OpenAI format
 */
function convertFromMessageContent(
  content: MessageContent,
): string | Array<any> {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part: any) => {
      if (part.type === "text") {
        return {
          type: "text",
          text: part.text,
        };
      } else if (part.type === "imageUrl") {
        return {
          type: "image_url",
          image_url: { url: part.imageUrl.url },
        };
      }
      throw new Error(`Unsupported content part type: ${part.type}`);
    });
  }

  throw new Error(`Unsupported content type: ${typeof content}`);
}

/**
 * Create a ChatHistoryItem from a ChatMessage
 */
export function createHistoryItem(
  message: ChatMessage,
  contextItems: ContextItemWithId[] = [],
): ChatHistoryItem {
  return {
    message,
    contextItems,
  };
}

/**
 * Convert array of ChatCompletionMessageParam to ChatHistoryItem array
 */
export function convertToUnifiedHistory(
  messages: ChatCompletionMessageParam[],
): ChatHistoryItem[] {
  const historyItems: ChatHistoryItem[] = [];

  for (const message of messages) {
    const unifiedMessage = convertToUnifiedMessage(message);

    if (unifiedMessage.role === "tool") {
      continue;
    }

    historyItems.push(createHistoryItem(unifiedMessage));
  }

  return historyItems;
}

/**
 * Convert ChatHistoryItem array to ChatCompletionMessageParam array
 */
export function convertFromUnifiedHistory(
  historyItems: ChatHistoryItem[],
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  for (const item of historyItems) {
    const baseMessage = convertFromUnifiedMessage(item.message);

    // If this is a user message with context items, expand the content
    if (
      item.message.role === "user" &&
      item.contextItems &&
      item.contextItems.length > 0
    ) {
      const contextContent = item.contextItems
        .map(
          (contextItem: ContextItemWithId) =>
            `<context name="${contextItem.name}">\n${contextItem.content}\n</context>\n\n`,
        )
        .join("");

      baseMessage.content =
        typeof baseMessage.content === "string"
          ? contextContent + baseMessage.content
          : baseMessage.content; // Keep array format if it's already an array
    }

    messages.push(baseMessage);
  }

  return messages;
}

/**
 * Convert ChatHistoryItem array to ChatCompletionMessageParam array with injected system message
 * @param historyItems - The chat history items
 * @param systemMessage - The system message to inject at the beginning
 */
export function convertFromUnifiedHistoryWithSystemMessage(
  historyItems: ChatHistoryItem[],
  systemMessage: string,
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  // Inject system message at the beginning
  messages.push({
    role: "system",
    content: systemMessage,
  });

  // Convert the rest of the history
  const convertedMessages = convertFromUnifiedHistory(historyItems);
  messages.push(...convertedMessages);

  return messages;
}

/**
 * Extract tool call information from a ChatHistoryItem
 */
export function extractToolCallInfo(historyItem: ChatHistoryItem): {
  hasToolCalls: boolean;
  toolCalls?: ToolCall[];
} {
  const toolCalls =
    historyItem.message.role === "assistant"
      ? historyItem.message.toolCalls?.map(normalizeToolCall)
      : undefined;

  return {
    hasToolCalls: !!(toolCalls && toolCalls.length > 0),
    toolCalls,
  };
}

function normalizeToolCall(
  toolCall: NonNullable<AssistantChatMessage["toolCalls"]>[number],
): ToolCall {
  return {
    id: toolCall.id ?? "",
    type: "function",
    function: {
      name: toolCall.function?.name ?? "",
      arguments: toolCall.function?.arguments ?? "",
    },
  };
}
