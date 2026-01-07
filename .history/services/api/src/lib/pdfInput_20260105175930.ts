import pdf from "pdf-parse";
import { escapeHtml, normalizeText } from "./text";

export async function pdfBufferToSafeHtml(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  const text = normalizeText(data.text ?? "");
  if (!text) return "<p></p>";

  const rawParas = splitToRawParagraphs(text);
  const paras = rawParas.flatMap((p) => expandParagraph(p)).slice(0, 5000);

  const html = paras
    .map((p) => {
      const escaped = escapeHtml(p).replace(/\n/g, "<br/>");
      return `<p>${escaped}</p>`;
    })
    .join("");

  return html || "<p></p>";
}

function splitToRawParagraphs(text: string): string[] {
  const lines = text.split("\n").map((x) => x.trimEnd());
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    const s = normalizeText(buf.join("\n"));
    if (s) out.push(s);
    buf = [];
  };
  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

function expandParagraph(p: string): string[] {
  const norm = normalizeText(p);
  if (!norm) return [];
  const lines = norm.split("\n").map((x) => normalizeText(x)).filter(Boolean);
  if (lines.length <= 1) return [norm];

  const shouldSplitLines = lines.length >= 4 || lines.some((l) => looksLikeTocLine(l) || looksLikeSectionHeading(l));
  if (!shouldSplitLines) return [norm];

  return lines;
}

function looksLikeTocLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  if (/(?:\.{3,}|…{2,}|·{3,}|-{3,}|_{3,})\s*\d+\s*$/.test(s)) return true;
  if (/^\d+(?:\.\d+)*\s+.+\s+\d+\s*$/.test(s)) return true;
  return false;
}

function looksLikeSectionHeading(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  if (/^\d+(?:\.\d+)*(\s|[.。:：、\-—\)])/.test(s)) return true;
  if (/^第[一二三四五六七八九十百千0-9]+[章节条篇部分]/.test(s)) return true;
  return false;
}
