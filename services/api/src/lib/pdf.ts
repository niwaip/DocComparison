import fs from "node:fs/promises";
import puppeteer from "puppeteer-core";

export async function renderPdfFromHtmlFile(params: { htmlPath: string; pdfPath: string }): Promise<void> {
  const html = await fs.readFile(params.htmlPath, "utf8");
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=medium"]
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMediaType("print");
    await page.evaluateHandle("document.fonts.ready");
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
