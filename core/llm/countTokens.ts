import {
  ChatMessage,
  CompiledMessagesResult,
  MessageContent,
  MessagePart,
} from "../index.js";
import {
  addSpaceToAnyEmptyMessages,
  chatMessageIsEmpty,
  isUserOrToolMsg,
  messageHasToolCallId,
} from "./messages.js";

import { renderChatMessage } from "../util/messageContent.js";
import { DEFAULT_PRUNING_LENGTH } from "./constants.js";
const APPROX_CHARS_PER_TOKEN = 3;

function estimateTextTokens(text: string): number {
  if (!text.length) {
    return 0;
  }

  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

function approximateCharacterBudget(maxTokens: number): number {
  return Math.max(0, maxTokens) * APPROX_CHARS_PER_TOKEN;
}

function countImageTokens(content: MessagePart): number {
  if (content.type === "imageUrl") {
    return 1024;
  }
  throw new Error("Non-image content type");
}

async function countTokensAsync(
  content: MessageContent,
  modelName = "llama2",
): Promise<number> {
  return Promise.resolve(countTokens(content, modelName));
}

function countTokens(content: MessageContent, _modelName = "llama2"): number {
  let baseTokens = 0;
  if (Array.isArray(content)) {
    baseTokens = content.reduce((acc, part) => {
      return (
        acc +
        (part.type === "text"
          ? estimateTextTokens(part.text ?? "")
          : countImageTokens(part))
      );
    }, 0);
  } else {
    baseTokens = estimateTextTokens(content ?? "");
  }
  return baseTokens;
}

function countChatMessageTokens(
  modelName: string,
  chatMessage: ChatMessage,
): number {
  const BASE_TOKENS = 4;
  const TOOL_CALL_EXTRA_TOKENS = 10;
  const TOOL_OUTPUT_EXTRA_TOKENS = 10;
  let tokens = BASE_TOKENS;

  if (chatMessage.content) {
    tokens += countTokens(chatMessage.content, modelName);
  }

  if ("toolCalls" in chatMessage && chatMessage.toolCalls) {
    for (const call of chatMessage.toolCalls) {
      tokens += TOOL_CALL_EXTRA_TOKENS;
      tokens += countTokens(JSON.stringify(call), modelName); // TODO hone this
    }
  }

  if (chatMessage.role === "thinking") {
    if (chatMessage.redactedThinking) {
      tokens += countTokens(chatMessage.redactedThinking, modelName);
    }
    if (chatMessage.signature) {
      tokens += countTokens(chatMessage.signature, modelName);
    }
  }

  if (chatMessage.role === "tool") {
    tokens += TOOL_OUTPUT_EXTRA_TOKENS; // safety
    if (chatMessage.toolCallId) {
      tokens += countTokens(chatMessage.toolCallId, modelName);
    }
  }
  return tokens;
}

/**
 * Extracts and validates the tool call sequence from the end of a message array.
 * Tool sequences consist of: [assistant_with_tool_calls, tool_response_1, tool_response_2, ...]
 * or just a single user message.
 *
 * @param messages - Array of chat messages (will be modified by popping messages)
 * @returns Array of messages that form the tool sequence
 */
function extractToolSequence(messages: ChatMessage[]): ChatMessage[] {
  const lastMsg = messages.pop();
  if (!lastMsg || !isUserOrToolMsg(lastMsg)) {
    throw new Error("Error parsing chat history: no user/tool message found");
  }

  const toolSequence: ChatMessage[] = [];

  if (lastMsg.role === "tool") {
    toolSequence.push(lastMsg);

    // Collect all consecutive tool messages from the end
    while (
      messages.length > 0 &&
      messages[messages.length - 1].role === "tool"
    ) {
      toolSequence.unshift(messages.pop()!);
    }

    // Get the assistant message with tool calls
    const assistantMsg = messages.pop();
    if (assistantMsg) {
      toolSequence.unshift(assistantMsg);

      // Validate that all tool messages have matching tool call IDs
      for (const toolMsg of toolSequence.slice(1)) {
        // Skip assistant message
        if (
          toolMsg.role === "tool" &&
          !messageHasToolCallId(assistantMsg, toolMsg.toolCallId)
        ) {
          throw new Error(
            `Error parsing chat history: no tool call found to match tool output for id "${toolMsg.toolCallId}"`,
          );
        }
      }
    }
  } else {
    // Single user message
    toolSequence.push(lastMsg);
  }

  return toolSequence;
}

function pruneLinesFromTop(
  prompt: string,
  maxTokens: number,
  modelName: string,
): string {
  const lines = prompt.split("\n");
  // Preprocess tokens for all lines and cache them.
  const lineTokens = lines.map((line) => countTokens(line, modelName));
  let totalTokens = lineTokens.reduce((sum, tokens) => sum + tokens, 0);
  let start = 0;
  let currentLines = lines.length;

  // Calculate initial token count including newlines
  totalTokens += Math.max(0, currentLines - 1); // Add tokens for joining newlines

  // Using indexes instead of array modifications.
  // Remove lines from the top until the token count is within the limit.
  while (totalTokens > maxTokens && start < currentLines) {
    totalTokens -= lineTokens[start];
    // Decrement token count for the removed line and its preceding/joining newline (if not the last line)
    if (currentLines - start > 1) {
      totalTokens--;
    }
    start++;
  }

  return lines.slice(start).join("\n");
}

function pruneLinesFromBottom(
  prompt: string,
  maxTokens: number,
  modelName: string,
): string {
  const lines = prompt.split("\n");
  const lineTokens = lines.map((line) => countTokens(line, modelName));
  let totalTokens = lineTokens.reduce((sum, tokens) => sum + tokens, 0);
  let end = lines.length;

  // Calculate initial token count including newlines
  totalTokens += Math.max(0, end - 1); // Add tokens for joining newlines

  // Reverse traversal to avoid array modification
  // Remove lines from the bottom until the token count is within the limit.
  while (totalTokens > maxTokens && end > 0) {
    end--;
    totalTokens -= lineTokens[end];
    // Decrement token count for the removed line and its following/joining newline (if not the first line)
    if (end > 0) {
      totalTokens--;
    }
  }

  return lines.slice(0, end).join("\n");
}

function pruneStringFromBottom(
  _modelName: string,
  maxTokens: number,
  prompt: string,
): string {
  const charBudget = approximateCharacterBudget(maxTokens);
  if (prompt.length <= charBudget) {
    return prompt;
  }

  return prompt.slice(0, charBudget);
}

function pruneStringFromTop(
  _modelName: string,
  maxTokens: number,
  prompt: string,
): string {
  const charBudget = approximateCharacterBudget(maxTokens);
  if (prompt.length <= charBudget) {
    return prompt;
  }

  return prompt.slice(prompt.length - charBudget);
}

const MAX_TOKEN_SAFETY_BUFFER = 2000;
const TOKEN_SAFETY_PROPORTION = 0.1;
export function getTokenCountingBufferSafety(contextLength: number) {
  return Math.min(
    MAX_TOKEN_SAFETY_BUFFER,
    contextLength * TOKEN_SAFETY_PROPORTION,
  );
}

const MIN_RESPONSE_TOKENS = 1000;

function pruneRawPromptFromTop(
  modelName: string,
  contextLength: number,
  prompt: string,
  tokensForCompletion: number,
): string {
  const maxTokens =
    contextLength -
    tokensForCompletion -
    getTokenCountingBufferSafety(contextLength);
  return pruneStringFromTop(modelName, maxTokens, prompt);
}

/**
 * Reconciles chat messages with available context length by intelligently pruning older messages
 * while preserving critical conversation elements.
 *
 * Core Guidelines:
 * - Always preserve the last user/tool message sequence (including any associated assistant message with tool calls)
 * - Always preserve the system message
 * - Never allow orphaned tool responses without their corresponding tool calls
 * - Remove older messages first when pruning is necessary
 * - Maintain conversation coherence by flattening adjacent similar messages
 *
 * Process:
 * 1. Handle image content conversion for models that don't support images
 * 2. Extract and preserve system message
 * 3. Filter out empty messages and trailing non-user/tool messages
 * 4. Extract the complete tool sequence from the end (user message or assistant + tool responses)
 * 5. Calculate token requirements for non-negotiable elements (system, last sequence)
 * 6. Prune older messages until within available token budget
 * 7. Reassemble with proper ordering and flatten adjacent similar messages
 *
 * @param params - Configuration object containing:
 *   - modelName: LLM model name for token counting
 *   - msgs: Array of chat messages to process
 *   - contextLength: Maximum context length supported by the model
 *   - maxTokens: Maximum tokens to reserve for the response
 *   - supportsImages: Whether the model supports image content
 * @returns Processed array of chat messages that fit within context constraints
 * @throws Error if non-negotiable elements exceed available context
 */
function compileChatMessages({
  modelName,
  msgs,
  knownContextLength,
  maxTokens,
  supportsImages,
}: {
  modelName: string;
  msgs: ChatMessage[];
  knownContextLength: number | undefined;
  maxTokens: number;
  supportsImages: boolean;
}): CompiledMessagesResult {
  let didPrune = false;

  let msgsCopy: ChatMessage[] = msgs.map((m) => ({ ...m }));

  // If images not supported, convert MessagePart[] to string
  if (!supportsImages) {
    for (const msg of msgsCopy) {
      if ("content" in msg && Array.isArray(msg.content)) {
        const content = renderChatMessage(msg);
        msg.content = content;
      }
    }
  }

  // Extract system message
  const systemMsg = msgsCopy.find((msg) => msg.role === "system");
  msgsCopy = msgsCopy.filter((msg) => msg.role !== "system");

  // Remove any empty messages or non-user/tool trailing messages
  msgsCopy = msgsCopy.filter((msg) => !chatMessageIsEmpty(msg));

  msgsCopy = addSpaceToAnyEmptyMessages(msgsCopy);

  // Extract the tool sequence from the end of the message array
  const toolSequence = extractToolSequence(msgsCopy);

  // Count tokens for all messages in the tool sequence
  let lastMessagesTokens = 0;
  for (const msg of toolSequence) {
    lastMessagesTokens += countChatMessageTokens(modelName, msg);
  }

  // System message
  let systemMsgTokens = 0;
  if (systemMsg) {
    systemMsgTokens = countChatMessageTokens(modelName, systemMsg);
  }

  const contextLength = knownContextLength ?? DEFAULT_PRUNING_LENGTH;
  const countingSafetyBuffer = getTokenCountingBufferSafety(contextLength);
  const minOutputTokens = Math.min(MIN_RESPONSE_TOKENS, maxTokens);

  let inputTokensAvailable = contextLength;

  // Leave space for output/safety
  inputTokensAvailable -= countingSafetyBuffer;
  inputTokensAvailable -= minOutputTokens;

  // Non-negotiable messages
  inputTokensAvailable -= systemMsgTokens;
  inputTokensAvailable -= lastMessagesTokens;

  // Make sure there's enough context for the non-excludable items
  if (knownContextLength !== undefined && inputTokensAvailable < 0) {
    throw new Error(
      `Not enough context available to include the system message and last user message.
        There must be at least ${minOutputTokens} tokens remaining for output.
        Request had the following token counts:
        - contextLength: ${knownContextLength}
        - counting safety buffer: ${countingSafetyBuffer}
        - system message: ~${systemMsgTokens}
        - max output tokens: ${maxTokens}`,
    );
  }

  // Now remove messages till we're under the limit
  let currentTotal = 0;
  const historyWithTokens = msgsCopy.map((message) => {
    const tokens = countChatMessageTokens(modelName, message);
    currentTotal += tokens;
    return {
      ...message,
      tokens,
    };
  });

  while (historyWithTokens.length > 0 && currentTotal > inputTokensAvailable) {
    const message = historyWithTokens.shift()!;
    currentTotal -= message.tokens;
    didPrune = true;

    // At this point make sure no latent tool response without corresponding call
    while (historyWithTokens[0]?.role === "tool") {
      const message = historyWithTokens.shift()!;
      currentTotal -= message.tokens;
    }
  }

  // Now reassemble
  const reassembled: ChatMessage[] = [];
  if (systemMsg) {
    reassembled.push(systemMsg);
  }
  reassembled.push(...historyWithTokens.map(({ tokens, ...rest }) => rest));
  reassembled.push(...toolSequence);

  const inputTokens = currentTotal + systemMsgTokens + lastMessagesTokens;
  const availableTokens =
    contextLength - countingSafetyBuffer - minOutputTokens;
  const contextPercentage = inputTokens / availableTokens;
  return {
    compiledChatMessages: reassembled,
    didPrune,
    contextPercentage,
  };
}

export {
  compileChatMessages,
  countTokens,
  countTokensAsync,
  extractToolSequence,
  pruneLinesFromBottom,
  pruneLinesFromTop,
  pruneRawPromptFromTop,
  pruneStringFromBottom,
  pruneStringFromTop,
};
