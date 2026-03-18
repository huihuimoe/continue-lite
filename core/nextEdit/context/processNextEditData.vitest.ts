import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_AUTOCOMPLETE_OPTS } from "../../util/parameters";
import { processNextEditData } from "./processNextEditData";

const getAutocompleteContextMock = vi.fn();
const addAutocompleteContextMock = vi.fn();
const logDevDataMock = vi.fn();
const getPrevEditsDescendingMock = vi.fn();
const setPrevEditMock = vi.fn();

vi.mock("./autocompleteContextFetching", () => ({
  getAutocompleteContext: (...args: any[]) =>
    getAutocompleteContextMock(...args),
}));

vi.mock("../NextEditProvider", () => ({
  NextEditProvider: {
    getInstance: () => ({
      addAutocompleteContext: addAutocompleteContextMock,
    }),
  },
}));

vi.mock("../../data/log", () => ({
  DataLogger: {
    getInstance: () => ({
      logDevData: logDevDataMock,
    }),
  },
}));

vi.mock("./prevEditLruCache", () => ({
  getPrevEditsDescending: () => getPrevEditsDescendingMock(),
  setPrevEdit: (...args: any[]) => setPrevEditMock(...args),
  prevEditLruCache: {
    clear: vi.fn(),
  },
}));

describe("processNextEditData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAutocompleteContextMock.mockResolvedValue("context-from-autocomplete");
    getPrevEditsDescendingMock.mockReturnValue([
      {
        fileUri: "file:///workspace/prev.ts",
        workspaceUri: "file:///workspace",
        timestamp: Date.now(),
        unidiff: "--- a/prev.ts\n+++ b/prev.ts\n@@\n-old\n+new",
      },
    ]);
  });

  it("uses the selected autocomplete model and deterministic token budget when no override is provided", async () => {
    const selectedAutocompleteModel = {
      title: "Sweep Local",
      model: "sweepai/sweep-next-edit:latest",
      providerName: "ollama",
      autocompleteOptions: {
        maxPromptTokens: 4096,
      },
    };

    await processNextEditData({
      filePath: "file:///workspace/current.ts",
      beforeContent: "const value = 1;",
      afterContent: "const value = 2;",
      cursorPosBeforeEdit: { line: 0, character: 0 },
      cursorPosAfterPrevEdit: { line: 0, character: 0 },
      ide: {} as any,
      configHandler: {
        loadConfig: vi.fn().mockResolvedValue({
          config: {
            selectedModelByRole: {
              autocomplete: selectedAutocompleteModel,
            },
            modelsByRole: {
              autocomplete: [selectedAutocompleteModel],
            },
          },
        }),
      } as any,
      getDefinitionsFromLsp: vi.fn(async () => []),
      recentlyEditedRanges: [],
      recentlyVisitedRanges: [],
      workspaceDir: "file:///workspace",
    });

    expect(getAutocompleteContextMock).toHaveBeenCalledWith(
      "file:///workspace/current.ts",
      { line: 0, character: 0 },
      expect.anything(),
      expect.anything(),
      expect.any(Function),
      [],
      [],
      4096,
      "const value = 1;",
      selectedAutocompleteModel,
    );

    expect(logDevDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "nextEditWithHistory",
        data: expect.objectContaining({
          modelProvider: "ollama",
          modelName: "sweepai/sweep-next-edit:latest",
          modelTitle: "Sweep Local",
        }),
      }),
    );
  });

  it("uses the explicit model override instead of the selected autocomplete model", async () => {
    const selectedAutocompleteModel = {
      title: "Codestral",
      model: "codestral-latest",
      providerName: "mistral",
    };
    const overrideAutocompleteModel = {
      title: "Sweep Local",
      model: "sweepai/sweep-next-edit:latest",
      providerName: "ollama",
      autocompleteOptions: {},
    };

    await processNextEditData({
      filePath: "file:///workspace/current.ts",
      beforeContent: "const value = 1;",
      afterContent: "const value = 2;",
      cursorPosBeforeEdit: { line: 0, character: 0 },
      cursorPosAfterPrevEdit: { line: 0, character: 0 },
      ide: {} as any,
      configHandler: {
        loadConfig: vi.fn().mockResolvedValue({
          config: {
            selectedModelByRole: {
              autocomplete: selectedAutocompleteModel,
            },
            modelsByRole: {
              autocomplete: [
                selectedAutocompleteModel,
                overrideAutocompleteModel,
              ],
            },
          },
        }),
      } as any,
      getDefinitionsFromLsp: vi.fn(async () => []),
      recentlyEditedRanges: [],
      recentlyVisitedRanges: [],
      workspaceDir: "file:///workspace",
      modelNameOrInstance: "Sweep Local",
    });

    expect(getAutocompleteContextMock).toHaveBeenCalledWith(
      "file:///workspace/current.ts",
      { line: 0, character: 0 },
      expect.anything(),
      expect.anything(),
      expect.any(Function),
      [],
      [],
      DEFAULT_AUTOCOMPLETE_OPTS.maxPromptTokens,
      "const value = 1;",
      overrideAutocompleteModel,
    );

    expect(logDevDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          modelProvider: "ollama",
          modelName: "sweepai/sweep-next-edit:latest",
          modelTitle: "Sweep Local",
        }),
      }),
    );
  });
});
