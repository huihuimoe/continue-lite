const fs = require("fs");
const path = require("path");

const { writeBuildTimestamp } = require("./write-build-timestamp");

const { build, watch } = require("rolldown");

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
];

const dedupePlugin = {
  name: "dedupe-shared-dependencies",
  resolveId(source) {
    for (const dependency of dedupedDependencies) {
      if (dependency.filter.test(source)) {
        return dependency.resolvePath(source);
      }
    }
    return null;
  },
};

const nodeFilePlugin = {
  name: "node-file-loader",
  resolveId(source, importer) {
    if (!source.endsWith(".node")) {
      return null;
    }

    if (!importer) {
      return path.resolve(source);
    }

    return path.resolve(path.dirname(importer), source);
  },
  load(id) {
    if (!id.endsWith(".node")) {
      return null;
    }

    const referenceId = this.emitFile({
      type: "asset",
      name: path.basename(id),
      source: fs.readFileSync(id),
    });

    return `export default import.meta.ROLLUP_FILE_URL_${referenceId};`;
  },
};

const onEndPlugin = {
  name: "on-end-plugin",
  generateBundle(_outputOptions, bundle) {
    try {
      fs.mkdirSync("./build", { recursive: true });
      const meta = Object.values(bundle).reduce(
        (acc, item) => {
          acc[item.fileName] = {
            type: item.type,
            name: item.name ?? null,
            originalFileNames: item.originalFileNames ?? null,
          };
          return acc;
        },
        {},
      );
      fs.writeFileSync("./build/meta.json", JSON.stringify(meta, null, 2));
    } catch (e) {
      console.error("Failed to write rolldown meta file", e);
    }
    console.log("VS Code Extension rolldown complete"); // used verbatim in vscode tasks to detect completion
  },
};

const rolldownInputOptions = {
  input: "src/extension.ts",
  external: ["vscode"],
  platform: "node",
  transform: {
    define: { "import.meta.url": "importMetaUrl" },
    inject: {
      importMetaUrl: [path.resolve(__dirname, "./importMetaUrl.js"), "importMetaUrl"],
    },
  },
  plugins: [dedupePlugin, nodeFilePlugin, onEndPlugin],
};

const rolldownOutputOptions = {
  file: "out/extension.js",
  format: "cjs",
  sourcemap: flags.includes("--sourcemap"),
  codeSplitting: false,
};

void (async () => {
  // Create .buildTimestamp.js before starting the first build
  writeBuildTimestamp();
  // Bundles the extension into one file
  if (flags.includes("--watch")) {
    const watcher = watch({
      ...rolldownInputOptions,
      output: rolldownOutputOptions,
    });

    watcher.on("event", (event) => {
      if (event.code === "BUNDLE_END") {
        event.result.close().catch((error) => {
          console.error("Failed to close rolldown bundle:", error);
        });
      } else if (event.code === "ERROR") {
        console.error("Build failed with errors:", event.error);
        throw event.error;
      }
    });
  } else if (flags.includes("--notify")) {
    const inFile = rolldownInputOptions.input;
    const outFile = rolldownOutputOptions.file;

    // The watcher automatically notices changes to source files
    // so the only thing it needs to be notified about is if the
    // output file gets removed.
    if (fs.existsSync(outFile)) {
      console.log("VS Code Extension rolldown up to date");
      return;
    }

    fs.watchFile(outFile, (current, previous) => {
      if (current.size > 0) {
        console.log("VS Code Extension rolldown rebuild complete");
        fs.unwatchFile(outFile);
        process.exit(0);
      }
    });

    console.log("Triggering VS Code Extension rolldown rebuild...");
    writeBuildTimestamp();
  } else {
    await build({
      ...rolldownInputOptions,
      output: rolldownOutputOptions,
    });
  }
})();
