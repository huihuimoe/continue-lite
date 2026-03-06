import {
  By,
  EditorView,
  InputBox,
  TextEditor,
  VSBrowser,
  Workbench,
} from "vscode-extension-tester";

import { DEFAULT_TIMEOUT } from "../constants";
import { TestUtils } from "../TestUtils";

export class GlobalActions {
  static defaultFolder = "e2e/test-continue";
  public static defaultNewFilename = "test.py";

  private static untitledEditorTitlePattern = /^Untitled(?:-\d+)?$/;

  private static async closeWelcomeEditorIfPresent() {
    const editorView = new EditorView();

    try {
      await editorView.closeEditor("Welcome");
    } catch {}
  }

  private static async openAndFocusEditor(title: string): Promise<TextEditor> {
    const editorView = new EditorView();
    const editor = (await editorView.openEditor(title)) as TextEditor;

    await TestUtils.waitForSuccess(async () => {
      const activeTab = await editorView.getActiveTab();
      const activeTitle = activeTab ? await activeTab.getTitle() : undefined;
      if (activeTitle !== title) {
        await editorView.openEditor(title);
        throw new Error(`Editor ${title} is not active yet`);
      }
    }, DEFAULT_TIMEOUT.MD);

    return editor;
  }

  public static async openTestWorkspace() {
    await VSBrowser.instance.openResources(GlobalActions.defaultFolder);
    await GlobalActions.closeWelcomeEditorIfPresent();
    await new Workbench().executeCommand(
      "Notifications: Clear All Notifications",
    );
  }

  public static async clearAllNotifications() {
    await new Workbench().executeCommand(
      "Notifications: Clear All Notifications",
    );
  }

  public static async createAndOpenNewTextFile(): Promise<{
    editor: TextEditor;
  }> {
    const editorView = new EditorView();
    const titlesBefore = await editorView.getOpenEditorTitles();

    await new Workbench().executeCommand("Create: New File...");
    await (
      await InputBox.create(DEFAULT_TIMEOUT.MD)
    ).selectQuickPick("Text File");

    const untitledTitle = await TestUtils.waitForSuccess(async () => {
      const titles = await editorView.getOpenEditorTitles();
      const untitledTitles = titles.filter((title) =>
        GlobalActions.untitledEditorTitlePattern.test(title),
      );

      if (untitledTitles.length === 0) {
        throw new Error("No Untitled editor tab found yet");
      }

      const newUntitledTitle = untitledTitles.find(
        (title) => !titlesBefore.includes(title),
      );

      return newUntitledTitle ?? untitledTitles[untitledTitles.length - 1];
    }, DEFAULT_TIMEOUT.MD);

    const editor = await GlobalActions.openAndFocusEditor(untitledTitle);

    return { editor };
  }

  public static async createAndSaveNewFile(
    filename = GlobalActions.defaultNewFilename,
  ): Promise<{
    editor: TextEditor;
  }> {
    let { editor } = await GlobalActions.createAndOpenNewTextFile();

    await new Workbench().executeCommand("File: Save As...");
    const inputBox = await InputBox.create(DEFAULT_TIMEOUT.MD);

    // Get current path and replace filename
    const currentPath = await inputBox.getText();
    const pathParts = currentPath.split(/[\/\\]/);
    pathParts[pathParts.length - 1] = filename;
    const newPath = pathParts.join("/");

    await inputBox.setText(newPath);

    await inputBox.confirm();
    await TestUtils.waitForTimeout(DEFAULT_TIMEOUT.XS);

    editor = await GlobalActions.openAndFocusEditor(filename);

    return { editor };
  }

  public static async deleteFileFromFolder(
    filename = GlobalActions.defaultNewFilename,
    folder = GlobalActions.defaultFolder,
  ): Promise<void> {
    const fs = require("fs");
    const path = require("path");

    const folderPath = path.join(process.cwd(), folder);
    const filePath = path.join(folderPath, filename);

    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      console.warn(`Failed to delete file ${filePath}:`, error);
    }
  }

  static async setNextEditEnabled(enabled: boolean) {
    const workbench = new Workbench();

    await workbench.openCommandPrompt();
    process.env.CONTINUE_E2E_NON_NEXT_EDIT_TEST = "true";

    // Initial wait and clear
    await TestUtils.waitForTimeout(1000);
    await GlobalActions.clearAllNotifications();

    const statusBar = workbench.getStatusBar();

    // Robust element finding with text validation
    const continueItem = await TestUtils.waitForSuccess(async () => {
      // Clear any new notifications
      try {
        await GlobalActions.clearAllNotifications();
      } catch (e) {
        // Ignore
      }

      const element = await statusBar.findElement(
        By.xpath("//*[contains(text(), 'Continue')]"),
      );

      // Validate we can get text
      const text = await element.getText();
      if (!text || text.trim() === "") {
        // Try alternative methods
        const textContent = await element.getAttribute("textContent");
        if (!textContent || textContent.trim() === "") {
          throw new Error("Text not yet available");
        }
      }

      return element;
    }, DEFAULT_TIMEOUT.MD);

    // Get text with retry
    const text = await TestUtils.waitForSuccess(async () => {
      const itemText = await continueItem.getText();
      if (!itemText || itemText.trim() === "") {
        // Fallback to textContent
        const textContent = await continueItem.getAttribute("textContent");
        if (textContent && textContent.trim() !== "") {
          return textContent;
        }
        throw new Error("Text content not yet available");
      }
      return itemText;
    }, DEFAULT_TIMEOUT.MD);

    console.log("Final text:", text);

    const hasNE = text.includes("(NE)");
    console.log("hasNE:", hasNE);

    if (hasNE !== enabled) {
      await workbench.executeCommand("Continue: Toggle Next Edit");
      // Clear any resulting notifications
      await TestUtils.waitForTimeout(500);
      await GlobalActions.clearAllNotifications();
    }
  }

  static async disableNextEdit() {
    await this.setNextEditEnabled(false);
  }
}
