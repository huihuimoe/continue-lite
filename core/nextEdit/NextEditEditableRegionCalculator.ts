import Parser from "web-tree-sitter";
import { IDE, RangeInFile } from "..";
import { DocumentHistoryTracker } from "./DocumentHistoryTracker";

export enum EditableRegionStrategy {
  Static = "static",
}

export async function getNextEditableRegion(
  _strategy: EditableRegionStrategy,
  ctx: any,
): Promise<RangeInFile[] | null> {
  return staticJump(ctx);
}

async function staticJump(ctx: {
  cursorPosition: { line: number; character: number };
  filepath: string;
  ide: IDE;
}): Promise<RangeInFile[] | null> {
  try {
    const { cursorPosition, filepath, ide } = ctx;
    if (!cursorPosition || !filepath || !ide) {
      console.warn(
        "Missing required context for static jump:",
        !cursorPosition,
        !filepath,
        !ide,
      );
      return null;
    }

    const tree =
      await DocumentHistoryTracker.getInstance().getMostRecentAst(filepath);
    if (!tree) return null;

    const point = {
      row: cursorPosition.line,
      column: cursorPosition.character,
    };

    const nodeAtCursor = tree.rootNode.descendantForPosition(point);
    if (!nodeAtCursor) {
      console.log("No node found at cursor position");
      return null;
    }

    const identifierNode = findClosestIdentifierNode(nodeAtCursor);
    if (!identifierNode) {
      console.log("No identifier node found near cursor position");
      return null;
    }
    const references = await ide.getReferences({
      filepath,
      position: {
        line: identifierNode.startPosition.row,
        character: identifierNode.startPosition.column,
      },
    });

    if (!references || references.length === 0) {
      console.log(`No references found for identifier: ${identifierNode.text}`);
      return null;
    }
    return references.length > 1 ? references.slice(1) : null;
  } catch (error) {
    console.error("Error in staticJump:", error);
    return null;
  }
}

function findClosestIdentifierNode(
  node: Parser.SyntaxNode | null,
): Parser.SyntaxNode | null {
  if (!node) return null;

  if (isIdentifierNode(node)) return node;
  if (isDeclarationNode(node)) return findLeftmostIdentifier(node);

  const parent = node.parent;
  if (parent && isIdentifierNode(parent)) {
    return parent;
  }

  if (parent) {
    if (isDeclarationNode(parent)) return findLeftmostIdentifier(parent);

    for (let i = 0; i < parent.childCount; ++i) {
      const sibling = parent.child(i);
      if (sibling && isIdentifierNode(sibling)) {
        return sibling;
      }
    }
  }

  return findClosestIdentifierNode(parent);
}

function findLeftmostIdentifier(
  node: Parser.SyntaxNode,
): Parser.SyntaxNode | null {
  if (isIdentifierNode(node)) return node;

  for (let i = 0; i < node.childCount; ++i) {
    const child = node.child(i);
    if (child) {
      const result = findLeftmostIdentifier(child);
      if (result) return result;
    }
  }

  return null;
}

function isIdentifierNode(node: Parser.SyntaxNode) {
  const nodeType = node.type;

  if (nodeType === "identifier") return true;
  if (nodeType.includes("identifier")) return true;

  const specialIdentifiers = ["name", "constant"];
  return specialIdentifiers.includes(nodeType);
}

function isDeclarationNode(node: Parser.SyntaxNode) {
  const nodeType = node.type;

  if (nodeType.endsWith("_declaration")) return true;
  if (nodeType.endsWith("_definition")) return true;
  if (nodeType.endsWith("_item")) return true;

  const declarationTypes = [
    "function_definition",
    "class_definition",
    "async_function_definition",
    "decorated_definition",
    "method",
    "class",
    "module",
    "singleton_method",
    "variable_declarator",
    "local_variable_declaration",
    "short_var_declaration",
    "method_definition",
  ];

  return declarationTypes.includes(nodeType);
}
