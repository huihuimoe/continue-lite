import ignore from "ignore";

import path from "path";
import { fileURLToPath } from "url";
import { ContinueError, ContinueErrorReason } from "./errors";

export const DEFAULT_SECURITY_IGNORE_FILETYPES = [
  "*.env",
  "*.env.*",
  ".env*",
  "config.json",
  "config.yaml",
  "config.yml",
  "settings.json",
  "appsettings.json",
  "appsettings.*.json",
  "*.key",
  "*.pem",
  "*.p12",
  "*.pfx",
  "*.crt",
  "*.cer",
  "*.jks",
  "*.keystore",
  "*.truststore",
  "*.db",
  "*.sqlite",
  "*.sqlite3",
  "*.mdb",
  "*.accdb",
  "*.secret",
  "*.secrets",
  "auth.json",
  "*.token",
  "*.bak",
  "*.backup",
  "*.old",
  "*.orig",
  "docker-compose.override.yml",
  "docker-compose.override.yaml",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "*.ppk",
  "*.gpg",
];

export const DEFAULT_SECURITY_IGNORE_DIRS = [
  ".env/",
  "env/",
  ".aws/",
  ".gcp/",
  ".azure/",
  ".kube/",
  ".docker/",
  "secrets/",
  ".secrets/",
  "private/",
  ".private/",
  "certs/",
  "certificates/",
  "keys/",
  ".ssh/",
  ".gnupg/",
  ".gpg/",
  "tmp/secrets/",
  "temp/secrets/",
  ".tmp/",
];

export const ADDITIONAL_INDEXING_IGNORE_FILETYPES = [
  "*.DS_Store",
  "*-lock.json",
  "*.lock",
  "*.log",
  "*.ttf",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.mp4",
  "*.svg",
  "*.ico",
  "*.pdf",
  "*.zip",
  "*.gz",
  "*.tar",
  "*.dmg",
  "*.tgz",
  "*.rar",
  "*.7z",
  "*.exe",
  "*.dll",
  "*.obj",
  "*.o",
  "*.o.d",
  "*.a",
  "*.lib",
  "*.so",
  "*.dylib",
  "*.ncb",
  "*.sdf",
  "*.woff",
  "*.woff2",
  "*.eot",
  "*.cur",
  "*.avi",
  "*.mpg",
  "*.mpeg",
  "*.mov",
  "*.mp3",
  "*.mkv",
  "*.webm",
  "*.jar",
  "*.onnx",
  "*.parquet",
  "*.pqt",
  "*.wav",
  "*.webp",
  "*.wasm",
  "*.plist",
  "*.profraw",
  "*.gcda",
  "*.gcno",
  "go.sum",
  "*.gitignore",
  "*.gitkeep",
  "*.continueignore",
  "*.csv",
  "*.uasset",
  "*.pdb",
  "*.bin",
  "*.pag",
  "*.swp",
  "*.jsonl",
  ".continue/",
];

export const ADDITIONAL_INDEXING_IGNORE_DIRS = [
  ".git/",
  ".svn/",
  "node_modules/",
  "dist/",
  "build/",
  "Build/",
  "target/",
  "out/",
  "bin/",
  ".pytest_cache/",
  ".vscode-test/",
  "__pycache__/",
  "site-packages/",
  ".gradle/",
  ".mvn/",
  ".cache/",
  "gems/",
  "vendor/",
  ".venv/",
  "venv/",
  ".vscode/",
  ".idea/",
  ".vs/",
];

export const DEFAULT_IGNORE_FILETYPES = [
  ...DEFAULT_SECURITY_IGNORE_FILETYPES,
  ...ADDITIONAL_INDEXING_IGNORE_FILETYPES,
];

export const DEFAULT_IGNORE_DIRS = [
  ...DEFAULT_SECURITY_IGNORE_DIRS,
  ...ADDITIONAL_INDEXING_IGNORE_DIRS,
];

export const DEFAULT_IGNORES = [
  ...DEFAULT_IGNORE_FILETYPES,
  ...DEFAULT_IGNORE_DIRS,
];

export const defaultIgnoresGlob = `!{${DEFAULT_IGNORES.join(",")}}`;

export const defaultSecurityIgnoreFile = ignore().add(
  DEFAULT_SECURITY_IGNORE_FILETYPES,
);
export const defaultSecurityIgnoreDir = ignore().add(
  DEFAULT_SECURITY_IGNORE_DIRS,
);
export const defaultIgnoreFile = ignore().add(DEFAULT_IGNORE_FILETYPES);
export const defaultIgnoreDir = ignore().add(DEFAULT_IGNORE_DIRS);

export const DEFAULT_SECURITY_IGNORE =
  DEFAULT_SECURITY_IGNORE_FILETYPES.join("\n") +
  "\n" +
  DEFAULT_SECURITY_IGNORE_DIRS.join("\n");

export const DEFAULT_IGNORE =
  DEFAULT_IGNORE_FILETYPES.join("\n") + "\n" + DEFAULT_IGNORE_DIRS.join("\n");

export const defaultFileAndFolderSecurityIgnores = ignore()
  .add(defaultSecurityIgnoreFile)
  .add(defaultSecurityIgnoreDir);

export const defaultIgnoreFileAndDir = ignore()
  .add(defaultIgnoreFile)
  .add(defaultIgnoreDir);

export function isSecurityConcern(filePathOrUri: string) {
  if (!filePathOrUri) {
    return false;
  }

  let filepath = filePathOrUri;
  try {
    filepath = fileURLToPath(filePathOrUri);
  } catch {}

  if (path.isAbsolute(filepath)) {
    const dir = path.dirname(filepath).split(/\/|\\/).at(-1) ?? "";
    const basename = path.basename(filepath);
    filepath = `${dir ? dir + "/" : ""}${basename}`;
  }

  if (!filepath) {
    return false;
  }

  return defaultFileAndFolderSecurityIgnores.ignores(filepath);
}

export function throwIfFileIsSecurityConcern(filepath: string) {
  if (isSecurityConcern(filepath)) {
    throw new ContinueError(
      ContinueErrorReason.FileIsSecurityConcern,
      `Reading or Editing ${filepath} is not allowed because it is a security concern. Do not attempt to read or edit this file in any way.`,
    );
  }
}

export function gitIgArrayFromFile(file: string) {
  return file
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => !/^#|^$/.test(l));
}
