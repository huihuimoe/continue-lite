import { IDE, RangeInFileWithContents } from "../index";
import { AutocompleteLanguageInfo } from "./constants/AutocompleteLanguageInfo";
import { AutocompleteCodeSnippet } from "./snippets/types";

export type AutocompleteSnippet = RangeInFileWithContents & {
  score?: number;
};

export type GetLspDefinitionsFunction = (
  filepath: string,
  contents: string,
  cursorIndex: number,
  ide: IDE,
  lang: AutocompleteLanguageInfo,
) => Promise<AutocompleteCodeSnippet[]>;
