"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LEGAL_DOCS_VERSION } from "@/lib/legal/constants";
import { createClient } from "@/lib/supabase/server";
import { acceptLegalSchema } from "@/lib/validations/auth";

export type AcceptLegalActionState = {
  error?: string;
};

export async function acceptLegalDocuments(
  _prev: AcceptLegalActionState,
  formData: FormData,
): Promise<AcceptLegalActionState> {
  const parsed = acceptLegalSchema.safeParse({
    acceptTerms: formData.get("acceptTerms") === "on" || formData.get("acceptTerms") === "true",
    acceptPrivacy:
      formData.get("acceptPrivacy") === "on" ||
      formData.get("acceptPrivacy") === "true",
    acceptDpa: formData.get("acceptDpa") === "on" || formData.get("acceptDpa") === "true",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Wymagana jest akceptacja wszystkich dokumentów",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({
      terms_accepted_at: now,
      privacy_accepted_at: now,
      dpa_accepted_at: now,
      legal_docs_version: LEGAL_DOCS_VERSION,
      updated_at: now,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
