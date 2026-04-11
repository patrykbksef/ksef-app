import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildKsefLiteInvoiceInput,
  type BuildFa3XmlOptions,
} from "@/lib/invoice/xml-builder";
import type { ParsedInvoice } from "@/lib/validations/invoice";
import { formatIsoDatePl } from "@/lib/utils";

function formatKsefDate(d: Date | string): string {
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return formatIsoDatePl(`${y}-${mo}-${day}`);
  }
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return formatIsoDatePl(d);
  }
  return String(d);
}

function PayloadRow({
  pl,
  path,
  xml,
  value,
}: {
  pl: string;
  path: string;
  xml: string;
  value: ReactNode;
}) {
  return (
    <div className="border-border/60 grid gap-1 border-b py-2 text-sm last:border-0 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-start md:gap-4">
      <div className="min-w-0">
        <div className="font-medium">{pl}</div>
        <div className="text-muted-foreground font-mono text-[11px] leading-snug">
          ({path} → {xml})
        </div>
      </div>
      <div className="text-muted-foreground min-w-0 wrap-break-word md:text-right">
        {value}
      </div>
    </div>
  );
}

export function KsefPayloadPreview({
  data,
  issuer,
}: {
  data: ParsedInvoice;
  issuer: BuildFa3XmlOptions;
}) {
  const input = buildKsefLiteInvoiceInput(data, issuer);
  const pay = input.details.payment;
  const addInfo = input.details.additionalInfo;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dane przekazywane do KSeF (wejście ksef-lite)</CardTitle>
        <CardDescription>
          Wartości wysyłane do generatora FA(3).{" "}
          <strong className="text-foreground">Sprzedawca (Podmiot1)</strong> —
          z Ustawień (NIP musi zgadzać się z kontekstem KSeF); karta „Parties”
          powyżej pokazuje sprzedawcę z PDF tylko informacyjnie.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <p className="text-muted-foreground border-border/60 bg-muted/40 rounded-md border p-3 text-xs leading-relaxed">
          <strong className="text-foreground">Uwaga:</strong> ksef-lite po
          przetworzeniu wylicza w XML kwoty netto/VAT pozycji (
          <span className="font-mono">P_11</span>,{" "}
          <span className="font-mono">P_11Vat</span> itd.) z ceny i ilości —
          nawet jeśli poniżej w wejściu nie ma osobnych pól kwotowych dla
          wierszy.
        </p>

        <div>
          <h3 className="mb-1 font-semibold">Sprzedawca</h3>
          <PayloadRow
            pl="NIP"
            path="seller.nip"
            xml="Podmiot1 / DaneIdentyfikacyjne / NIP"
            value={input.seller.nip}
          />
          <PayloadRow
            pl="Nazwa"
            path="seller.name"
            xml="Podmiot1 / DaneIdentyfikacyjne / Nazwa"
            value={input.seller.name}
          />
          <PayloadRow
            pl="Adres (łączony)"
            path="seller.address"
            xml="Podmiot1 / Adres (KodKraju, AdresL1, AdresL2)"
            value={input.seller.address}
          />
        </div>

        <div>
          <h3 className="mb-1 font-semibold">Nabywca</h3>
          <PayloadRow
            pl="NIP"
            path="buyer.nip"
            xml="Podmiot2 / DaneIdentyfikacyjne / NIP"
            value={input.buyer.nip}
          />
          <PayloadRow
            pl="Nazwa (tylko z PDF — nie w payloadzie)"
            path="parsedInvoice.buyer.name"
            xml="— (KSeF weryfikuje NIP; ksef-lite+NIP+Nazwa w DaneIdentyfikacyjne bywa odrzucone)"
            value={data.buyer.name}
          />
          <PayloadRow
            pl="Adres (łączony)"
            path="buyer.address"
            xml="Podmiot2 / Adres (KodKraju, AdresL1, AdresL2)"
            value={input.buyer.address}
          />
        </div>

        <div>
          <h3 className="mb-1 font-semibold">Nagłówek faktury (Fa)</h3>
          <PayloadRow
            pl="Kod waluty"
            path="details.currency"
            xml="KodWaluty"
            value={input.details.currency}
          />
          <PayloadRow
            pl="Data wystawienia"
            path="details.issueDate"
            xml="P_1"
            value={formatKsefDate(input.details.issueDate)}
          />
          <PayloadRow
            pl="Numer faktury"
            path="details.invoiceNumber"
            xml="P_2"
            value={input.details.invoiceNumber}
          />
          <PayloadRow
            pl="Data sprzedaży"
            path="details.saleDate"
            xml="P_6"
            value={formatKsefDate(input.details.saleDate)}
          />
          <PayloadRow
            pl="Rodzaj faktury"
            path="details.invoiceType"
            xml="RodzajFaktury"
            value={input.details.invoiceType}
          />
        </div>

        <div>
          <h3 className="mb-1 font-semibold">Pozycje (FaWiersz)</h3>
          {input.details.items.map((item, i) => (
            <div
              key={`${item.name}-${i}`}
              className="border-border/60 mb-3 rounded-md border p-3 last:mb-0"
            >
              <p className="text-muted-foreground mb-2 font-mono text-xs">
                details.items[{i}] → FaWiersz
              </p>
              <PayloadRow
                pl="Nazwa towaru / usługi"
                path={`details.items[${i}].name`}
                xml="P_7"
                value={item.name}
              />
              <PayloadRow
                pl="Jednostka miary"
                path={`details.items[${i}].unit`}
                xml="P_8A"
                value={item.unit}
              />
              <PayloadRow
                pl="Ilość"
                path={`details.items[${i}].quantity`}
                xml="P_8B"
                value={item.quantity}
              />
              <PayloadRow
                pl="Cena netto"
                path={`details.items[${i}].netPrice`}
                xml="P_9A"
                value={item.netPrice}
              />
              <PayloadRow
                pl="Stawka VAT"
                path={`details.items[${i}].vatRate`}
                xml="P_12"
                value={item.vatRate}
              />
            </div>
          ))}
        </div>

        <div>
          <h3 className="mb-1 font-semibold">Płatność (Platnosc)</h3>
          {"bankAccount" in pay && pay.bankAccount != null ? (
            <PayloadRow
              pl="Rachunek bankowy"
              path="details.payment.bankAccount"
              xml="RachunekBankowy / NrRB"
              value={pay.bankAccount}
            />
          ) : null}
          {"bankName" in pay && pay.bankName != null ? (
            <PayloadRow
              pl="Nazwa banku"
              path="details.payment.bankName"
              xml="RachunekBankowy / NazwaBanku"
              value={pay.bankName}
            />
          ) : null}
          {"dueDate" in pay && pay.dueDate != null ? (
            <PayloadRow
              pl="Termin płatności"
              path="details.payment.dueDate"
              xml="TerminPlatnosci / Termin"
              value={formatKsefDate(pay.dueDate)}
            />
          ) : null}
          <PayloadRow
            pl="Forma płatności (kod)"
            path="details.payment.method"
            xml="FormaPlatnosci"
            value={`${pay.method} (MF: 6 = przelew)`}
          />
          {"amount" in pay && pay.amount != null ? (
            <PayloadRow
              pl="Kwota (pole amount)"
              path="details.payment.amount"
              xml="(sprawdź wygenerowany XML — może nie być emitowane)"
              value={pay.amount}
            />
          ) : null}
          {"methodDescription" in pay && pay.methodDescription != null ? (
            <PayloadRow
              pl="Opis płatności"
              path="details.payment.methodDescription"
              xml="OpisPlatnosci (przy innej formie)"
              value={pay.methodDescription}
            />
          ) : null}
        </div>

        {addInfo && addInfo.length > 0 ? (
          <div>
            <h3 className="mb-1 font-semibold">Dodatkowy opis</h3>
            {addInfo.map((row, i) => (
              <div
                key={`${row.key}-${i}`}
                className="border-border/60 mb-2 rounded-md border p-3 last:mb-0"
              >
                <p className="text-muted-foreground mb-2 font-mono text-xs">
                  details.additionalInfo[{i}] → DodatkowyOpis (Klucz, Wartosc)
                </p>
                <PayloadRow
                  pl="Klucz"
                  path={`details.additionalInfo[${i}].key`}
                  xml="Klucz"
                  value={row.key}
                />
                <PayloadRow
                  pl="Wartość"
                  path={`details.additionalInfo[${i}].value`}
                  xml="Wartosc"
                  value={row.value}
                />
              </div>
            ))}
          </div>
        ) : null}

        <div>
          <h3 className="mb-1 font-semibold">Podsumowanie</h3>
          <p className="text-muted-foreground mb-2 text-xs leading-relaxed">
            Do ksef-lite <strong className="text-foreground">nie wysyłamy</strong>{" "}
            <span className="font-mono">summary</span>: biblioteka ustala{" "}
            <span className="font-mono">P_13_*</span>,{" "}
            <span className="font-mono">P_14_*</span> i{" "}
            <span className="font-mono">P_15</span> z pozycji, żeby uniknąć
            odrzucenia przez KSeF przy rozjazdach sum z PDF.
          </p>
          <PayloadRow
            pl="Sumy z PDF (tylko informacja — nie w payloadzie)"
            path="parsedInvoice.totals"
            xml="—"
            value={`net ${data.totals.net.toFixed(2)} · VAT ${data.totals.vat.toFixed(2)} · brutto ${data.totals.gross.toFixed(2)} ${data.currency}`}
          />
        </div>

        <p className="text-muted-foreground border-border/60 text-xs leading-relaxed">
          Z PDF-a nie przekazujemy osobnych pól{" "}
          <span className="font-mono">netAmount</span> /{" "}
          <span className="font-mono">vatAmount</span> /{" "}
          <span className="font-mono">grossAmount</span> na pozycjach — kwoty
          wierszy w XML wynikają z ceny i ilości.
        </p>
      </CardContent>
    </Card>
  );
}
