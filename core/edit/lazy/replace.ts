import { ILLM } from "../..";
import { filterLeadingNewline } from "../../autocomplete/filtering/streamTransforms/lineStream";
import { streamLines } from "../../diff/util";
import { dedent } from "../../util";

export const BUFFER_LINES_BELOW = 3;

const REPLACE_HERE = "// REPLACE HERE //";
export async function* getReplacementWithLlm(
  oldCode: string,
  linesBefore: string[],
  linesAfter: string[],
  llm: ILLM,
  abortController: AbortController,
): AsyncGenerator<string> {
  const userPrompt = dedent`
    ORIGINAL CODE:
    \`\`\`
    ${oldCode}
    \`\`\`

    UPDATED CODE:
    \`\`\`
    ${linesBefore.join("\n")}
    ${REPLACE_HERE}
    ${linesAfter.join("\n")}
    \`\`\`

    Above is an original version of a file, followed by a newer version that is in the process of being written. The new version contains a section which is exactly the same as in the original code, and has been marked with "${REPLACE_HERE}". Your task is to give the exact snippet of code from the original code that should replace "${REPLACE_HERE}" in the new version.

    Your output should be a single code block. We will paste the contents of that code block directly into the new version, so make sure that it has correct indentation.
  `;

  const assistantPrompt = dedent`
    Here is the snippet of code that will replace "${REPLACE_HERE}" in the new version:
    \`\`\`
  `;

  const completion = await llm.streamChat(
    [
      { role: "user", content: userPrompt },
      { role: "assistant", content: assistantPrompt },
    ],
    abortController.signal,
    {
      raw: true,
      prediction: undefined,
      reasoning: false,
    },
  );

  let lines = streamLines(completion);
  lines = filterLeadingNewline(lines);
  // We want to retrive everything from the llm
  // then let the filterCodeBlocks function clean up for any trailing text.
  // if we stop here early, we run the risk of loosing inner markdown content.

  for await (const line of lines) {
    yield line;
  }
}
