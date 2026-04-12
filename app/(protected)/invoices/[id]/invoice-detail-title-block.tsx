"use client";

import Link from "next/link";
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
    <div>
      <Link
        href="/dashboard"
        className="text-muted-foreground mb-2 inline-block text-sm hover:underline"
      >
        ← Panel
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{fileName}</h1>
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
        <p className="text-destructive mt-2 text-sm">{errorMessage}</p>
      ) : null}
    </div>
  );
}
