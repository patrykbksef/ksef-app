import { analyzeInvoicePdfBuffer } from "@/lib/invoice/azure-document-intelligence";
import { mapAzureInvoiceAnalyzeResult } from "@/lib/invoice/map-azure-invoice-to-parsed";
import { parseInterRiskInvoiceText } from "@/lib/invoice/parser";
import { recalcParsedInvoice } from "@/lib/invoice/recalc-parsed-invoice";
import {
  parsedInvoiceSchema,
  type ParsedInvoice,
} from "@/lib/validations/invoice";
import type { z } from "zod";

const LOG_SCOPE = "invoice.parse.azure-di";

function formatZodIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
}

/**
 * Parse invoice PDF via Azure Document Intelligence (prebuilt invoice) + code mapper.
 * No LLM. Falls back to InterRisk text parser on full OCR `content` when schema validation fails.
 */
export async function parseInvoiceWithAzureDi(
  buffer: ArrayBuffer,
): Promise<ParsedInvoice> {
  const analyzeResult = await analyzeInvoicePdfBuffer(buffer);

  const tryValidate = (data: ParsedInvoice): ParsedInvoice => {
    const parsed = parsedInvoiceSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(formatZodIssues(parsed.error));
    }
    return recalcParsedInvoice(parsed.data);
  };

  const mapped = mapAzureInvoiceAnalyzeResult(analyzeResult);
  if (mapped) {
    try {
      return tryValidate(mapped);
    } catch (e) {
      console.warn("Azure DI: mapped invoice failed Zod, trying InterRisk fallback", {
        scope: LOG_SCOPE,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const content = (analyzeResult.content ?? "").trim();
  if (content.length > 0) {
    try {
      const inter = parseInterRiskInvoiceText(content);
      return tryValidate(inter);
    } catch (e) {
      console.error("Azure DI: InterRisk fallback failed", {
        scope: LOG_SCOPE,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  throw new Error(
    "Nie udało się odczytać faktury z Azure Document Intelligence — sprawdź PDF lub użyj Panelu / Panelu AI.",
  );
}
