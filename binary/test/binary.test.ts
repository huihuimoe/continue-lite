import { FromCoreProtocol, ToCoreProtocol } from "core/protocol/index.js";
import { IMessenger } from "core/protocol/messenger";
import { ReverseMessageIde } from "core/protocol/messenger/reverseMessageIde";
import { WebviewSingleMessage } from "core/protocol/util";
import FileSystemIde from "core/util/filesystem";
import fs from "fs";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import path from "path";
import {
  CoreBinaryMessenger,
  CoreBinaryTcpMessenger,
} from "../src/IpcMessenger";

// jest.setTimeout(100_000);

const USE_TCP = false;

type BinaryRequestProtocol = {
  [K in keyof ToCoreProtocol]: [
    ToCoreProtocol[K][0],
    WebviewSingleMessage<ToCoreProtocol[K][1]>,
  ];
};

function autodetectPlatformAndArch() {
  const platform = {
    aix: "linux",
    darwin: "darwin",
    freebsd: "linux",
    linux: "linux",
    openbsd: "linux",
    sunos: "linux",
    win32: "win32",
    android: "linux",
    cygwin: "win32",
    netbsd: "linux",
    haiku: "linux",
  }[process.platform];
  const arch = {
    arm: "arm64",
    arm64: "arm64",
    ia32: "x64",
    loong64: "arm64",
    mips: "arm64",
    mipsel: "arm64",
    ppc: "x64",
    ppc64: "x64",
    riscv64: "arm64",
    s390: "x64",
    s390x: "x64",
    x64: "x64",
  }[process.arch];
  return [platform, arch];
}

const CONTINUE_GLOBAL_DIR = path.join(__dirname, "..", ".continue");
if (fs.existsSync(CONTINUE_GLOBAL_DIR)) {
  fs.rmSync(CONTINUE_GLOBAL_DIR, { recursive: true, force: true });
}
fs.mkdirSync(CONTINUE_GLOBAL_DIR);

describe("Test Suite", () => {
  let messenger: IMessenger<FromCoreProtocol, BinaryRequestProtocol>;
  let subprocess: ChildProcessWithoutNullStreams | undefined;

  beforeAll(async () => {
    const [platform, arch] = autodetectPlatformAndArch();
    const binaryDir = path.join(__dirname, "..", "bin", `${platform}-${arch}`);
    const exe = platform === "win32" ? ".exe" : "";
    const runtimeEntry = path.join(__dirname, "..", "out", "index.js");
    const expectedItems = [`continue-binary${exe}`, "package.json"];
    expectedItems.forEach((item) => {
      expect(fs.existsSync(path.join(binaryDir, item))).toBe(true);
    });
    expect(fs.existsSync(runtimeEntry)).toBe(true);

    if (USE_TCP) {
      messenger = new CoreBinaryTcpMessenger<
        FromCoreProtocol,
        BinaryRequestProtocol
      >();
    } else {
      try {
        subprocess = spawn(process.execPath, [runtimeEntry], {
          env: { ...process.env, CONTINUE_GLOBAL_DIR },
        });
        console.log("Successfully spawned subprocess");
      } catch (error) {
        console.error("Error spawning subprocess:", error);
        throw error;
      }
      messenger = new CoreBinaryMessenger<
        FromCoreProtocol,
        BinaryRequestProtocol
      >(subprocess);
    }

    const testDir = path.join(__dirname, "..", ".test");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }
    const ide = new FileSystemIde(testDir);
    new ReverseMessageIde(messenger.on.bind(messenger), ide);

    // Wait for core to set itself up
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Wait for the subprocess to exit
    if (USE_TCP) {
      (
        messenger as CoreBinaryTcpMessenger<
          FromCoreProtocol,
          BinaryRequestProtocol
        >
      ).close();
    } else {
      const processToClose = subprocess;
      if (!processToClose) {
        return;
      }
      processToClose.kill();
      await new Promise((resolve) => processToClose.on("close", resolve));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });

  it("should respond to ping with pong", async () => {
    const resp = await messenger.request("ping", "ping");
    expect(resp).toMatchObject({
      status: "success",
      done: true,
      content: "pong",
    });
  });

  it("should create the configured continue directory", async () => {
    expect(fs.existsSync(CONTINUE_GLOBAL_DIR)).toBe(true);
  });

  it("should accept ide settings updates", async () => {
    const resp = await messenger.request("config/ideSettingsUpdate", {
      remoteConfigSyncPeriod: 0,
      userToken: "",
      continueTestEnvironment: "local",
      pauseCodebaseIndexOnStart: false,
    });

    expect(resp).toMatchObject({
      status: "success",
      done: true,
    });
  });

  it("should report next edit chain state", async () => {
    const resp = await messenger.request("nextEdit/isChainAlive", undefined);

    expect(resp.status).toBe("success");
    expect(resp.done).toBe(true);
    if (resp.status !== "success") {
      throw new Error(resp.error);
    }
    expect(typeof resp.content).toBe("boolean");
  });

  it("should accept file change notifications", async () => {
    const resp = await messenger.request("files/changed", {});

    expect(resp).toMatchObject({
      status: "success",
      done: true,
    });
  });
});
