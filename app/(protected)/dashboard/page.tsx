import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  profileReadyForKsefXml,
  profileRowSchema,
} from "@/lib/validations/profile";
import { DashboardUpload } from "./upload-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { invoiceStatusLabel } from "@/lib/i18n/pl";
import { KsefRecentInvoicesCard } from "./ksef-recent-invoices";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profile = profileRaw
    ? profileRowSchema.safeParse(profileRaw)
    : null;
  const p = profile?.success ? profile.data : null;

  const profileComplete = Boolean(p && profileReadyForKsefXml(p));

  const { data: invoicesRaw } = await supabase
    .from("invoices")
    .select("id, file_name, status, created_at, ksef_reference")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
        <p className="text-muted-foreground text-sm">
          Wgraj fakturę PDF i wyślij ją do KSeF ({ profile?.data?.ksef_environment === "demo" ? "środowisko testowe" : "środowisko produkcyjne"}).
        </p>
      </div>

      {!profileComplete ? (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-lg">Uzupełnij profil</CardTitle>
            <CardDescription>
              Dodaj NIP, nazwę i adres sprzedawcy oraz token KSeF w Ustawieniach,
              zanim wgrasz faktury.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ButtonLink href="/settings">Przejdź do ustawień</ButtonLink>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Wgraj fakturę</CardTitle>
          <CardDescription>
            Tylko PDF, maks. 5 MB. Parser obsługuje m.in. szablony InterRisk,
            Compensa i Global Assistance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DashboardUpload disabled={!profileComplete} />
        </CardContent>
      </Card>

      <KsefRecentInvoicesCard profileComplete={profileComplete} />

      <Card>
        <CardHeader>
          <CardTitle>Ostatnie faktury</CardTitle>
          <CardDescription>20 ostatnich plików</CardDescription>
        </CardHeader>
        <CardContent>
          {!invoicesRaw?.length ? (
            <p className="text-muted-foreground text-sm">Brak faktur.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plik</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ref. KSeF</TableHead>
                  <TableHead>Utworzono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesRaw.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/invoices/${row.id}`}
                        className="text-primary font-medium underline-offset-4 hover:underline"
                      >
                        {row.file_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" title={row.status}>
                        {invoiceStatusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate font-mono text-xs">
                      {row.ksef_reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ButtonLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="bg-primary text-primary-foreground inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium"
    >
      {children}
    </Link>
  );
}
