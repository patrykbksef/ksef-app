import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = loginSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const oauthCallbackQuerySchema = z.object({
  code: z.string().min(1),
  next: z.string().optional(),
});

export type OauthCallbackQuery = z.infer<typeof oauthCallbackQuerySchema>;
