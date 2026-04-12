import { notFound, redirect } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { buildFa3XmlOptionsFromProfile } from "@/lib/invoice/xml-builder";
import { invoiceDbSchema, parsedInvoiceSchema } from "@/lib/validations/invoice";
import {
  profileReadyForKsefXml,
  profileRowSchema,
} from "@/lib/validations/profile";
import { InvoiceDetailPageClient } from "./invoice-detail-editable";
import { InvoiceDetailTitleBlock } from "./invoice-detail-title-block";
import { KsefPayloadPreview } from "./ksef-payload-preview";

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
      {!data ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <InvoiceDetailTitleBlock
              fileName={inv.data.file_name}
              status={inv.data.status}
              ksefReference={inv.data.ksef_reference}
              errorMessage={inv.data.error_message}
            />
          </div>
          <p className="text-muted-foreground text-sm">Brak sparsowanych danych.</p>
        </>
      ) : (
        <>
          <InvoiceDetailPageClient
            invoiceId={inv.data.id}
            fileName={inv.data.file_name}
            status={inv.data.status}
            ksefReference={inv.data.ksef_reference}
            errorMessage={inv.data.error_message}
            initial={data}
            issuerOptions={issuerOptions}
            parsedSnapshot={JSON.stringify(data)}
            canSendToKsef={canSend}
          />

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
            <AccordionTrigger>
              Podgląd XML FA(3) (wysłany do KSeF)
            </AccordionTrigger>
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
