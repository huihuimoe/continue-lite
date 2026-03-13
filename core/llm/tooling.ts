export type ToolCallDelta = import("./chatTypes").ToolCallDelta;

interface ToolSchema {
  type?: string;
  function: {
    name: string;
    description?: string;
    parameters?: any;
  };
  [key: string]: any;
}

export function safeParseToolCallArgs(
  toolCall: ToolCallDelta,
): Record<string, any> {
  const args = toolCall.function?.arguments;

  if (
    args &&
    typeof args === "object" &&
    !Array.isArray(args) &&
    Object.keys(args).length > 0
  ) {
    return args;
  }

  try {
    return JSON.parse((toolCall.function?.arguments as string)?.trim() || "{}");
  } catch {
    return {};
  }
}
