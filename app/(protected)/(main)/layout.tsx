import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentMonthRangeWarsaw } from "@/lib/invoice/month-range";
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
      "terms_accepted_at, privacy_accepted_at, dpa_accepted_at, legal_docs_version, verified",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!hasAcceptedCurrentLegalDocs(profile)) {
    redirect("/akceptacja-dokumentow");
  }

  const { startIso, endIso } = currentMonthRangeWarsaw();
  const { count: monthInvoiceCount } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  const verified = profile?.verified === true;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-card border-b">
        <div className="mx-auto flex py-2 max-w-5xl items-center justify-between gap-4 px-4 flex-wrap">
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/dashboard" className="hover:text-foreground/80">
              Panel
            </Link>
            <Link href="/settings" className="hover:text-foreground/80">
              Ustawienia
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              Faktury w tym miesiącu: {monthInvoiceCount ?? 0}
            </span>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm" className="gap-2">
                <LogOut className="size-4" />
                Wyloguj
              </Button>
            </form>
          </div>
        </div>
      </header>
      {!verified ? (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-center text-sm">
          Konto oczekuje na weryfikację. Możesz dodać tylko 1 fakturę. Zadzwoń:{" "}
          <a href="tel:503758919" className="font-semibold underline-offset-2 hover:underline">
            503 758 919
          </a>
          .
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
