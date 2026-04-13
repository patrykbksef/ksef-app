"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  uploadInvoiceAi,
  type UploadInvoiceState,
} from "@/lib/actions/invoices";
import { cn } from "@/lib/utils";

function isNextRedirectError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const d = (e as { digest?: string }).digest;
  return typeof d === "string" && d.startsWith("NEXT_REDIRECT");
}

export function DashboardAiUpload({ disabled }: { disabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback((f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
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
      startTransition(async () => {
        const initial: UploadInvoiceState = {};
        try {
          const res = await uploadInvoiceAi(initial, fd);
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
    <form onSubmit={onSubmit} className="space-y-4">
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
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled) inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "border-border focus-visible:ring-ring/50 rounded-lg border-2 border-dashed p-8 text-center transition-colors outline-none focus-visible:ring-[3px]",
          dragOver && !disabled && "border-primary bg-primary/5",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <p className="text-foreground font-medium">
          Przeciągnij plik PDF tutaj
        </p>
        <p className="text-muted-foreground mt-2 text-sm">lub</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            variant="default"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Wybierz plik
          </Button>
          {file ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={clearFile}
            >
              Usuń wybór
            </Button>
          ) : null}
        </div>
        {file ? (
          <p className="text-muted-foreground mt-4 break-all text-sm">
            Wybrano: <span className="text-foreground font-medium">{file.name}</span>{" "}
            ({(file.size / 1024).toFixed(1)} KB)
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={disabled || !file || pending}>
        {pending ? "Analiza AI…" : "Wyślij i sparsuj (AI)"}
      </Button>
    </form>
  );
}
