const fs = require("fs");
const path = require("path");

const { rimrafSync } = require("rimraf");

const { execCmdSync } = require("../../../scripts/util");
const {
  validateFilesPresent,
  autodetectPlatformAndArch,
} = require("../../../scripts/util/index");

const { writeBuildTimestamp } = require("./write-build-timestamp");

const continueDir = path.join(__dirname, "..", "..", "..");

async function generateConfigYamlSchema() {
  const cwd = process.cwd();
  process.chdir(path.join(continueDir, "packages", "config-yaml"));
  execCmdSync("npm install");
  execCmdSync("npm run build");
  execCmdSync("npm run generate-schema");
  fs.copyFileSync(
    path.join("schema", "config-yaml-schema.json"),
    path.join(continueDir, "extensions", "vscode", "config-yaml-schema.json"),
  );
  process.chdir(cwd);
  console.log("[info] Generated config.yaml schema");
}

const extensionRoot = path.join(__dirname, "..");
const coreRoot = path.join(__dirname, "..", "..", "..", "core");
const extensionNodeModules = path.join(extensionRoot, "node_modules");
const coreNodeModules = path.join(coreRoot, "node_modules");
const REQUIRED_TREE_SITTER_LANGUAGES = [
  "bash",
  "c",
  "c_sharp",
  "cpp",
  "css",
  "dart",
  "dockerfile",
  "elisp",
  "elixir",
  "elm",
  "embedded_template",
  "go",
  "graphql",
  "html",
  "java",
  "javascript",
  "json",
  "julia",
  "kotlin",
  "lua",
  "ocaml",
  "php",
  "proto",
  "python",
  "rescript",
  "ruby",
  "rust",
  "scala",
  "solidity",
  "sql",
  "svelte",
  "swift",
  "toml",
  "tsx",
  "typescript",
  "vue",
  "yaml",
  "zig",
];

function resolveExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate required packaging input. Tried: ${candidates.join(", ")}`,
  );
}

function copyFile(src, dest, label) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[info] Copied ${label}`);
}

function getOptionalExistingPaths(root, relativePaths) {
  return relativePaths.filter((relativePath) =>
    fs.existsSync(path.join(root, relativePath)),
  );
}

function getTarget() {
  let target;
  const args = process.argv;
  if (args[2] === "--target") {
    target = args[3];
  }

  if (!target) {
    const envTarget =
      process.env.CONTINUE_VSCODE_TARGET ||
      process.env.CONTINUE_BUILD_TARGET ||
      process.env.VSCODE_TARGET;
    if (envTarget && typeof envTarget === "string") {
      target = envTarget.trim();
    }
  }

  let os;
  let arch;
  if (target) {
    [os, arch] = target.split("-");
  } else {
    [os, arch] = autodetectPlatformAndArch();
  }

  if (os === "alpine") {
    os = "linux";
  }
  if (arch === "armhf") {
    arch = "arm64";
  }

  return {
    os,
    arch,
    target: `${os}-${arch}`,
    exe: os === "win32" ? ".exe" : "",
  };
}

void (async () => {
  const startTime = Date.now();
  const { target, exe } = getTarget();

  console.log(
    `[info] Packaging lite extension for target ${target} - started at ${new Date().toISOString()}`,
  );

  process.chdir(extensionRoot);

  rimrafSync(path.join(extensionRoot, "out"));
  fs.mkdirSync(path.join(extensionRoot, "out", "node_modules"), {
    recursive: true,
  });

  writeBuildTimestamp();

  const treeSitterWasmRoot = resolveExistingPath([
    path.join(coreNodeModules, "tree-sitter-wasm", "out"),
    path.join(extensionNodeModules, "tree-sitter-wasm", "out"),
  ]);
  const treeSitterWasmDest = path.join(
    extensionRoot,
    "out",
    "tree-sitter-wasms",
  );
  rimrafSync(treeSitterWasmDest);
  fs.mkdirSync(treeSitterWasmDest, { recursive: true });
  for (const lang of REQUIRED_TREE_SITTER_LANGUAGES) {
    const fileName = `tree-sitter-${lang}.wasm`;
    const src = path.join(treeSitterWasmRoot, lang, fileName);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing required tree-sitter language WASM: ${src}`);
    }
    copyFile(
      src,
      path.join(treeSitterWasmDest, fileName),
      `tree-sitter language WASMs/${fileName}`,
    );
  }

  copyFile(
    resolveExistingPath([
      path.join(coreNodeModules, "web-tree-sitter", "web-tree-sitter.wasm"),
      path.join(
        extensionNodeModules,
        "web-tree-sitter",
        "web-tree-sitter.wasm",
      ),
      path.join(coreNodeModules, "web-tree-sitter", "tree-sitter.wasm"),
      path.join(extensionNodeModules, "web-tree-sitter", "tree-sitter.wasm"),
    ]),
    path.join(extensionRoot, "out", "web-tree-sitter.wasm"),
    "tree-sitter runtime WASM",
  );

  await generateConfigYamlSchema();

  validateFilesPresent([
    "tree-sitter/code-snippet-queries/c_sharp.scm",
    "tag-qry/tree-sitter-c_sharp-tags.scm",
    "out/web-tree-sitter.wasm",
    "out/tree-sitter-wasms/tree-sitter-typescript.wasm",
    "config-yaml-schema.json",
  ]);

  console.log(
    `[timer] Lite prepackage completed in ${Date.now() - startTime}ms - finished at ${new Date().toISOString()}`,
  );
})();
