import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function loadState(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return {
      initialized: Boolean(parsed.initialized),
      seenLetterKeys: Array.isArray(parsed.seenLetterKeys) ? parsed.seenLetterKeys : [],
      lastSummaryDate: typeof parsed.lastSummaryDate === "string" ? parsed.lastSummaryDate : "",
      lastSuccessAt: typeof parsed.lastSuccessAt === "string" ? parsed.lastSuccessAt : "",
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { initialized: false, seenLetterKeys: [], lastSummaryDate: "", lastSuccessAt: "" };
    }
    throw error;
  }
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}

