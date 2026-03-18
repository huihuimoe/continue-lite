import { ContextItemWithId, RangeInFileWithContents } from "../";

export function ctxItemToRifWithContents(
  item: ContextItemWithId,
  linesOffByOne = false,
): RangeInFileWithContents {
  let startLine = 0;
  let endLine = 0;
  let adjustLines = linesOffByOne ? 1 : 0;

  const nameSplit = item.name.split("(");

  if (nameSplit.length > 1) {
    const lines = nameSplit[1].split(")")[0].split("-");
    startLine = Number.parseInt(lines[0], 10);
    if (startLine === 0) {
      adjustLines = 0; // safety to make sure doesn't go negative
    }
    startLine -= adjustLines;
    endLine = Number.parseInt(lines[1], 10) - adjustLines;
  }

  const rif: RangeInFileWithContents = {
    filepath: item.uri?.value || "",
    range: {
      start: {
        line: startLine,
        character: 0,
      },
      end: {
        line: endLine,
        character: 0,
      },
    },
    contents: item.content,
  };

  return rif;
}
