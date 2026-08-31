import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Podaj prawidłowy adres e-mail"),
  password: z.string().min(6, "Hasło musi mieć co najmniej 6 znaków"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const passwordResetRequestSchema = z.object({
  email: z.string().email("Podaj prawidłowy adres e-mail"),
});

export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestSchema
>;

export const passwordUpdateSchema = z
  .object({
    password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków"),
    confirmPassword: z.string().min(1, "Powtórz nowe hasło"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Hasła muszą być takie same",
    path: ["confirmPassword"],
  });

export type PasswordUpdateInput = z.infer<typeof passwordUpdateSchema>;

const requiredTrue = (message: string) =>
  z.boolean().refine((v) => v === true, { message });

export const signupSchema = loginSchema
  .extend({
    password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków"),
    acceptTerms: requiredTrue("Akceptacja Regulaminu jest wymagana"),
    acceptPrivacy: requiredTrue("Akceptacja Polityki prywatności jest wymagana"),
    acceptDpa: requiredTrue(
      "Zawarcie Umowy powierzenia przetwarzania danych jest wymagane",
    ),
  });

export type SignupInput = z.infer<typeof signupSchema>;

export const acceptLegalSchema = z.object({
  acceptTerms: requiredTrue("Akceptacja Regulaminu jest wymagana"),
  acceptPrivacy: requiredTrue("Akceptacja Polityki prywatności jest wymagana"),
  acceptDpa: requiredTrue(
    "Zawarcie Umowy powierzenia przetwarzania danych jest wymagane",
  ),
});

export type AcceptLegalInput = z.infer<typeof acceptLegalSchema>;

export const oauthCallbackQuerySchema = z.object({
  code: z.string().min(1),
  next: z.string().optional(),
});

export type OauthCallbackQuery = z.infer<typeof oauthCallbackQuerySchema>;
