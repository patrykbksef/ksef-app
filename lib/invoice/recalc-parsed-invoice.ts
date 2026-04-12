import type { InvoiceLineItem, ParsedInvoice } from "@/lib/validations/invoice";

type VatSummaryGroup = ParsedInvoice["vatSummary"][number];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function recalcLineAmounts(row: InvoiceLineItem): InvoiceLineItem {
  const netAmount = round2(row.quantity * row.netUnitPrice);
  const vatAmount = round2((netAmount * row.vatRate) / 100);
  const grossAmount = round2(netAmount + vatAmount);
  return { ...row, netAmount, vatAmount, grossAmount };
}

function aggregateVatSummary(lineItems: InvoiceLineItem[]): VatSummaryGroup[] {
  const map = new Map<number, { net: number; vat: number; gross: number }>();
  for (const row of lineItems) {
    const e = map.get(row.vatRate) ?? { net: 0, vat: 0, gross: 0 };
    e.net += row.netAmount;
    e.vat += row.vatAmount;
    e.gross += row.grossAmount;
    map.set(row.vatRate, e);
  }
  return [...map.entries()].map(([vatRate, v]) => ({
    vatRate,
    netAmount: round2(v.net),
    vatAmount: round2(v.vat),
    grossAmount: round2(v.gross),
  }));
}

export function recalcParsedInvoice(data: ParsedInvoice): ParsedInvoice {
  const lineItems = data.lineItems.map(recalcLineAmounts);
  const vatSummary = aggregateVatSummary(lineItems);
  const totals = {
    net: round2(lineItems.reduce((s, i) => s + i.netAmount, 0)),
    vat: round2(lineItems.reduce((s, i) => s + i.vatAmount, 0)),
    gross: round2(lineItems.reduce((s, i) => s + i.grossAmount, 0)),
  };
  return { ...data, lineItems, vatSummary, totals };
}
