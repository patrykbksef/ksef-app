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
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const safeNext = next?.startsWith("/") ? next : "/dashboard";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
