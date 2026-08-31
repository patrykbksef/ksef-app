import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { oauthCallbackQuerySchema } from "@/lib/validations/auth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const parsed = oauthCallbackQuerySchema.safeParse({
    code: searchParams.get("code") ?? "",
    next: searchParams.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const { code, next } = parsed.data;
  const isPasswordRecovery = next === "/reset-password";
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errorCode = isPasswordRecovery ? "recovery" : "oauth";
    return NextResponse.redirect(`${origin}/login?error=${errorCode}`);
  }

  const safeNext = next?.startsWith("/") ? next : "/dashboard";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
