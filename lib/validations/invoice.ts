import { z } from "zod";

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
        `File must be at most ${MAX_PDF_BYTES / 1024 / 1024} MB`,
      ),
    type: z.string(),
  })
  .refine(
    (v) =>
      v.type === "application/pdf" ||
      v.name.toLowerCase().endsWith(".pdf"),
    { message: "Only PDF files are allowed", path: ["type"] },
  );

export type FileUploadInput = z.infer<typeof fileUploadSchema>;

export const invoiceLineItemSchema = z.object({
  lineNumber: z.number().int().positive(),
  name: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().positive(),
  netUnitPrice: z.number().nonnegative(),
  netAmount: z.number().nonnegative(),
  vatRate: z.number().nonnegative(),
  vatAmount: z.number().nonnegative(),
  grossAmount: z.number().nonnegative(),
});

export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;

export const vatSummaryGroupSchema = z.object({
  vatRate: z.number().nonnegative(),
  netAmount: z.number().nonnegative(),
  vatAmount: z.number().nonnegative(),
  grossAmount: z.number().nonnegative(),
});

export const parsedInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1),
  issueDate: z.string().min(1),
  saleDate: z.string().min(1),
  seller: z.object({
    name: z.string().min(1),
    addressLines: z.array(z.string()),
    nip: z.string().regex(/^\d{10}$/),
  }),
  buyer: z.object({
    name: z.string().min(1),
    addressLines: z.array(z.string()),
    nip: z.string().regex(/^\d{10}$/),
  }),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  paymentDays: z.number().int().nonnegative().optional(),
  paymentMethod: z.string().optional(),
  amountDue: z.number().nonnegative().optional(),
  referenceNumber: z.string().optional(),
  remarks: z.string().optional(),
  lineItems: z.array(invoiceLineItemSchema).min(1),
  vatSummary: z.array(vatSummaryGroupSchema),
  totals: z.object({
    net: z.number().nonnegative(),
    vat: z.number().nonnegative(),
    gross: z.number().nonnegative(),
  }),
  currency: z.literal("PLN"),
});

export type ParsedInvoice = z.infer<typeof parsedInvoiceSchema>;

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
  parsed_data: parsedInvoiceSchema.nullable(),
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
