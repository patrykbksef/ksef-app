"use client";

import { useQuery } from "@tanstack/react-query";
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
import type { KsefInvoiceListRow } from "@/lib/ksef/client";
import { ksefQueryKeys } from "@/lib/query-keys";

type RecentApiOk = { invoices: KsefInvoiceListRow[]; hasMore: boolean };

async function fetchKsefRecentInvoices(): Promise<RecentApiOk> {
  const res = await fetch("/api/ksef/invoices/recent");
  const data = (await res.json()) as RecentApiOk & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return { invoices: data.invoices ?? [], hasMore: Boolean(data.hasMore) };
}

function formatMaybeDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function KsefRecentInvoices({ enabled }: { enabled: boolean }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ksefQueryKeys.recentInvoices,
    queryFn: fetchKsefRecentInvoices,
    enabled,
  });

  if (!enabled) {
    return (
      <p className="text-muted-foreground text-sm">
        Uzupełnij profil w Ustawieniach, aby pobrać listę z KSeF.
      </p>
    );
  }

  if (isPending) {
    return (
      <p className="text-muted-foreground text-sm">Ładowanie listy z KSeF…</p>
    );
  }

  if (isError) {
    return (
      <p className="text-destructive text-sm">
        {error instanceof Error ? error.message : "Nie udało się pobrać faktur z KSeF"}
      </p>
    );
  }

  const rows = data?.invoices ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Brak faktur w zakresie ostatnich 90 dni (Subject1 / trwałe przechowywanie)
        lub pusta odpowiedź API.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Numer KSeF</TableHead>
            <TableHead>Numer faktury</TableHead>
            <TableHead>Data wystawienia</TableHead>
            <TableHead>Nabywca (NIP / id)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.ksefNumber}>
              <TableCell className="max-w-[200px] truncate font-mono text-xs">
                {row.ksefNumber}
              </TableCell>
              <TableCell>{row.invoiceNumber ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatMaybeDate(row.issueDate ?? row.invoicingDate)}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {row.buyerIdentifier ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data?.hasMore ? (
        <p className="text-muted-foreground mt-3 text-xs">
          Są kolejne strony w KSeF — wyświetlono pierwsze {rows.length} pozycji.
        </p>
      ) : null}
    </>
  );
}

export function KsefRecentInvoicesCard({ profileComplete }: { profileComplete: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ostatnie faktury w KSEF</CardTitle>
        <CardDescription>
          Do 20 ostatnich faktur (jako sprzedawca / Subject1), z ostatnich 90 dni.
          Host API (demo lub produkcja) zgodnie z przełącznikiem w Ustawieniach.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <KsefRecentInvoices enabled={profileComplete} />
      </CardContent>
    </Card>
  );
}
