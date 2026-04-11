import { extractText, getDocumentProxy } from "unpdf";

const LOG_SCOPE = "invoice.pdf";

export async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    const pages = text ?? [];
    const fullText = pages.join("\n\n");

    if (!fullText.trim()) {
      console.error("PDF text extraction returned empty string", {
        scope: LOG_SCOPE,
        phase: "extract",
        reason: "empty_text",
        totalPages: totalPages ?? pages.length,
      });
    }

    return fullText;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PDF text extraction failed", {
      scope: LOG_SCOPE,
      phase: "extract",
      reason: "exception",
      error: message,
    });
    throw err;
  }
}
