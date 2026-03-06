/**
 * CodeRenderer is a class that, when given a code string,
 * highlights the code string using shiki and
 * returns a svg representation of it.
 * We could technically just call shiki's methods to do a
 * one-liner syntax highlighting code, but
 * a separate class for this is useful because
 * we rarely ever need syntax highlighting outside of
 * creating a render of it.
 */
import {
  transformerNotationDiff,
  transformerNotationHighlight,
} from "@shikijs/transformers";
import {
  BundledLanguage,
  BundledTheme,
  getSingletonHighlighter,
  Highlighter,
} from "shiki";
import { DiffChar, DiffLine } from "..";
import { escapeForSVG, kebabOfThemeStr } from "../util/text";

interface CodeRendererOptions {
  themesDir?: string;
  theme?: string;
}

interface HTMLOptions {
  theme?: string;
  customCSS?: string;
  containerClass?: string;
}

interface ConversionOptions extends HTMLOptions {
  transparent?: boolean;
  imageType: "svg";
  fontSize: number;
  fontFamily: string;
  dimensions: Dimensions;
  lineHeight: number;
}

interface Dimensions {
  width: number;
  height: number;
}

type DataUri = PngUri | SvgUri;
type PngUri = string;
type SvgUri = string;

type ParsedShikiSpan = {
  text: string;
  style: string;
  className: string;
};

type ParsedShikiLine = {
  className: string;
  spans: ParsedShikiSpan[];
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]+>/g, ""));
}

function getAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1] ?? "";
}

function parseShikiLines(shikiHtml: string): ParsedShikiLine[] {
  const codeBlockMatch = shikiHtml.match(/<code>([\s\S]*?)<\/code>/);
  if (!codeBlockMatch) {
    return [];
  }

  return Array.from(codeBlockMatch[1].matchAll(/<span class="([^"]*)">([\s\S]*?)<\/span>/g)).map(
    ([, className, content]) => ({
      className,
      spans: Array.from(content.matchAll(/<span([^>]*)>([\s\S]*?)<\/span>|([^<]+)/g)).map(
        (match) => {
          const tag = match[1] ?? "";
          const nestedText = match[2];
          const plainText = match[3];
          return {
            text: stripTags(nestedText ?? plainText ?? ""),
            style: getAttribute(tag, "style"),
            className: getAttribute(tag, "class"),
          };
        },
      ),
    }),
  );
}

function getPreBackgroundColor(shikiHtml: string): string {
  const preMatch = shikiHtml.match(/<pre[^>]*style="([^"]*)"/);
  const style = preMatch?.[1] ?? "";
  return style.match(/background-color:\s*(#[0-9a-fA-F]{6})/)?.[1] ?? "#333333";
}

export class CodeRenderer {
  private static instance: CodeRenderer;
  private currentTheme: string = "dark-plus";
  private editorBackground: string = "#000000";
  private editorForeground: string = "#FFFFFF";
  private editorLineHighlight: string = "#000000";
  private highlighter: Highlighter | null = null;

  private constructor() {}

  static getInstance(): CodeRenderer {
    if (!CodeRenderer.instance) {
      CodeRenderer.instance = new CodeRenderer();
    }
    return CodeRenderer.instance;
  }

  public async setTheme(themeName: string): Promise<void> {
    if (
      this.themeExists(kebabOfThemeStr(themeName)) ||
      themeName === "Default Dark Modern"
    ) {
      this.currentTheme =
        themeName === "Default Dark Modern"
          ? "dark-plus"
          : kebabOfThemeStr(themeName);
    } else {
      // Fallback to default theme for unsupported themes.
      this.currentTheme = "dark-plus";
    }

    // Always initialize the highlighter with the current theme.
    this.highlighter = await getSingletonHighlighter({
      langs: ["typescript"],
      themes: [this.currentTheme],
    });

    const th = this.highlighter.getTheme(this.currentTheme);
    this.editorBackground = th.bg;
    this.editorForeground = th.fg;
    this.editorLineHighlight =
      th.colors!["editor.lineHighlightBackground"] ?? "#000000";
  }

  async init(): Promise<void> {}

  async close(): Promise<void> {}

  themeExists(themeNameKebab: string): themeNameKebab is BundledTheme {
    const themeArray: BundledTheme[] = [
      "andromeeda",
      "aurora-x",
      "ayu-dark",
      "catppuccin-frappe",
      "catppuccin-latte",
      "catppuccin-macchiato",
      "catppuccin-mocha",
      "dark-plus",
      "dracula",
      "dracula-soft",
      "everforest-dark",
      "everforest-light",
      "github-dark",
      "github-dark-default",
      "github-dark-dimmed",
      "github-dark-high-contrast",
      "github-light",
      "github-light-default",
      "github-light-high-contrast",
      "gruvbox-dark-hard",
      "gruvbox-dark-medium",
      "gruvbox-dark-soft",
      "gruvbox-light-hard",
      "gruvbox-light-medium",
      "gruvbox-light-soft",
      "houston",
      "kanagawa-dragon",
      "kanagawa-lotus",
      "kanagawa-wave",
      "laserwave",
      "light-plus",
      "material-theme",
      "material-theme-darker",
      "material-theme-lighter",
      "material-theme-ocean",
      "material-theme-palenight",
      "min-dark",
      "min-light",
      "monokai",
      "night-owl",
      "nord",
      "one-dark-pro",
      "one-light",
      "plastic",
      "poimandres",
      "red",
      "rose-pine",
      "rose-pine-dawn",
      "rose-pine-moon",
      "slack-dark",
      "slack-ochin",
      "snazzy-light",
      "solarized-dark",
      "solarized-light",
      "synthwave-84",
      "tokyo-night",
      "vesper",
      "vitesse-black",
      "vitesse-dark",
      "vitesse-light",
    ];

    return themeArray.includes(themeNameKebab as BundledTheme);
  }

  async highlightCode(
    code: string,
    language: string = "javascript",
    currLineOffsetFromTop: number,
    newDiffLines: DiffLine[],
  ): Promise<string> {
    const lines = code.split("\n");
    const newDiffLineMap = new Set();

    if (newDiffLines) {
      newDiffLines.forEach((diffLine) => {
        if (diffLine.type === "new") {
          newDiffLineMap.add(diffLine.line);
        }
      });
    }

    const annotatedLines = [];

    // NOTE: Shiki's preprocessor deletes transformer annotations when applied to an empty line.
    // If you are transforming an empty line, make sure that
    // the transformation is applied to a non-empty line first.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Add highlight comment before target line.
      if (i + 1 === currLineOffsetFromTop && currLineOffsetFromTop >= 0) {
        annotatedLines.push("// [!code highlight:1]");
      }

      // Handle diff lines
      if (newDiffLineMap.has(line)) {
        if (line.trim() === "") {
          // For empty lines, add the magic comment on a separate line before.
          annotatedLines.push("// [!code ++]");
          annotatedLines.push(line); // The empty line itself.
        } else {
          // For non-empty lines, append the magic comment.
          annotatedLines.push(line + "// [!code ++]");
        }
        newDiffLineMap.delete(line);
      } else {
        annotatedLines.push(line);
      }
    }

    const annotatedCode = annotatedLines.join("\n");

    await this.highlighter!.loadLanguage(language as BundledLanguage);
    return this.highlighter!.codeToHtml(annotatedCode, {
      lang: language,
      theme: this.currentTheme,
      transformers: [transformerNotationHighlight(), transformerNotationDiff()],
    });
  }

  async convertToSVG(
    code: string,
    language: string = "javascript",
    options: ConversionOptions,
    currLineOffsetFromTop: number,
    newDiffLines: DiffLine[],
    newDiffChars: DiffChar[],
  ): Promise<Buffer> {
    const strokeWidth = 1;
    const highlightedCodeHtml = await this.highlightCode(
      code,
      language,
      currLineOffsetFromTop,
      newDiffLines,
    );

    const { guts, lineBackgrounds } = this.convertShikiHtmlToSvgGut(
      highlightedCodeHtml,
      options,
      newDiffChars,
    );
    const backgroundColor = this.getBackgroundColor(highlightedCodeHtml);
    const borderColor = "#6b6b6b";

    const lines = code.split("\n");
    const actualHeight = lines.length * options.lineHeight;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.dimensions.width}" height="${actualHeight}" shape-rendering="crispEdges">
    <style>
      :root {
        --purple: rgb(112, 114, 209);
        --green: rgb(136, 194, 163);
        --blue: rgb(107, 166, 205);
      }
    </style>
    <g>
    <rect x="0" y="0" rx="2" ry="2" width="${options.dimensions.width}" height="${actualHeight}" fill="${backgroundColor}" stroke="${borderColor}" stroke-width="${strokeWidth}" shape-rendering="crispEdges" />
      ${lineBackgrounds}
      ${guts}
    </g>
  </svg>`;

    return Buffer.from(svg, "utf8");
  }

  convertShikiHtmlToSvgGut(
    shikiHtml: string,
    options: ConversionOptions,
    diffChars: DiffChar[],
  ): { guts: string; lineBackgrounds: string } {
    const lines = parseShikiLines(shikiHtml);

    const additionSegmentsByLine = new Map<
      number,
      Array<{ start: number; end: number }>
    >();

    diffChars.forEach((diff) => {
      if (
        diff.type !== "new" ||
        diff.newLineIndex === undefined ||
        diff.newCharIndexInLine === undefined
      ) {
        return;
      }

      if (diff.char.includes("\n")) {
        return;
      }

      const start = diff.newCharIndexInLine;
      const end = start + diff.char.length;
      const existing = additionSegmentsByLine.get(diff.newLineIndex) ?? [];
      existing.push({ start, end });
      additionSegmentsByLine.set(diff.newLineIndex, existing);
    });

    additionSegmentsByLine.forEach((segments, lineIndex) => {
      segments.sort((a, b) => a.start - b.start);
      const merged: Array<{ start: number; end: number }> = [];
      segments.forEach((segment) => {
        if (merged.length === 0) {
          merged.push({ ...segment });
          return;
        }

        const last = merged[merged.length - 1];
        if (segment.start <= last.end) {
          last.end = Math.max(last.end, segment.end);
        } else {
          merged.push({ ...segment });
        }
      });
      additionSegmentsByLine.set(lineIndex, merged);
    });
    const svgLines = lines.map((line, index) => {
      const spans = line.spans
        .map((span) => {
          const colorMatch = span.style.match(/color:\s*(#[0-9a-fA-F]{6})/);
          let fill = colorMatch ? ` fill="${colorMatch[1]}"` : "";
          if (span.className.includes("highlighted")) {
            fill = ` fill="${this.editorLineHighlight}"`;
          }

          return `<tspan xml:space="preserve"${fill}>${escapeForSVG(span.text)}</tspan>`;
        })
        .join("");

      const y = index * options.lineHeight + options.lineHeight / 2;
      return `<text x="0" y="${y}" font-family="${options.fontFamily}" font-size="${options.fontSize.toString()}" xml:space="preserve" dominant-baseline="central" shape-rendering="crispEdges">${spans}</text>`;
    });

    const estimatedCharWidth = options.fontSize * 0.6;
    const additionFill = "rgba(40, 167, 69, 0.25)";

    const lineBackgrounds = lines
      .map((line, index) => {
        const classes = line.className;
        const y = index * options.lineHeight;
        const segments = additionSegmentsByLine.get(index) ?? [];
        const backgrounds: string[] = [];

        if (classes.includes("highlighted")) {
          backgrounds.push(
            `<rect x="0" y="${y}" width="100%" height="${options.lineHeight}" fill="${this.editorLineHighlight}" shape-rendering="crispEdges" />`,
          );
        }

        segments.forEach(({ start, end }) => {
          const widthInChars = Math.max(end - start, 0);
          if (widthInChars <= 0) {
            return;
          }
          const x = start * estimatedCharWidth;
          const segmentWidth = widthInChars * estimatedCharWidth;
          backgrounds.push(
            `<rect x="${x}" y="${y}" width="${segmentWidth}" height="${options.lineHeight}" fill="${additionFill}" shape-rendering="crispEdges" />`,
          );
        });

        return backgrounds.join("\n");
      })
      .filter((bg) => bg.length > 0)
      .join("\n");

    return {
      guts: svgLines.join("\n"),
      lineBackgrounds,
    };
  }

  getBackgroundColor(shikiHtml: string): string {
    return getPreBackgroundColor(shikiHtml);
  }

  async getDataUri(
    code: string,
    language: string = "javascript",
    options: ConversionOptions,
    currLineOffsetFromTop: number,
    newDiffLines: DiffLine[],
    newDiffChars: DiffChar[],
  ): Promise<DataUri> {
    switch (options.imageType) {
      // case "png":
      //   const pngBuffer = await this.convertToPNG(
      //     code,
      //     language,
      //     fontSize,
      //     dimensions,
      //     lineHeight,
      //     options,
      //   );
      //   return `data:image/png;base64,${pngBuffer.data.toString("base64")}`;
      case "svg":
        const svgBuffer = await this.convertToSVG(
          code,
          language,
          options,
          currLineOffsetFromTop,
          newDiffLines,
          newDiffChars,
        );
        return `data:image/svg+xml;base64,${svgBuffer.toString("base64")}`;
    }
  }
}
