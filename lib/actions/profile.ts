"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { profileFormSchema } from "@/lib/validations/profile";

export type ProfileActionState = {
  error?: string;
  ok?: boolean;
};

export async function saveProfile(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const raw = {
    nip: String(formData.get("nip") ?? "").trim(),
    ksef_token: String(formData.get("ksef_token") ?? "").trim(),
    auto_send:
      formData.get("auto_send") === "true" ||
      formData.get("auto_send") === "on",
    issuer_name: String(formData.get("issuer_name") ?? "").trim(),
    issuer_address_line1: String(
      formData.get("issuer_address_line1") ?? "",
    ).trim(),
    issuer_address_line2: String(
      formData.get("issuer_address_line2") ?? "",
    ).trim(),
  };

  const parsed = profileFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      nip: parsed.data.nip,
      ksef_token: parsed.data.ksef_token,
      auto_send: parsed.data.auto_send,
      issuer_name: parsed.data.issuer_name,
      issuer_address_line1: parsed.data.issuer_address_line1,
      issuer_address_line2:
        parsed.data.issuer_address_line2?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
