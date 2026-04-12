import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Podaj prawidłowy adres e-mail"),
  password: z.string().min(6, "Hasło musi mieć co najmniej 6 znaków"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = loginSchema.extend({
  password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków"),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const oauthCallbackQuerySchema = z.object({
  code: z.string().min(1),
  next: z.string().optional(),
});

export type OauthCallbackQuery = z.infer<typeof oauthCallbackQuerySchema>;
