import { expect } from "chai";
import { By, TextEditor, VSBrowser, Workbench } from "vscode-extension-tester";

import { DEFAULT_TIMEOUT } from "../constants";
import { AutocompleteSelectors } from "../selectors/Autocomplete.selectors";
import { TestUtils } from "../TestUtils";

export class AutocompleteActions {
  private static patchedEditorInputLocator = false;

  private static patchEditorInputLocator() {
    if (AutocompleteActions.patchedEditorInputLocator) {
      return;
    }

    const editorLocators = (
      TextEditor as unknown as {
        locators?: {
          Editor?: {
            inputArea?: unknown;
          };
        };
      }
    ).locators?.Editor;

    if (!editorLocators) {
      return;
    }

    editorLocators.inputArea = By.css(
      ".inputarea, .native-edit-context, textarea.inputarea",
    );
    AutocompleteActions.patchedEditorInputLocator = true;
  }

  private static async ensureEditorHasFocus(editor: TextEditor) {
    AutocompleteActions.patchEditorInputLocator();
    const driver = editor.getDriver();

    await TestUtils.waitForSuccess(async () => {
      const isFocused = await driver.executeScript<boolean>(
        "const selectors=['.monaco-editor textarea.inputarea','.monaco-editor .native-edit-context','textarea.inputarea','.native-edit-context'];const input=selectors.map((selector)=>document.querySelector(selector)).find(Boolean);if(!input){return false;}input.focus();return document.activeElement===input;",
      );

      if (!isFocused) {
        throw new Error("Editor input area is not focused yet");
      }
    }, DEFAULT_TIMEOUT.MD);
  }

  public static async clearEditorContents(editor: TextEditor) {
    await AutocompleteActions.ensureEditorHasFocus(editor);
    await editor.clearText();
  }

  public static async testCompletions(editor: TextEditor) {
    await AutocompleteActions.ensureEditorHasFocus(editor);
    const driver = editor.getDriver();

    const messagePair0 = TestUtils.generateTestMessagePair(0);
    await editor.typeTextAt(1, 1, messagePair0.userMessage);
    await editor.typeTextAt(1, messagePair0.userMessage.length + 1, " ");
    const ghostText0 = await TestUtils.waitForSuccess(
      () => AutocompleteSelectors.getGhostTextContent(driver),
      DEFAULT_TIMEOUT.XL,
    );
    expect(ghostText0).to.equal(messagePair0.llmResponse);

    await AutocompleteActions.clearEditorContents(editor);

    const messagePair1 = TestUtils.generateTestMessagePair(1);
    await AutocompleteActions.ensureEditorHasFocus(editor);
    await editor.typeTextAt(1, 1, messagePair1.userMessage);
    await editor.typeTextAt(1, messagePair1.userMessage.length + 1, " ");
    const ghostText1 = await TestUtils.waitForSuccess(() =>
      AutocompleteSelectors.getGhostTextContent(driver),
    );
    expect(ghostText1).to.equal(messagePair1.llmResponse);
  }

  public static async forceCompletion(editor: TextEditor): Promise<string> {
    await AutocompleteActions.ensureEditorHasFocus(editor);
    await editor.setText("def main():\n    ");
    await editor.moveCursor(2, 5);

    await new Workbench().executeCommand("Continue: Force Autocomplete");

    const ghostText = await TestUtils.waitForSuccess(() =>
      AutocompleteSelectors.getGhostTextContent(VSBrowser.instance.driver),
    );

    return ghostText;
  }
}
