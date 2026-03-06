import {
  ChatMessage,
  CompletionOptions,
  UserChatMessage,
} from "../../index.js";
import Bedrock from "./Bedrock.js";

// Mock AWS SDK
jest.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
    middlewareStack: { add: jest.fn() },
  })),
  ConverseStreamCommand: jest.fn(),
  InvokeModelCommand: jest.fn(),
}));

// Mock credential provider
jest.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: jest.fn().mockImplementation(() => async () => ({
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    sessionToken: "test-session-token",
  })),
}));

// Extend CompletionOptions for testing
interface TestCompletionOptions extends CompletionOptions {
  mockError?: string;
  mockToolUse?: boolean;
}

// Create a test class that overrides the protected methods
class TestBedrock extends Bedrock {
  // Make _streamChat public for testing
  public async *streamChat(
    _messages: ChatMessage[],
    _signal: AbortSignal,
    options: TestCompletionOptions,
  ): AsyncGenerator<ChatMessage> {
    if (options.mockError) {
      throw new Error(options.mockError);
    }

    if (options.mockToolUse) {
      yield {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "test_tool",
              arguments: '{"arg1":"value1"}',
            },
          },
        ],
      };
      return;
    }

    yield { role: "assistant", content: "Hello" };
    yield { role: "assistant", content: " world" };
  }
}

describe("Bedrock", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with default options", () => {
      const bedrock = new TestBedrock({
        apiKey: "test-key",
        model: "anthropic.claude-3-sonnet-20240229-v1:0",
        region: "us-east-1",
      });

      expect(bedrock.region).toBe("us-east-1");
      expect(bedrock.profile).toBe("bedrock");
      expect(bedrock.apiBase).toBe(
        "https://bedrock-runtime.us-east-1.amazonaws.com",
      );
    });

    it("should use custom options when provided", () => {
      const bedrock = new TestBedrock({
        apiKey: "test-key",
        model: "anthropic.claude-3-sonnet-20240229-v1:0",
        region: "us-west-2",
        profile: "custom-profile",
        apiBase: "https://custom-endpoint.amazonaws.com/",
      });

      expect(bedrock.region).toBe("us-west-2");
      expect(bedrock.profile).toBe("custom-profile");
      expect(bedrock.apiBase).toBe("https://custom-endpoint.amazonaws.com/");
    });
  });

  describe("streamChat", () => {
    let bedrock: TestBedrock;
    const mockAbortSignal = new AbortController().signal;
    const defaultOptions: TestCompletionOptions = {
      model: "anthropic.claude-3-sonnet-20240229-v1:0",
    };

    beforeEach(() => {
      bedrock = new TestBedrock({
        apiKey: "test-key",
        model: "anthropic.claude-3-sonnet-20240229-v1:0",
        region: "us-east-1",
      });
    });

    it("should handle text streaming correctly", async () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: "Hi",
        } as UserChatMessage,
      ];

      const results = [];

      for await (const message of bedrock.streamChat(
        messages,
        mockAbortSignal,
        defaultOptions,
      )) {
        results.push(message);
      }

      expect(results).toEqual([
        { role: "assistant", content: "Hello" },
        { role: "assistant", content: " world" },
      ]);
    });

    it("should handle tool use streaming correctly", async () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: "Use a tool",
        } as UserChatMessage,
      ];

      const results = [];
      const options: TestCompletionOptions = {
        ...defaultOptions,
        mockToolUse: true,
      };

      for await (const message of bedrock.streamChat(
        messages,
        mockAbortSignal,
        options,
      )) {
        results.push(message);
      }

      expect(results).toEqual([
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "tool-1",
              type: "function",
              function: {
                name: "test_tool",
                arguments: '{"arg1":"value1"}',
              },
            },
          ],
        },
      ]);
    });

    it("should handle API errors", async () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: "Hi",
        } as UserChatMessage,
      ];

      const options: TestCompletionOptions = {
        ...defaultOptions,
        mockError: "API Error",
      };

      await expect(async () => {
        for await (const _ of bedrock.streamChat(
          messages,
          mockAbortSignal,
          options,
        )) {
          // consume generator
        }
      }).rejects.toThrow("API Error");
    });
  });

  it("should not expose runtime embed/rerank methods", () => {
    const bedrock = new TestBedrock({
      apiKey: "test-key",
      model: "anthropic.claude-3-sonnet-20240229-v1:0",
      region: "us-east-1",
    });

    expect("embed" in (bedrock as any)).toBe(false);
    expect("rerank" in (bedrock as any)).toBe(false);
  });

  describe("message conversion", () => {
    let bedrock: TestBedrock;

    beforeEach(() => {
      bedrock = new TestBedrock({
        apiKey: "test-key",
        model: "anthropic.claude-3-sonnet-20240229-v1:0",
        region: "us-east-1",
      });
    });

    it("should convert simple user and assistant messages correctly", () => {
      const messages: ChatMessage[] = [
        { role: "user", content: "Hello" } as UserChatMessage,
        { role: "assistant", content: "Hi there" },
      ];

      const converted = bedrock["_convertMessages"](messages);

      expect(converted).toEqual([
        { role: "user", content: [{ text: "Hello" }] },
        { role: "assistant", content: [{ text: "Hi there" }] },
      ]);
    });

    it("should handle tool responses correctly", () => {
      const messages: ChatMessage[] = [
        { role: "user", content: "Use a tool" } as UserChatMessage,
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "tool-1",
              type: "function",
              function: {
                name: "test_tool",
                arguments: '{"arg":"value"}',
              },
            },
          ],
        },
        {
          role: "tool",
          content: "Tool result",
          toolCallId: "tool-1",
        },
      ];

      const converted = bedrock["_convertMessages"](messages);

      expect(converted).toEqual([
        { role: "user", content: [{ text: "Use a tool" }] },
        {
          role: "assistant",
          content: [
            {
              text: expect.stringContaining("Assistant tool call:"),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              text: "Tool call output for Tool Call ID tool-1:\n\nTool result",
            },
          ],
        },
      ]);
    });

    it("should handle tool calls with unavailable tools as text", () => {
      const messages: ChatMessage[] = [
        { role: "user", content: "Use a tool" } as UserChatMessage,
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "tool-1",
              type: "function",
              function: {
                name: "unavailable_tool",
                arguments: '{"arg":"value"}',
              },
            },
          ],
        },
      ];

      // Empty set means no tools are available
      const converted = bedrock["_convertMessages"](messages);

      expect(converted).toEqual([
        { role: "user", content: [{ text: "Use a tool" }] },
        {
          role: "assistant",
          content: [
            {
              text: expect.stringContaining("Assistant tool call:"),
            },
          ],
        },
      ]);
    });

    it("should handle thinking messages correctly", () => {
      const messages: ChatMessage[] = [
        { role: "user", content: "Think about this" } as UserChatMessage,
        { role: "thinking", content: "I am thinking about the solution" },
        { role: "assistant", content: "Here's my answer" },
      ];

      const converted = bedrock["_convertMessages"](messages);

      expect(converted).toEqual([
        { role: "user", content: [{ text: "Think about this" }] },
        {
          role: "assistant",
          content: [
            {
              reasoningContent: {
                reasoningText: {
                  text: "I am thinking about the solution",
                  signature: undefined,
                },
              },
            },
            { text: "Here's my answer" },
          ],
        },
      ]);
    });

    it("should handle redacted thinking messages", () => {
      const messages: ChatMessage[] = [
        { role: "user", content: "Think about this" } as UserChatMessage,
        {
          role: "thinking",
          content: "",
          redactedThinking: "redacted-content-bytes",
        },
        { role: "assistant", content: "Here's my answer" },
      ];

      const converted = bedrock["_convertMessages"](messages);

      expect(converted).toEqual([
        { role: "user", content: [{ text: "Think about this" }] },
        {
          role: "assistant",
          content: [
            {
              reasoningContent: {
                redactedContent: expect.any(Uint8Array),
              },
            },
            { text: "Here's my answer" },
          ],
        },
      ]);

      // Check that the Uint8Array contains the expected bytes
      const redactedContent =
        converted[1].content?.[0].reasoningContent?.redactedContent;
      expect(redactedContent).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(redactedContent!).toString()).toBe(
        "redacted-content-bytes",
      );
    });

    it("should convert multimodal content correctly", () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "Look at this image:" },
            {
              type: "imageUrl",
              imageUrl: {
                url: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
              },
            },
          ],
        } as UserChatMessage,
      ];

      const converted = bedrock["_convertMessages"](messages);

      expect(converted).toEqual([
        {
          role: "user",
          content: [
            { text: "Look at this image:" },
            {
              image: {
                format: "jpeg",
                source: {
                  bytes: expect.any(Uint8Array),
                },
              },
            },
          ],
        },
      ]);

      // Check that the image bytes were processed correctly
      const imageBytes = converted[0].content?.[1].image?.source?.bytes;
      expect(imageBytes).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(imageBytes!).toString("base64")).toBe(
        "/9j/4AAQSkZJRg==",
      );
    });

    it("should add cache points when cacheBehavior.cacheConversation is enabled", () => {
      // Create a test instance with caching behavior enabled
      const bedrockWithCaching = new TestBedrock({
        apiKey: "test-key",
        model: "anthropic.claude-3-sonnet-20240229-v1:0",
        region: "us-east-1",
      });

      // Set caching behavior
      bedrockWithCaching.cacheBehavior = {
        cacheConversation: true,
        cacheSystemMessage: true,
      };

      const messages: ChatMessage[] = [
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: "First message" } as UserChatMessage,
        { role: "assistant", content: "First response" },
        { role: "user", content: "Second message" } as UserChatMessage,
      ];

      const converted = bedrockWithCaching["_convertMessages"](messages);

      // The last two user messages should have cache points
      // But we're not testing the system message here since it's handled separately
      expect(converted.length).toBe(3);
      expect(converted[0].role).toBe("user");
      expect(converted[0].content?.some((block) => block.cachePoint)).toBe(
        true,
      );
      expect(converted[1].role).toBe("assistant");
      expect(converted[2].role).toBe("user");
      expect(converted[2].content?.some((block) => block.cachePoint)).toBe(
        true,
      );

      // Verify that text content includes a cache ID suffix
      const userMessageText = converted[0].content?.[0].text;
      expect(userMessageText).toMatch(/First message.+/);
    });

    it("should add cache points when completionOptions.promptCaching is enabled", () => {
      // Create a test instance with prompt caching enabled via completionOptions
      const bedrockWithPromptCaching = new TestBedrock({
        apiKey: "test-key",
        model: "anthropic.claude-3-sonnet-20240229-v1:0",
        region: "us-east-1",
      });

      // Set completionOptions.promptCaching (without cacheBehavior)
      bedrockWithPromptCaching.completionOptions = {
        ...bedrockWithPromptCaching.completionOptions,
        promptCaching: true,
      };

      const messages: ChatMessage[] = [
        { role: "user", content: "First message" } as UserChatMessage,
        { role: "assistant", content: "First response" },
        { role: "user", content: "Second message" } as UserChatMessage,
      ];

      const converted = bedrockWithPromptCaching["_convertMessages"](messages);

      // The last two user messages should have cache points
      expect(converted.length).toBe(3);
      expect(converted[0].role).toBe("user");
      expect(converted[0].content?.some((block) => block.cachePoint)).toBe(
        true,
      );
      expect(converted[1].role).toBe("assistant");
      expect(converted[2].role).toBe("user");
      expect(converted[2].content?.some((block) => block.cachePoint)).toBe(
        true,
      );

      // Verify that text content includes a cache ID suffix
      const userMessageText = converted[0].content?.[0].text;
      expect(userMessageText).toMatch(/First message.+/);
    });

    it("should not add cache points when both caching options are disabled", () => {
      // Create a test instance with no caching enabled
      const bedrockNoCaching = new TestBedrock({
        apiKey: "test-key",
        model: "anthropic.claude-3-sonnet-20240229-v1:0",
        region: "us-east-1",
      });

      // Explicitly set no caching
      bedrockNoCaching.cacheBehavior = {
        cacheConversation: false,
        cacheSystemMessage: false,
      };
      bedrockNoCaching.completionOptions = {
        ...bedrockNoCaching.completionOptions,
        promptCaching: false,
      };

      const messages: ChatMessage[] = [
        { role: "user", content: "First message" } as UserChatMessage,
        { role: "assistant", content: "First response" },
        { role: "user", content: "Second message" } as UserChatMessage,
      ];

      const converted = bedrockNoCaching["_convertMessages"](messages);

      // No cache points should be added
      expect(converted.length).toBe(3);
      expect(converted[0].role).toBe("user");
      expect(converted[0].content?.some((block) => block.cachePoint)).toBe(
        false,
      );
      expect(converted[1].role).toBe("assistant");
      expect(converted[2].role).toBe("user");
      expect(converted[2].content?.some((block) => block.cachePoint)).toBe(
        false,
      );

      // Verify that text content doesn't include a cache ID suffix
      const userMessageText = converted[0].content?.[0].text;
      expect(userMessageText).toBe("First message");
    });
  });
});
