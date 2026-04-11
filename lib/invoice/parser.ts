import { parsedInvoiceSchema, type ParsedInvoice } from "@/lib/validations/invoice";

const LOG_SCOPE = "invoice.parser";

function truncatePreview(s: string, max = 300): string {
  if (s.length <= max) return s;
  return `${s.slice(0, 200)}…[truncated]…${s.slice(-80)}`;
}

function parsePlNumber(s: string): number {
  return Number.parseFloat(s.replace(",", "."));
}

/** Strip invoice header dates that sit between NIP blocks (InterRisk PDF layout). */
function normalizeInterRiskPartyLines(lines: string[]): string[] {
  const dateOnly = /^\d{2}-\d{2}-\d{4}$/;
  const leadingDateComma = /^\d{2}-\d{2}-\d{4},\s*/;
  return lines
    .map((line) => line.replace(leadingDateComma, "").trim())
    .filter((line) => line.length > 0 && !dateOnly.test(line));
}

/**
 * InterRisk PDF text glues the first digit of quantity onto unit price:
 * `3.501 km. 235.00` = 3.50 PLN × 235 km, not 3.50 × 1 km.
 * A naive space-split would mis-read qty; do not use the old fuse replacer as primary.
 */
/** InterRisk: `3.501 km. 235.00` = 3.50 × 235 km (glued digit before unit). */
const INTERRISK_LINE_ROW =
  /^(.+?)\s+(\d+)([.,]\d{2})(\d)\s+(km\.|ope\.)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;

/** Legacy: split `3.501 km.` → `3.50 1 km.` — wrong when `1` belongs to `235`. */
function normalizeFusedPriceQtyRow(line: string): string {
  return line.replace(
    /(\d+)\.(\d{2})(\d)(\s+(?:km\.|ope\.))/g,
    "$1.$2 $3$4",
  );
}

function parseInterRiskTableRow(
  line: string,
  lineNumber: number,
): {
  lineNumber: number;
  name: string;
  unit: string;
  quantity: number;
  netUnitPrice: number;
  netAmount: number;
  vatRate: number;
  vatAmount: number;
  grossAmount: number;
} | null {
  const m = line.trim().match(INTERRISK_LINE_ROW);
  if (!m) return null;
  const netUnitPrice = parsePlNumber(`${m[2]}${m[3]}`);
  const quantity = parsePlNumber(m[6]!);
  const netAmount = parsePlNumber(m[7]!);
  const vatRate = parsePlNumber(m[8]!);
  const vatAmount = parsePlNumber(m[9]!);
  const grossAmount = parsePlNumber(m[10]!);
  const name = m[1]!.trim();
  const unit = m[5]!;

  if (
    !name ||
    !Number.isFinite(netUnitPrice) ||
    !Number.isFinite(quantity) ||
    !Number.isFinite(netAmount) ||
    !Number.isFinite(vatRate) ||
    !Number.isFinite(vatAmount) ||
    !Number.isFinite(grossAmount)
  ) {
    return null;
  }

  return {
    lineNumber,
    name,
    unit,
    quantity,
    netUnitPrice,
    netAmount,
    vatRate,
    vatAmount,
    grossAmount,
  };
}

function extractInvoiceNumber(text: string): string | null {
  const m = text.match(/FAKTURA VAT NR\s+([^\r\n]+)/i);
  return m?.[1]?.trim() ?? null;
}

function extractNips(text: string): string[] {
  const matches = text.matchAll(/\bNIP\s*(\d{10})\b/gi);
  return [...matches].map((m) => m[1]!);
}

function extractPolishDates(text: string): string[] {
  const matches = text.matchAll(/\b(\d{2})-(\d{2})-(\d{4})\b/g);
  return [...matches].map((m) => `${m[3]}-${m[2]}-${m[1]}`);
}

function parseLineItemLine(line: string, lineNumber: number) {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 9) return null;

  const gross = parsePlNumber(parts[parts.length - 1]!);
  const vatAmt = parsePlNumber(parts[parts.length - 2]!);
  const vatRate = parsePlNumber(parts[parts.length - 3]!);
  const netAmt = parsePlNumber(parts[parts.length - 4]!);
  void parsePlNumber(parts[parts.length - 5]!);
  const unit = parts[parts.length - 6]!;
  const qty = parsePlNumber(parts[parts.length - 7]!);
  const netUnitPrice = parsePlNumber(parts[parts.length - 8]!);
  const name = parts.slice(0, parts.length - 8).join(" ");

  if (
    !name ||
    !Number.isFinite(gross) ||
    !Number.isFinite(netAmt) ||
    !Number.isFinite(vatAmt) ||
    !Number.isFinite(vatRate) ||
    !Number.isFinite(qty) ||
    !Number.isFinite(netUnitPrice)
  ) {
    return null;
  }

  return {
    lineNumber,
    name,
    unit,
    quantity: qty,
    netUnitPrice,
    netAmount: netAmt,
    vatRate,
    vatAmount: vatAmt,
    grossAmount: gross,
  };
}

function parseVatSummaryAndTotals(text: string) {
  const vatSummary: ParsedInvoice["vatSummary"] = [];
  const rateBlock = /(\d+(?:[.,]\d+)?)%\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = rateBlock.exec(text)) !== null) {
    const rate = parsePlNumber(m[1]!);
    const a = parsePlNumber(m[2]!);
    const b = parsePlNumber(m[3]!);
    const c = parsePlNumber(m[4]!);
    if (m[0].includes("-") && m[2] === "-" && m[3] === "-") continue;
    if (!Number.isFinite(rate)) continue;
    vatSummary.push({
      vatRate: rate,
      netAmount: a,
      vatAmount: c,
      grossAmount: b,
    });
  }

  const suma = text.match(
    /([\d.,]+)\s*zł\.\s*([\d.,]+)\s*zł\.\s*SUMA\s*([\d.,]+)\s*zł\./i,
  );
  let totals = { net: 0, vat: 0, gross: 0 };
  if (suma) {
    totals = {
      vat: parsePlNumber(suma[1]!),
      net: parsePlNumber(suma[2]!),
      gross: parsePlNumber(suma[3]!),
    };
  }

  return { vatSummary, totals };
}

function extractPayment(text: string) {
  const days = text.match(/Termin\s+Płatnosci\s*\(dni\):\s*(\d+)/i);
  const due = text.match(/Do\s+zapłaty:\s*([\d.,]+)\s*zł\./i);
  const method = text.match(/Forma\s+płatności:\s*\n?\s*([^\n]+)/i);
  return {
    paymentDays: days ? Number.parseInt(days[1]!, 10) : undefined,
    amountDue: due ? parsePlNumber(due[1]!) : undefined,
    paymentMethod: method?.[1]?.trim(),
  };
}

function extractReference(text: string) {
  const m = text.match(/([\d]+\/IR)\s*Numer ref\./i);
  return m?.[1];
}

function extractBank(text: string, buyerNip: string) {
  const lines = text.split(/\r?\n/);
  const nipIdx = lines.findIndex((l) => l.includes(`NIP ${buyerNip}`));
  if (nipIdx < 0 || nipIdx + 3 >= lines.length) return {};
  const bankName = lines[nipIdx + 1]?.trim();
  const bankAccount = lines[nipIdx + 2]?.trim();
  if (bankName && /^\d[\d\s]+$/.test(bankAccount ?? "")) {
    return { bankName, bankAccount: bankAccount.replace(/\s/g, "") };
  }
  return {};
}

/**
 * Parse plain text extracted from InterRisk-style PDF invoices.
 */
export function parseInterRiskInvoiceText(rawText: string): ParsedInvoice {
  const text = rawText.replace(/\u00a0/g, " ");
  const lineCount = text.split(/\r?\n/).length;

  const invoiceNumber = extractInvoiceNumber(text);
  if (!invoiceNumber) {
    console.error("Invoice parse failed: missing invoice number", {
      scope: LOG_SCOPE,
      phase: "header",
      reason: "missing_invoice_number",
      lineCount,
      textPreview: truncatePreview(text),
    });
    throw new Error("Could not find invoice number (FAKTURA VAT NR …)");
  }

  const nips = extractNips(text);
  if (nips.length < 2) {
    console.error("Invoice parse failed: NIP count", {
      scope: LOG_SCOPE,
      phase: "parties",
      reason: "insufficient_nips",
      nipCount: nips.length,
      lineCount,
      textPreview: truncatePreview(text),
    });
    throw new Error("Could not find seller and buyer NIP");
  }
  const sellerNip = nips[0]!;
  const buyerNip = nips[1]!;

  const dates = extractPolishDates(text);
  const issueDate = dates[0] ?? "";
  const saleDate = dates[1] ?? dates[0] ?? "";

  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const nipSellerIdx = lines.findIndex((l) => l.includes(`NIP ${sellerNip}`));
  const nipBuyerIdx = lines.findIndex((l) => l.includes(`NIP ${buyerNip}`));

  const sellerLinesRaw =
    nipSellerIdx > 0 ? lines.slice(1, nipSellerIdx).filter(Boolean) : [];
  const buyerLinesRaw =
    nipBuyerIdx > nipSellerIdx + 1
      ? lines.slice(nipSellerIdx + 1, nipBuyerIdx).filter(Boolean)
      : [];
  const sellerLines = normalizeInterRiskPartyLines(sellerLinesRaw);
  const buyerLines = normalizeInterRiskPartyLines(buyerLinesRaw);

  const itemsStart = lines.findIndex((l) =>
    l.includes("Nazwa usługi") || l.includes("Nazwa us"),
  );
  let itemsEnd = lines.findIndex(
    (l, i) => i > itemsStart && /^\d+(?:[.,]\d+)?%\s/.test(l),
  );
  if (itemsStart < 0) {
    console.error("Invoice parse failed: line items section not found", {
      scope: LOG_SCOPE,
      phase: "lineItems",
      reason: "missing_nazwa_uslugi_marker",
      lineCount: lines.length,
      textPreview: truncatePreview(text),
    });
    throw new Error("Could not locate line items section");
  }
  if (itemsEnd < 0) itemsEnd = lines.length;

  const lineItems: NonNullable<ReturnType<typeof parseLineItemLine>>[] = [];
  let lp = 0;
  for (let i = itemsStart + 1; i < itemsEnd; i++) {
    const row = lines[i]!;
    if (!row || row.startsWith("SPRZEDAWCA")) continue;
    const item =
      parseInterRiskTableRow(row, lp + 1) ??
      parseLineItemLine(normalizeFusedPriceQtyRow(row), lp + 1) ??
      parseLineItemLine(row, lp + 1);
    if (item) {
      lineItems.push(item);
      lp++;
    }
  }

  if (lineItems.length === 0) {
    const sampleRows = lines
      .slice(itemsStart + 1, Math.min(itemsEnd, itemsStart + 5))
      .map((r) => truncatePreview(r, 200));
    console.error("Invoice parse failed: no line items", {
      scope: LOG_SCOPE,
      phase: "lineItems",
      reason: "zero_parsed_rows",
      itemsStart,
      itemsEnd,
      linesBetween: Math.max(0, itemsEnd - itemsStart - 1),
      lineCount: lines.length,
      sampleRows,
    });
    throw new Error("No line items parsed — check PDF text layout");
  }

  const { vatSummary: vatFromDoc, totals } = parseVatSummaryAndTotals(text);
  const pay = extractPayment(text);
  const ref = extractReference(text);
  const bank = extractBank(text, buyerNip);

  const vatSummaryFromLines = (): ParsedInvoice["vatSummary"] => {
    const map = new Map<
      number,
      { net: number; vat: number; gross: number }
    >();
    for (const i of lineItems) {
      const e = map.get(i.vatRate) ?? { net: 0, vat: 0, gross: 0 };
      e.net += i.netAmount;
      e.vat += i.vatAmount;
      e.gross += i.grossAmount;
      map.set(i.vatRate, e);
    }
    return [...map.entries()].map(([vatRate, v]) => ({
      vatRate,
      netAmount: v.net,
      vatAmount: v.vat,
      grossAmount: v.gross,
    }));
  };

  const vatSummary =
    vatFromDoc.length > 0 ? vatFromDoc : vatSummaryFromLines();

  const raw = {
    invoiceNumber,
    issueDate,
    saleDate,
    seller: {
      name: sellerLines[0] ?? "Unknown seller",
      addressLines: sellerLines.slice(1),
      nip: sellerNip,
    },
    buyer: {
      name: buyerLines[0] ?? "Unknown buyer",
      addressLines: buyerLines.slice(1),
      nip: buyerNip,
    },
    ...bank,
    ...pay,
    referenceNumber: ref,
    remarks: lines.find((l) => l.startsWith("KIA ")) ?? undefined,
    lineItems,
    vatSummary,
    totals: {
      net:
        totals.net || lineItems.reduce((s, i) => s + i.netAmount, 0),
      vat:
        totals.vat || lineItems.reduce((s, i) => s + i.vatAmount, 0),
      gross:
        totals.gross || lineItems.reduce((s, i) => s + i.grossAmount, 0),
    },
    currency: "PLN" as const,
  };

  const parsed = parsedInvoiceSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Invoice parse failed: Zod validation", {
      scope: LOG_SCOPE,
      phase: "validate",
      reason: "parsed_invoice_schema",
      zodMessage: parsed.error.message,
      lineItemCount: lineItems.length,
    });
    throw new Error(
      `Parsed invoice validation failed: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
