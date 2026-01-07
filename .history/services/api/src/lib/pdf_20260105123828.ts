import fs from "node:fs/promises";
import { chromium } from "playwright";

export async function renderPdfFromHtmlFile(params: { htmlPath: string; pdfPath: string }): Promise<void> {
  const html = await fs.readFile(params.htmlPath, "utf8");
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: params.pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" }
    });
  } finally {
    await browser.close();
  }
}

