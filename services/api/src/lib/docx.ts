import crypto from "node:crypto";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import sanitizeHtml from "sanitize-html";
import mammoth from "mammoth";
import { escapeHtml, normalizeText } from "./text";

let sofficeTail: Promise<void> = Promise.resolve();

async function withSofficeLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => await fn();
  const p = sofficeTail.then(run, run);
  sofficeTail = p.then(
    () => undefined,
    () => undefined
  );
  return p;
}

const sanitizeCfg: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "br",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "blockquote",
    "hr",
    "span"
  ],
  allowedAttributes: {
    span: ["style"],
    p: ["style"],
    table: ["style"],
    td: ["style"],
    th: ["style"],
    "*": []
  },
  allowedStyles: {
    "*": {
      "text-align": [/^left$|^right$|^center$|^justify$/],
      "font-weight": [/^\d+$/],
      "font-style": [/^italic$/],
      "text-decoration": [/^underline$/]
    }
  }
};

export async function docxBufferToSafeHtml(buffer: Buffer): Promise<string> {
  const tmpDir = os.tmpdir();
  const base = `docx_${crypto.randomUUID().replace(/-/g, "")}`;
  const filePath = path.join(tmpDir, `${base}.docx`);
  await fs.writeFile(filePath, buffer);
  const expectedHtml = [path.join(tmpDir, `${base}.html`), path.join(tmpDir, `${base}.htm`)];
  const expectedDir = path.join(tmpDir, `${base}_files`);
  try {
    const html = await withSofficeLock(() => sofficeDocToHtml(filePath, tmpDir, base));
    const sanitized = sanitizeHtml(html, sanitizeCfg);
    return sanitized || "<p></p>";
  } finally {
    await fs.unlink(filePath).catch(() => {});
    for (const p of expectedHtml) await fs.unlink(p).catch(() => {});
    await fs.rm(expectedDir, { recursive: true, force: true } as any).catch(() => {});
  }
}

export async function docxBufferToSafeHtmlMammoth(buffer: Buffer): Promise<string> {
  const out = await mammoth.convertToHtml({ buffer });
  const html = String((out as any)?.value ?? "");
  const sanitized = sanitizeHtml(html, sanitizeCfg);
  return sanitized || "<p></p>";
}

export async function docBufferToSafeHtml(buffer: Buffer): Promise<string> {
  const tmpDir = os.tmpdir();
  const base = `doc_${crypto.randomUUID().replace(/-/g, "")}`;
  const filePath = path.join(tmpDir, `${base}.doc`);
  await fs.writeFile(filePath, buffer);
  const expectedHtml = [path.join(tmpDir, `${base}.html`), path.join(tmpDir, `${base}.htm`)];
  const expectedDir = path.join(tmpDir, `${base}_files`);
  try {
    const html = await withSofficeLock(() => sofficeDocToHtml(filePath, tmpDir, base));
    const sanitized = sanitizeHtml(html, sanitizeCfg);
    return sanitized || "<p></p>";
  } finally {
    await fs.unlink(filePath).catch(() => {});
    for (const p of expectedHtml) await fs.unlink(p).catch(() => {});
    await fs.rm(expectedDir, { recursive: true, force: true } as any).catch(() => {});
  }
}

async function sofficeDocToHtml(filePath: string, outDir: string, base: string): Promise<string> {
  const profileDir = path.join(outDir, `${base}_lo_profile`);
  await fs.mkdir(profileDir, { recursive: true });
  const profileUrl = `file://${profileDir}`;
  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        "--headless",
        "--nologo",
        "--nolockcheck",
        "--nodefault",
        "--nofirststartwizard",
        `-env:UserInstallation=${profileUrl}`,
        "--convert-to",
        "html",
        "--outdir",
        outDir,
        filePath
      ];
      const bin = (process.env.SOFFICE_BIN && process.env.SOFFICE_BIN.trim()) || "soffice";
      const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("soffice timeout"));
      }, 120_000);
      child.stderr.on("data", (d) => (err += String(d)));
      child.on("error", (e: any) => {
        clearTimeout(timer);
        const code = String(e?.code ?? "");
        if (code === "ENOENT") return reject(new Error('soffice not found (set env "SOFFICE_BIN" or install LibreOffice)'));
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) return resolve();
        const msg = (err || "").trim();
        reject(new Error(msg ? `soffice failed: ${msg}` : `soffice failed (code ${code})`));
      });
    });

    const htmlPath1 = path.join(outDir, `${base}.html`);
    const htmlPath2 = path.join(outDir, `${base}.htm`);
    const htmlPath =
      (await fs.stat(htmlPath1).then(() => htmlPath1).catch(() => null)) ?? (await fs.stat(htmlPath2).then(() => htmlPath2).catch(() => null));
    if (!htmlPath) throw new Error("soffice output html not found");
    return await fs.readFile(htmlPath, "utf8");
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true } as any).catch(() => {});
  }
}

function docTextToHtml(raw: string): string {
  const text = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = text.split("\n");
  const out: string[] = [];

  const splitRowCells = (line: string): string[] | null => {
    const s = String(line ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\u3000/g, " ")
      .trim();
    if (!s) return null;
    if (s.includes("\t")) {
      const cells = s.split(/\t+/g).map((c) => c.trim());
      const nonEmpty = cells.filter((c) => c.length > 0).length;
      if (nonEmpty >= 2) return cells;
      return null;
    }
    if (/[ ]{2,}/.test(s)) {
      const cells = s.split(/[ ]{2,}/g).map((c) => c.trim());
      const nonEmpty = cells.filter((c) => c.length > 0).length;
      if (nonEmpty >= 2 && cells.length <= 24) return cells;
    }
    return null;
  };

  const isStartLikeHeadingOrItem = (trimmed: string): boolean => {
    const s = String(trimmed ?? "").trim();
    if (!s) return false;
    if (/^第[一二三四五六七八九十百千0-9]+[章节条部分篇]/.test(s)) return true;
    if (/^[一二三四五六七八九十]+[、.．。]/.test(s)) return true;
    if (/^\d+(?:[.．]\d+)+/.test(s)) return true;
    if (/^\d+[.．。]/.test(s)) return true;
    if (/^[（(][一二三四五六七八九十]+[)）]/.test(s)) return true;
    if (/^[-*•]\s+/.test(s)) return true;
    if (/^[a-z]\)/i.test(s)) return true;
    return false;
  };

  const isStandaloneLabel = (trimmed: string): boolean => {
    const s = String(trimmed ?? "").trim();
    if (!s) return false;
    if (/^\d+[.．。]?$/.test(s)) return true;
    if (/^[（(]\d+[)）]$/.test(s)) return true;
    if (/^[（(][一二三四五六七八九十]+[)）]$/.test(s)) return true;
    return false;
  };

  const pushParagraph = (content: string) => {
    const norm = normalizeText(content);
    if (!norm) return;
    out.push(`<p>${escapeHtml(norm).replace(/\n/g, "<br/>")}</p>`);
  };

  const nextNonEmptyIndex = (from: number): number | null => {
    for (let j = from; j < lines.length; j++) {
      const t = String(lines[j] ?? "").trim();
      if (t) return j;
    }
    return null;
  };

  let i = 0;
  let paraBuf: string[] = [];
  while (i < lines.length) {
    const rawLine = String(lines[i] ?? "");
    const trimmed = rawLine
      .replace(/\u00a0/g, " ")
      .replace(/\u3000/g, " ")
      .trimEnd();

    if (!trimmed.trim()) {
      if (paraBuf.length) pushParagraph(paraBuf.join("\n"));
      paraBuf = [];
      i += 1;
      continue;
    }

    const row0 = splitRowCells(trimmed);
    if (row0) {
      if (paraBuf.length) pushParagraph(paraBuf.join("\n"));
      paraBuf = [];

      const rows: string[][] = [];
      while (i < lines.length) {
        const l = String(lines[i] ?? "");
        const t = l.replace(/\u00a0/g, " ").replace(/\u3000/g, " ").trimEnd();
        if (!t.trim()) {
          const nextIdx = nextNonEmptyIndex(i + 1);
          if (nextIdx === null) {
            i = lines.length;
            break;
          }
          const nextLine = String(lines[nextIdx] ?? "").replace(/\u00a0/g, " ").replace(/\u3000/g, " ").trimEnd();
          if (!splitRowCells(nextLine)) break;
          i += 1;
          continue;
        }
        const row = splitRowCells(t);
        if (!row) break;
        rows.push(row);
        i += 1;
      }

      const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
      const body = rows
        .map((r) => {
          const tds = Array.from({ length: maxCols }, (_, idx) => {
            const cell = normalizeText(String(r[idx] ?? "")).replace(/\n/g, " ").trim();
            return `<td>${escapeHtml(cell)}</td>`;
          }).join("");
          return `<tr>${tds}</tr>`;
        })
        .join("");
      out.push(`<table><tbody>${body}</tbody></table>`);
      continue;
    }

    const t = trimmed.trim();
    if (isStandaloneLabel(t)) {
      const ni = nextNonEmptyIndex(i + 1);
      if (ni !== null) {
        const nt = String(lines[ni] ?? "")
          .replace(/\u00a0/g, " ")
          .replace(/\u3000/g, " ")
          .trim();
        if (nt && !isStartLikeHeadingOrItem(nt)) {
          paraBuf.push(`${t} ${nt}`);
          i = ni + 1;
          continue;
        }
      }
    }

    const isIndented = /^\s+/.test(rawLine.replace(/\u00a0/g, " ").replace(/\u3000/g, " "));
    if (isIndented && paraBuf.length && !isStartLikeHeadingOrItem(t)) {
      paraBuf[paraBuf.length - 1] = `${paraBuf[paraBuf.length - 1]} ${t}`.trim();
      i += 1;
      continue;
    }

    if (paraBuf.length) {
      pushParagraph(paraBuf.join("\n"));
      paraBuf = [];
    }
    paraBuf.push(t);
    i += 1;
  }
  if (paraBuf.length) pushParagraph(paraBuf.join("\n"));

  return out.join("");
}

async function antiwordToText(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const bin = (process.env.ANTIWORD_BIN && process.env.ANTIWORD_BIN.trim()) || "antiword";
    const child = spawn(bin, ["-m", "UTF-8.txt", filePath], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", (e: any) => {
      const code = String(e?.code ?? "");
      if (code === "ENOENT") return reject(new Error('antiword not found (set env "ANTIWORD_BIN")'));
      reject(e);
    });
    child.on("close", (code) => {
      if (code === 0) return resolve(out);
      const msg = (err || "").trim();
      reject(new Error(msg ? `antiword failed: ${msg}` : `antiword failed (code ${code})`));
    });
  });
}
