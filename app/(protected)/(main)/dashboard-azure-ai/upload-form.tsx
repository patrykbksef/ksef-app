"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { FileCheck2, FileUp, LoaderCircle, ScanText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  uploadInvoiceAzureDi,
  type UploadInvoiceState,
} from "@/lib/actions/invoices";
import {
  REMARKS_LOOKUP_PREFIX_FORM_FIELD,
  REMARKS_PREFIX_TEXT_LS_KEY,
} from "@/lib/invoice/remarks-lookup-from-pdf";
import { cn } from "@/lib/utils";

function isNextRedirectError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const d = (e as { digest?: string }).digest;
  return typeof d === "string" && d.startsWith("NEXT_REDIRECT");
}

export function DashboardAzureDiUpload({ disabled }: { disabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback((f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    if (
      f.type !== "application/pdf" &&
      !f.name.toLowerCase().endsWith(".pdf")
    ) {
      toast.error("Dozwolone są tylko pliki PDF");
      return;
    }
    setFile(f);
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const f = e.dataTransfer.files[0];
      if (f) pickFile(f);
    },
    [disabled, pickFile],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (disabled || !file || pending) return;
      const fd = new FormData();
      fd.append("file", file);
      try {
        const raw = localStorage.getItem(REMARKS_PREFIX_TEXT_LS_KEY);
        const prefix = (raw ?? "").trim().slice(0, 64);
        if (prefix) fd.append(REMARKS_LOOKUP_PREFIX_FORM_FIELD, prefix);
      } catch {
        /* ignore */
      }
      startTransition(async () => {
        const initial: UploadInvoiceState = {};
        try {
          const res = await uploadInvoiceAzureDi(initial, fd);
          if (res?.error) toast.error(res.error);
        } catch (err) {
          if (isNextRedirectError(err)) return;
          toast.error(
            err instanceof Error ? err.message : "Nie udało się wgrać pliku",
          );
        }
      });
    },
    [disabled, file, pending],
  );

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-2xl border-2 border-dashed bg-muted/15 px-5 py-10 text-center transition-all md:px-8 md:py-12",
          dragOver && !disabled && "scale-[1.01] border-cyan-500 bg-cyan-500/5 shadow-sm",
          file && "border-emerald-500/50 bg-emerald-500/5",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <div className={cn(
          "mx-auto flex size-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
          file && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
        )}>
          {file ? <FileCheck2 className="size-7" /> : <ScanText className="size-7" />}
        </div>
        <p className="mt-4 text-lg font-semibold">
          {file ? "Plik jest gotowy" : "Dodaj fakturę do analizy Azure"}
        </p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm leading-relaxed">
          {file
            ? "Możesz rozpocząć analizę albo wybrać inny dokument."
            : "Przeciągnij dokument w to miejsce lub wybierz go z urządzenia."}
        </p>
        {file ? (
          <div className="mx-auto mt-5 flex max-w-lg items-center gap-3 rounded-xl border bg-background p-3 text-left shadow-sm">
            <ScanText className="size-5 shrink-0 text-cyan-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-muted-foreground text-xs">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            variant={file ? "outline" : "default"}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <FileUp /> {file ? "Wybierz inny plik" : "Wybierz plik"}
          </Button>
          {file ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={clearFile}
            >
              <Trash2 /> Usuń
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-5 text-xs">PDF · maksymalnie 5 MB</p>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={disabled || !file || pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <ScanText />}
        {pending ? "Analiza Azure…" : "Prześlij i odczytaj dane (Azure DI)"}
      </Button>
    </form>
  );
}
