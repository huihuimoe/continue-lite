import { NextEditProvider } from "core/nextEdit/NextEditProvider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { JumpManager } from "./JumpManager";

// Mock VSCode API
vi.mock("vscode", () => {
  return {
    window: {
      activeTextEditor: {
        document: {
          lineAt: vi.fn().mockReturnValue({
            text: "Sample line text",
            lineNumber: 0,
          }),
          getText: vi.fn().mockReturnValue("Sample document text"),
          lineCount: 5,
        },
        selection: {
          active: { line: 0, character: 0 },
        },
        setDecorations: vi.fn(),
        revealRange: vi.fn(),
        visibleRanges: [
          {
            start: { line: 0, character: 0 },
            end: { line: 4, character: 0 }, // Changed to be within document bounds
          },
        ],
      },
      createTextEditorDecorationType: vi.fn().mockReturnValue({
        dispose: vi.fn(),
      }),
      onDidChangeTextEditorSelection: vi.fn().mockReturnValue({
        dispose: vi.fn(),
      }),
    },
    workspace: {
      getConfiguration: vi.fn().mockImplementation((_section?: string) => {
        // Return a configuration object with a get method
        return {
          get: vi.fn().mockImplementation((key: string) => {
            if (key === "fontSize") return 14;
            if (key === "fontFamily") return "monaco";
            return undefined;
          }),
        };
      }),
      onDidChangeConfiguration: vi.fn().mockReturnValue({
        dispose: vi.fn(),
      }),
    },
    Position: class {
      constructor(
        public line: number,
        public character: number,
      ) {}
      isEqual(other: any) {
        return this.line === other.line && this.character === other.character;
      }
    },
    Selection: class {
      constructor(
        public anchor: any,
        public active: any,
      ) {}
    },
    Range: class {
      constructor(
        public start: any,
        public end: any,
      ) {}
    },
    TextEditorRevealType: {
      InCenter: 2,
    },
    ThemeColor: class {
      constructor(public id: string) {}
    },
    commands: {
      executeCommand: vi.fn(),
      registerCommand: vi.fn().mockReturnValue({
        dispose: vi.fn(),
      }),
    },
    Uri: {
      parse: vi.fn().mockReturnValue({ toString: () => "mock-uri" }),
    },
  };
});

// Mock getTheme utility
vi.mock("../util/getTheme", () => ({
  getTheme: vi.fn().mockReturnValue({
    colors: {
      "editor.foreground": "#ffffff",
      "editor.background": "#1e1e1e",
    },
  }),
}));

// Mock svg-builder
vi.mock("svg-builder", () => {
  const mockSvgBuilder = {
    width: vi.fn().mockReturnThis(),
    height: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    render: vi.fn().mockReturnValue("<svg>mock svg</svg>"),
  };
  return {
    default: mockSvgBuilder,
  };
});

// Mock NextEditProvider
vi.mock("core/nextEdit/NextEditProvider", () => {
  const mockDeleteChain = vi.fn();
  const mockGetInstance = vi.fn(() => ({
    deleteChain: mockDeleteChain,
  }));

  return {
    NextEditProvider: {
      getInstance: mockGetInstance,
    },
  };
});

describe("JumpManager", () => {
  let jumpManager: JumpManager;

  beforeEach(() => {
    // Clear mock history but keep implementations
    vi.clearAllMocks();

    // Create a proper TextLine mock
    const createMockTextLine = (text: string, lineNumber: number) => ({
      text,
      lineNumber,
      range: new vscode.Range(lineNumber, 0, lineNumber, text.length),
      rangeIncludingLineBreak: new vscode.Range(
        lineNumber,
        0,
        lineNumber + 1,
        0,
      ),
      firstNonWhitespaceCharacterIndex: text.search(/\S/),
      isEmptyOrWhitespace: text.trim().length === 0,
    });

    // Reset lineAt mock with proper TextLine objects
    if (vscode.window.activeTextEditor?.document.lineAt) {
      vi.mocked(
        vscode.window.activeTextEditor.document.lineAt,
        // @ts-ignore
      ).mockImplementation((line: number) =>
        createMockTextLine("Sample line text", line),
      );
    }

    // Clear any existing instance
    JumpManager.clearInstance();

    // Get a fresh instance
    jumpManager = JumpManager.getInstance();
  });

  afterEach(() => {
    jumpManager.dispose();
  });

  describe("getInstance", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = JumpManager.getInstance();
      const instance2 = JumpManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("clearInstance", () => {
    it("should dispose the current instance and clear it", () => {
      const instance = JumpManager.getInstance();
      const disposeSpy = vi.spyOn(instance, "dispose");

      JumpManager.clearInstance();

      expect(disposeSpy).toHaveBeenCalled();

      // Get a new instance
      const newInstance = JumpManager.getInstance();
      expect(newInstance).not.toBe(instance);
    });
  });

  describe("suggestJump", () => {
    it("should set jumpInProgress to true", async () => {
      const currentPosition = new vscode.Position(1, 0);
      const nextJumpLocation = new vscode.Position(3, 0);

      await jumpManager.suggestJump(currentPosition, nextJumpLocation);

      expect(jumpManager.isJumpInProgress()).toBe(true);
    });

    it("should not suggest jump if completion content matches document content", async () => {
      const currentPosition = new vscode.Position(1, 0);
      const nextJumpLocation = new vscode.Position(3, 0);
      const completionContent = "Test line content";

      // Mock document content to match the completion content
      const mockLineAt = vi.fn().mockReturnValue({
        text: "Test line content",
        lineNumber: 3,
      });

      // Override the mock for this specific test
      vi.mocked(
        vscode.window.activeTextEditor!.document.lineAt,
      ).mockImplementation(mockLineAt);

      const result = await jumpManager.suggestJump(
        currentPosition,
        nextJumpLocation,
        completionContent,
      );

      // Jump should not be suggested
      expect(result).toBe(false);
      expect(jumpManager.isJumpInProgress()).toBe(false);
      // Decorations should not be created
      expect(
        vscode.window.createTextEditorDecorationType,
      ).toHaveBeenCalledOnce(); // only during setup
    });

    it("should render decoration for jump location outside visible range (below)", async () => {
      const currentPosition = new vscode.Position(1, 0);
      const nextJumpLocation = new vscode.Position(8, 0); // Outside visible range (below)

      await jumpManager.suggestJump(currentPosition, nextJumpLocation);

      // Should create decoration
      expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalled();
      // Should set context
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "setContext",
        "continue.jumpDecorationVisible",
        true,
      );
      // Should register key listeners
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        "continue.acceptJump",
        expect.any(Function),
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        "continue.rejectJump",
        expect.any(Function),
      );
    });

    it("should render decoration for jump location outside visible range (above)", async () => {
      // Set visible range to be below the jump target
      const mockEditor = vscode.window.activeTextEditor!;
      Object.defineProperty(mockEditor, "visibleRanges", {
        value: [{ start: { line: 5 }, end: { line: 10 } }],
        writable: true,
      });

      const currentPosition = new vscode.Position(6, 0);
      const nextJumpLocation = new vscode.Position(2, 0); // Outside visible range (above)

      await jumpManager.suggestJump(currentPosition, nextJumpLocation);

      // Should create decoration
      expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalled();
    });

    it("should render decoration for jump location within visible range", async () => {
      const currentPosition = new vscode.Position(1, 0);
      const nextJumpLocation = new vscode.Position(2, 0); // Within visible range (0-4)

      await jumpManager.suggestJump(currentPosition, nextJumpLocation);

      // Should create decoration
      expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalled();
      // Should not reveal range
      expect(
        vscode.window.activeTextEditor!.revealRange,
      ).not.toHaveBeenCalled();
    });

    it("should call revealRange when jump is accepted", async () => {
      const currentPosition = new vscode.Position(1, 0);
      const nextJumpLocation = new vscode.Position(8, 0); // Outside visible range

      await jumpManager.suggestJump(currentPosition, nextJumpLocation);

      // Find the acceptJump command handler.
      const commandArgs = vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.find((call: any) => call[0] === "continue.acceptJump");
      expect(commandArgs).toBeDefined();
      const acceptJumpHandler = commandArgs![1];

      await acceptJumpHandler();

      // Should reveal the jump location range after jumping.
      expect(vscode.window.activeTextEditor!.revealRange).toHaveBeenCalledWith(
        new vscode.Range(nextJumpLocation.line, 0, nextJumpLocation.line, 0),
        vscode.TextEditorRevealType.InCenter,
      );
    });

    it("should reset jumpInProgress when jump is accepted", async () => {
      const currentPosition = new vscode.Position(1, 0);
      const nextJumpLocation = new vscode.Position(8, 0);

      await jumpManager.suggestJump(currentPosition, nextJumpLocation);
      expect(jumpManager.isJumpInProgress()).toBe(true);

      const commandArgs = vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.find((call: any) => call[0] === "continue.acceptJump");
      expect(commandArgs).toBeDefined();

      const acceptJumpHandler = commandArgs![1];
      await acceptJumpHandler();

      expect(jumpManager.isJumpInProgress()).toBe(false);
    });
  });

  describe("registerKeyListeners", () => {
    it("should register acceptJump command that moves cursor", async () => {
      // Setup private method access
      const privateJumpManager = jumpManager as any;

      // Mock context
      privateJumpManager._jumpDecorationVisible = true;

      // Create editor mock that matches the expected interface
      const editor = vscode.window.activeTextEditor!;

      // Create jump position
      const jumpPosition = new vscode.Position(3, 5);

      // Call the private method
      await privateJumpManager.registerKeyListeners(editor, jumpPosition);

      // Find the command handler
      const commandArgs = vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.find((call: any) => call[0] === "continue.acceptJump");
      expect(commandArgs).toBeDefined();
      const acceptJumpHandler = commandArgs![1];

      // Clear previous executeCommand calls
      vi.mocked(vscode.commands.executeCommand).mockClear();

      // Call the handler
      await acceptJumpHandler();

      // Expect selection to be updated
      expect(editor.selection).toEqual(
        new vscode.Selection(jumpPosition, jumpPosition),
      );
      // Expect decoration to be cleared
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "setContext",
        "continue.jumpDecorationVisible",
        false,
      );
      // Expect inline suggest to be triggered
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "editor.action.inlineSuggest.trigger",
      );
    });

    it("should register rejectJump command that deletes the chain", async () => {
      // Setup private method access
      const privateJumpManager = jumpManager as any;

      // Mock context
      privateJumpManager._jumpDecorationVisible = true;

      // Get a reference to the mocked deleteChain
      const mockDeleteChain = vi.mocked(
        NextEditProvider.getInstance().deleteChain,
      );
      mockDeleteChain.mockClear();

      // Call the private method
      await privateJumpManager.registerKeyListeners(
        vscode.window.activeTextEditor!,
        new vscode.Position(0, 0),
      );

      // Find the command handler
      const commandArgs = vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.find((call: any) => call[0] === "continue.rejectJump");
      expect(commandArgs).toBeDefined();
      const rejectJumpHandler = commandArgs![1];
      expect(rejectJumpHandler).toBeDefined();

      // Reset executeCommand mock
      vi.mocked(vscode.commands.executeCommand).mockClear();

      // Call the handler
      await rejectJumpHandler();

      // Expect NextEditProvider.deleteChain to be called
      expect(mockDeleteChain).toHaveBeenCalled();

      // Expect decoration to be cleared
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "setContext",
        "continue.jumpDecorationVisible",
        false,
      );
    });

    it("should reset jumpInProgress when jump is rejected", async () => {
      const currentPosition = new vscode.Position(1, 0);
      const nextJumpLocation = new vscode.Position(8, 0);

      await jumpManager.suggestJump(currentPosition, nextJumpLocation);
      expect(jumpManager.isJumpInProgress()).toBe(true);

      const commandArgs = vi
        .mocked(vscode.commands.registerCommand)
        .mock.calls.find((call: any) => call[0] === "continue.rejectJump");
      expect(commandArgs).toBeDefined();

      const rejectJumpHandler = commandArgs![1];
      await rejectJumpHandler();

      expect(jumpManager.isJumpInProgress()).toBe(false);
    });

    it("should register selection change listener that rejects jump on cursor movement", async () => {
      const privateJumpManager = jumpManager as any;
      privateJumpManager._jumpDecorationVisible = true;
      privateJumpManager._oldCursorPosition = new vscode.Position(1, 0);

      const jumpPosition = new vscode.Position(3, 0);

      await privateJumpManager.registerKeyListeners(
        vscode.window.activeTextEditor!,
        jumpPosition,
      );

      // Find the selection change listener
      expect(vscode.window.onDidChangeTextEditorSelection).toHaveBeenCalled();
      const selectionChangeListener = vi.mocked(
        vscode.window.onDidChangeTextEditorSelection,
      ).mock.calls[0][0];

      // Mock a selection change event that moves cursor away from both old and jump positions
      const newPosition = new vscode.Position(5, 0);
      const mockEvent = {
        textEditor: vscode.window.activeTextEditor!,
        kind: undefined, // Can be undefined according to VSCode API
        selections: [new vscode.Selection(newPosition, newPosition)], // Use proper Selection object
      };

      // Reset executeCommand mock
      vi.mocked(vscode.commands.executeCommand).mockClear();

      // Call the selection change listener
      selectionChangeListener(mockEvent);

      // Should trigger reject jump
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "continue.rejectJump",
      );
    });
  });

  describe("clearJumpDecoration", () => {
    it("should dispose decoration and reset state", async () => {
      // Setup private method access
      const privateJumpManager = jumpManager as any;

      // Create a mock decoration with a spy on dispose
      const mockDispose = vi.fn();
      privateJumpManager._jumpDecoration = {
        dispose: mockDispose,
      };
      privateJumpManager._jumpDecorationVisible = true;
      privateJumpManager._jumpInProgress = true;

      // Reset executeCommand mock
      vi.mocked(vscode.commands.executeCommand).mockClear();

      // Call the method
      await privateJumpManager.clearJumpDecoration();

      // Expect dispose to have been called
      expect(mockDispose).toHaveBeenCalled();

      // Expect decoration to be undefined after clearing
      expect(privateJumpManager._jumpDecoration).toBeUndefined();
      expect(privateJumpManager._jumpDecorationVisible).toBe(false);
      expect(jumpManager.isJumpInProgress()).toBe(false);

      // Expect context to be reset
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "setContext",
        "continue.jumpDecorationVisible",
        false,
      );
    });
  });
});
