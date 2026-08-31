import type {
  AddressValueOutput,
  AnalyzeResultOutput,
  DocumentFieldOutput,
} from "@azure-rest/ai-document-intelligence";
import type { ParsedInvoice } from "@/lib/validations/invoice";
import { isValidNipChecksum } from "@/lib/validations/profile";

function pickField(
  fields: Record<string, DocumentFieldOutput> | undefined,
  ...candidates: string[]
): DocumentFieldOutput | undefined {
  if (!fields) return undefined;
  const keys = Object.keys(fields);
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (hit) return fields[hit];
  }
  return undefined;
}

function fieldString(f: DocumentFieldOutput | undefined): string | undefined {
  if (!f) return undefined;
  if (f.valueString != null && String(f.valueString).trim())
    return String(f.valueString).trim();
  if (f.content != null && String(f.content).trim())
    return String(f.content).trim();
  return undefined;
}

function fieldNumber(f: DocumentFieldOutput | undefined): number | undefined {
  if (!f) return undefined;
  if (f.valueNumber != null && Number.isFinite(f.valueNumber))
    return f.valueNumber;
  if (f.valueInteger != null && Number.isFinite(f.valueInteger))
    return f.valueInteger;
  if (f.valueCurrency?.amount != null && Number.isFinite(f.valueCurrency.amount))
    return f.valueCurrency.amount;
  return undefined;
}

function fieldDateIso(f: DocumentFieldOutput | undefined): string | undefined {
  if (!f) return undefined;
  if (f.valueDate) return f.valueDate;
  const s = fieldString(f);
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return undefined;
}

/**
 * Azure DI often duplicates street across `streetAddress`, `road`, and `houseNumber`.
 * Concatenating all three repeats the line. Also `streetAddress` may be "21C ul. …"
 * (numer first), which fails our Podmiot2 name/address heuristic — prefer `road` +
 * `houseNumber` when both exist so the line usually starts with `ul.` / `al.` etc.
 */
function addressToLines(addr: AddressValueOutput | undefined): string[] {
  if (!addr) return [];
  const lines: string[] = [];

  const roadT = addr.road?.trim();
  const houseT = addr.houseNumber?.trim();
  const unitT = addr.unit?.trim();
  const streetT = addr.streetAddress?.trim();

  let street: string | undefined;
  if (roadT && houseT) {
    street = unitT ? `${roadT} ${houseT} ${unitT}`.trim() : `${roadT} ${houseT}`.trim();
  } else if (roadT) {
    street = unitT ? `${roadT} ${unitT}`.trim() : roadT;
  } else if (streetT) {
    street = unitT ? `${streetT} ${unitT}`.trim() : streetT;
  } else if (houseT) {
    street = unitT ? `${houseT} ${unitT}`.trim() : houseT;
  } else if (unitT) {
    street = unitT;
  }

  if (street) lines.push(street);

  const cityLine = [addr.postalCode, addr.city].filter(Boolean).join(" ").trim();
  if (cityLine) lines.push(cityLine);
  if (addr.countryRegion && lines.length === 0) {
    lines.push(addr.countryRegion);
  }
  return lines.filter(Boolean);
}

function fieldAddressLines(f: DocumentFieldOutput | undefined): string[] {
  if (!f) return [];
  if (f.valueAddress) return addressToLines(f.valueAddress);
  const s = fieldString(f);
  if (!s) return [];
  return s
    .split(/\n|,/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * First valid Polish NIP in a string. Strips all non-digits, then scans 10-digit
 * windows (handles `955-192-91-62`, `525-10-32-299`, `PL 5251032299`, etc.).
 */
export function extractPlNip(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly.length < 10) return undefined;
  for (let i = 0; i <= digitsOnly.length - 10; i++) {
    const cand = digitsOnly.slice(i, i + 10);
    if (isValidNipChecksum(cand)) return cand;
  }
  return undefined;
}

/** All distinct valid Polish NIPs found in free text (dashed / spaced groups). */
function extractAllPlNipsFromContent(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\d(?:[\d\s\-]*\d){9,}/g;
  let m: RegExpExecArray | null;
  for (m = re.exec(text); m !== null; m = re.exec(text)) {
    const n = extractPlNip(m[0]);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function nipFromTaxField(f: DocumentFieldOutput | undefined): string | undefined {
  return extractPlNip(fieldString(f));
}

function pickObjectField(
  obj: Record<string, DocumentFieldOutput> | undefined,
  ...candidates: string[]
): DocumentFieldOutput | undefined {
  return pickField(obj, ...candidates);
}

/** Loose float compare for currency amounts from Azure DI. */
function nearEqual(a: number, b: number): boolean {
  const tol = Math.max(0.02, Math.abs(a) * 0.0005, Math.abs(b) * 0.0005);
  return Math.abs(a - b) <= tol;
}

function mapLineItemRow(
  row: DocumentFieldOutput,
  lineNumber: number,
): {
  name: string;
  unit: string;
  quantity: number;
  netUnitPrice: number;
  netAmount: number;
  vatRate: number;
  vatAmount: number;
  grossAmount: number;
} | null {
  const o = row.valueObject;
  if (!o) return null;

  const desc =
    fieldString(pickObjectField(o, "Description", "ProductDescription", "ItemDescription")) ??
    `Pozycja ${lineNumber}`;
  const qtyRaw = fieldNumber(pickObjectField(o, "Quantity", "Qty")) ?? 1;
  const qty = qtyRaw > 0 ? qtyRaw : 1;
  const unit =
    fieldString(pickObjectField(o, "Unit", "UnitOfMeasure", "UOM")) || "szt.";
  const unitPrice =
    fieldNumber(pickObjectField(o, "UnitPrice", "NetUnitPrice", "Price")) ?? 0;
  const explicitNet = fieldNumber(
    pickObjectField(
      o,
      "NetAmount",
      "TaxableAmount",
      "NetLineAmount",
      "AmountExcludingTax",
    ),
  );
  const amountField = fieldNumber(pickObjectField(o, "Amount", "LineAmount", "Total"));
  const taxLine = fieldNumber(
    pickObjectField(o, "Tax", "TaxAmount", "VATAmount", "VAT"),
  );
  const explicitRate = fieldNumber(
    pickObjectField(o, "TaxRate", "VATRate", "VatRate"),
  );
  const vr =
    explicitRate != null && explicitRate > 0 && explicitRate <= 100
      ? explicitRate
      : 23;

  const fromUnit = unitPrice > 0 ? unitPrice * qty : 0;

  let net: number;
  if (explicitNet != null && explicitNet > 0) {
    net = explicitNet;
  } else if (unitPrice > 0) {
    if (amountField != null && amountField > 0) {
      if (nearEqual(amountField, fromUnit)) {
        net = amountField;
      } else {
        const tax = taxLine != null && taxLine > 0 ? taxLine : 0;
        const netFromGross = tax > 0 ? amountField - tax : amountField;
        if (tax > 0 && netFromGross > 0 && nearEqual(netFromGross, fromUnit)) {
          net = netFromGross;
        } else {
          net = fromUnit;
        }
      }
    } else {
      net = fromUnit;
    }
  } else if (
    amountField != null &&
    taxLine != null &&
    taxLine > 0 &&
    amountField > taxLine
  ) {
    net = amountField - taxLine;
  } else if (amountField != null && amountField > 0) {
    net = amountField;
  } else {
    net = 0;
  }

  let netUnit: number;
  if (explicitNet != null && explicitNet > 0) {
    netUnit = qty > 0 ? net / qty : unitPrice;
  } else if (unitPrice > 0) {
    netUnit = unitPrice;
  } else if (qty > 0 && net > 0) {
    netUnit = net / qty;
  } else {
    netUnit = 0;
  }

  return {
    name: desc,
    unit,
    quantity: qty,
    netUnitPrice: Math.max(0, netUnit),
    netAmount: Math.max(0, net),
    vatRate: vr,
    vatAmount: 0,
    grossAmount: 0,
  };
}

/**
 * Map Azure prebuilt-invoice `analyzeResult` to {@link ParsedInvoice}, or `null` if structure is unusable.
 */
export function mapAzureInvoiceAnalyzeResult(
  result: AnalyzeResultOutput,
): ParsedInvoice | null {
  const doc = result.documents?.[0];
  const fields = doc?.fields;
  if (!fields) return null;

  const invoiceNumber =
    fieldString(pickField(fields, "InvoiceId", "InvoiceNumber", "InvoiceNo")) ??
    "";
  const issueDate =
    fieldDateIso(pickField(fields, "InvoiceDate", "IssueDate", "Date")) ?? "";
  const saleDate =
    fieldDateIso(pickField(fields, "ServiceDate", "SaleDate")) ?? issueDate;

  const sellerName =
    fieldString(pickField(fields, "VendorName", "SellerName", "SupplierName")) ??
    "";
  const buyerName =
    fieldString(pickField(fields, "CustomerName", "BuyerName", "ShipToName")) ??
    "";

  let sellerNip =
    nipFromTaxField(pickField(fields, "VendorTaxId", "SellerTaxId")) ??
    extractPlNip(sellerName);
  let buyerNip =
    nipFromTaxField(
      pickField(fields, "CustomerTaxId", "CustomerId", "BuyerTaxId"),
    ) ?? extractPlNip(buyerName);

  const content = result.content ?? "";
  const nipsInDoc = extractAllPlNipsFromContent(content);
  if (!sellerNip && nipsInDoc[0]) sellerNip = nipsInDoc[0];
  if (!buyerNip) {
    buyerNip =
      nipsInDoc.find((n) => n !== sellerNip) ??
      (nipsInDoc.length > 1 ? nipsInDoc[1] : undefined);
  }
  if (!sellerNip) {
    sellerNip = nipsInDoc.find((n) => n !== buyerNip);
  }

  const sellerLines = fieldAddressLines(pickField(fields, "VendorAddress"));
  const buyerLines = fieldAddressLines(pickField(fields, "CustomerAddress"));

  const itemsField = pickField(fields, "Items", "LineItems");
  const rawRows = itemsField?.valueArray ?? [];
  const lineItems: ParsedInvoice["lineItems"] = [];
  let ln = 1;
  for (const row of rawRows) {
    const mapped = mapLineItemRow(row, ln);
    if (mapped) {
      lineItems.push({
        lineNumber: ln,
        ...mapped,
      });
      ln++;
    }
  }

  if (!invoiceNumber || lineItems.length === 0) return null;
  if (!sellerName || !buyerName) return null;
  if (!sellerNip || !buyerNip) return null;

  const paymentDaysRaw = fieldNumber(pickField(fields, "PaymentTerm", "PaymentTerms"));
  const dueDateStr = fieldDateIso(pickField(fields, "DueDate"));
  let paymentDays: number | undefined;
  if (issueDate && dueDateStr) {
    const a = new Date(issueDate).getTime();
    const b = new Date(dueDateStr).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
      paymentDays = Math.round((b - a) / 86400000);
    }
  }
  if (paymentDays == null && paymentDaysRaw != null && paymentDaysRaw >= 0) {
    paymentDays = Math.floor(paymentDaysRaw);
  }

  const amountDue = fieldNumber(pickField(fields, "AmountDue", "TotalDue", "BalanceDue"));
  const paymentMethod = fieldString(
    pickField(fields, "PaymentMethod", "PaymentDetails"),
  );

  return {
    invoiceNumber,
    issueDate,
    saleDate: saleDate || issueDate,
    seller: {
      name: sellerName,
      nip: sellerNip,
      addressLines: sellerLines.length > 0 ? sellerLines : ["—"],
    },
    buyer: {
      name: buyerName,
      nip: buyerNip,
      addressLines: buyerLines.length > 0 ? buyerLines : ["—"],
    },
    bankName: fieldString(pickField(fields, "BankName")) ?? undefined,
    bankAccount: fieldString(pickField(fields, "BankAccount", "IBAN")) ?? undefined,
    paymentDays,
    paymentMethod: paymentMethod ?? undefined,
    amountDue: amountDue != null && amountDue >= 0 ? amountDue : undefined,
    referenceNumber:
      fieldString(pickField(fields, "PurchaseOrder", "PurchaseOrderNumber")) ??
      undefined,
    remarks: fieldString(pickField(fields, "Remarks", "Note")) ?? undefined,
    lineItems,
    vatSummary: [],
    totals: { net: 0, vat: 0, gross: 0 },
    currency: "PLN",
  };
}
