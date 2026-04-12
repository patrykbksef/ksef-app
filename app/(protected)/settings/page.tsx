import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  profileRowSchema,
  type ProfileFormInput,
} from "@/lib/validations/profile";
import { resolveKsefEnvironment } from "@/lib/ksef/config";
import { SettingsForm } from "./settings-form";

const emptyProfile: ProfileFormInput = {
  nip: "",
  ksef_token_demo: "",
  ksef_token_production: "",
  ksef_environment: "demo",
  auto_send: false,
  issuer_name: "",
  issuer_address_line1: "",
  issuer_address_line2: "",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: raw } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const parsed = raw ? profileRowSchema.safeParse(raw) : null;
  const defaults: ProfileFormInput = parsed?.success
    ? {
        nip: parsed.data.nip ?? "",
        ksef_token_demo: parsed.data.ksef_token_demo ?? "",
        ksef_token_production: parsed.data.ksef_token_production ?? "",
        ksef_environment: resolveKsefEnvironment(parsed.data.ksef_environment),
        auto_send: parsed.data.auto_send,
        issuer_name: parsed.data.issuer_name ?? "",
        issuer_address_line1: parsed.data.issuer_address_line1 ?? "",
        issuer_address_line2: parsed.data.issuer_address_line2 ?? "",
      }
    : emptyProfile;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ustawienia</h1>
        <p className="text-muted-foreground text-sm">
          Dane są sprawdzane na serwerze (Zod) przy każdym zapisie.
        </p>
      </div>
      <SettingsForm defaultValues={defaults} />
    </div>
  );
}
