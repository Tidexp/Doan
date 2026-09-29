import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export type ParsedDocument = {
  title: string;
  text: string;
  pageCount?: number;
};

function estimatePages(text: string) {
  return Math.max(1, Math.ceil(text.length / 1800));
}

export async function parseDocument(
  filePath: string,
  mimeType: string,
): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = await fs.readFile(filePath);
  const fallbackTitle = path.basename(filePath, ext);

  if (ext === ".md" || mimeType === "text/markdown" || mimeType === "text/plain") {
    const text = buffer.toString("utf8");
    return { title: fallbackTitle, text, pageCount: estimatePages(text) };
  }

  if (
    ext === ".docx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.convertToMarkdown({ buffer });
    return {
      title: fallbackTitle,
      text: result.value,
      pageCount: estimatePages(result.value),
    };
  }

  if (ext === ".pdf" || mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      const info = await parser.getInfo();
      return {
        title: fallbackTitle,
        text: textResult.text,
        pageCount: info.total ?? estimatePages(textResult.text),
      };
    } finally {
      await parser.destroy();
    }
  }

  throw new Error(`Unsupported file type: ${ext || mimeType}`);
}
