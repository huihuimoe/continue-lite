import fs from "fs";

import { IDE } from "..";
import { getGlobalContinueIgnorePath } from "./paths";
import { gitIgArrayFromFile } from "./ignore";

export const getGlobalContinueIgArray = () => {
  try {
    const path = getGlobalContinueIgnorePath();
    if (!fs.existsSync(path)) {
      return [];
    }
    const contents = fs.readFileSync(path, "utf8");
    return gitIgArrayFromFile(contents);
  } catch {
    return [];
  }
};

export const getWorkspaceContinueIgArray = async (ide: IDE) => {
  const dirs = await ide.getWorkspaceDirs();
  return await dirs.reduce(
    async (accPromise, dir) => {
      const acc = await accPromise;
      try {
        const contents = await ide.readFile(`${dir}/.continueignore`);
        return [...acc, ...gitIgArrayFromFile(contents)];
      } catch {
        return acc;
      }
    },
    Promise.resolve([] as string[]),
  );
};
