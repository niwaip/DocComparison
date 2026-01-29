import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

export type CompareArtifacts = {
  compareId: string;
  dir: string;
  jsonPath: string;
  htmlPath: string;
  pdfPath: string;
};

export async function ensureArtifacts(compareId: string): Promise<CompareArtifacts> {
  const base = "./artifacts";
  const dir = path.join(base, compareId);
  await fs.mkdir(dir, { recursive: true });
  return {
    compareId,
    dir,
    jsonPath: path.join(dir, "compare.json"),
    htmlPath: path.join(dir, "compare.html"),
    pdfPath: path.join(dir, "compare.pdf")
  };
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function readJson<T>(filePath: string): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch (e) {
      lastErr = e;
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
