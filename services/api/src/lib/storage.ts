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
  const base = env("ARTIFACTS_DIR", "/data/artifacts");
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
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
