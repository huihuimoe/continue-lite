import { describe, expect, it } from "vitest";
import { escapeForSVG, kebabOfStr, kebabOfThemeStr } from "./text";

describe("escapeForSVG", () => {
  it("should escape XML entities", () => {
    expect(escapeForSVG("Hello & World")).toBe("Hello &amp; World");
    expect(escapeForSVG("Hello < World")).toBe("Hello &lt; World");
    expect(escapeForSVG("Hello > World")).toBe("Hello &gt; World");
    expect(escapeForSVG('Hello "World"')).toBe("Hello &quot;World&quot;");
    expect(escapeForSVG("Hello 'World'")).toBe("Hello &apos;World&apos;");
  });

  it("should escape whitespace characters as literal escape sequences", () => {
    expect(escapeForSVG("Hello\nWorld")).toBe("Hello\\nWorld");
    expect(escapeForSVG("Hello\tWorld")).toBe("Hello\\tWorld");
    expect(escapeForSVG("Hello\rWorld")).toBe("Hello\\rWorld");
  });

  it("should handle multiple types of characters together", () => {
    expect(escapeForSVG("Line1\nLine2&<>\"'Tab\tHere")).toBe(
      "Line1\\nLine2&amp;&lt;&gt;&quot;&apos;Tab\\tHere",
    );
  });

  it("should handle empty strings", () => {
    expect(escapeForSVG("")).toBe("");
  });

  it("should handle strings with only whitespace characters", () => {
    expect(escapeForSVG("\n\t\r")).toBe("\\n\\t\\r");
  });

  it("should handle strings without special characters", () => {
    expect(escapeForSVG("Hello World 123")).toBe("Hello World 123");
  });

  it("should handle complex multiline code examples", () => {
    const codeExample = `function test() {
  console.log("Hello & World");
  return true;
}`;
    const expected = `function test() {\\n  console.log(&quot;Hello &amp; World&quot;);\\n  return true;\\n}`;
    expect(escapeForSVG(codeExample)).toBe(expected);
  });

  it("should handle edge case with all escape types", () => {
    expect(escapeForSVG("&<>\"'\n\t\r")).toBe(
      "&amp;&lt;&gt;&quot;&apos;\\n\\t\\r",
    );
  });
});

describe("kebabOfStr", () => {
  it("should convert camelCase to kebab-case", () => {
    expect(kebabOfStr("camelCase")).toBe("camel-case");
    expect(kebabOfStr("someVariableName")).toBe("some-variable-name");
  });

  it("should convert PascalCase to kebab-case", () => {
    expect(kebabOfStr("PascalCase")).toBe("pascal-case");
    expect(kebabOfStr("SomeClassName")).toBe("some-class-name");
  });

  it("should convert spaces to hyphens", () => {
    expect(kebabOfStr("hello world")).toBe("hello-world");
    expect(kebabOfStr("multiple   spaces")).toBe("multiple-spaces");
  });

  it("should convert underscores to hyphens", () => {
    expect(kebabOfStr("snake_case")).toBe("snake-case");
    expect(kebabOfStr("multiple___underscores")).toBe("multiple-underscores");
  });

  it("should convert mixed formats", () => {
    expect(kebabOfStr("mixedCase_with spaces")).toBe("mixed-case-with-spaces");
    expect(kebabOfStr("PascalCase_Snake SPACE")).toBe(
      "pascal-case-snake-space",
    );
  });

  it("should handle already kebab-case strings", () => {
    expect(kebabOfStr("already-kebab")).toBe("already-kebab");
  });

  it("should handle strings with numbers", () => {
    expect(kebabOfStr("version2Beta")).toBe("version2-beta");
    expect(kebabOfStr("test123Case")).toBe("test123-case");
  });

  it("should handle empty strings", () => {
    expect(kebabOfStr("")).toBe("");
  });

  it("should handle single characters", () => {
    expect(kebabOfStr("A")).toBe("a");
    expect(kebabOfStr("a")).toBe("a");
  });

  it("should handle special characters", () => {
    expect(kebabOfStr("hello@world")).toBe("hello@world");
    expect(kebabOfStr("test.file.name")).toBe("test.file.name");
  });

  it("should convert to lowercase", () => {
    expect(kebabOfStr("UPPERCASE")).toBe("uppercase");
    expect(kebabOfStr("MiXeD cAsE")).toBe("mi-xe-d-c-as-e");
  });
});

describe("kebabOfThemeStr", () => {
  it("should convert spaces to hyphens", () => {
    expect(kebabOfThemeStr("hello world")).toBe("hello-world");
    expect(kebabOfThemeStr("multiple   spaces")).toBe("multiple-spaces");
  });

  it("should convert underscores to hyphens", () => {
    expect(kebabOfThemeStr("snake_case")).toBe("snake-case");
    expect(kebabOfThemeStr("multiple___underscores")).toBe(
      "multiple-underscores",
    );
  });

  it("should convert mixed spaces and underscores", () => {
    expect(kebabOfThemeStr("mixed_ case")).toBe("mixed-case");
    expect(kebabOfThemeStr("theme name_variant")).toBe("theme-name-variant");
  });

  it("should convert to lowercase", () => {
    expect(kebabOfThemeStr("UPPERCASE")).toBe("uppercase");
    expect(kebabOfThemeStr("MiXeD CaSe")).toBe("mixed-case");
  });

  it("should handle already kebab-case strings", () => {
    expect(kebabOfThemeStr("already-kebab")).toBe("already-kebab");
  });

  it("should handle empty strings", () => {
    expect(kebabOfThemeStr("")).toBe("");
  });

  it("should handle single characters", () => {
    expect(kebabOfThemeStr("A")).toBe("a");
    expect(kebabOfThemeStr("a")).toBe("a");
  });

  it("should preserve other special characters", () => {
    expect(kebabOfThemeStr("hello@world")).toBe("hello@world");
    expect(kebabOfThemeStr("test.file.name")).toBe("test.file.name");
  });

  it("should not convert camelCase (unlike kebabOfStr)", () => {
    expect(kebabOfThemeStr("camelCase")).toBe("camelcase");
    expect(kebabOfThemeStr("PascalCase")).toBe("pascalcase");
  });

  it("should handle strings with numbers", () => {
    expect(kebabOfThemeStr("theme_v2 beta")).toBe("theme-v2-beta");
    expect(kebabOfThemeStr("version_123_FINAL")).toBe("version-123-final");
  });

  it("should handle strings with parentheses", () => {
    expect(kebabOfThemeStr("theme_v2 (beta)")).toBe("theme-v2-beta");
    expect(kebabOfThemeStr("Gruvbox Dark (Hard)")).toBe("gruvbox-dark-hard");
  });
});
