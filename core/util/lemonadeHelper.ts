import { exec } from "node:child_process";

export async function isLemonadeInstalled(): Promise<boolean> {
  // On Windows, check if lemonade-server command exists
  if (process.platform === "win32") {
    return new Promise((resolve, _reject) => {
      exec("where.exe lemonade-server", (error, _stdout, _stderr) => {
        resolve(!error);
      });
    });
  }

  // On Linux, check if the health endpoint is accessible
  try {
    const response = await fetch("http://localhost:8000/api/v1/health", {
      method: "GET",
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (response.ok) {
      const data = await response.json();
      return data.status === "ok";
    }
    return false;
  } catch {
    return false;
  }
}
