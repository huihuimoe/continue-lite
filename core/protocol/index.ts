import {
  ToCoreFromWebviewProtocol,
  ToWebviewFromCoreProtocol,
} from "./coreWebview";
import { ToWebviewOrCoreFromIdeProtocol } from "./ide";
import { ToCoreFromIdeProtocol, ToIdeFromCoreProtocol } from "./ideCore";
import {
  ToIdeFromWebviewProtocol,
  ToWebviewFromIdeProtocol,
} from "./ideWebview";

export type IProtocol = Record<string, [any, any]>;

// IDE
type FromIdeProtocol = ToWebviewFromIdeProtocol &
  ToCoreFromIdeProtocol &
  ToWebviewOrCoreFromIdeProtocol;

// Webview
type FromWebviewProtocol = ToIdeFromWebviewProtocol & ToCoreFromWebviewProtocol;

// Core
export type ToCoreProtocol = ToCoreFromIdeProtocol &
  ToCoreFromWebviewProtocol &
  ToWebviewOrCoreFromIdeProtocol;
export type FromCoreProtocol = ToWebviewFromCoreProtocol &
  ToIdeFromCoreProtocol;
