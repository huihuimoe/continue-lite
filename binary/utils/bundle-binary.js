/**
 * @file Builds the binary for the specified target. It is also intended to run as a child process.
 */

const { execCmdSync } = require("../../scripts/util");
const fs = require("fs");
const { fork } = require("child_process");

/**
 * @param {string} target the platform to build for
 */
async function bundleForBinary(target) {
  const targetDir = `bin/${target}`;
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`[info] Building ${target}...`);
  execCmdSync(
    `npx pkg --no-bytecode --public-packages "*" --public --compress GZip pkgJson/${target} --out-path ${targetDir}`,
  );

  fs.writeFileSync(`${targetDir}/package.json`, "");
}

process.on("message", (msg) => {
  bundleForBinary(msg.payload.target)
    .then(() => process.send({ done: true }))
    .catch((error) => {
      console.error(error); // show the error in the parent process
      process.send({ error: true });
    });
});

/**
 * @param {string} target the platform to bundle for
 */
async function bundleBinary(target) {
  const child = fork(__filename, { stdio: "inherit" });
  child.send({
    payload: {
      target,
    },
  });
  return new Promise((resolve, reject) => {
    child.on("message", (msg) => {
      if (msg.error) {
        reject();
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  bundleBinary,
};
