export function removeQuotesAndEscapes(input: string): string {
  let output = input.trim();

  // Replace smart quotes
  output = output.replaceAll("“", '"');
  output = output.replaceAll("”", '"');
  output = output.replaceAll("‘", "'");
  output = output.replaceAll("’", "'");

  // Remove escapes
  output = output.replaceAll('\\"', '"');
  output = output.replaceAll("\\'", "'");
  output = output.replaceAll("\\n", "\n");
  output = output.replaceAll("\\t", "\t");
  output = output.replaceAll("\\\\", "\\");
  while (
    (output.startsWith('"') && output.endsWith('"')) ||
    (output.startsWith("'") && output.endsWith("'"))
  ) {
    output = output.slice(1, -1);
  }

  while (output.startsWith("`") && output.endsWith("`")) {
    output = output.slice(1, -1);
  }

  return output;
}

export function deduplicateArray<T>(
  array: T[],
  equal: (a: T, b: T) => boolean,
): T[] {
  const result: T[] = [];

  for (const item of array) {
    if (!result.some((existingItem) => equal(existingItem, item))) {
      result.push(item);
    }
  }

  return result;
}

export function dedent(strings: TemplateStringsArray, ...values: any[]) {
  let raw = "";
  for (let i = 0; i < strings.length; i++) {
    raw += strings[i];

    // Handle the value if it exists
    if (i < values.length) {
      let value = String(values[i]);
      // If the value contains newlines, we need to adjust the indentation
      if (value.includes("\n")) {
        // Find the indentation level of the last line in strings[i]
        let lines = strings[i].split("\n");
        let lastLine = lines[lines.length - 1];
        let match = lastLine.match(/(^|\n)([^\S\n]*)$/);
        let indent = match ? match[2] : "";
        // Add indentation to all lines except the first line of value
        let valueLines = value.split("\n");
        valueLines = valueLines.map((line, index) =>
          index === 0 ? line : indent + line,
        );
        value = valueLines.join("\n");
      }
      raw += value;
    }
  }

  // Now dedent the full string
  let result = raw.replace(/^\n/, "").replace(/\n\s*$/, "");
  let lines = result.split("\n");

  // Remove leading/trailing blank lines
  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  // Calculate minimum indentation (excluding empty lines)
  let minIndent = lines.reduce((min: any, line: any) => {
    if (line.trim() === "") return min;
    let match = line.match(/^(\s*)/);
    let indent = match ? match[1].length : 0;
    return min === null ? indent : Math.min(min, indent);
  }, null);

  if (minIndent !== null && minIndent > 0) {
    // Remove the minimum indentation from each line
    lines = lines.map((line) => line.slice(minIndent));
  }

  return lines.join("\n");
}

/**
 * Removes code blocks from a message.
 *
 * Return modified message text.
 */
export function removeCodeBlocksAndTrim(text: string): string {
  const codeBlockRegex = /```[\s\S]*?```/g;
  const thinkBlockRegex = /<think>[\s\S]*?<\/think>/g;

  // Remove code blocks and think blocks from the message text
  let processedText = text.replace(codeBlockRegex, "");
  processedText = processedText.replace(thinkBlockRegex, "");

  return processedText.trim();
}
