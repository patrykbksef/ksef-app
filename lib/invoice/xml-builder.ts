import { KSefInvoiceGenerator } from "ksef-lite";
import type { ParsedInvoice, PartialParsedInvoice } from "@/lib/validations/invoice";
import type { ProfileRow } from "@/lib/validations/profile";
import { profileReadyForKsefXml } from "@/lib/validations/profile";
import { mergeLeadingNameLinesFromAddress } from "@/lib/invoice/party-name-address";
import { resolvePartyTaxIdentifier } from "@/lib/invoice/party-tax-identifier";

function joinAddress(lines: string[]): string {
  return lines.filter(Boolean).join(", ") || "—";
}

/** Podmiot1 (issuer) — must match KSeF session NIP; name/address from Settings. */
export type BuildFa3XmlOptions = {
  issuerNip: string;
  issuerName: string;
  issuerAddressLine1: string;
  issuerAddressLine2?: string | null;
};

/** Returns options for XML when profile has NIP, token, and issuer identity fields. */
export function buildFa3XmlOptionsFromProfile(p: ProfileRow): BuildFa3XmlOptions | null {
  if (!profileReadyForKsefXml(p)) return null;
  return {
    issuerNip: p.nip!,
    issuerName: p.issuer_name!.trim(),
    issuerAddressLine1: p.issuer_address_line1!.trim(),
    issuerAddressLine2: p.issuer_address_line2?.trim() || undefined,
  };
}

function issuerAddressForKsef(o: BuildFa3XmlOptions): string {
  return joinAddress([o.issuerAddressLine1, o.issuerAddressLine2 ?? ""].map((s) => s.trim()).filter(Boolean));
}

function normalizeNip(n: string): string {
  return n.replace(/\D/g, "").slice(0, 10);
}

/**
 * Party on the PDF whose NIP matches the profile (Podmiot1 / Ty w KSeF).
 */
export function issuerPartyFromParsed(data: PartialParsedInvoice, issuerNip: string): "seller" | "buyer" | null {
  const p = normalizeNip(issuerNip);
  if (p.length !== 10) return null;
  const sellerId = resolvePartyTaxIdentifier(data.seller);
  const buyerId = resolvePartyTaxIdentifier(data.buyer);
  if (sellerId.type === "nip" && p === normalizeNip(sellerId.value)) return "seller";
  if (buyerId.type === "nip" && p === normalizeNip(buyerId.value)) return "buyer";
  return null;
}

/**
 * Druga strona faktury (kontrahent w XML = Podmiot2 / `buyer` w ksef-lite).
 * Zależy od tego, czy Twój NIP z profilu jest u sprzedawcy czy u nabywcy na PDF.
 */
export function podmiot2CounterpartyFromParsed(
  data: PartialParsedInvoice,
  issuerNip: string,
): PartialParsedInvoice["seller"] {
  const side = issuerPartyFromParsed(data, issuerNip);
  if (side === "seller") {
    return mergeLeadingNameLinesFromAddress(data.buyer);
  }
  if (side === "buyer") {
    return mergeLeadingNameLinesFromAddress(data.seller);
  }
  console.warn(
    "[KSeF XML] NIP profilu nie zgadza się ze sprzedawcą ani nabywcą z PDF — Podmiot2 jak dawniej (parsed.seller)",
    {
      scope: "invoice.xml",
      issuerNip,
      sellerNip: data.seller.nip,
      buyerNip: data.buyer.nip,
    },
  );
  return mergeLeadingNameLinesFromAddress(data.seller);
}

function buyerIdentifierForKsef(
  party: PartialParsedInvoice["seller"],
): Record<string, string | boolean> {
  const identifier = resolvePartyTaxIdentifier(party);
  if (identifier.type === "nip") return { nip: normalizeNip(identifier.value) };
  if (identifier.type === "vat_ue") {
    return {
      countryCodeUE: identifier.countryCode ?? "",
      vatUE: identifier.value,
    };
  }
  if (identifier.type === "other") {
    return {
      ...(identifier.countryCode ? { countryCode: identifier.countryCode } : {}),
      idNumber: identifier.value,
    };
  }
  return { noId: true };
}

function buyerAddressForKsef(party: PartialParsedInvoice["seller"]) {
  const identifier = resolvePartyTaxIdentifier(party);
  const countryCode = identifier.countryCode;
  const lines = party.addressLines.map((line) => line.trim()).filter(Boolean);
  if (countryCode && countryCode !== "PL") {
    return {
      countryCode,
      line1: lines[0] || "—",
      ...(lines.length > 1 ? { line2: lines.slice(1).join(", ") } : {}),
    };
  }
  return joinAddress(lines);
}

/** ksef-lite FA(3) JSON input — same object passed to `KSefInvoiceGenerator.generate`. */
export function buildKsefLiteInvoiceInput(data: ParsedInvoice, options: BuildFa3XmlOptions) {
  const issueDate = new Date(data.issueDate);
  const saleDate = new Date(data.saleDate);
  const podmiot2 = podmiot2CounterpartyFromParsed(data, options.issuerNip);
  const podmiot2Identifier = buyerIdentifierForKsef(podmiot2);

  return {
    seller: {
      nip: options.issuerNip,
      name: options.issuerName,
      address: issuerAddressForKsef(options),
    },
    buyer: {
      // Podmiot2 = kontrahent (druga strona), nie Twój NIP z profilu.
      ...podmiot2Identifier,
      name: podmiot2.name,
      address: buyerAddressForKsef(podmiot2),
    },
    details: {
      invoiceNumber: data.invoiceNumber,
      issueDate,
      saleDate,
      currency: data.currency,
      invoiceType: "VAT" as const,
      items: data.lineItems.map((row) => ({
        name: row.name,
        quantity: row.quantity,
        netPrice: row.netUnitPrice,
        vatRate: row.vatRate,
        unit: row.unit,
      })),
      payment: {
        ...(data.bankAccount
          ? {
              bankAccount: data.bankAccount,
              ...(data.bankName ? { bankName: data.bankName } : {}),
            }
          : {}),
        ...(data.paymentDays != null
          ? {
              dueDate: new Date(issueDate.getTime() + data.paymentDays * 86400000),
            }
          : {}),
        // MF FA(3): 6 = Przelew (4 = Czek). With a bank account, transfer is correct.
        method: 6 as const,
        ...(data.amountDue != null ? { amount: data.amountDue } : {}),
        ...(data.paymentMethod ? { methodDescription: data.paymentMethod } : {}),
      },
      ...((data.referenceNumber || data.remarks) && {
        additionalInfo: [
          ...(data.referenceNumber ? [{ key: "Numer ref.", value: data.referenceNumber }] : []),
          ...(data.remarks ? [{ key: "Uwagi", value: data.remarks }] : []),
        ],
      }),
    },
    // Omit `summary`: ksef-lite overwrites calculator totals when grossAmount !== 0,
    // which desyncs P_15 from P_13/P_14 and FaWiersz when PDF totals differ from lines.
  };
}

/**
 * Map parsed PDF data to ksef-lite FA(3) JSON input and generate XML.
 */
export function buildFa3XmlFromParsedInvoice(data: ParsedInvoice, options: BuildFa3XmlOptions): string {
  const input = buildKsefLiteInvoiceInput(data, options);
  const generator = new KSefInvoiceGenerator();
  const xml = generator.generate(input);
  return xml;
}
