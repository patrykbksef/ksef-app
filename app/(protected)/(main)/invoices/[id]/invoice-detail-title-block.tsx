"use client";

import Link from "next/link";
import { ArrowLeft, CircleAlert, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { invoiceStatusLabel } from "@/lib/i18n/pl";

export function InvoiceDetailTitleBlock({
  fileName,
  status,
  ksefReference,
  errorMessage,
}: {
  fileName: string;
  status: string;
  ksefReference: string | null;
  errorMessage: string | null;
}) {
  return (
    <div className="flex min-w-0 items-start gap-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
        <FileText className="size-6" />
      </span>
      <div className="min-w-0">
      <Link
        href="/dashboard"
        className="text-muted-foreground mb-1.5 inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-3.5" /> Panel
      </Link>
      <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl" title={fileName}>
        {fileName}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary" title={status}>
          {invoiceStatusLabel(status)}
        </Badge>
        {ksefReference ? (
          <span className="text-muted-foreground font-mono text-xs">
            KSeF: {ksefReference}
          </span>
        ) : null}
      </div>
      {errorMessage ? (
        <p className="text-destructive mt-2 flex items-start gap-1.5 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {errorMessage}
        </p>
      ) : null}
      </div>
    </div>
  );
}
