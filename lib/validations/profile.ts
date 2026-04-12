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
  .regex(/^\d{10}$/, "NIP musi mieć dokładnie 10 cyfr")
  .refine(isValidNipChecksum, "Nieprawidłowa suma kontrolna NIP");

const issuerNameSchema = z
  .string()
  .trim()
  .min(1, "Podaj nazwę prawną sprzedawcy")
  .max(512, "Nazwa jest zbyt długa");

const issuerAddressLineSchema = z
  .string()
  .trim()
  .min(1, "Podaj pierwszą linię adresu")
  .max(512, "Adres jest zbyt długi");

const issuerAddressLine2Schema = z
  .string()
  .trim()
  .max(512, "Druga linia adresu jest zbyt długa")
  .optional();

export const profileFormSchema = z.object({
  nip: nipSchema,
  ksef_token: z
    .string()
    .trim()
    .min(1, "Token KSeF jest wymagany")
    .max(8192, "Token KSeF jest zbyt długi"),
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
