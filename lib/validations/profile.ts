import { z } from "zod";

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7] as const;

export function isValidNipChecksum(digits: string): boolean {
  if (digits.length !== 10 || !/^\d{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * NIP_WEIGHTS[i]!;
  }
  const mod = sum % 11;
  const expected = mod === 10 ? 0 : mod;
  return Number(digits[9]) === expected;
}

export const nipSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "NIP must be exactly 10 digits")
  .refine(isValidNipChecksum, "Invalid NIP checksum");

const issuerNameSchema = z
  .string()
  .trim()
  .min(1, "Seller legal name is required")
  .max(512, "Name is too long");

const issuerAddressLineSchema = z
  .string()
  .trim()
  .min(1, "Address line 1 is required")
  .max(512, "Address line is too long");

const issuerAddressLine2Schema = z
  .string()
  .trim()
  .max(512, "Address line is too long")
  .optional();

export const profileFormSchema = z.object({
  nip: nipSchema,
  ksef_token: z
    .string()
    .trim()
    .min(1, "KSeF token is required")
    .max(8192, "KSeF token is too long"),
  auto_send: z.boolean(),
  issuer_name: issuerNameSchema,
  issuer_address_line1: issuerAddressLineSchema,
  issuer_address_line2: issuerAddressLine2Schema,
});

export type ProfileFormInput = z.infer<typeof profileFormSchema>;

export const profileRowSchema = z.object({
  id: z.string().uuid(),
  nip: z.string().nullable(),
  ksef_token: z.string().nullable(),
  auto_send: z.boolean(),
  issuer_name: z.string().nullable().optional(),
  issuer_address_line1: z.string().nullable().optional(),
  issuer_address_line2: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ProfileRow = z.infer<typeof profileRowSchema>;

/** NIP, token, and Podmiot1 fields required before upload/send to KSeF. */
export function profileReadyForKsefXml(p: ProfileRow): boolean {
  return Boolean(
    p.nip &&
    p.ksef_token &&
    p.issuer_name?.trim() &&
    p.issuer_address_line1?.trim(),
  );
}
