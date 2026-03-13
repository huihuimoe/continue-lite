import { JSONSchema7Object } from "json-schema";
import { ChatCompletionTool } from "openai/resources/index.mjs";

type GeminiObjectSchemaType =
  | "TYPE_UNSPECIFIED"
  | "STRING"
  | "NUMBER"
  | "INTEGER"
  | "BOOLEAN"
  | "ARRAY"
  | "OBJECT";

interface GeminiObjectSchema {
  type: GeminiObjectSchemaType;
  format?: string;
  title?: string;
  description?: string;
  nullable?: boolean;
  enum?: string[];
  maxItems?: string;
  minItems?: string;
  properties?: Record<string, GeminiObjectSchema>;
  required?: string[];
  anyOf?: GeminiObjectSchema[];
  propertyOrdering?: string[];
  items?: GeminiObjectSchema;
  minimum?: number;
  maximum?: number;
}

const jsonSchemaTypeToGeminiType = (
  jsonSchemaType: string,
): GeminiObjectSchemaType => {
  switch (jsonSchemaType.toLowerCase()) {
    case "string":
      return "STRING";
    case "object":
      return "OBJECT";
    case "number":
      return "NUMBER";
    case "integer":
      return "INTEGER";
    case "array":
      return "ARRAY";
    case "boolean":
      return "BOOLEAN";
    default:
      return "TYPE_UNSPECIFIED";
  }
};

function convertJsonSchemaToGeminiSchema(jsonSchema: any): GeminiObjectSchema {
  const jsonSchemaType = jsonSchema["type"];
  if (!jsonSchemaType || typeof jsonSchema.type !== "string") {
    throw new Error(
      `Invalid type property in function declaration\n${JSON.stringify(jsonSchema, null, 2)}`,
    );
  }
  const geminiSchema: GeminiObjectSchema = {
    type: jsonSchemaTypeToGeminiType(jsonSchemaType),
  };

  // if (jsonSchema.format) geminiSchema.format = jsonSchema.format;
  if (jsonSchema.title) geminiSchema.title = jsonSchema.title;
  if (jsonSchema.description) geminiSchema.description = jsonSchema.description;

  // Handle nullable
  if (jsonSchemaType === "null" || jsonSchema.nullable) {
    geminiSchema.nullable = true;
  }

  // Handle enum values
  if (Array.isArray(jsonSchema.enum)) {
    geminiSchema.enum = jsonSchema.enum.map(String);
  }

  // Handle array constraints
  if (jsonSchemaType === "array") {
    if (typeof jsonSchema.maxItems !== "undefined") {
      geminiSchema.maxItems = String(jsonSchema.maxItems);
    }
    if (typeof jsonSchema.minItems !== "undefined") {
      geminiSchema.minItems = String(jsonSchema.minItems);
    }
    // Handle array items
    if (jsonSchema.items) {
      geminiSchema.items = convertJsonSchemaToGeminiSchema(jsonSchema.items);
    }
  }

  // Handle numeric constraints
  if (typeof jsonSchema.minimum !== "undefined") {
    geminiSchema.minimum = Number(jsonSchema.minimum);
  }
  if (typeof jsonSchema.maximum !== "undefined") {
    geminiSchema.maximum = Number(jsonSchema.maximum);
  }

  // Handle properties for objects
  if (jsonSchema.properties) {
    geminiSchema.properties = {};
    for (const [key, value] of Object.entries(jsonSchema.properties)) {
      geminiSchema.properties[key] = convertJsonSchemaToGeminiSchema(value);
    }
  }

  // Handle required properties
  if (Array.isArray(jsonSchema.required)) {
    geminiSchema.required = jsonSchema.required;
  }

  // Handle anyOf
  if (Array.isArray(jsonSchema.anyOf)) {
    geminiSchema.anyOf = jsonSchema.anyOf.map(convertJsonSchemaToGeminiSchema);
  }

  // TODO/UNSUPPORTED:
  // format
  // property ordering:
  // if (Array.isArray(jsonSchema.propertyOrdering)) {
  //   geminiSchema.propertyOrdering = jsonSchema.propertyOrdering;
  // }

  return geminiSchema;
}

// https://ai.google.dev/api/caching#FunctionDeclaration
// Note "reponse" field (schema showing function output structure) is not supported at the moment
export function convertOpenAIToolToGeminiFunction(
  tool: ChatCompletionTool,
): GeminiToolFunctionDeclaration {
  // Type guard for function tools
  if (tool.type !== "function" || !tool.function) {
    throw new Error(`Unsupported tool type: ${tool.type}`);
  }

  if (!tool.function.name) {
    throw new Error("Function name required");
  }
  const description = tool.function.description ?? "";
  const name = tool.function.name;

  const fn: GeminiToolFunctionDeclaration = {
    description,
    name,
  };

  if (
    tool.function.parameters &&
    "type" in tool.function.parameters &&
    typeof tool.function.parameters.type === "string"
  ) {
    // Gemini can't take an empty object
    // So if empty object param is present just don't add parameters
    if (tool.function.parameters.type === "object") {
      if (JSON.stringify(tool.function.parameters.properties) === "{}") {
        return fn;
      }
    }

    fn.parameters = convertJsonSchemaToGeminiSchema(tool.function.parameters);
  }

  return fn;
}

type GeminiTextContentPart = {
  text: string;
};

type GeminiInlineDataContentPart = {
  inlineData: {
    mimeType: string;
    data: string;
  };
};

type GeminiFunctionCallContentPart = {
  functionCall: {
    id?: string;
    name: string;
    args: JSONSchema7Object;
  };
};

type GeminiFunctionResponseContentPart = {
  functionResponse: {
    id?: string;
    name: string;
    response: JSONSchema7Object;
  };
};

type GeminiFileDataContentPart = {
  fileData: {
    fileUri: string;
    mimeType: string; // See possible values here: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#filedata
  };
};

type GeminiExecutableCodeContentPart = {
  executableCode: {
    language: "PYTHON" | "LANGUAGE_UNSPECIFIED";
    code: string;
  };
};

type GeminiCodeExecutionResultContentPart = {
  codeExecutionResult: {
    outcome:
      | "OUTCOME_UNSPECIFIED"
      | "OUTCOME_OK"
      | "OUTCOME_FAILED"
      | "OUTCOME_DEADLINE_EXCEEDED";
    output: string;
  };
};

export type GeminiChatContentPart =
  | GeminiTextContentPart
  | GeminiInlineDataContentPart
  | GeminiFunctionCallContentPart
  | GeminiFunctionResponseContentPart
  | GeminiFileDataContentPart
  | GeminiExecutableCodeContentPart
  | GeminiCodeExecutionResultContentPart;

export interface GeminiChatContent {
  role?: "user" | "model";
  parts: GeminiChatContentPart[];
}

export interface GeminiToolFunctionDeclaration {
  name: string;
  description: string;
  parameters?: GeminiObjectSchema;
  response?: GeminiObjectSchema;
}
