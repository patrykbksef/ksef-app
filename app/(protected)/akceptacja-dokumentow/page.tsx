import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { AcceptLegalForm } from "./accept-legal-form";
import { Button } from "@/components/ui/button";
import { hasAcceptedCurrentLegalDocs } from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";

async function signOutAction() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function AkceptacjaDokumentowPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "terms_accepted_at, privacy_accepted_at, dpa_accepted_at, legal_docs_version",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (hasAcceptedCurrentLegalDocs(profile)) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-card border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="text-sm font-medium">KSeF — faktury</div>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm" className="gap-2">
              <LogOut className="size-4" />
              Wyloguj
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">
          Dostęp do panelu jest zablokowany do momentu akceptacji dokumentów
          prawnych. Dokumenty:{" "}
          <Link href="/regulamin" className="underline underline-offset-2">
            Regulamin
          </Link>
          ,{" "}
          <Link
            href="/polityka-prywatnosci"
            className="underline underline-offset-2"
          >
            Polityka prywatności
          </Link>
          ,{" "}
          <Link
            href="/umowa-powierzenia"
            className="underline underline-offset-2"
          >
            Umowa powierzenia
          </Link>
          .
        </p>
        <AcceptLegalForm />
      </main>
    </div>
  );
}
