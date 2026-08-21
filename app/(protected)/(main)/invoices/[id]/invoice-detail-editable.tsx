"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Controller,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { recalcParsedInvoice } from "@/lib/invoice/recalc-parsed-invoice";
import {
  partyTaxIdentifierLabel,
  resolvePartyTaxIdentifier,
  taxIdentifierFields,
} from "@/lib/invoice/party-tax-identifier";
import { REMARKS_PREFIX_TEXT_LS_KEY } from "@/lib/invoice/remarks-lookup-from-pdf";
import type { KsefEnvironment } from "@/lib/ksef/config";
import {
  issuerPartyFromParsed,
  podmiot2CounterpartyFromParsed,
  type BuildFa3XmlOptions,
} from "@/lib/invoice/xml-builder";
import {
  saveInvoiceParsedData,
  type SaveParsedInvoiceState,
} from "@/lib/actions/invoices";
import type { InvoiceLineItem, PartialParsedInvoice } from "@/lib/validations/invoice";
import { parsedInvoiceSchema } from "@/lib/validations/invoice";
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
  counterpartyIdentifierType: z.enum(["nip", "vat_ue", "other", "none"]),
  counterpartyIdentifierValue: z.string(),
  counterpartyIdentifierCountryCode: z.string(),
  counterpartyAddress: z.string(),
  invoiceNumber: z.string().min(1, "Wymagany numer"),
  issueDate: z
    .string()
    .min(1, "Wymagana data")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  saleDate: z
    .string()
    .min(1, "Wymagana data")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  remarks: z.string(),
  lineItems: z.array(lineDraftSchema).min(1, "Co najmniej jedna pozycja"),
}).superRefine((values, ctx) => {
  const type = values.counterpartyIdentifierType;
  const value = values.counterpartyIdentifierValue.trim().toUpperCase();
  const country = values.counterpartyIdentifierCountryCode.trim().toUpperCase();

  if (type === "nip" && !/^\d{10}$/.test(value.replace(/\D/g, ""))) {
    ctx.addIssue({ code: "custom", path: ["counterpartyIdentifierValue"], message: "NIP musi mieć 10 cyfr" });
  }
  if (type === "vat_ue") {
    if (!/^[A-Z]{2}$/.test(country)) {
      ctx.addIssue({ code: "custom", path: ["counterpartyIdentifierCountryCode"], message: "Kod kraju musi mieć 2 litery" });
    }
    if (!/^[A-Z0-9+*]{1,12}$/.test(value)) {
      ctx.addIssue({ code: "custom", path: ["counterpartyIdentifierValue"], message: "Nieprawidłowy numer VAT UE" });
    }
  }
  if (type === "other" && !/^[A-Z0-9+*\-\.]{1,50}$/.test(value)) {
    ctx.addIssue({ code: "custom", path: ["counterpartyIdentifierValue"], message: "Wpisz identyfikator podatkowy" });
  }
});

export type InvoiceEditFormValues = z.infer<typeof invoiceEditFormSchema>;

const REMARKS_AUTO_PREFIX_LS_KEY = "ksef-invoice-remarks-auto-prefix";

/** `null` w localStorage = brak zapisu */
function readRemarksPrefixTextFromStorage(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(REMARKS_PREFIX_TEXT_LS_KEY);
    if (raw === null) return "";
    return raw;
  } catch {
    return "";
  }
}

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

const EMPTY_LINE_DRAFT: LineDraft = {
  lineNumber: 1,
  name: "",
  unit: "szt.",
  quantity: "1",
  netAmount: "0.00",
  vatRate: "23",
};

function toFormValues(
  p: PartialParsedInvoice,
  issuerNip: string,
): InvoiceEditFormValues {
  const counterparty = podmiot2CounterpartyFromParsed(p, issuerNip);
  const identifier = resolvePartyTaxIdentifier(counterparty);
  const drafts = toLineDrafts(p.lineItems);
  return {
    counterpartyName: counterparty.name,
    counterpartyIdentifierType: identifier.type,
    counterpartyIdentifierValue: identifier.value,
    counterpartyIdentifierCountryCode: identifier.countryCode ?? "",
    counterpartyAddress: counterparty.addressLines.join("\n"),
    invoiceNumber: p.invoiceNumber,
    issueDate: p.issueDate,
    saleDate: p.saleDate,
    remarks: p.remarks ?? "",
    lineItems: drafts.length > 0 ? drafts : [{ ...EMPTY_LINE_DRAFT }],
  };
}

function formValuesWithOptionalRemarksPrefix(
  p: PartialParsedInvoice,
  issuerNip: string,
): InvoiceEditFormValues {
  const v = toFormValues(p, issuerNip);
  if (
    typeof window !== "undefined" &&
    localStorage.getItem(REMARKS_AUTO_PREFIX_LS_KEY) === "true" &&
    !p.remarks?.trim()
  ) {
    return { ...v, remarks: readRemarksPrefixTextFromStorage() };
  }
  return v;
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

function ensurePartyName<T extends { name: string }>(
  party: T,
  fallback: string,
): T {
  return party.name.trim() ? party : { ...party, name: fallback };
}

function ensureIssuerParty(
  party: PartialParsedInvoice["seller"],
  issuerNip: string,
  nameFallback: string,
): PartialParsedInvoice["seller"] {
  const withName = ensurePartyName(party, nameFallback);
  const nip = withName.nip.replace(/\D/g, "");
  if (nip.length === 10) return withName;
  const fromProfile = issuerNip.replace(/\D/g, "").slice(0, 10);
  return fromProfile.length === 10
    ? {
        ...withName,
        ...taxIdentifierFields("nip", fromProfile),
      }
    : withName;
}

function buildPayload(
  base: PartialParsedInvoice,
  values: InvoiceEditFormValues,
  issuerNip: string,
): PartialParsedInvoice {
  const partialLines = parseDraftLines(values.lineItems);
  const lineItems: InvoiceLineItem[] = partialLines.map((p) => ({
    ...p,
    netAmount: 0,
    vatAmount: 0,
    grossAmount: 0,
  }));
  const addrLines = values.counterpartyAddress
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const editedParty = {
    name: values.counterpartyName.trim(),
    addressLines: addrLines,
    ...taxIdentifierFields(
      values.counterpartyIdentifierType,
      values.counterpartyIdentifierValue,
      values.counterpartyIdentifierCountryCode,
    ),
  };
  const side = issuerPartyFromParsed(base, issuerNip);
  if (side === "seller") {
    return {
      ...base,
      // Issuer-side fields are not editable (Podmiot1 comes from profile);
      // fill gaps so strict save validation can succeed after partial parse.
      seller: ensureIssuerParty(base.seller, issuerNip, "Nieznany sprzedawca"),
      buyer: editedParty,
      invoiceNumber: values.invoiceNumber.trim(),
      issueDate: values.issueDate.trim(),
      saleDate: values.saleDate.trim(),
      remarks: values.remarks.trim() || undefined,
      lineItems,
      vatSummary: base.vatSummary,
      totals: base.totals,
    };
  }
  return {
    ...base,
    seller: editedParty,
    buyer: ensureIssuerParty(base.buyer, issuerNip, "Nieznany nabywca"),
    invoiceNumber: values.invoiceNumber.trim(),
    issueDate: values.issueDate.trim(),
    saleDate: values.saleDate.trim(),
    remarks: values.remarks.trim() || undefined,
    lineItems,
    vatSummary: base.vatSummary,
    totals: base.totals,
  };
}

const saveInitial: SaveParsedInvoiceState = {};

function InvoiceFormSections({
  initial,
  issuerOptions,
  parsedSnapshotKey,
}: {
  initial: PartialParsedInvoice;
  issuerOptions: BuildFa3XmlOptions | null;
  parsedSnapshotKey: string;
}) {
  const { control, register, setValue, getValues, formState: { errors } } =
    useFormContext<InvoiceEditFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });

  const strictResult = useMemo(
    () => parsedInvoiceSchema.safeParse(initial),
    [initial],
  );
  const missingFieldLabels = useMemo(() => {
    if (strictResult.success) return [];
    const labels: string[] = [];
    for (const issue of strictResult.error.issues) {
      const path = issue.path.join(".");
      if (path.includes("invoiceNumber") && !initial.invoiceNumber) labels.push("Numer faktury");
      else if (path.includes("issueDate") && !initial.issueDate) labels.push("Data wystawienia");
      else if (path.includes("saleDate") && !initial.saleDate) labels.push("Data sprzedaży");
      else if (
        path.includes("seller.identifier") ||
        (path.includes("seller.nip") && !initial.seller.nip)
      ) labels.push("Identyfikator podatkowy sprzedawcy");
      else if (path.includes("seller.name") && !initial.seller.name) labels.push("Nazwa sprzedawcy");
      else if (
        path.includes("buyer.identifier") ||
        (path.includes("buyer.nip") && !initial.buyer.nip)
      ) labels.push("Identyfikator podatkowy nabywcy");
      else if (path.includes("buyer.name") && !initial.buyer.name) labels.push("Nazwa nabywcy");
      else if (path.includes("lineItems") && initial.lineItems.length === 0) labels.push("Pozycje faktury");
    }
    return [...new Set(labels)];
  }, [strictResult, initial]);

  const [autoPrefixGap, setAutoPrefixGap] = useState(false);
  const [remarksPrefixText, setRemarksPrefixText] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      setAutoPrefixGap(
        localStorage.getItem(REMARKS_AUTO_PREFIX_LS_KEY) === "true",
      );
      setRemarksPrefixText(readRemarksPrefixTextFromStorage());
    });
  }, [parsedSnapshotKey]);

  function onRemarksPrefixFieldChange(next: string) {
    setRemarksPrefixText(next);
    try {
      localStorage.setItem(REMARKS_PREFIX_TEXT_LS_KEY, next);
    } catch {
      /* ignore */
    }
  }

  function onRemarksAutoPrefixChange(checked: boolean) {
    setAutoPrefixGap(checked);
    try {
      localStorage.setItem(
        REMARKS_AUTO_PREFIX_LS_KEY,
        checked ? "true" : "false",
      );
    } catch {
      /* ignore quota / private mode */
    }
    const prefix = readRemarksPrefixTextFromStorage();
    const r = (getValues("remarks") ?? "").trim();
    if (checked) {
      if (r === "") setValue("remarks", prefix, { shouldDirty: true });
    } else if (r === prefix.trim()) {
      setValue("remarks", "", { shouldDirty: true });
    }
  }

  const watched = useWatch({ control }) as InvoiceEditFormValues | undefined;
  const identifierType = watched?.counterpartyIdentifierType ?? "nip";
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

  return (
    <>
      {missingFieldLabels.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5 shadow-none">
          <CardHeader className="p-5">
            <CardTitle className="text-lg text-amber-800 dark:text-amber-200">
              Niekompletne dane z PDF
            </CardTitle>
            <CardDescription className="text-amber-700 dark:text-amber-300">
              Nie udało się odczytać: {missingFieldLabels.join(", ")}.
              Uzupełnij brakujące pola i zapisz, aby móc wysłać fakturę do KSeF.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/25">
          <CardTitle className="text-lg">Strony faktury</CardTitle>
          <CardDescription>
            Dane sprzedawcy pochodzą z ustawień. Poniżej możesz poprawić dane
            kontrahenta wysyłane do KSeF jako Podmiot2.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
          <div className="space-y-6 rounded-xl border bg-background p-4">
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
              <div>
                <Input
                  {...register("counterpartyName")}
                  aria-label="Nazwa kontrahenta (Podmiot2)"
                  className="text-sm"
                />
                {errors.counterpartyName && (
                  <p className="text-destructive mt-1 text-xs">{errors.counterpartyName.message}</p>
                )}
              </div>
              <Textarea
                {...register("counterpartyAddress")}
                aria-label="Adres kontrahenta (linie)"
                rows={3}
                className="text-sm"
              />
              <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                <Controller
                  control={control}
                  name="counterpartyIdentifierType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Rodzaj identyfikatora kontrahenta">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nip">NIP</SelectItem>
                        <SelectItem value="vat_ue">VAT UE</SelectItem>
                        <SelectItem value="other">Inny identyfikator</SelectItem>
                        <SelectItem value="none">Brak identyfikatora</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {identifierType !== "none" && (
                  <Input
                    {...register("counterpartyIdentifierValue")}
                    aria-label="Identyfikator podatkowy kontrahenta"
                    className="font-mono text-sm uppercase"
                    placeholder={identifierType === "nip" ? "10 cyfr" : "Numer identyfikatora"}
                    maxLength={50}
                  />
                )}
              </div>
              {(identifierType === "vat_ue" || identifierType === "other") && (
                <div>
                  <Input
                    {...register("counterpartyIdentifierCountryCode")}
                    aria-label="Kod kraju identyfikatora kontrahenta"
                    className="w-28 font-mono uppercase"
                    placeholder={identifierType === "vat_ue" ? "np. DE" : "Kod kraju"}
                    maxLength={2}
                  />
                  <p className="text-muted-foreground mt-1 text-xs">
                    {identifierType === "vat_ue"
                      ? "Kod kraju VAT UE jest wymagany. Numer wpisz bez prefiksu kraju."
                      : "Kod kraju jest opcjonalny dla innego identyfikatora podatkowego."}
                  </p>
                </div>
              )}
              {errors.counterpartyIdentifierValue && (
                <p className="text-destructive text-xs">{errors.counterpartyIdentifierValue.message}</p>
              )}
              {errors.counterpartyIdentifierCountryCode && (
                <p className="text-destructive text-xs">{errors.counterpartyIdentifierCountryCode.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-6 rounded-xl border bg-muted/20 p-4">
            <div>
              <h3 className="mb-2 font-semibold">
                Kontrahent w KSeF (Podmiot2)
              </h3>
              <p className="text-sm">{podmiot2Preview.name || "—"}</p>
              <p className="text-muted-foreground text-sm">
                {podmiot2Preview.addressLines.filter(Boolean).join(", ") || "—"}
              </p>
              <p className="mt-1 font-mono text-sm">
                {partyTaxIdentifierLabel(podmiot2Preview)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/25">
          <CardTitle className="text-lg">Dane dokumentu</CardTitle>
          <CardDescription>
            Sprawdź numer faktury oraz daty odczytane z dokumentu.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 p-5 text-sm md:grid-cols-3 md:p-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">
              Numer faktury ({`details.invoiceNumber`} →{" "}
              <span className="font-mono text-xs">P_2</span>)
            </span>
            <Input {...register("invoiceNumber")} />
            {errors.invoiceNumber && (
              <p className="text-destructive text-xs">{errors.invoiceNumber.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">
              Data wystawienia ({`details.issueDate`} →{" "}
              <span className="font-mono text-xs">P_1</span>) — ISO YYYY-MM-DD
            </span>
            <Input
              {...register("issueDate")}
              className="font-mono"
            />
            {errors.issueDate && (
              <p className="text-destructive text-xs">{errors.issueDate.message}</p>
            )}
            <span className="text-muted-foreground text-xs">
              Podgląd: {formatIsoDatePl(issueDate)}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">
              Data sprzedaży ({`details.saleDate`} →{" "}
              <span className="font-mono text-xs">P_6</span>) — ISO YYYY-MM-DD
            </span>
            <Input {...register("saleDate")} className="font-mono" />
            {errors.saleDate && (
              <p className="text-destructive text-xs">{errors.saleDate.message}</p>
            )}
            <span className="text-muted-foreground text-xs">
              Podgląd: {formatIsoDatePl(saleDate)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/25">
          <CardTitle className="text-lg">Pozycje faktury</CardTitle>
          <CardDescription>
            Faktura {invoiceNumber || "—"} · {formatIsoDatePl(issueDate)} ·{" "}
            {initial.currency}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-5 md:p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Nazwa</TableHead>
                <TableHead>Ilość</TableHead>
                <TableHead>Netto</TableHead>
                <TableHead>VAT %</TableHead>
                <TableHead>Brutto</TableHead>
                <TableHead />
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
                    <TableCell>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(i)}
                          aria-label="Usuń pozycję"
                          className="text-destructive h-8 w-8 p-0"
                        >
                          ×
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {errors.lineItems && typeof errors.lineItems.message === "string" && (
            <p className="text-destructive mt-2 text-xs">{errors.lineItems.message}</p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() =>
              append({
                ...EMPTY_LINE_DRAFT,
                lineNumber: fields.length + 1,
              })
            }
          >
            + Dodaj pozycję
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/25">
          <CardTitle className="text-lg">Podsumowanie kwot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-3 md:p-6">
          <div className="rounded-xl border bg-muted/15 p-4">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Netto</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{preview.totals.net.toFixed(2)} PLN</p>
          </div>
          <div className="rounded-xl border bg-muted/15 p-4">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">VAT</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{preview.totals.vat.toFixed(2)} PLN</p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-primary text-xs font-medium uppercase tracking-wide">Brutto</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{preview.totals.gross.toFixed(2)} PLN</p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/25">
          <CardTitle className="text-lg">Dodatkowy opis</CardTitle>
          <CardDescription>
            Opcjonalne uwagi przesyłane do KSeF jako DodatkowyOpis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5 md:p-6">
          <Textarea
            {...register("remarks")}
            aria-label="Dodatkowy opis (DodatkowyOpis w KSeF)"
            rows={4}
            placeholder="np. numer zamówienia, uwagi do faktury…"
            className="text-sm"
          />
          <details className="rounded-xl border bg-muted/15">
            <summary className="cursor-pointer p-4 text-sm font-medium">
              Automatyczne uzupełnianie opisu z PDF
            </summary>
            <div className="space-y-4 border-t p-4">
              <p className="text-muted-foreground text-sm leading-relaxed">
                Aplikacja może odnaleźć w PDF tekst zaczynający się od podanego
                prefiksu, np. <span className="font-mono">GAP_2026</span>, i
                wstawić go do uwag.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={autoPrefixGap}
                  onCheckedChange={onRemarksAutoPrefixChange}
                  aria-label="Wstaw domyślny prefiks do dodatkowego opisu, gdy pole jest puste"
                />
                <span className="text-muted-foreground text-sm">
                  Wstaw domyślny prefiks, gdy opis jest pusty
                </span>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="remarks-prefix-text"
                  className="text-sm font-medium"
                >
                  Tekst prefiksu
                </label>
                <Input
                  id="remarks-prefix-text"
                  value={remarksPrefixText}
                  onChange={(e) => onRemarksPrefixFieldChange(e.target.value)}
                  maxLength={120}
                  className="max-w-md font-mono text-sm"
                  aria-label="Tekst prefiksu dodatkowego opisu"
                />
              </div>
            </div>
          </details>
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
  ksefEnvironment,
}: {
  invoiceId: string;
  fileName: string;
  status: string;
  ksefReference: string | null;
  errorMessage: string | null;
  initial: PartialParsedInvoice;
  issuerOptions: BuildFa3XmlOptions | null;
  parsedSnapshot: string;
  canSendToKsef: boolean;
  ksefEnvironment: KsefEnvironment;
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
    defaultValues: formValuesWithOptionalRemarksPrefix(initial, issuerNip),
    mode: "onChange",
  });

  const { reset, handleSubmit, formState } = form;
  const isDirty = formState.isDirty;

  useEffect(() => {
    reset(
      formValuesWithOptionalRemarksPrefix(
        initial,
        issuerOptions?.issuerNip ?? "",
      ),
    );
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
    reset(formValuesWithOptionalRemarksPrefix(initial, issuerNip));
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-sky-500/5" />
        <div className="relative flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between md:p-6">
        <InvoiceDetailTitleBlock
          fileName={fileName}
          status={status}
          ksefReference={ksefReference}
          errorMessage={errorMessage}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onDiscard}
              disabled={!isDirty}
            >
              <RotateCcw /> Anuluj zmiany
            </Button>
            <Button
              type="submit"
              form="invoice-parsed-edit"
              disabled={!isDirty || savePending}
            >
              {savePending ? <LoaderCircle className="animate-spin" /> : <Save />}
              {savePending ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </div>
          <SendToKsefForm
            invoiceId={invoiceId}
            canSend={canSendToKsef}
            sendDisabled={isDirty}
            sendDisabledReason="Zapisz lub anuluj zmiany przed wysłaniem do KSeF"
            ksefEnvironment={ksefEnvironment}
          />
        </div>
        </div>
      </section>

      <FormProvider {...form}>
        <form
          id="invoice-parsed-edit"
          onSubmit={onSave}
          className="space-y-6"
        >
          <InvoiceFormSections
            initial={initial}
            issuerOptions={issuerOptions}
            parsedSnapshotKey={parsedSnapshot}
          />
        </form>
      </FormProvider>
    </div>
  );
}
