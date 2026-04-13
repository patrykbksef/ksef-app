"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useTransition } from "react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { recalcParsedInvoice } from "@/lib/invoice/recalc-parsed-invoice";
import {
  issuerPartyFromParsed,
  podmiot2CounterpartyFromParsed,
  type BuildFa3XmlOptions,
} from "@/lib/invoice/xml-builder";
import {
  saveInvoiceParsedData,
  type SaveParsedInvoiceState,
} from "@/lib/actions/invoices";
import type { InvoiceLineItem, ParsedInvoice } from "@/lib/validations/invoice";
import { formatIsoDatePl } from "@/lib/utils";
import { InvoiceDetailTitleBlock } from "./invoice-detail-title-block";
import { SendToKsefForm } from "./send-form";

type LineDraft = {
  lineNumber: number;
  name: string;
  unit: string;
  quantity: string;
  netAmount: string;
  vatRate: string;
};

const lineDraftSchema = z.object({
  lineNumber: z.number().int().positive(),
  name: z.string(),
  unit: z.string(),
  quantity: z.string(),
  netAmount: z.string(),
  vatRate: z.string(),
});

const invoiceEditFormSchema = z.object({
  counterpartyName: z.string().min(1, "Wymagana nazwa"),
  counterpartyNip: z.string().min(1, "Wymagany NIP"),
  counterpartyAddress: z.string(),
  invoiceNumber: z.string().min(1, "Wymagany numer"),
  issueDate: z.string().min(1, "Wymagana data"),
  saleDate: z.string().min(1, "Wymagana data"),
  lineItems: z.array(lineDraftSchema).min(1, "Co najmniej jedna pozycja"),
});

export type InvoiceEditFormValues = z.infer<typeof invoiceEditFormSchema>;

function toLineDrafts(items: InvoiceLineItem[]): LineDraft[] {
  return items.map((line) => ({
    lineNumber: line.lineNumber,
    name: line.name,
    unit: line.unit,
    quantity: String(line.quantity),
    netAmount: line.netAmount.toFixed(2),
    vatRate: String(line.vatRate),
  }));
}

function toFormValues(
  p: ParsedInvoice,
  issuerNip: string,
): InvoiceEditFormValues {
  const counterparty = podmiot2CounterpartyFromParsed(p, issuerNip);
  return {
    counterpartyName: counterparty.name,
    counterpartyNip: counterparty.nip,
    counterpartyAddress: counterparty.addressLines.join("\n"),
    invoiceNumber: p.invoiceNumber,
    issueDate: p.issueDate,
    saleDate: p.saleDate,
    lineItems: toLineDrafts(p.lineItems),
  };
}

function parseDraftLines(
  drafts: LineDraft[],
): Pick<
  InvoiceLineItem,
  "lineNumber" | "name" | "unit" | "quantity" | "netUnitPrice" | "vatRate"
>[] {
  return drafts.map((d, idx) => {
    const lineNumber = d.lineNumber || idx + 1;
    const name = d.name.trim();
    const unit = d.unit.trim() || "szt.";
    const quantity = Number.parseFloat(d.quantity.replace(",", "."));
    const netAmount = Number.parseFloat(d.netAmount.replace(",", "."));
    const vatRate = Number.parseFloat(d.vatRate.replace(",", "."));
    const q = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const net = Number.isFinite(netAmount) && netAmount >= 0 ? netAmount : 0;
    const netUnitPrice = q > 0 ? net / q : 0;
    const vr = Number.isFinite(vatRate) && vatRate >= 0 ? vatRate : 0;
    return {
      lineNumber,
      name: name || `Pozycja ${lineNumber}`,
      unit,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : q,
      netUnitPrice,
      vatRate: vr,
    };
  });
}

function buildPayload(
  base: ParsedInvoice,
  values: InvoiceEditFormValues,
  issuerNip: string,
): ParsedInvoice {
  const partialLines = parseDraftLines(values.lineItems);
  const lineItems: InvoiceLineItem[] = partialLines.map((p) => ({
    ...p,
    netAmount: 0,
    vatAmount: 0,
    grossAmount: 0,
  }));
  const cpRef = podmiot2CounterpartyFromParsed(base, issuerNip);
  const addrLines = values.counterpartyAddress
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const nip = values.counterpartyNip.trim().replace(/\D/g, "").slice(0, 10);
  const editedParty = {
    name: values.counterpartyName.trim() || cpRef.name,
    nip: nip.length === 10 ? nip : cpRef.nip,
    addressLines: addrLines.length > 0 ? addrLines : [...cpRef.addressLines],
  };
  const side = issuerPartyFromParsed(base, issuerNip);
  if (side === "seller") {
    return {
      ...base,
      seller: base.seller,
      buyer: editedParty,
      invoiceNumber: values.invoiceNumber.trim() || base.invoiceNumber,
      issueDate: values.issueDate.trim() || base.issueDate,
      saleDate: values.saleDate.trim() || base.saleDate,
      lineItems,
      vatSummary: base.vatSummary,
      totals: base.totals,
    };
  }
  return {
    ...base,
    seller: editedParty,
    buyer: base.buyer,
    invoiceNumber: values.invoiceNumber.trim() || base.invoiceNumber,
    issueDate: values.issueDate.trim() || base.issueDate,
    saleDate: values.saleDate.trim() || base.saleDate,
    lineItems,
    vatSummary: base.vatSummary,
    totals: base.totals,
  };
}

const saveInitial: SaveParsedInvoiceState = {};

function InvoiceFormSections({
  initial,
  issuerOptions,
}: {
  initial: ParsedInvoice;
  issuerOptions: BuildFa3XmlOptions | null;
}) {
  const { control, register } = useFormContext<InvoiceEditFormValues>();
  const { fields } = useFieldArray({ control, name: "lineItems" });

  const watched = useWatch({ control }) as InvoiceEditFormValues | undefined;
  const issuerNipForPreview = issuerOptions?.issuerNip ?? "";
  const preview = useMemo(() => {
    if (!watched?.lineItems) return recalcParsedInvoice(initial);
    const draft = buildPayload(initial, watched, issuerNipForPreview);
    return recalcParsedInvoice(draft);
  }, [initial, watched, issuerNipForPreview]);

  const invoiceNumber = watched?.invoiceNumber ?? initial.invoiceNumber;
  const issueDate = watched?.issueDate ?? initial.issueDate;
  const saleDate = watched?.saleDate ?? initial.saleDate;

  const podmiot2Preview = useMemo(
    () => podmiot2CounterpartyFromParsed(preview, issuerNipForPreview),
    [preview, issuerNipForPreview],
  );
  const issuerPartyOnPdf = useMemo(() => {
    const side = issuerPartyFromParsed(preview, issuerNipForPreview);
    if (side === "buyer") return preview.buyer;
    if (side === "seller") return preview.seller;
    return preview.seller;
  }, [preview, issuerNipForPreview]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Strony</CardTitle>
          <CardDescription>
            Podmiot1 w KSeF — z profilu (Twój NIP). Podmiot2 — kontrahent (druga
            strona transakcji): wybierany po porównaniu NIP z profilu ze
            sprzedawcą i nabywcą z PDF (jeśli Twój NIP = sprzedawca na PDF, do KSeF
            idzie nabywca z PDF i odwrotnie).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8 md:grid-cols-2">
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-semibold">
                Sprzedawca (Ty — wysyłane do KSeF)
              </h3>
              {issuerOptions ? (
                <>
                  <p className="text-sm">{issuerOptions.issuerName}</p>
                  <p className="text-muted-foreground text-sm">
                    {[
                      issuerOptions.issuerAddressLine1,
                      issuerOptions.issuerAddressLine2?.trim() || "",
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="mt-1 font-mono text-sm">
                    NIP {issuerOptions.issuerNip}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Uzupełnij w Ustawieniach NIP, token KSeF, nazwę i adres
                  sprzedawcy — te dane trafią do KSeF jako Podmiot1.
                </p>
              )}
            </div>
            <div className="border-border/60 space-y-2 border-t pt-4">
              <h4 className="text-muted-foreground mb-2 text-sm font-medium">
                Kontrahent (Podmiot2) — edycja
              </h4>
              <Input
                {...register("counterpartyName")}
                aria-label="Nazwa kontrahenta (Podmiot2)"
                className="text-sm"
              />
              <Textarea
                {...register("counterpartyAddress")}
                aria-label="Adres kontrahenta (linie)"
                rows={3}
                className="text-sm"
              />
              <Input
                {...register("counterpartyNip")}
                aria-label="NIP kontrahenta"
                className="font-mono text-sm"
                maxLength={13}
              />
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-semibold">
                Kontrahent w KSeF (Podmiot2)
              </h3>
              <p className="text-sm">{podmiot2Preview.name || "—"}</p>
              <p className="text-muted-foreground text-sm">
                {podmiot2Preview.addressLines.filter(Boolean).join(", ") || "—"}
              </p>
              <p className="mt-1 font-mono text-sm">
                NIP{" "}
                {(() => {
                  const d = podmiot2Preview.nip.replace(/\D/g, "").slice(0, 10);
                  return d.length === 10 ? d : podmiot2Preview.nip.trim() || "—";
                })()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Faktura (metadane)</CardTitle>
          <CardDescription>
            Zgodnie z polami dat w dokumencie PDF (ISO w bazie po zapisie)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">
              Numer faktury ({`details.invoiceNumber`} →{" "}
              <span className="font-mono text-xs">P_2</span>)
            </span>
            <Input {...register("invoiceNumber")} className="max-w-md" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">
              Data wystawienia ({`details.issueDate`} →{" "}
              <span className="font-mono text-xs">P_1</span>) — ISO YYYY-MM-DD
            </span>
            <Input
              {...register("issueDate")}
              className="max-w-md font-mono"
            />
            <span className="text-muted-foreground text-xs">
              Podgląd: {formatIsoDatePl(issueDate)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">
              Data sprzedaży ({`details.saleDate`} →{" "}
              <span className="font-mono text-xs">P_6</span>) — ISO YYYY-MM-DD
            </span>
            <Input {...register("saleDate")} className="max-w-md font-mono" />
            <span className="text-muted-foreground text-xs">
              Podgląd: {formatIsoDatePl(saleDate)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pozycje</CardTitle>
          <CardDescription>
            Faktura {invoiceNumber || "—"} · {formatIsoDatePl(issueDate)} ·{" "}
            {initial.currency}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Nazwa</TableHead>
                <TableHead>Ilość</TableHead>
                <TableHead>Netto</TableHead>
                <TableHead>VAT %</TableHead>
                <TableHead>Brutto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, i) => {
                const computed = preview.lineItems[i];
                return (
                  <TableRow key={field.id}>
                    <TableCell>
                      <input
                        type="hidden"
                        {...register(`lineItems.${i}.lineNumber`)}
                      />
                      {field.lineNumber}
                    </TableCell>
                    <TableCell className="min-w-[140px]">
                      <Input
                        {...register(`lineItems.${i}.name`)}
                        className="min-w-[120px]"
                      />
                    </TableCell>
                    <TableCell className="min-w-[100px]">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                        <Input
                          {...register(`lineItems.${i}.quantity`)}
                          className="w-20"
                          inputMode="decimal"
                        />
                        <Input
                          {...register(`lineItems.${i}.unit`)}
                          className="w-16"
                          aria-label="Jednostka"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[88px]">
                      <Input
                        {...register(`lineItems.${i}.netAmount`)}
                        className="w-24"
                        inputMode="decimal"
                      />
                    </TableCell>
                    <TableCell className="min-w-[72px]">
                      <Input
                        {...register(`lineItems.${i}.vatRate`)}
                        className="w-16"
                        inputMode="decimal"
                      />
                    </TableCell>
                    <TableCell>
                      {computed ? computed.grossAmount.toFixed(2) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sumy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Netto: {preview.totals.net.toFixed(2)} PLN</p>
          <p>VAT: {preview.totals.vat.toFixed(2)} PLN</p>
          <p className="font-medium">
            Brutto: {preview.totals.gross.toFixed(2)} PLN
          </p>
        </CardContent>
      </Card>
    </>
  );
}

export function InvoiceDetailPageClient({
  invoiceId,
  fileName,
  status,
  ksefReference,
  errorMessage,
  initial,
  issuerOptions,
  parsedSnapshot,
  canSendToKsef,
}: {
  invoiceId: string;
  fileName: string;
  status: string;
  ksefReference: string | null;
  errorMessage: string | null;
  initial: ParsedInvoice;
  issuerOptions: BuildFa3XmlOptions | null;
  parsedSnapshot: string;
  canSendToKsef: boolean;
}) {
  const router = useRouter();
  const [saveState, saveAction] = useActionState(
    saveInvoiceParsedData,
    saveInitial,
  );
  const [savePending, startSaveTransition] = useTransition();
  const toastRef = useRef(false);

  const issuerNip = issuerOptions?.issuerNip ?? "";

  const form = useForm<InvoiceEditFormValues>({
    resolver: zodResolver(invoiceEditFormSchema),
    defaultValues: toFormValues(initial, issuerNip),
    mode: "onChange",
  });

  const { reset, handleSubmit, formState } = form;
  const isDirty = formState.isDirty;

  useEffect(() => {
    reset(toFormValues(initial, issuerOptions?.issuerNip ?? ""));
    // Only when server snapshot changes — not when `initial` reference changes alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial matches parsedSnapshot from parent
  }, [parsedSnapshot, reset, issuerOptions?.issuerNip]);

  useEffect(() => {
    if (saveState.ok && !toastRef.current) {
      toastRef.current = true;
      toast.success("Zapisano");
      router.refresh();
    }
    if (saveState.error && !toastRef.current) {
      toastRef.current = true;
      toast.error(saveState.error);
    }
    if (!saveState.ok && !saveState.error) toastRef.current = false;
  }, [saveState, router]);

  const onSave = handleSubmit((values) => {
    const payload = recalcParsedInvoice(
      buildPayload(initial, values, issuerNip),
    );
    const fd = new FormData();
    fd.set("invoice_id", invoiceId);
    fd.set("parsed_json", JSON.stringify(payload));
    startSaveTransition(() => {
      void saveAction(fd);
    });
  });

  function onDiscard() {
    reset(toFormValues(initial, issuerNip));
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <InvoiceDetailTitleBlock
          fileName={fileName}
          status={status}
          ksefReference={ksefReference}
          errorMessage={errorMessage}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onDiscard}
              disabled={!isDirty}
            >
              Anuluj zmiany
            </Button>
            <Button
              type="submit"
              form="invoice-parsed-edit"
              disabled={!isDirty || savePending}
            >
              {savePending ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </div>
          <SendToKsefForm
            invoiceId={invoiceId}
            canSend={canSendToKsef}
            sendDisabled={isDirty}
            sendDisabledReason="Zapisz lub anuluj zmiany przed wysłaniem do KSeF"
          />
        </div>
      </div>

      <FormProvider {...form}>
        <form
          id="invoice-parsed-edit"
          onSubmit={onSave}
          className="space-y-8"
        >
          <InvoiceFormSections initial={initial} issuerOptions={issuerOptions} />
        </form>
      </FormProvider>
    </div>
  );
}
