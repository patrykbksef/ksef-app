import { parsedInvoiceSchema, type ParsedInvoice } from "@/lib/validations/invoice";
import { mergeLeadingNameLinesFromAddress } from "@/lib/invoice/party-name-address";

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
  /^(.+?)\s+(\d+)([.,]\d{2})(\d)\s+(km\.|ope\.|h\.)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;

/** Legacy: split `3.501 km.` → `3.50 1 km.` — wrong when `1` belongs to `235`. */
function normalizeFusedPriceQtyRow(line: string): string {
  return line.replace(/(\d+)\.(\d{2})(\d)(\s+(?:km\.|ope\.|h\.))/g, "$1.$2 $3$4");
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

function normalizeInvoiceNumberToken(raw: string): string {
  return raw
    .trim()
    .replace(/[,;.)]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractInvoiceNumber(text: string): string | null {
  const patterns: RegExp[] = [
    /FAKTURA\s+VAT\s+NR\s+([^\r\n]+)/i,
    /Podgląd\s+rozliczenia\s+do\s+FV\s*:?\s*(?:nr\.?\s*)?(\S+)/i,
    /Faktura\s+(?:VAT\s+)?nr\.?\s*:?\s*(\S+)/i,
    /Numer\s+faktury\s*:?\s*(\S+)/i,
    /Nr\.?\s+faktury\s*:?\s*(\S+)/i,
    /Invoice\s+(?:No\.?|#)\s*:?\s*(\S+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    const cap = m?.[1];
    if (!cap) continue;
    const n = normalizeInvoiceNumberToken(cap);
    if (n.length > 0) return n;
  }
  return null;
}

/** First NIP value after a label (no newlines — avoids swallowing dates on next lines). */
function nipDigitsAfterLabel(tail: string): string | null {
  const compact =
    tail.match(/^(\d{10})\b/) ??
    tail.match(/^(\d{3}-\d{3}-\d{2}-\d{3})\b/) ??
    tail.match(/^(\d{3}\s+\d{3}\s+\d{2}\s+\d{3})\b/);
  if (compact) {
    const d = compact[1]!.replace(/\D/g, "");
    return d.length === 10 ? d : null;
  }
  const spaced = tail.match(/^([\d][\d\s\-]{8,25}?)(?=\s*$|\s{2,}|\s[^\d\s\-]|\r|\n)/);
  if (!spaced) return null;
  const d = spaced[1]!.replace(/\D/g, "");
  return d.length === 10 ? d : null;
}

function extractNips(text: string): string[] {
  const out: string[] = [];
  const label = /(?:NIP|TAX\s+NUMBER):?\s*/gi;
  let m: RegExpExecArray | null;
  while ((m = label.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const tail = text.slice(start, start + 48);
    const d = nipDigitsAfterLabel(tail);
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

/** Match seller/buyer lines: `NIP 123…`, `NIP: 525-10-32-299`, dashed groups, etc. */
function findNipLineIndex(lines: string[], nip: string): number {
  const want = nip.replace(/\D/g, "");
  return lines.findIndex((l) => {
    const label = /(?:NIP|TAX\s+NUMBER):?\s*/gi;
    let mm: RegExpExecArray | null;
    while ((mm = label.exec(l)) !== null) {
      const start = mm.index + mm[0].length;
      const tail = l.slice(start, start + 48);
      const d = nipDigitsAfterLabel(tail);
      if (d === want) return true;
    }
    return false;
  });
}

/** ISO `yyyy-mm-dd` first (document order), then `dd-mm-yyyy` → ISO; deduped. */
function extractPolishDates(text: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (iso: string) => {
    if (!seen.has(iso)) {
      seen.add(iso);
      ordered.push(iso);
    }
  };
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    push(`${m[1]}-${m[2]}-${m[3]}`);
  }
  for (const m of text.matchAll(/\b(\d{2})-(\d{2})-(\d{4})\b/g)) {
    push(`${m[3]}-${m[2]}-${m[1]}`);
  }
  return ordered;
}

/** Match ISO YYYY-MM-DD or Polish DD-MM-YYYY after a label regex and return ISO. */
function extractLabeledDateIso(text: string, labelRe: RegExp): string | null {
  const isoRe = new RegExp(labelRe.source + String.raw`(\d{4})-(\d{2})-(\d{2})`, "i");
  const isoM = text.match(isoRe);
  if (isoM?.[1] && isoM[2] && isoM[3]) return `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
  const plRe = new RegExp(labelRe.source + String.raw`(\d{2})-(\d{2})-(\d{4})`, "i");
  const plM = text.match(plRe);
  if (plM?.[1] && plM[2] && plM[3]) return `${plM[3]}-${plM[2]}-${plM[1]}`;
  return null;
}

/** Prefer explicit PL invoice lines so payment due is not used as sale date. */
function extractIssueAndSaleDates(text: string): {
  issueDate: string;
  saleDate: string;
} {
  const saleIso = extractLabeledDateIso(text, /Data\s+sprzeda[żz]y\s*:?\s*/);
  const issueIso =
    extractLabeledDateIso(text, /dnia\s*:?\s*/) ?? extractLabeledDateIso(text, /Data\s+wystawienia\s*:?\s*/);
  const ordered = extractPolishDates(text);
  const issueDate = issueIso ?? ordered[0] ?? "";

  // Two-column PDF layouts put labels ("Data sprzedaży") far from the date
  // values. When the label exists but no adjacent date was found, use the
  // second unique date in document order (first = issue, second = sale).
  const hasSaleLabel = /Data\s+sprzeda[żz]y/i.test(text);
  const saleDate = saleIso ?? (hasSaleLabel && ordered.length >= 2 ? ordered[1] : null) ?? issueIso ?? ordered[0] ?? "";
  return { issueDate, saleDate };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * When PDF text glues seller + buyer on one line, strip issuer from profile if it
 * matches the line prefix (flexible whitespace between issuer words).
 */
function splitNameLineByIssuerPrefix(
  nameLine: string,
  issuerName: string,
): { sellerName: string; buyerName: string } | null {
  const issuer = issuerName.trim();
  if (!issuer) return null;
  const trimmed = nameLine.trim();
  const parts = issuer.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const re = new RegExp(`^\\s*${parts.map(escapeRegExp).join("\\s+")}\\s*`, "i");
  const m = trimmed.match(re);
  if (!m) return null;
  const buyerName = trimmed.slice(m[0].length).trim();
  if (!buyerName) return null;
  return { sellerName: issuer, buyerName };
}

/**
 * Europ Assistance / two-column PDFs: same-line dual NIP, "Sprzedawca Nabywca" header.
 */
function splitEuropAssistanceTwoColumnParties(
  block: string[],
  issuerName?: string,
): {
  sellerLines: string[];
  buyerLines: string[];
} {
  if (block.length === 0) {
    return { sellerLines: [], buyerLines: [] };
  }
  const nameLine = block[0] ?? "";
  let sellerName = nameLine.trim();
  let buyerName = "";
  const byIssuer = issuerName ? splitNameLineByIssuerPrefix(nameLine, issuerName) : null;
  if (byIssuer) {
    sellerName = byIssuer.sellerName;
    buyerName = byIssuer.buyerName;
  } else {
    const ea = nameLine.match(/^(.+?)\s+(Europ\s+Assistance\b.+)$/i);
    if (ea) {
      sellerName = ea[1]!.trim();
      buyerName = ea[2]!.trim();
    }
  }
  const sellerRest: string[] = [];
  const buyerRest: string[] = [];
  if (sellerName) sellerRest.push(sellerName);
  if (buyerName) buyerRest.push(buyerName);
  for (let i = 1; i < block.length; i++) {
    const line = block[i]!;
    const ul = line.match(/^(.+?)\s+(ul\.\s.+)$/i);
    if (ul) {
      sellerRest.push(ul[1]!.trim());
      buyerRest.push(ul[2]!.trim());
      continue;
    }
    const pc = line.match(/^(\d{2}-\d{3}\s+.+?)\s+(\d{2}-\d{3}\s+.+)$/);
    if (pc) {
      sellerRest.push(pc[1]!.trim());
      buyerRest.push(pc[2]!.trim());
      continue;
    }
    const sp = line.split(/\s{2,}/);
    if (sp.length >= 2) {
      sellerRest.push(sp[0]!.trim());
      buyerRest.push(sp.slice(1).join(" ").trim());
    } else if (line.trim()) {
      sellerRest.push(line.trim());
    }
  }
  return {
    sellerLines: normalizeInterRiskPartyLines(sellerRest),
    buyerLines: normalizeInterRiskPartyLines(buyerRest),
  };
}

function parseLineItemLine(line: string, lineNumber: number) {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 9) return null;

  const gross = parsePlNumber(parts[parts.length - 1]!);
  const vatAmt = parsePlNumber(parts[parts.length - 2]!);
  const vatRate = parsePlNumber(parts[parts.length - 3]!);
  const netAmt = parsePlNumber(parts[parts.length - 4]!);
  const qty = parsePlNumber(parts[parts.length - 5]!);
  const unit = parts[parts.length - 6]!;
  void parsePlNumber(parts[parts.length - 7]!); // Lp. column (line number), skip
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

/**
 * Europ Assistance–style rows: `… qty netUnit net vatRate vatAmt brutto`
 * (no separate unit column; qty and net unit at end before VAT block).
 */
function parseEuropAssistanceTotalsRow(
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
  const t = line.trim();
  if (!t || /^Razem\s*:/i.test(t) || /^w\s+tym\s*:/i.test(t)) return null;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length < 7) return null;

  const gross = parsePlNumber(parts[parts.length - 1]!);
  const vatAmt = parsePlNumber(parts[parts.length - 2]!);
  const vatRate = parsePlNumber(parts[parts.length - 3]!);
  const netAmt = parsePlNumber(parts[parts.length - 4]!);
  const netUnit = parsePlNumber(parts[parts.length - 5]!);
  const qty = parsePlNumber(parts[parts.length - 6]!);
  let name = parts.slice(0, parts.length - 6).join(" ");
  name = name.replace(/^\d+\s+/, "").trim();

  if (
    !name ||
    !Number.isFinite(gross) ||
    !Number.isFinite(netAmt) ||
    !Number.isFinite(vatAmt) ||
    !Number.isFinite(vatRate) ||
    !Number.isFinite(qty) ||
    !Number.isFinite(netUnit) ||
    qty <= 0 ||
    vatRate < 0 ||
    vatRate > 100
  ) {
    return null;
  }

  const unit = qty === 1 ? "szt." : /km|holow|kursy|dojazd|powrót|etoll|opłat/i.test(name) ? "km." : "szt.";

  return {
    lineNumber,
    name,
    unit,
    quantity: qty,
    netUnitPrice: netUnit,
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

  const suma = text.match(/([\d.,]+)\s*zł\.\s*([\d.,]+)\s*zł\.\s*SUMA\s*([\d.,]+)\s*zł\./i);
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
  const due = text.match(/Do\s+zapłaty:\s*([\d.,]+)\s*zł\./i) ?? text.match(/Do\s+zapłaty:\s*([\d.,]+)\b/i);
  const method = text.match(/Forma\s+płatności:\s*\n?\s*([^\n]+)/i) ?? text.match(/Sposób\s+zapłaty:\s*([^\n]+)/i);
  return {
    paymentDays: days ? Number.parseInt(days[1]!, 10) : undefined,
    amountDue: due ? parsePlNumber(due[1]!) : undefined,
    paymentMethod: method?.[1]?.trim(),
  };
}

function extractReference(text: string) {
  const m = text.match(/([\d]+\/\w+)\s*Numer ref\./i);
  return m?.[1];
}

function extractBank(text: string, buyerNip: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const nipIdx = findNipLineIndex(lines, buyerNip);
  if (nipIdx < 0 || nipIdx + 3 >= lines.length) return {};
  const bankName = lines[nipIdx + 1]?.trim();
  const bankAccount = lines[nipIdx + 2]?.trim();
  if (bankName && /^\d[\d\s]+$/.test(bankAccount ?? "")) {
    return { bankName, bankAccount: bankAccount.replace(/\s/g, "") };
  }
  return {};
}

export type ParseInterRiskInvoiceTextOptions = {
  /** Profile issuer name — used to split glued "Sprzedawca | Nabywca" name lines. */
  issuerName?: string;
};

/**
 * Parse plain text extracted from InterRisk-style PDF invoices.
 */
export function parseInterRiskInvoiceText(rawText: string, options?: ParseInterRiskInvoiceTextOptions): ParsedInvoice {
  const issuerName = options?.issuerName?.trim();
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
    throw new Error("Nie znaleziono numeru faktury (np. „FAKTURA VAT NR …”, „Faktura nr …”)");
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
    throw new Error("Nie znaleziono NIP sprzedawcy i nabywcy");
  }
  const sellerNip = nips[0]!;
  const buyerNip = nips[1]!;

  const { issueDate, saleDate } = extractIssueAndSaleDates(text);

  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const nipSellerIdx = findNipLineIndex(lines, sellerNip);
  const nipBuyerIdx = findNipLineIndex(lines, buyerNip);

  const sprzedawcaHeaderIdx = lines.findIndex((l) => /Sprzedawca.*Nabywca/i.test(l));

  let sellerLinesRaw = nipSellerIdx > 0 ? lines.slice(1, nipSellerIdx).filter(Boolean) : [];
  let buyerLinesRaw = nipBuyerIdx > nipSellerIdx + 1 ? lines.slice(nipSellerIdx + 1, nipBuyerIdx).filter(Boolean) : [];

  const usedEuropPartySplit =
    sprzedawcaHeaderIdx >= 0 && nipSellerIdx === nipBuyerIdx && nipSellerIdx > sprzedawcaHeaderIdx;

  if (usedEuropPartySplit) {
    const block = lines.slice(sprzedawcaHeaderIdx + 1, nipSellerIdx).filter(Boolean);
    const split = splitEuropAssistanceTwoColumnParties(block, issuerName || undefined);
    sellerLinesRaw = split.sellerLines;
    buyerLinesRaw = split.buyerLines;
  }

  const sellerLines = normalizeInterRiskPartyLines(sellerLinesRaw);
  const buyerLines = normalizeInterRiskPartyLines(buyerLinesRaw);
  const sellerParty = usedEuropPartySplit
    ? {
        name: sellerLines[0] ?? "",
        addressLines: sellerLines.slice(1).filter(Boolean),
      }
    : mergeLeadingNameLinesFromAddress({
        name: sellerLines[0] ?? "",
        addressLines: sellerLines.slice(1),
      });
  const buyerParty = usedEuropPartySplit
    ? {
        name: buyerLines[0] ?? "",
        addressLines: buyerLines.slice(1).filter(Boolean),
      }
    : mergeLeadingNameLinesFromAddress({
        name: buyerLines[0] ?? "",
        addressLines: buyerLines.slice(1),
      });

  const itemsStart = lines.findIndex(
    (l) =>
      l.includes("Nazwa usługi") || l.includes("Nazwa us") || /Nazwa\s+towaru/i.test(l) || /L\.p\.\s+Nazwa/i.test(l),
  );
  let itemsEnd = lines.findIndex(
    (l, i) => i > itemsStart && (/^\d+(?:[.,]\d+)?%\s/.test(l) || /^Razem\s*:/i.test(l) || /^w\s+tym\s*:/i.test(l)),
  );
  if (itemsStart < 0) {
    console.error("Invoice parse failed: line items section not found", {
      scope: LOG_SCOPE,
      phase: "lineItems",
      reason: "missing_nazwa_uslugi_marker",
      lineCount: lines.length,
      textPreview: truncatePreview(text),
    });
    throw new Error("Nie znaleziono sekcji pozycji faktury");
  }
  if (itemsEnd < 0) itemsEnd = lines.length;

  let dataStart = itemsStart + 1;
  const itemsHeaderLine = lines[itemsStart] ?? "";
  if (/L\.p\.\s+Nazwa/i.test(itemsHeaderLine)) {
    while (dataStart < lines.length && dataStart < (itemsEnd > 0 ? itemsEnd : lines.length)) {
      const l = lines[dataStart]!;
      if (/^\d+\s+\D/u.test(l)) break;
      if (/^Razem\s*:/i.test(l)) break;
      dataStart++;
    }
  }

  const lineItems: NonNullable<ReturnType<typeof parseLineItemLine>>[] = [];
  let lp = 0;
  let pendingNamePrefix = "";
  for (let i = dataStart; i < itemsEnd; i++) {
    const row = lines[i]!;
    if (!row || row.startsWith("SPRZEDAWCA")) {
      pendingNamePrefix = "";
      continue;
    }
    const fullRow = pendingNamePrefix ? `${pendingNamePrefix} ${row}` : row;
    const item =
      parseInterRiskTableRow(fullRow, lp + 1) ??
      parseEuropAssistanceTotalsRow(fullRow, lp + 1) ??
      parseLineItemLine(normalizeFusedPriceQtyRow(fullRow), lp + 1) ??
      parseLineItemLine(fullRow, lp + 1);
    if (item) {
      lineItems.push(item);
      lp++;
      pendingNamePrefix = "";
    } else {
      pendingNamePrefix = fullRow;
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
    throw new Error("Nie udało się odczytać pozycji — sprawdź układ tekstu w PDF");
  }

  const { vatSummary: vatFromDoc, totals } = parseVatSummaryAndTotals(text);
  const pay = extractPayment(text);
  const ref = extractReference(text);
  const bank = extractBank(text, buyerNip);

  const vatSummaryFromLines = (): ParsedInvoice["vatSummary"] => {
    const map = new Map<number, { net: number; vat: number; gross: number }>();
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

  const vatSummary = vatFromDoc.length > 0 ? vatFromDoc : vatSummaryFromLines();

  const raw = {
    invoiceNumber,
    issueDate,
    saleDate,
    seller: {
      name: sellerParty.name || "Nieznany sprzedawca",
      addressLines: sellerParty.addressLines,
      nip: sellerNip,
    },
    buyer: {
      name: buyerParty.name || "Nieznany nabywca",
      addressLines: buyerParty.addressLines,
      nip: buyerNip,
    },
    ...bank,
    ...pay,
    referenceNumber: ref,
    remarks: lines.find((l) => l.startsWith("KIA ")) ?? undefined,
    lineItems,
    vatSummary,
    totals: {
      net: totals.net || lineItems.reduce((s, i) => s + i.netAmount, 0),
      vat: totals.vat || lineItems.reduce((s, i) => s + i.vatAmount, 0),
      gross: totals.gross || lineItems.reduce((s, i) => s + i.grossAmount, 0),
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
    throw new Error(`Walidacja sparsowanej faktury nie powiodła się: ${parsed.error.message}`);
  }
  return parsed.data;
}
