const fs = require("fs");
const path = require("path");

const { writeBuildTimestamp } = require("./write-build-timestamp");

const esbuild = require("esbuild");

const flags = process.argv.slice(2);
const corePackageRoot = path.resolve(__dirname, "../../../core");
const localFetchPackageEntry = path.resolve(
  __dirname,
  "../../../packages/fetch/dist/index.js",
);

function resolveFromCore(specifier) {
  return require.resolve(specifier, {
    paths: [corePackageRoot],
  });
}

const dedupedDependencies = [
  {
    filter: /^@continuedev\/fetch$/,
    resolvePath: () => localFetchPackageEntry,
  },
  {
    filter: /^zod(?:\/.*)?$/,
    resolvePath: (specifier) => resolveFromCore(specifier),
  },
  {
    filter: /^node-fetch(?:\/.*)?$/,
    resolvePath: (specifier) => resolveFromCore(specifier),
  },
  {
    filter: /^fetch-blob(?:\/.*)?$/,
    resolvePath: (specifier) => resolveFromCore(specifier),
  },
  {
    filter: /^formdata-polyfill\/esm\.min\.js$/,
    resolvePath: (specifier) => resolveFromCore(specifier),
  },
  {
    filter: /^web-streams-polyfill\/dist\/ponyfill\.es2018\.js$/,
    resolvePath: () =>
      resolveFromCore("web-streams-polyfill/dist/ponyfill.es2018.js"),
  },
];

const dedupePlugin = {
  name: "dedupe-shared-dependencies",
  setup(build) {
    for (const dependency of dedupedDependencies) {
      build.onResolve({ filter: dependency.filter }, (args) => ({
        path: dependency.resolvePath(args.path),
      }));
    }
  },
};

const esbuildConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode", "esbuild"],
  format: "cjs",
  platform: "node",
  sourcemap: flags.includes("--sourcemap"),
  loader: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ".node": "file",
  },

  // To allow import.meta.path for transformers.js
  // https://github.com/evanw/esbuild/issues/1492#issuecomment-893144483
  inject: ["./scripts/importMetaUrl.js"],
  define: { "import.meta.url": "importMetaUrl" },
  supported: { "dynamic-import": false },
  metafile: true,
  plugins: [
    dedupePlugin,
    {
      name: "on-end-plugin",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length > 0) {
            console.error("Build failed with errors:", result.errors);
            throw new Error(result.errors);
          } else {
            try {
              fs.mkdirSync("./build", { recursive: true });
              fs.writeFileSync(
                "./build/meta.json",
                JSON.stringify(result.metafile, null, 2),
              );
            } catch (e) {
              console.error("Failed to write esbuild meta file", e);
            }
            console.log("VS Code Extension esbuild complete"); // used verbatim in vscode tasks to detect completion
          }
        });
      },
    },
  ],
};

void (async () => {
  // Create .buildTimestamp.js before starting the first build
  writeBuildTimestamp();
  // Bundles the extension into one file
  if (flags.includes("--watch")) {
    const ctx = await esbuild.context(esbuildConfig);
    await ctx.watch();
  } else if (flags.includes("--notify")) {
    const inFile = esbuildConfig.entryPoints[0];
    const outFile = esbuildConfig.outfile;

    // The watcher automatically notices changes to source files
    // so the only thing it needs to be notified about is if the
    // output file gets removed.
    if (fs.existsSync(outFile)) {
      console.log("VS Code Extension esbuild up to date");
      return;
    }

    fs.watchFile(outFile, (current, previous) => {
      if (current.size > 0) {
        console.log("VS Code Extension esbuild rebuild complete");
        fs.unwatchFile(outFile);
        process.exit(0);
      }
    });

    console.log("Triggering VS Code Extension esbuild rebuild...");
    writeBuildTimestamp();
  } else {
    await esbuild.build(esbuildConfig);
  }
})();
