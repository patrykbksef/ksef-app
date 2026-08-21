import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowRight, FileText, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { invoiceStatusLabel } from "@/lib/i18n/pl";
import { cn } from "@/lib/utils";

type DashboardTone = "standard" | "ai" | "azure";

const toneStyles: Record<
  DashboardTone,
  { icon: string; glow: string; border: string }
> = {
  standard: {
    icon: "bg-primary text-primary-foreground",
    glow: "from-primary/10 via-transparent to-sky-500/5",
    border: "border-primary/20",
  },
  ai: {
    icon: "bg-violet-600 text-white",
    glow: "from-violet-500/12 via-transparent to-fuchsia-500/5",
    border: "border-violet-500/25",
  },
  azure: {
    icon: "bg-cyan-600 text-white",
    glow: "from-cyan-500/12 via-transparent to-blue-500/5",
    border: "border-cyan-500/25",
  },
};

export function InvoiceDashboardHero({
  title,
  description,
  environment,
  icon: Icon,
  tone = "standard",
}: {
  title: string;
  description: string;
  environment: "demo" | "production";
  icon: LucideIcon;
  tone?: DashboardTone;
}) {
  const styles = toneStyles[tone];
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card shadow-sm",
        styles.border,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br",
          styles.glow,
        )}
      />
      <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between md:p-8">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-sm",
              styles.icon,
            )}
          >
            <Icon className="size-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {title}
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed md:text-base">
              {description}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "h-8 gap-2 self-start px-3 sm:self-center",
            environment === "production"
              ? "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200"
              : "border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-200",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              environment === "production" ? "bg-amber-500" : "bg-sky-500",
            )}
          />
          {environment === "production" ? "Produkcja PRD" : "Demo TR"}
        </Badge>
      </div>
    </section>
  );
}

export function DashboardAlert({
  title,
  children,
  actionHref,
  actionLabel,
}: {
  title: string;
  children: ReactNode;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <Card className="border-amber-500/40 bg-amber-500/5 shadow-none">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-5" />
          </span>
          <div>
            <p className="font-semibold">{title}</p>
            <div className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {children}
            </div>
          </div>
        </div>
        {actionHref && actionLabel ? (
          <Button asChild variant="outline" className="shrink-0">
            <Link href={actionHref}>
              <Settings /> {actionLabel}
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function InvoiceUploadPanel({
  title,
  description,
  icon: Icon,
  children,
  tone = "standard",
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
  tone?: DashboardTone;
}) {
  const styles = toneStyles[tone];
  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="border-b bg-muted/25">
        <div className="flex items-start gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", styles.icon)}>
            <Icon className="size-5" />
          </span>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              {description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 md:p-6">{children}</CardContent>
    </Card>
  );
}

export type LocalInvoiceListRow = {
  id: string;
  file_name: string;
  status: string;
  created_at: string;
  ksef_reference: string | null;
};

export function RecentLocalInvoicesCard({
  invoices,
}: {
  invoices: LocalInvoiceListRow[] | null;
}) {
  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="border-b bg-muted/25">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="size-5" />
          </span>
          <div>
            <CardTitle className="text-lg">Ostatnie faktury</CardTitle>
            <CardDescription className="mt-1">
              20 ostatnio dodanych dokumentów
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!invoices?.length ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <FileText className="size-6" />
            </span>
            <p className="mt-4 font-medium">Nie dodano jeszcze żadnej faktury</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Pierwszy dokument pojawi się tutaj po odczytaniu PDF.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plik</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ref. KSeF</TableHead>
                    <TableHead>Utworzono</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          href={`/invoices/${row.id}`}
                          className="font-medium underline-offset-4 hover:text-primary hover:underline"
                        >
                          {row.file_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" title={row.status}>
                          {invoiceStatusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-44 truncate font-mono text-xs">
                        {row.ksef_reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(row.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/invoices/${row.id}`}
                          aria-label={`Otwórz ${row.file_name}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ArrowRight className="size-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-y md:hidden">
              {invoices.map((row) => (
                <Link
                  key={row.id}
                  href={`/invoices/${row.id}`}
                  className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.file_name}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge variant="secondary" title={row.status}>
                        {invoiceStatusLabel(row.status)}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {new Date(row.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="text-muted-foreground size-4 shrink-0" />
                </Link>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
