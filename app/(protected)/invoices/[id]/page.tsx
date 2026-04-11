import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
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
import { createClient } from "@/lib/supabase/server";
import { buildFa3XmlOptionsFromProfile } from "@/lib/invoice/xml-builder";
import { invoiceDbSchema, parsedInvoiceSchema } from "@/lib/validations/invoice";
import {
  profileReadyForKsefXml,
  profileRowSchema,
} from "@/lib/validations/profile";
import { formatIsoDatePl } from "@/lib/utils";
import { KsefPayloadPreview } from "./ksef-payload-preview";
import { SendToKsefForm } from "./send-form";

type PageProps = { params: Promise<{ id: string }> };

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row) notFound();

  const inv = invoiceDbSchema.safeParse(row);
  if (!inv.success) notFound();

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profileParsed = profileRaw
    ? profileRowSchema.safeParse(profileRaw)
    : null;
  const issuerOptions =
    profileParsed?.success && profileReadyForKsefXml(profileParsed.data)
      ? buildFa3XmlOptionsFromProfile(profileParsed.data)
      : null;

  const parsed = inv.data.parsed_data
    ? parsedInvoiceSchema.safeParse(inv.data.parsed_data)
    : null;
  const data = parsed?.success ? parsed.data : null;

  const canSend =
    Boolean(data) &&
    Boolean(issuerOptions) &&
    (inv.data.status === "pending_review" ||
      inv.data.status === "parsed" ||
      inv.data.status === "error");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/dashboard"
            className="text-muted-foreground mb-2 inline-block text-sm hover:underline"
          >
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {inv.data.file_name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{inv.data.status}</Badge>
            {inv.data.ksef_reference ? (
              <span className="text-muted-foreground font-mono text-xs">
                KSeF: {inv.data.ksef_reference}
              </span>
            ) : null}
          </div>
          {inv.data.error_message ? (
            <p className="text-destructive mt-2 text-sm">{inv.data.error_message}</p>
          ) : null}
        </div>
        <SendToKsefForm invoiceId={inv.data.id} canSend={canSend} />
      </div>

      {!data ? (
        <p className="text-muted-foreground text-sm">No parsed data.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Parties</CardTitle>
              <CardDescription>Seller and buyer from PDF</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-1 font-medium">Seller</h3>
                <p className="text-sm">{data.seller.name}</p>
                <p className="text-muted-foreground text-sm">
                  {data.seller.addressLines.join(", ")}
                </p>
                <p className="mt-1 font-mono text-sm">NIP {data.seller.nip}</p>
              </div>
              <div>
                <h3 className="mb-1 font-medium">Buyer</h3>
                <p className="text-sm">{data.buyer.name}</p>
                <p className="text-muted-foreground text-sm">
                  {data.buyer.addressLines.join(", ")}
                </p>
                <p className="mt-1 font-mono text-sm">NIP {data.buyer.nip}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Faktura (metadane)</CardTitle>
              <CardDescription>
                Zgodnie z polami dat w dokumencie PDF (ISO w bazie:{" "}
                {data.issueDate}, {data.saleDate})
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Numer faktury </span>
                <span className="font-medium">({`details.invoiceNumber`} → </span>
                <span className="font-mono text-xs">P_2</span>
                <span className="font-medium">)</span> {data.invoiceNumber}
              </p>
              <p>
                <span className="text-muted-foreground">Data wystawienia </span>
                <span className="font-medium">({`details.issueDate`} → </span>
                <span className="font-mono text-xs">P_1</span>
                <span className="font-medium">)</span>{" "}
                {formatIsoDatePl(data.issueDate)}
              </p>
              <p>
                <span className="text-muted-foreground">Data sprzedaży </span>
                <span className="font-medium">({`details.saleDate`} → </span>
                <span className="font-mono text-xs">P_6</span>
                <span className="font-medium">)</span>{" "}
                {formatIsoDatePl(data.saleDate)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
              <CardDescription>
                Invoice {data.invoiceNumber} ·{" "}
                {formatIsoDatePl(data.issueDate)} · {data.currency}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>VAT %</TableHead>
                    <TableHead>Gross</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lineItems.map((line) => (
                    <TableRow key={line.lineNumber}>
                      <TableCell>{line.lineNumber}</TableCell>
                      <TableCell>{line.name}</TableCell>
                      <TableCell>
                        {line.quantity} {line.unit}
                      </TableCell>
                      <TableCell>{line.netAmount.toFixed(2)}</TableCell>
                      <TableCell>{line.vatRate}</TableCell>
                      <TableCell>{line.grossAmount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Totals</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p>Net: {data.totals.net.toFixed(2)} PLN</p>
              <p>VAT: {data.totals.vat.toFixed(2)} PLN</p>
              <p className="font-medium">Gross: {data.totals.gross.toFixed(2)} PLN</p>
            </CardContent>
          </Card>

          {issuerOptions ? (
            <KsefPayloadPreview data={data} issuer={issuerOptions} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>KSeF — podgląd payloadu</CardTitle>
                <CardDescription>
                  Uzupełnij w Ustawieniach NIP, token KSeF, nazwę sprzedawcy i
                  adres (linia 1), aby zobaczyć dane wysyłane do generatora FA(3).
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </>
      )}

      {inv.data.xml_content ? (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="xml">
            <AccordionTrigger>FA(3) XML preview (sent to KSeF)</AccordionTrigger>
            <AccordionContent>
              <pre className="bg-muted max-h-[480px] overflow-auto rounded-md p-4 text-xs whitespace-pre-wrap">
                {inv.data.xml_content}
              </pre>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}
