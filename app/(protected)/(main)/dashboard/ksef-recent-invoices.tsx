"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Cloud, Inbox, LoaderCircle } from "lucide-react";
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
      <div className="flex items-center gap-3 px-6 py-8 text-muted-foreground">
        <CircleAlert className="size-5 shrink-0" />
        <p className="text-sm">Uzupełnij profil w Ustawieniach, aby pobrać listę z KSeF.</p>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center gap-3 px-6 py-10 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
        <p className="text-sm">Pobieranie faktur z KSeF…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="m-5 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">
        <CircleAlert className="mt-0.5 size-5 shrink-0" />
        <p className="text-sm">{error instanceof Error ? error.message : "Nie udało się pobrać faktur z KSeF"}</p>
      </div>
    );
  }

  const rows = data?.invoices ?? [];
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Inbox className="size-6" />
        </span>
        <p className="mt-4 font-medium">Brak faktur w KSeF</p>
        <p className="text-muted-foreground mt-1 max-w-md text-sm">
          Nie znaleziono dokumentów sprzedawcy z ostatnich 90 dni.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
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
        <p className="text-muted-foreground border-t px-6 py-3 text-xs">
          Są kolejne strony w KSeF — wyświetlono pierwsze {rows.length} pozycji.
        </p>
      ) : null}
    </div>
  );
}

export function KsefRecentInvoicesCard({ profileComplete }: { profileComplete: boolean }) {
  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="border-b bg-muted/25">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Cloud className="size-5" />
          </span>
          <div>
            <CardTitle className="text-lg">Faktury zapisane w KSeF</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              Do 20 ostatnich dokumentów sprzedawcy z ostatnich 90 dni, ze środowiska wybranego w ustawieniach.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <KsefRecentInvoices enabled={profileComplete} />
      </CardContent>
    </Card>
  );
}
