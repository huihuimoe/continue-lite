import { getUriFileExtension } from "../../util/uri";
import { BracketMatchingService } from "../filtering/BracketMatchingService";
import {
  CharacterFilter,
  LineFilter,
} from "../filtering/streamTransforms/lineStream";

export interface AutocompleteLanguageInfo {
  /**
   * The display name of the language
   */
  name: string;
  /**
   * Keywords that show up at the top-level of files. We often use these as stop words or soft breaks
   */
  topLevelKeywords: string[];
  /**
   * The character that prefixes a single line comment
   * We use this to format snippets from other files as large comment blocks
   */
  singleLineComment?: string;
  /**
   * Semi-colon or other end of line indicator that may be used as a stop char
   * or other parsing
   */
  endOfLine: string[];
  /**
   * Strings that indicate we should filter out a line from completion
   * Primarily currently used for .ipynb files
   */
  lineFilters?: LineFilter[];
  /**
   * Similar to line filters, but characters. I think.
   */
  charFilters?: CharacterFilter[];
  /**
   * Function that allows cusotmization of whether to use a multi-line completion on a per-language and completion basis
   */
  useMultiline?: (args: { prefix: string; suffix: string }) => boolean;
}

// TypeScript
const Typescript = {
  name: "TypeScript",
  topLevelKeywords: ["function", "class", "module", "export", "import"],
  singleLineComment: "//",
  endOfLine: [";"],
};

// JavaScript
const JavaScript = {
  name: "JavaScript",
  topLevelKeywords: ["function", "class", "module", "export", "import"],
  singleLineComment: "//",
  endOfLine: [";"],
};

// Python
const Python = {
  name: "Python",
  // """"#" is for .ipynb files, where we add '"""' surrounding markdown blocks.
  // This stops the model from trying to complete the start of a new markdown block
  topLevelKeywords: ["def", "class", '"""#'],
  singleLineComment: "#",
  endOfLine: [],
};

// Java
const Java = {
  name: "Java",
  topLevelKeywords: ["class", "function"],
  singleLineComment: "//",
  endOfLine: [";"],
};

// C++
const Cpp = {
  name: "C++",
  topLevelKeywords: ["class", "namespace", "template"],
  singleLineComment: "//",
  endOfLine: [";"],
};

// C#
const CSharp = {
  name: "C#",
  topLevelKeywords: ["class", "namespace", "void"],
  singleLineComment: "//",
  endOfLine: [";"],
};

// C
const C = {
  name: "C",
  topLevelKeywords: ["if", "else", "while", "for", "switch", "case"],
  singleLineComment: "//",
  endOfLine: [";"],
};

// Scala
const Scala = {
  name: "Scala",
  topLevelKeywords: ["def", "val", "var", "class", "object", "trait"],
  singleLineComment: "//",
  endOfLine: [";"],
};

// Go
const Go = {
  name: "Go",
  topLevelKeywords: ["func", "package", "import", "type"],
  singleLineComment: "//",
  endOfLine: [],
};

// Rust
const Rust = {
  name: "Rust",
  topLevelKeywords: ["fn", "mod", "pub", "struct", "enum", "trait"],
  singleLineComment: "//",
  endOfLine: [";"],
};

// Haskell
const Haskell = {
  name: "Haskell",
  topLevelKeywords: [
    "data",
    "type",
    "newtype",
    "class",
    "instance",
    "let",
    "in",
    "where",
  ],
  singleLineComment: "--",
  endOfLine: [],
};

// PHP
const PHP = {
  name: "PHP",
  topLevelKeywords: ["function", "class", "namespace", "use"],
  singleLineComment: "//",
  endOfLine: [";"],
};

// Ruby on Rails
const RubyOnRails = {
  name: "Ruby on Rails",
  topLevelKeywords: ["def", "class", "module"],
  singleLineComment: "#",
  endOfLine: [],
};

// Swift
const Swift = {
  name: "Swift",
  topLevelKeywords: ["func", "class", "struct", "import"],
  singleLineComment: "//",
  endOfLine: [";"],
};

// Kotlin
const Kotlin = {
  name: "Kotlin",
  topLevelKeywords: ["fun", "class", "package", "import"],
  singleLineComment: "//",
  endOfLine: [";"],
};

// Ruby
const Ruby = {
  name: "Ruby",
  topLevelKeywords: ["class", "module", "def"],
  singleLineComment: "#",
  endOfLine: [],
};

// Clojure
const Clojure = {
  name: "Clojure",
  topLevelKeywords: ["def", "fn", "let", "do", "if", "defn", "ns", "defmacro"],
  singleLineComment: ";",
  endOfLine: [],
};

// Julia
const Julia = {
  name: "Julia",
  topLevelKeywords: [
    "function",
    "macro",
    "if",
    "else",
    "elseif",
    "while",
    "for",
    "begin",
    "end",
    "module",
  ],
  singleLineComment: "#",
  endOfLine: [";"],
};

// F#
const FSharp = {
  name: "F#",
  topLevelKeywords: [
    "let",
    "type",
    "module",
    "namespace",
    "open",
    "if",
    "then",
    "else",
    "match",
    "with",
  ],
  singleLineComment: "//",
  endOfLine: [],
};

// R
const R = {
  name: "R",
  topLevelKeywords: [
    "function",
    "if",
    "else",
    "for",
    "while",
    "repeat",
    "library",
    "require",
  ],
  singleLineComment: "#",
  endOfLine: [],
};

// Dart
const Dart = {
  name: "Dart",
  topLevelKeywords: ["class", "import", "void", "enum"],
  singleLineComment: "//",
  endOfLine: [";"],
};

// Solidity
const Solidity = {
  name: "Solidity",
  topLevelKeywords: [
    "contract",
    "event",
    "modifier",
    "function",
    "constructor",
    "for",
    "require",
    "emit",
    "interface",
    "error",
    "library",
    "struct",
    "enum",
    "type",
  ],
  singleLineComment: "//",
  endOfLine: [";"],
};

// Lua
const Lua = {
  name: "Lua",
  topLevelKeywords: ["function"],
  singleLineComment: "--",
  endOfLine: [],
};

// YAML
const YAML: AutocompleteLanguageInfo = {
  name: "YAML",
  topLevelKeywords: [],
  singleLineComment: "#",
  endOfLine: [],
  lineFilters: [
    // Only display one list item at a time
    async function* ({ lines, fullStop }) {
      let seenListItem = false;
      for await (const line of lines) {
        if (line.trim().startsWith("- ")) {
          if (seenListItem) {
            fullStop();
            break;
          } else {
            seenListItem = true;
          }
        }
        yield line;
      }
    },
    // Don't allow consecutive lines of same key
    async function* ({ lines }) {
      let lastKey = undefined;
      for await (const line of lines) {
        if (line.includes(":")) {
          const key = line.split(":")[0];
          if (key === lastKey) {
            break;
          } else {
            yield line;
            lastKey = key;
          }
        } else {
          yield line;
        }
      }
    },
  ],
};

const Json: AutocompleteLanguageInfo = {
  name: "JSON",
  topLevelKeywords: [],
  singleLineComment: "//",
  endOfLine: [",", "}", "]"],
  charFilters: [
    function matchBrackets({ chars, prefix, suffix, filepath, multiline }) {
      const bracketMatchingService = new BracketMatchingService();
      return bracketMatchingService.stopOnUnmatchedClosingBracket(
        chars,
        prefix,
        suffix,
        filepath,
        multiline,
      );
    },
  ],
};

const Markdown: AutocompleteLanguageInfo = {
  name: "Markdown",
  topLevelKeywords: [],
  singleLineComment: "",
  endOfLine: [],
  useMultiline: ({ prefix, suffix }) => {
    const singleLineStarters = ["- ", "* ", /^\d+\. /, "> ", "```", /^#{1,6} /];
    let currentLine = prefix.split("\n").pop();
    if (!currentLine) {
      return true;
    }
    currentLine = currentLine.trim();
    for (const starter of singleLineStarters) {
      if (
        typeof starter === "string"
          ? currentLine.startsWith(starter)
          : starter.test(currentLine)
      ) {
        return false;
      }
    }
    return true;
  },
};

export const LANGUAGES: { [extension: string]: AutocompleteLanguageInfo } = {
  ts: Typescript,
  js: JavaScript,
  tsx: Typescript,
  json: Json,
  jsx: Typescript,
  ipynb: Python,
  py: Python,
  pyi: Python,
  java: Java,
  cpp: Cpp,
  cxx: Cpp,
  h: Cpp,
  hpp: Cpp,
  cs: CSharp,
  c: C,
  scala: Scala,
  sc: Scala,
  go: Go,
  rs: Rust,
  hs: Haskell,
  php: PHP,
  rb: Ruby,
  rails: RubyOnRails,
  swift: Swift,
  kt: Kotlin,
  clj: Clojure,
  cljs: Clojure,
  cljc: Clojure,
  jl: Julia,
  fs: FSharp,
  fsi: FSharp,
  fsx: FSharp,
  fsscript: FSharp,
  r: R,
  R: R,
  dart: Dart,
  sol: Solidity,
  yaml: YAML,
  yml: YAML,
  md: Markdown,
  lua: Lua,
  luau: Lua,
};

export function languageForFilepath(fileUri: string): AutocompleteLanguageInfo {
  const extension = getUriFileExtension(fileUri);
  return LANGUAGES[extension] || Typescript;
}
