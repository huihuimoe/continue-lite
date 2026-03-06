const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const version = JSON.parse(
  fs.readFileSync("./package.json", { encoding: "utf-8" }),
).version;

const args = process.argv.slice(2);
let target;

if (args[0] === "--target") {
  target = args[1];
}

if (!fs.existsSync("build")) {
  fs.mkdirSync("build");
}

const isPreRelease = args.includes("--pre-release");

let command = isPreRelease
  ? "npx @vscode/vsce package --out ./build --pre-release --no-dependencies"
  : "npx @vscode/vsce package --out ./build --no-dependencies";

if (target) {
  command += ` --target ${target}`;
}

const outputVsixPath = path.join("build", `continue-${version}.vsix`);
const YAZL_BYTE_COUNT_ERROR = "file data stream has unexpected number of bytes";
const MAX_RETRIES = 2;

function runVscePackage() {
  const output = execSync(command, {
    stdio: "pipe",
    encoding: "utf8",
  });

  if (output) {
    process.stdout.write(output);
  }
}

for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
  try {
    if (fs.existsSync(outputVsixPath)) {
      fs.unlinkSync(outputVsixPath);
    }

    runVscePackage();
    break;
  } catch (error) {
    const stdout = error?.stdout ? error.stdout.toString("utf8") : "";
    const stderr = error?.stderr ? error.stderr.toString("utf8") : "";
    const message = `${error?.message ?? ""}\n${stdout}\n${stderr}`;

    process.stdout.write(stdout);
    process.stderr.write(stderr);

    const isRetriable = message.includes(YAZL_BYTE_COUNT_ERROR);
    const hasRetriesLeft = attempt < MAX_RETRIES;

    if (isRetriable && hasRetriesLeft) {
      console.warn(
        `[warn] vsce packaging hit transient yazl byte-count mismatch (attempt ${attempt + 1}/${MAX_RETRIES + 1}); retrying...`,
      );
      continue;
    }

    throw error;
  }
}

console.log(
  `vsce package completed - extension created at extensions/vscode/build/continue-${version}.vsix`,
);
