import { z } from "zod";
import { PARTY_IDENTIFIER_TYPES } from "@/lib/invoice/party-tax-identifier";

/** Max upload size for PDF (5 MiB) */
export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export const fileUploadSchema = z
  .object({
    name: z.string().min(1).max(255),
    size: z
      .number()
      .int()
      .positive()
      .max(
        MAX_PDF_BYTES,
        `Plik może mieć co najwyżej ${MAX_PDF_BYTES / 1024 / 1024} MB`,
      ),
    type: z.string(),
  })
  .refine(
    (v) =>
      v.type === "application/pdf" ||
      v.name.toLowerCase().endsWith(".pdf"),
    { message: "Dozwolone są tylko pliki PDF", path: ["type"] },
  );

export type FileUploadInput = z.infer<typeof fileUploadSchema>;

export const VAT_RATES = [
  23,
  22,
  8,
  7,
  5,
  4,
  3,
  "0 KR",
  "0 WDT",
  "0 EX",
  "zw",
  "oo",
  "np I",
  "np II",
] as const;

export const vatRateSchema = z.union([
  z.union([
    z.literal(23),
    z.literal(22),
    z.literal(8),
    z.literal(7),
    z.literal(5),
    z.literal(4),
    z.literal(3),
  ]),
  z.enum(["0 KR", "0 WDT", "0 EX", "zw", "oo", "np I", "np II"]),
]);

export type VatRate = z.infer<typeof vatRateSchema>;

export function normalizeVatRate(value: string | number): VatRate | null {
  if (typeof value === "number") {
    if (value === 0) return "0 KR";
    const result = vatRateSchema.safeParse(value);
    return result.success ? result.data : null;
  }

  const normalized = value.trim().replace(/%$/, "").replace(/,/g, ".");
  const special = normalized.toLowerCase().replace(/\s+/g, " ");
  const aliases: Record<string, VatRate> = {
    zw: "zw",
    oo: "oo",
    np: "np I",
    "np i": "np I",
    "np ii": "np II",
    "0 kr": "0 KR",
    "0 wdt": "0 WDT",
    "0 ex": "0 EX",
  };
  if (aliases[special]) return aliases[special];

  const numeric = Number(normalized);
  if (numeric === 0) return "0 KR";
  const result = vatRateSchema.safeParse(numeric);
  return result.success ? result.data : null;
}

export const invoiceLineItemSchema = z.object({
  lineNumber: z.number().int().positive(),
  name: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().positive(),
  netUnitPrice: z.number().nonnegative(),
  netAmount: z.number().nonnegative(),
  vatRate: vatRateSchema,
  vatAmount: z.number().nonnegative(),
  grossAmount: z.number().nonnegative(),
});

export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;

export const vatSummaryGroupSchema = z.object({
  vatRate: vatRateSchema,
  netAmount: z.number().nonnegative(),
  vatAmount: z.number().nonnegative(),
  grossAmount: z.number().nonnegative(),
});

const identifierFieldsSchema = {
  nip: z.string(),
  identifierType: z.enum(PARTY_IDENTIFIER_TYPES).optional(),
  identifierValue: z.string().optional(),
  identifierCountryCode: z.string().optional(),
};

function validatePartyIdentifier(
  party: {
    nip: string;
    identifierType?: (typeof PARTY_IDENTIFIER_TYPES)[number];
    identifierValue?: string;
    identifierCountryCode?: string;
  },
  ctx: z.RefinementCtx,
) {
  const type = party.identifierType ?? "nip";
  const value = (party.identifierValue ?? party.nip).trim().toUpperCase();
  const country = party.identifierCountryCode?.trim().toUpperCase() ?? "";

  if (type === "nip" && !/^\d{10}$/.test(value.replace(/\D/g, ""))) {
    ctx.addIssue({ code: "custom", path: ["identifierValue"], message: "NIP musi mieć 10 cyfr" });
  }
  if (type === "vat_ue") {
    if (!/^[A-Z]{2}$/.test(country)) {
      ctx.addIssue({ code: "custom", path: ["identifierCountryCode"], message: "Wybierz dwuliterowy kod kraju VAT UE" });
    }
    if (!/^[A-Z0-9+*]{1,12}$/.test(value)) {
      ctx.addIssue({ code: "custom", path: ["identifierValue"], message: "Nieprawidłowy numer VAT UE" });
    }
  }
  if (type === "other") {
    if (country && !/^[A-Z]{2}$/.test(country)) {
      ctx.addIssue({ code: "custom", path: ["identifierCountryCode"], message: "Kod kraju musi mieć 2 litery" });
    }
    if (!/^[A-Z0-9+*\-\.]{1,50}$/.test(value)) {
      ctx.addIssue({ code: "custom", path: ["identifierValue"], message: "Wpisz identyfikator podatkowy" });
    }
  }
}

const partySchema = z
  .object({
    name: z.string().min(1),
    addressLines: z.array(z.string()),
    ...identifierFieldsSchema,
  })
  .superRefine(validatePartyIdentifier);

const vatExemptionSchema = z.object({
  basisType: z.enum(["law", "directive", "other"]),
  basis: z.string().trim().min(1, "Wymagana podstawa zwolnienia").max(256),
});

export const parsedInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1),
  issueDate: z.string().min(1),
  saleDate: z.string().min(1),
  seller: partySchema,
  buyer: partySchema,
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  paymentDays: z.number().int().nonnegative().optional(),
  paymentMethod: z.string().optional(),
  amountDue: z.number().nonnegative().optional(),
  referenceNumber: z.string().optional(),
  remarks: z.string().optional(),
  vatExemption: vatExemptionSchema.optional(),
  lineItems: z.array(invoiceLineItemSchema).min(1),
  vatSummary: z.array(vatSummaryGroupSchema),
  totals: z.object({
    net: z.number().nonnegative(),
    vat: z.number().nonnegative(),
    gross: z.number().nonnegative(),
  }),
  currency: z.literal("PLN"),
});

export const ksefReadyInvoiceSchema = parsedInvoiceSchema.superRefine((invoice, ctx) => {
  if (invoice.lineItems.some((line) => line.vatRate === "zw") && !invoice.vatExemption) {
    ctx.addIssue({
      code: "custom",
      path: ["vatExemption", "basis"],
      message: "Dla stawki zw podaj podstawę zwolnienia z VAT",
    });
  }
});

export type ParsedInvoice = z.infer<typeof parsedInvoiceSchema>;

const partialPartySchema = z.object({
  name: z.string(),
  addressLines: z.array(z.string()),
  ...identifierFieldsSchema,
});

/**
 * Relaxed version of parsedInvoiceSchema that accepts empty strings for
 * required fields and zero line items. Structurally identical to
 * ParsedInvoice so no type churn downstream.
 */
export const partialParsedInvoiceSchema = z.object({
  invoiceNumber: z.string(),
  issueDate: z.string(),
  saleDate: z.string(),
  seller: partialPartySchema,
  buyer: partialPartySchema,
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  paymentDays: z.number().int().nonnegative().optional(),
  paymentMethod: z.string().optional(),
  amountDue: z.number().nonnegative().optional(),
  referenceNumber: z.string().optional(),
  remarks: z.string().optional(),
  vatExemption: vatExemptionSchema.optional(),
  lineItems: z.array(invoiceLineItemSchema),
  vatSummary: z.array(vatSummaryGroupSchema),
  totals: z.object({
    net: z.number().nonnegative(),
    vat: z.number().nonnegative(),
    gross: z.number().nonnegative(),
  }),
  currency: z.literal("PLN"),
});

export type PartialParsedInvoice = z.infer<typeof partialParsedInvoiceSchema>;

const invoiceStatusEnum = z.enum([
  "parsed",
  "pending_review",
  "sent",
  "success",
  "error",
]);

export const invoiceDbSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  file_name: z.string(),
  parsed_data: partialParsedInvoiceSchema.nullable(),
  xml_content: z.string().nullable(),
  ksef_reference: z.string().nullable(),
  status: invoiceStatusEnum,
  error_message: z.string().nullable(),
  created_at: z.string(),
});

export type InvoiceRow = z.infer<typeof invoiceDbSchema>;

export const invoiceIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const ksefSendResultSchema = z
  .object({
    status: z.number().int(),
    error: z.string().optional(),
    invoiceKsefNumber: z.string().nullable(),
    invoiceReferenceNumber: z.string(),
    sessionReferenceNumber: z.string(),
    invoiceHash: z.string(),
    invoiceSize: z.number().int(),
  })
  .passthrough();

export type KsefSendResult = z.infer<typeof ksefSendResultSchema>;

export const ksefErrorSchema = z
  .object({
    status: z.number().optional(),
    message: z.string().optional(),
    exception: z
      .object({
        exceptionCode: z.number().optional(),
        serviceMessage: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
