import { CompletionProvider } from "core/autocomplete/CompletionProvider";
import { ConfigHandler } from "core/config/ConfigHandler";
import { EXTENSION_NAME } from "core/control-plane/env";
import { NextEditLoggingService } from "core/nextEdit/NextEditLoggingService";
import * as vscode from "vscode";

import {
  getAutocompleteStatusBarDescription,
  getAutocompleteStatusBarTitle,
  getNextEditMenuItems,
  getStatusBarStatusFromQuickPickItemLabel,
  handleNextEditToggle,
  isNextEditToggleLabel,
  quickPickStatusText,
  setupStatusBar,
  StatusBarStatus,
} from "./autocomplete/statusBar";
import { Battery } from "./util/battery";
import { getMetaKeyLabel } from "./util/util";

type ModelQuickPickItem = vscode.QuickPickItem & { modelTitle: string };

function isBatteryPauseActive(
  config: vscode.WorkspaceConfiguration,
  battery: Battery,
): boolean {
  return (
    Boolean(config.get<boolean>("pauseTabAutocompleteOnBattery")) &&
    !battery.isACConnected()
  );
}

function deriveAutocompleteStatus(
  config: vscode.WorkspaceConfiguration,
  battery: Battery,
): StatusBarStatus {
  const enabled = config.get<boolean>("enableTabAutocomplete") ?? true;
  if (!enabled) {
    return StatusBarStatus.Disabled;
  }

  return isBatteryPauseActive(config, battery)
    ? StatusBarStatus.Paused
    : StatusBarStatus.Enabled;
}

function getToggleTargetStatus(
  currentStatus: StatusBarStatus,
  pauseActive: boolean,
): StatusBarStatus {
  if (pauseActive) {
    return currentStatus === StatusBarStatus.Disabled
      ? StatusBarStatus.Paused
      : StatusBarStatus.Disabled;
  }

  return currentStatus === StatusBarStatus.Disabled
    ? StatusBarStatus.Enabled
    : StatusBarStatus.Disabled;
}

export function registerAllCommands(
  context: vscode.ExtensionContext,
  battery: Battery,
  configHandler: ConfigHandler,
) {
  const commandsMap: Record<
    string,
    (...args: any[]) => unknown | Promise<unknown>
  > = {
    "continue.logAutocompleteOutcome": (
      completionId: string,
      completionProvider: CompletionProvider,
    ) => {
      completionProvider.accept(completionId);
    },
    "continue.logNextEditOutcomeAccept": (
      completionId: string,
      nextEditLoggingService: NextEditLoggingService,
    ) => {
      nextEditLoggingService.accept(completionId);
    },
    "continue.logNextEditOutcomeReject": (
      completionId: string,
      nextEditLoggingService: NextEditLoggingService,
    ) => {
      nextEditLoggingService.reject(completionId);
    },
    "continue.toggleTabAutocompleteEnabled": async () => {
      const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
      const enabled = config.get<boolean>("enableTabAutocomplete") ?? true;
      const nextEnabled = !enabled;
      const pauseActive = isBatteryPauseActive(config, battery);

      await config.update(
        "enableTabAutocomplete",
        nextEnabled,
        vscode.ConfigurationTarget.Global,
      );

      setupStatusBar(
        nextEnabled
          ? pauseActive
            ? StatusBarStatus.Paused
            : StatusBarStatus.Enabled
          : StatusBarStatus.Disabled,
      );
    },
    "continue.forceAutocomplete": async () => {
      await vscode.commands.executeCommand("editor.action.inlineSuggest.hide");
      await vscode.commands.executeCommand(
        "editor.action.inlineSuggest.trigger",
      );
    },
    "continue.openTabAutocompleteConfigMenu": async () => {
      const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
      const quickPick = vscode.window.createQuickPick<
        vscode.QuickPickItem | ModelQuickPickItem
      >();
      const { config: continueConfig } = await configHandler.loadConfig();
      const autocompleteModels =
        continueConfig?.modelsByRole.autocomplete ?? [];
      const selected =
        continueConfig?.selectedModelByRole?.autocomplete?.title ?? undefined;
      const pauseActive = isBatteryPauseActive(config, battery);
      const currentStatus = deriveAutocompleteStatus(config, battery);
      const targetStatus = getToggleTargetStatus(currentStatus, pauseActive);
      const metaKeyLabel = getMetaKeyLabel();

      const modelItems: ModelQuickPickItem[] = autocompleteModels
        .filter((model) => Boolean(model.title))
        .map((model) => ({
          label: getAutocompleteStatusBarTitle(selected, model),
          description: getAutocompleteStatusBarDescription(selected, model),
          modelTitle: model.title!,
        }));

      quickPick.items = [
        {
          label: quickPickStatusText(targetStatus),
          description: `${metaKeyLabel} + K, ${metaKeyLabel} + A`,
        },
        ...getNextEditMenuItems(
          currentStatus,
          config.get<boolean>("enableNextEdit") ?? false,
        ),
        {
          kind: vscode.QuickPickItemKind.Separator,
          label: "Switch model",
        },
        ...modelItems,
      ];

      quickPick.onDidAccept(async () => {
        const selectedItem = quickPick.selectedItems[0];
        if (!selectedItem) {
          quickPick.dispose();
          return;
        }

        const nextStatus = getStatusBarStatusFromQuickPickItemLabel(
          selectedItem.label,
        );

        if (nextStatus !== undefined) {
          setupStatusBar(nextStatus);
          await config.update(
            "enableTabAutocomplete",
            nextStatus !== StatusBarStatus.Disabled,
            vscode.ConfigurationTarget.Global,
          );
        } else if (isNextEditToggleLabel(selectedItem.label)) {
          await handleNextEditToggle(selectedItem.label, config);
        } else if ("modelTitle" in selectedItem && selectedItem.modelTitle) {
          await configHandler.updateSelectedModel(
            "autocomplete",
            selectedItem.modelTitle,
          );
        }

        quickPick.dispose();
      });

      quickPick.show();
    },
    "continue.toggleNextEditEnabled": async () => {
      const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
      const autocompleteEnabled =
        config.get<boolean>("enableTabAutocomplete") ?? true;

      if (!autocompleteEnabled) {
        await vscode.window.showInformationMessage(
          "Please enable tab autocomplete first to use Next Edit",
        );
        return;
      }

      const nextEditEnabled = config.get<boolean>("enableNextEdit") ?? false;
      await config.update(
        "enableNextEdit",
        !nextEditEnabled,
        vscode.ConfigurationTarget.Global,
      );
    },
    "continue.forceNextEdit": async () => {
      await vscode.commands.executeCommand("editor.action.inlineSuggest.hide");
      await vscode.commands.executeCommand(
        "editor.action.inlineSuggest.trigger",
      );
    },
  };

  for (const [command, callback] of Object.entries(commandsMap)) {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, callback),
    );
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        !event.affectsConfiguration(
          `${EXTENSION_NAME}.enableTabAutocomplete`,
        ) &&
        !event.affectsConfiguration(
          `${EXTENSION_NAME}.pauseTabAutocompleteOnBattery`,
        )
      ) {
        return;
      }

      const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
      setupStatusBar(deriveAutocompleteStatus(config, battery));
    }),
  );
}
