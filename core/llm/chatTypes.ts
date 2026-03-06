export type ChatMessageRole =
  | "user"
  | "assistant"
  | "thinking"
  | "system"
  | "tool";

export type TextMessagePart = {
  type: "text";
  text: string;
};

export type ImageMessagePart = {
  type: "imageUrl";
  imageUrl: { url: string };
};

export type MessagePart = TextMessagePart | ImageMessagePart;

export type MessageContent = string | MessagePart[];

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolCallDelta {
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ToolResultChatMessage {
  role: "tool";
  content: string;
  toolCallId: string;
  metadata?: Record<string, unknown>;
}

export interface UserChatMessage {
  role: "user";
  content: MessageContent;
  metadata?: Record<string, unknown>;
}

export interface ThinkingChatMessage {
  role: "thinking";
  content: MessageContent;
  signature?: string;
  redactedThinking?: string;
  toolCalls?: ToolCallDelta[];
  reasoning_details?: {
    signature?: string;
    [key: string]: any;
  }[];
  metadata?: Record<string, unknown>;
}

export interface Usage {
  completionTokens: number;
  promptTokens: number;
  promptTokensDetails?: {
    cachedTokens?: number;
    cacheWriteTokens?: number;
    audioTokens?: number;
  };
  completionTokensDetails?: {
    acceptedPredictionTokens?: number;
    reasoningTokens?: number;
    rejectedPredictionTokens?: number;
    audioTokens?: number;
  };
}

export interface AssistantChatMessage {
  role: "assistant";
  content: MessageContent;
  toolCalls?: ToolCallDelta[];
  usage?: Usage;
  metadata?: Record<string, unknown>;
}

export interface SystemChatMessage {
  role: "system";
  content: string;
  metadata?: Record<string, unknown>;
}

export type ChatMessage =
  | UserChatMessage
  | AssistantChatMessage
  | ThinkingChatMessage
  | SystemChatMessage
  | ToolResultChatMessage;
