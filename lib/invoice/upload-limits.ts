import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const UNVERIFIED_UPLOAD_LIMIT_ERROR =
  "Konto nie zostało jeszcze zweryfikowane. Możesz dodać tylko jedną fakturę. Zadzwoń: 503 758 919.";

/** Returns an error payload if an unverified user already has ≥1 invoice. */
export async function assertUnverifiedCanUpload(
  supabase: Supabase,
  userId: string,
  verified: boolean,
): Promise<{ error: string } | null> {
  if (verified) return null;

  const { count, error } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    return { error: error.message };
  }

  if ((count ?? 0) >= 1) {
    return { error: UNVERIFIED_UPLOAD_LIMIT_ERROR };
  }

  return null;
}
