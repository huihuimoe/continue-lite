import { beforeEach, describe, expect, it, vi } from "vitest";

import * as vscode from "vscode";

import setupNextEditWindowManager, {
  NextEditWindowManager,
} from "../activation/NextEditWindowManager";
import { JumpManager } from "../activation/JumpManager";
import { GhostTextAcceptanceTracker } from "../autocomplete/GhostTextAcceptanceTracker";
import { VsCodeExtension } from "./VsCodeExtension";

const mocks = vi.hoisted(() => ({
  workspaceConfig: {
    get: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  showWarningMessage: vi.fn(async () => undefined),
  executeCommand: vi.fn(async () => undefined),
  setupNextEditWindowManager: vi.fn(async () => undefined),
  freeTabAndEsc: vi.fn(async () => undefined),
  clearNextEditWindowManager: vi.fn(),
  nextEditWindowManagerInstance: {
    registerSelectionChangeHandler: vi.fn(),
    hasAccepted: vi.fn(() => false),
  },
  jumpManagerInstance: {
    registerSelectionChangeHandler: vi.fn(),
  },
  clearJumpManager: vi.fn(),
  ghostTextAcceptanceTrackerInstance: {
    registerSelectionChangeHandler: vi.fn(),
  },
  clearGhostTextAcceptanceTracker: vi.fn(),
  selectionChangeManagerInstance: {
    initialize: vi.fn(),
    registerListener: vi.fn(),
    updateUsingFullFileDiff: vi.fn(),
  },
  updateUsingFullFileDiff: vi.fn(),
  activateNextEdit: vi.fn(),
  deactivateNextEdit: vi.fn(),
  monitorBatteryChanges: vi.fn(() => ({ dispose: vi.fn() })),
  setupStatusBar: vi.fn(),
  registerAllCommands: vi.fn(),
  fsWatchFile: vi.fn(),
  fsUnwatchFile: vi.fn(),
  clearDocumentContentCache: vi.fn(),
  handleTextDocumentChange: vi.fn(),
  initDocumentContentCache: vi.fn(),
  fsExistsSync: vi.fn(() => false),
  fsWatch: vi.fn(),
}));

vi.mock("fs", () => ({
  default: {
    watchFile: mocks.fsWatchFile,
    unwatchFile: mocks.fsUnwatchFile,
    existsSync: mocks.fsExistsSync,
    watch: mocks.fsWatch,
  },
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => mocks.workspaceConfig),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidDeleteFiles: vi.fn(() => ({ dispose: vi.fn() })),
    onDidCreateFiles: vi.fn(() => ({ dispose: vi.fn() })),
    textDocuments: [],
    notebookDocuments: [],
  },
  window: {
    showWarningMessage: mocks.showWarningMessage,
    onDidChangeVisibleTextEditors: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeTextEditorSelection: vi.fn(() => ({ dispose: vi.fn() })),
  },
  commands: {
    executeCommand: mocks.executeCommand,
  },
  languages: {
    registerInlineCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
  },
  ConfigurationTarget: {
    Global: 1,
  },
}));

vi.mock("core/config/ConfigHandler", () => ({
  ConfigHandler: class {},
}));

vi.mock("core/control-plane/env", () => ({
  EXTENSION_NAME: "continue",
}));

vi.mock("core/core", () => ({
  Core: class {
    configHandler = {
      loadConfig: vi.fn(async () => ({
        config: {
          selectedModelByRole: {},
        },
      })),
      onConfigUpdate: vi.fn(),
      reloadConfig: vi.fn(),
    };
    invoke = vi.fn();
  },
}));

vi.mock("core/protocol", () => ({}));

vi.mock("core/protocol/messenger", () => ({
  InProcessMessenger: class {
    externalOn = vi.fn();
  },
}));

vi.mock("core/util/paths", () => ({
  getConfigYamlPath: vi.fn(() => "/tmp/config.yaml"),
  getContinueGlobalPath: vi.fn(() => "/tmp"),
}));

vi.mock("../autocomplete/completionProvider", () => ({
  ContinueCompletionProvider: class {
    updateUsingFullFileDiff = mocks.updateUsingFullFileDiff;
    activateNextEdit = mocks.activateNextEdit;
    deactivateNextEdit = mocks.deactivateNextEdit;
  },
}));

vi.mock("../autocomplete/statusBar", () => ({
  monitorBatteryChanges: mocks.monitorBatteryChanges,
  setupStatusBar: mocks.setupStatusBar,
  StatusBarStatus: {
    Enabled: "enabled",
    Disabled: "disabled",
    Paused: "paused",
  },
}));

vi.mock("../activation/SelectionChangeManager", () => ({
  HandlerPriority: {
    NORMAL: 1,
  },
  SelectionChangeManager: {
    getInstance: () => mocks.selectionChangeManagerInstance,
  },
}));

vi.mock("../activation/JumpManager", () => ({
  JumpManager: {
    getInstance: () => mocks.jumpManagerInstance,
    clearInstance: mocks.clearJumpManager,
  },
}));

vi.mock("../activation/NextEditWindowManager", () => ({
  default: mocks.setupNextEditWindowManager,
  NextEditWindowManager: {
    freeTabAndEsc: mocks.freeTabAndEsc,
    getInstance: () => mocks.nextEditWindowManagerInstance,
    clearInstance: mocks.clearNextEditWindowManager,
  },
}));

vi.mock("../autocomplete/GhostTextAcceptanceTracker", () => ({
  GhostTextAcceptanceTracker: {
    getInstance: () => mocks.ghostTextAcceptanceTrackerInstance,
    clearInstance: mocks.clearGhostTextAcceptanceTracker,
  },
}));

vi.mock("../autocomplete/lsp", () => ({
  getDefinitionsFromLsp: vi.fn(),
}));

vi.mock("../commands", () => ({
  registerAllCommands: mocks.registerAllCommands,
}));

vi.mock("../util/battery", () => ({
  Battery: class {},
}));

vi.mock("../util/editLoggingUtils", () => ({
  clearDocumentContentCache: mocks.clearDocumentContentCache,
  handleTextDocumentChange: mocks.handleTextDocumentChange,
  initDocumentContentCache: mocks.initDocumentContentCache,
}));

vi.mock("../util/ideUtils", () => ({
  VsCodeIdeUtils: class {
    getOpenFiles = vi.fn(() => []);
  },
}));

vi.mock("../VsCodeIde", () => ({
  VsCodeIde: class {
    onDidChangeActiveTextEditor = vi.fn();
    getIdeInfo = vi.fn();
    getIdeSettings = vi.fn();
  },
}));

vi.mock("core/llm/autodetect", () => ({
  modelSupportsNextEdit: vi.fn(
    (_capabilities: unknown, model?: string, title?: string) =>
      [model, title].some((value) => value?.includes("sweep-next-edit")) ??
      false,
  ),
}));

vi.mock("core/llm/constants", () => ({
  NEXT_EDIT_MODELS: {
    INSTINCT: "instinct",
    SWEEP_NEXT_EDIT: "sweep-next-edit",
  },
}));

vi.mock("core/nextEdit/NextEditProvider", () => ({
  NextEditProvider: {
    getInstance: vi.fn(),
  },
}));

vi.mock("core/nextEdit/utils", () => ({
  isNextEditTest: vi.fn(() => false),
}));

describe("VsCodeExtension updateNextEditState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceConfig.get.mockReturnValue(undefined);
    mocks.workspaceConfig.update.mockResolvedValue(undefined);
  });

  it("enables Next Edit for the sweep-next-edit autocomplete model", async () => {
    const extension = createExtension({
      model: "sweep-next-edit",
      title: "Sweep Next Edit",
    });

    await extension.updateNextEditState({ subscriptions: [] } as any);

    expect(mocks.workspaceConfig.update).toHaveBeenCalledWith(
      "enableNextEdit",
      true,
      vscode.ConfigurationTarget.Global,
    );
    expect(setupNextEditWindowManager).toHaveBeenCalledWith({
      subscriptions: [],
    });
    expect(extension.completionProvider.activateNextEdit).toHaveBeenCalledTimes(
      1,
    );
    expect(NextEditWindowManager.freeTabAndEsc).toHaveBeenCalledTimes(1);
    expect(
      JumpManager.getInstance().registerSelectionChangeHandler,
    ).toHaveBeenCalledTimes(1);
    expect(
      GhostTextAcceptanceTracker.getInstance().registerSelectionChangeHandler,
    ).toHaveBeenCalledTimes(1);
    expect(
      NextEditWindowManager.getInstance().registerSelectionChangeHandler,
    ).toHaveBeenCalledTimes(1);
  });

  it("keeps unsupported autocomplete models on the regular completion path", async () => {
    const extension = createExtension({
      model: "gpt-4.1",
      title: "GPT-4.1",
    });

    await extension.updateNextEditState({ subscriptions: [] } as any);

    expect(mocks.workspaceConfig.update).toHaveBeenCalledWith(
      "enableNextEdit",
      false,
      vscode.ConfigurationTarget.Global,
    );
    expect(setupNextEditWindowManager).not.toHaveBeenCalled();
    expect(
      extension.completionProvider.deactivateNextEdit,
    ).toHaveBeenCalledTimes(1);
    expect(NextEditWindowManager.clearInstance).toHaveBeenCalledTimes(1);
    expect(JumpManager.clearInstance).toHaveBeenCalledTimes(1);
    expect(GhostTextAcceptanceTracker.clearInstance).toHaveBeenCalledTimes(1);
    expect(NextEditWindowManager.freeTabAndEsc).toHaveBeenCalledTimes(1);
  });
});

describe("VsCodeExtension constructor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("watches only the global YAML config file", () => {
    new VsCodeExtension({ subscriptions: [] } as vscode.ExtensionContext);

    expect(mocks.fsWatchFile).toHaveBeenCalledTimes(1);
    expect(mocks.fsWatchFile).toHaveBeenCalledWith(
      "/tmp/config.yaml",
      { interval: 1000 },
      expect.any(Function),
    );
  });
});

function createExtension(autocompleteModel?: {
  model: string;
  title?: string;
}) {
  type TestVsCodeExtension = {
    configHandler: {
      loadConfig: ReturnType<typeof vi.fn>;
    };
    completionProvider: {
      activateNextEdit: ReturnType<typeof vi.fn>;
      deactivateNextEdit: ReturnType<typeof vi.fn>;
    };
    updateNextEditState: (context: vscode.ExtensionContext) => Promise<void>;
  };

  const extension = Object.create(
    VsCodeExtension.prototype,
  ) as TestVsCodeExtension;

  extension.configHandler = {
    loadConfig: vi.fn(async () => ({
      config: {
        selectedModelByRole: {
          autocomplete: autocompleteModel,
        },
      },
    })),
  };

  extension.completionProvider = {
    activateNextEdit: vi.fn(),
    deactivateNextEdit: vi.fn(),
  };

  return extension;
}
