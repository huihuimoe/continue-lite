import * as os from "node:os";

import * as vscode from "vscode";

type Platform = "mac" | "linux" | "windows" | "unknown";
type Architecture = "x64" | "arm64" | "unknown";

function getPlatform(): Platform {
  const platform = os.platform();
  if (platform === "darwin") {
    return "mac";
  } else if (platform === "linux") {
    return "linux";
  } else if (platform === "win32") {
    return "windows";
  } else {
    return "unknown";
  }
}

function getArchitecture(): Architecture {
  const arch = os.arch();
  if (arch === "x64" || arch === "ia32") {
    return "x64";
  } else if (arch === "arm64" || arch === "arm") {
    return "arm64";
  } else {
    return "unknown";
  }
}

export function getMetaKeyLabel() {
  const platform = getPlatform();
  switch (platform) {
    case "mac":
      return "⌘";
    case "linux":
    case "windows":
      return "Ctrl";
    default:
      return "Ctrl";
  }
}

export function getExtensionVersion(): string {
  const extension = vscode.extensions.getExtension("huihuimoe.continue-lite");
  return extension?.packageJSON.version || "0.1.0";
}

export function isExtensionPrerelease(): boolean {
  const extensionVersion = getExtensionVersion();
  const versionParts = extensionVersion.split(".");
  if (versionParts.length >= 2) {
    const minorVersion = parseInt(versionParts[1], 10);
    if (!isNaN(minorVersion)) {
      return minorVersion % 2 !== 0;
    }
  }
  return false;
}
