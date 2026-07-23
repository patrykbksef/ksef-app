import { z } from "zod";
import { decryptToken } from "@/lib/encryption";
import { resolveKsefEnvironment } from "@/lib/ksef/config";

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

const issuerNameSchema = z.string().trim().min(1, "Podaj nazwę prawną sprzedawcy").max(512, "Nazwa jest zbyt długa");

const issuerAddressLineSchema = z
  .string()
  .trim()
  .min(1, "Podaj pierwszą linię adresu")
  .max(512, "Adres jest zbyt długi");

const issuerAddressLine2Schema = z.string().trim().max(512, "Druga linia adresu jest zbyt długa").optional();

const tokenFieldSchema = z.string().max(8192, "Token jest zbyt długi");

export const ksefEnvironmentSchema = z.enum(["demo", "production"]);

export const profileFormSchema = z
  .object({
    nip: nipSchema,
    ksef_token_demo: tokenFieldSchema,
    ksef_token_production: tokenFieldSchema,
    ksef_environment: ksefEnvironmentSchema,
    auto_send: z.boolean(),
    issuer_name: issuerNameSchema,
    issuer_address_line1: issuerAddressLineSchema,
    issuer_address_line2: issuerAddressLine2Schema,
  })
  .superRefine((data, ctx) => {
    if (data.ksef_environment === "demo") {
      if (!data.ksef_token_demo.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Podaj token KSeF dla środowiska demo (wybrane w przełączniku)",
          path: ["ksef_token_demo"],
        });
      }
    } else if (!data.ksef_token_production.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Podaj token KSeF dla środowiska produkcyjnego (wybrane w przełączniku)",
        path: ["ksef_token_production"],
      });
    }
  });

export type ProfileFormInput = z.infer<typeof profileFormSchema>;

export const profileRowSchema = z.object({
  id: z.string().uuid(),
  nip: z.string().nullable(),
  ksef_token_demo: z.string().nullable().optional(),
  ksef_token_production: z.string().nullable().optional(),
  ksef_environment: ksefEnvironmentSchema.nullable().optional(),
  auto_send: z.boolean(),
  issuer_name: z.string().nullable().optional(),
  issuer_address_line1: z.string().nullable().optional(),
  issuer_address_line2: z.string().nullable().optional(),
  terms_accepted_at: z.string().nullable().optional(),
  privacy_accepted_at: z.string().nullable().optional(),
  dpa_accepted_at: z.string().nullable().optional(),
  legal_docs_version: z.string().nullable().optional(),
  verified: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ProfileRow = z.infer<typeof profileRowSchema>;

const profileIdsWithNonCryptedTokens = [
  "10ea7394-b856-40fb-9791-ab4e9407c044", // ja
  "10b373f4-eb87-4f11-a008-9403c65c405f", // marcin
  "3793728d-0bf0-452b-9489-3538fad2689f", // janusz
  "d5faa768-a146-46ba-ad6b-89601f8b4fae", // marcin2
];
/** Token used for API calls for the profile's selected environment. Decrypts at call time. */
export function ksefTokenForProfile(p: ProfileRow): string | null {
  const env = resolveKsefEnvironment(p.ksef_environment);
  const raw = env === "production" ? p.ksef_token_production : p.ksef_token_demo;
  if (profileIdsWithNonCryptedTokens.includes(p.id)) {
    const t = raw?.trim() ?? "";
    return t.length > 0 ? t : null;
  }
  if (!raw?.trim()) return null;
  return decryptToken(raw);
}

/** NIP, token for active environment, and Podmiot1 fields required before upload/send to KSeF. */
export function profileReadyForKsefXml(p: ProfileRow): boolean {
  const env = resolveKsefEnvironment(p.ksef_environment);
  const hasToken = env === "production" ? Boolean(p.ksef_token_production?.trim()) : Boolean(p.ksef_token_demo?.trim());
  return Boolean(p.nip && hasToken && p.issuer_name?.trim() && p.issuer_address_line1?.trim());
}
