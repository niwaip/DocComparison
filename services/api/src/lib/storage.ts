import fs from "node:fs/promises";
import path from "node:path";
import { envOptional } from "./env";

export type CompareArtifacts = {
  compareId: string;
  dir: string;
  jsonPath: string;
  htmlPath: string;
  pdfPath: string;
  diffHtmlPath: string;
  diffPdfPath: string;
};

export async function ensureArtifacts(compareId: string): Promise<CompareArtifacts> {
  const baseFromEnv = envOptional("ARTIFACTS_DIR");
  const candidates = Array.from(new Set([baseFromEnv, "./artifacts"].filter(Boolean))) as string[];

  const pickBase = async (): Promise<string> => {
    if (baseFromEnv) return baseFromEnv;
    return "./artifacts";
  };

  const existsCompareJson = async (base: string): Promise<boolean> => {
    try {
      await fs.access(path.join(base, compareId, "compare.json"));
      return true;
    } catch {
      return false;
    }
  };

  let base = await pickBase();
  for (const c of candidates) {
    if (await existsCompareJson(c)) {
      base = c;
      break;
    }
  }

  const dir = path.join(base, compareId);
  await fs.mkdir(dir, { recursive: true });
  return {
    compareId,
    dir,
    jsonPath: path.join(dir, "compare.json"),
    htmlPath: path.join(dir, "compare.html"),
    pdfPath: path.join(dir, "compare.pdf"),
    diffHtmlPath: path.join(dir, "compare.diff.html"),
    diffPdfPath: path.join(dir, "compare.diff.pdf")
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

export type StandardContractMeta = {
  schemaVersion: "1";
  typeId: string;
  name: string;
  fileName: string;
  mimeType: string;
  sha256: string;
  updatedAt: string;
};

function safeTypeId(typeId: string): string {
  const x = String(typeId ?? "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(x)) {
    throw new Error("invalid standardTypeId");
  }
  return x;
}

async function ensureStandardContractsDir(): Promise<string> {
  const baseFromEnv = envOptional("STANDARD_CONTRACTS_DIR");
  const base = (baseFromEnv && baseFromEnv.trim()) || "./data/standard-contracts";
  await fs.mkdir(base, { recursive: true });
  return base;
}

export async function getStandardContractMetaPath(typeId: string): Promise<string> {
  const dir = await ensureStandardContractsDir();
  const id = safeTypeId(typeId);
  return path.join(dir, `${id}.meta.json`);
}

export async function getStandardContractRulesPath(typeId: string): Promise<string> {
  const dir = await ensureStandardContractsDir();
  const id = safeTypeId(typeId);
  return path.join(dir, `${id}.rules.json`);
}

export async function getStandardContractFilePathFromMeta(meta: StandardContractMeta): Promise<string> {
  const dir = await ensureStandardContractsDir();
  const id = safeTypeId(meta.typeId);
  const ext = path.extname(meta.fileName || "").toLowerCase();
  const safeExt = ext === ".doc" || ext === ".docx" || ext === ".pdf" ? ext : ".docx";
  return path.join(dir, `${id}${safeExt}`);
}

export async function readStandardContractMeta(typeId: string): Promise<StandardContractMeta | null> {
  const metaPath = await getStandardContractMetaPath(typeId);
  if (!(await fileExists(metaPath))) return null;
  const meta = await readJson<StandardContractMeta>(metaPath);
  if (!meta || meta.schemaVersion !== "1") return null;
  return meta;
}

export async function readStandardContractFile(typeId: string): Promise<{
  meta: StandardContractMeta;
  filePath: string;
  buffer: Buffer;
}> {
  const meta = await readStandardContractMeta(typeId);
  if (!meta) throw new Error("standard contract not found");
  const filePath = await getStandardContractFilePathFromMeta(meta);
  const buffer = await fs.readFile(filePath);
  return { meta, filePath, buffer };
}

export async function readStandardContractRules(typeId: string): Promise<unknown | null> {
  const rulesPath = await getStandardContractRulesPath(typeId);
  if (!(await fileExists(rulesPath))) return null;
  return await readJson<unknown>(rulesPath);
}

export async function writeStandardContractRules(typeId: string, rules: unknown): Promise<void> {
  const rulesPath = await getStandardContractRulesPath(typeId);
  await writeJson(rulesPath, rules);
}
