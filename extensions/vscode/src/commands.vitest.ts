import { beforeEach, describe, expect, it, vi } from "vitest";

type AcceptCallback = () => Promise<void> | void;

let registeredCommands: Record<string, (...args: any[]) => unknown> = {};
let lastQuickPick: any;
let quickPickAcceptCallback: AcceptCallback | undefined;
let configValues: Record<string, any> = {};
let configUpdate: ReturnType<typeof vi.fn> = vi
  .fn()
  .mockResolvedValue(undefined);

vi.mock("vscode", () => ({
  commands: {
    registerCommand: vi.fn(
      (command: string, callback: (...args: any[]) => unknown) => {
        registeredCommands[command] = callback;
        return { dispose: vi.fn() };
      },
    ),
    executeCommand: vi.fn(),
  },
  window: {
    createQuickPick: vi.fn(() => {
      const quickPick = {
        items: [] as Array<Record<string, any>>,
        selectedItems: [] as Array<Record<string, any>>,
        show: vi.fn(),
        dispose: vi.fn(),
        onDidAccept: vi.fn((callback: AcceptCallback) => {
          quickPickAcceptCallback = callback;
          return { dispose: vi.fn() };
        }),
      };
      lastQuickPick = quickPick;
      return quickPick;
    }),
    showInformationMessage: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (key: string) => configValues[key],
      update: (...args: any[]) => configUpdate(...args),
    })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  },
  QuickPickItemKind: {
    Separator: 1,
  },
  ConfigurationTarget: {
    Global: 1,
  },
  StatusBarAlignment: {
    Right: 1,
  },
}));

import * as vscode from "vscode";
import { quickPickStatusText, StatusBarStatus } from "./autocomplete/statusBar";
import { registerAllCommands } from "./commands";

const createBattery = (connected = true) => ({
  isACConnected: vi.fn(() => connected),
  onChangeAC: vi.fn(() => ({ dispose: vi.fn() })),
});

const createConfigHandler = (config?: Record<string, any>) => ({
  loadConfig: vi.fn().mockResolvedValue({ config }),
  updateSelectedModel: vi.fn().mockResolvedValue(undefined),
});

describe("commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredCommands = {};
    lastQuickPick = undefined;
    quickPickAcceptCallback = undefined;
    configValues = {};
    configUpdate = vi.fn().mockResolvedValue(undefined);
  });

  it("builds the status bar menu with retained quick pick options and toggles Next Edit", async () => {
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    const battery = createBattery(true);
    const configHandler = createConfigHandler({
      modelsByRole: {
        autocomplete: [{ title: "Codestral" }, { title: "Minimalist" }],
      },
      selectedModelByRole: { autocomplete: { title: "Codestral" } },
    });

    configValues = {
      enableTabAutocomplete: true,
      pauseTabAutocompleteOnBattery: false,
      enableNextEdit: false,
    };

    registerAllCommands(context as any, battery as any, configHandler as any);
    await registeredCommands["continue.openTabAutocompleteConfigMenu"]();

    expect(vscode.window.createQuickPick).toHaveBeenCalled();
    expect(lastQuickPick).toBeDefined();

    const items = lastQuickPick!.items;
    expect(items.length).toBeGreaterThanOrEqual(5);

    expect(items[0].label).toBe(quickPickStatusText(StatusBarStatus.Disabled));
    expect(items[1].label).toBe(
      "$(sparkle) Use Next Edit over FIM autocomplete",
    );
    expect(items[2].kind).toBe(vscode.QuickPickItemKind.Separator);
    expect(items[3].label).toBe("$(check) Codestral");
    expect(items[4].label).toBe("Minimalist");

    expect(quickPickAcceptCallback).toBeDefined();
    lastQuickPick!.selectedItems = [items[1]];
    await quickPickAcceptCallback!();

    expect(configUpdate).toHaveBeenCalledWith(
      "enableNextEdit",
      true,
      vscode.ConfigurationTarget.Global,
    );
  });

  it("blocks Next Edit toggling when tab autocomplete is disabled", async () => {
    const context = { subscriptions: [] as Array<{ dispose: () => void }> };
    const battery = createBattery(true);
    const configHandler = createConfigHandler();

    configValues = {
      enableTabAutocomplete: false,
    };

    registerAllCommands(context as any, battery as any, configHandler as any);
    await registeredCommands["continue.toggleNextEditEnabled"]();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Please enable tab autocomplete first to use Next Edit",
    );
    expect(configUpdate).not.toHaveBeenCalled();
  });
});
