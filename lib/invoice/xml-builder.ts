import { KSefInvoiceGenerator } from "ksef-lite";
import type { ParsedInvoice } from "@/lib/validations/invoice";
import type { ProfileRow } from "@/lib/validations/profile";
import { profileReadyForKsefXml } from "@/lib/validations/profile";

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
export function buildFa3XmlOptionsFromProfile(
  p: ProfileRow,
): BuildFa3XmlOptions | null {
  if (!profileReadyForKsefXml(p)) return null;
  return {
    issuerNip: p.nip!,
    issuerName: p.issuer_name!.trim(),
    issuerAddressLine1: p.issuer_address_line1!.trim(),
    issuerAddressLine2: p.issuer_address_line2?.trim() || undefined,
  };
}

function issuerAddressForKsef(o: BuildFa3XmlOptions): string {
  return joinAddress(
    [o.issuerAddressLine1, o.issuerAddressLine2 ?? ""].map((s) => s.trim()).filter(Boolean),
  );
}

/** ksef-lite FA(3) JSON input — same object passed to `KSefInvoiceGenerator.generate`. */
export function buildKsefLiteInvoiceInput(
  data: ParsedInvoice,
  options: BuildFa3XmlOptions,
) {
  const issueDate = new Date(data.issueDate);
  const saleDate = new Date(data.saleDate);

  return {
    seller: {
      nip: options.issuerNip,
      name: options.issuerName,
      address: issuerAddressForKsef(options),
    },
    buyer: {
      nip: data.buyer.nip,
      // Empty: ksef-lite puts Nazwa inside DaneIdentyfikacyjne next to NIP; KSeF API
      // rejects that pairing. Name stays in our UI/DB from PDF only.
      name: "",
      address: joinAddress(data.buyer.addressLines),
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
              dueDate: new Date(
                issueDate.getTime() + data.paymentDays * 86400000,
              ),
            }
          : {}),
        // MF FA(3): 6 = Przelew (4 = Czek). With a bank account, transfer is correct.
        method: 6 as const,
        ...(data.amountDue != null ? { amount: data.amountDue } : {}),
        ...(data.paymentMethod
          ? { methodDescription: data.paymentMethod }
          : {}),
      },
      ...((data.referenceNumber || data.remarks) && {
        additionalInfo: [
          ...(data.referenceNumber
            ? [{ key: "Numer ref.", value: data.referenceNumber }]
            : []),
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
export function buildFa3XmlFromParsedInvoice(
  data: ParsedInvoice,
  options: BuildFa3XmlOptions,
): string {
  const input = buildKsefLiteInvoiceInput(data, options);
  const generator = new KSefInvoiceGenerator();
  const xml = generator.generate(input);
  const podmiot2 = xml.match(/<Podmiot2>[\s\S]*?<\/Podmiot2>/)?.[0];
  const faWierszFirst = xml.match(/<FaWiersz>[\s\S]*?<\/FaWiersz>/)?.[0];
  console.error("[KSeF XML] generated FA(3)", {
    scope: "invoice.xml",
    issuerNip: options.issuerNip,
    invoiceNumber: data.invoiceNumber,
    lineItemCount: data.lineItems.length,
    lineQtySample: data.lineItems.slice(0, 3).map((r) => ({
      name: r.name.slice(0, 40),
      quantity: r.quantity,
      netUnitPrice: r.netUnitPrice,
    })),
    xmlLength: xml.length,
    xmlHead: xml.slice(0, 1200),
    podmiot2Preview: podmiot2?.slice(0, 2500),
    firstFaWierszPreview: faWierszFirst?.slice(0, 800),
  });
  return xml;
}
