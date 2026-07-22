import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasAcceptedCurrentLegalDocs } from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";

async function signOutAction() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function MainAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  if (!hasAcceptedCurrentLegalDocs(profile)) {
    redirect("/akceptacja-dokumentow");
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-card border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/dashboard" className="hover:text-foreground/80">
              Panel
            </Link>
            <Link href="/settings" className="hover:text-foreground/80">
              Ustawienia
            </Link>
          </nav>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm" className="gap-2">
              <LogOut className="size-4" />
              Wyloguj
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
