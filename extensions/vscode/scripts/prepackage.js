const fs = require("fs");
const path = require("path");

const ncp = require("ncp").ncp;
const { rimrafSync } = require("rimraf");

const {
  validateFilesPresent,
  autodetectPlatformAndArch,
} = require("../../../scripts/util/index");

const { writeBuildTimestamp } = require("./write-build-timestamp");

const extensionRoot = path.join(__dirname, "..");
const coreRoot = path.join(__dirname, "..", "..", "..", "core");
const extensionNodeModules = path.join(extensionRoot, "node_modules");
const coreNodeModules = path.join(coreRoot, "node_modules");
const REQUIRED_TREE_SITTER_WASMS = [
  "tree-sitter-bash.wasm",
  "tree-sitter-c.wasm",
  "tree-sitter-c_sharp.wasm",
  "tree-sitter-cpp.wasm",
  "tree-sitter-css.wasm",
  "tree-sitter-elisp.wasm",
  "tree-sitter-elixir.wasm",
  "tree-sitter-elm.wasm",
  "tree-sitter-embedded_template.wasm",
  "tree-sitter-go.wasm",
  "tree-sitter-html.wasm",
  "tree-sitter-java.wasm",
  "tree-sitter-javascript.wasm",
  "tree-sitter-json.wasm",
  "tree-sitter-lua.wasm",
  "tree-sitter-ocaml.wasm",
  "tree-sitter-php.wasm",
  "tree-sitter-python.wasm",
  "tree-sitter-ql.wasm",
  "tree-sitter-rescript.wasm",
  "tree-sitter-ruby.wasm",
  "tree-sitter-rust.wasm",
  "tree-sitter-solidity.wasm",
  "tree-sitter-systemrdl.wasm",
  "tree-sitter-toml.wasm",
  "tree-sitter-tsx.wasm",
  "tree-sitter-typescript.wasm",
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

function copyDirectory(src, dest, label) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  return new Promise((resolve, reject) => {
    ncp(src, dest, { dereference: true }, (error) => {
      if (error) {
        reject(error);
      } else {
        console.log(`[info] Copied ${label}`);
        resolve();
      }
    });
  });
}

function copyFile(src, dest, label) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[info] Copied ${label}`);
}

async function copyMinimalPackage(srcRoot, destRoot, relativePaths, label) {
  rimrafSync(destRoot);
  fs.mkdirSync(destRoot, { recursive: true });

  for (const relativePath of relativePaths) {
    const src = path.join(srcRoot, relativePath);
    const dest = path.join(destRoot, relativePath);

    if (!fs.existsSync(src)) {
      throw new Error(`Missing required file for ${label}: ${src}`);
    }

    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
      await copyDirectory(src, dest, `${label}/${relativePath}`);
    } else {
      copyFile(src, dest, `${label}/${relativePath}`);
    }
  }
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

  await copyMinimalPackage(
    resolveExistingPath([
      path.join(coreNodeModules, "tree-sitter-wasms", "out"),
      path.join(extensionNodeModules, "tree-sitter-wasms", "out"),
    ]),
    path.join(extensionRoot, "out", "tree-sitter-wasms"),
    REQUIRED_TREE_SITTER_WASMS,
    "tree-sitter language WASMs",
  );

  copyFile(
    resolveExistingPath([
      path.join(coreNodeModules, "web-tree-sitter", "tree-sitter.wasm"),
      path.join(extensionNodeModules, "web-tree-sitter", "tree-sitter.wasm"),
    ]),
    path.join(extensionRoot, "out", "tree-sitter.wasm"),
    "tree-sitter runtime WASM",
  );

  validateFilesPresent([
    "tree-sitter/code-snippet-queries/c_sharp.scm",
    "tag-qry/tree-sitter-c_sharp-tags.scm",
    "out/tree-sitter.wasm",
    "out/tree-sitter-wasms/tree-sitter-typescript.wasm",
  ]);

  console.log(
    `[timer] Lite prepackage completed in ${Date.now() - startTime}ms - finished at ${new Date().toISOString()}`,
  );
})();
