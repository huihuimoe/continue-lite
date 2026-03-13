import { describe, expect, test } from "vitest";
import { testConfigHandler } from "../test/fixtures";

import { defaultConfig } from "./default";

describe.skip("Test the ConfigHandler and E2E config loading", () => {
  test("should show only local profile", () => {
    const activeProfile = testConfigHandler.getActiveProfile();
    expect(activeProfile?.profileDescription.id).toBe("local");
  });

  test("should load the default config successfully", async () => {
    const result = await testConfigHandler.loadConfig();
    expect(result.config!.modelsByRole.autocomplete?.length ?? 0).toBe(
      defaultConfig.models?.length,
    );
  });
});
