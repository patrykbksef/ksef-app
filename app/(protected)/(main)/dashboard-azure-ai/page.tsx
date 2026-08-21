import { redirect } from "next/navigation";
import { ScanText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  profileReadyForKsefXml,
  profileRowSchema,
} from "@/lib/validations/profile";
import { azureDocumentIntelligenceConfigured } from "@/lib/invoice/azure-document-intelligence";
import { DashboardAzureDiUpload } from "./upload-form";
import {
  DashboardAlert,
  InvoiceDashboardHero,
  InvoiceUploadPanel,
  RecentLocalInvoicesCard,
} from "@/components/invoice/invoice-dashboard-ui";
import { KsefRecentInvoicesCard } from "../dashboard/ksef-recent-invoices";

export default async function DashboardAzureAiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profile = profileRaw
    ? profileRowSchema.safeParse(profileRaw)
    : null;
  const p = profile?.success ? profile.data : null;

  const profileComplete = Boolean(p && profileReadyForKsefXml(p));
  const verified = p?.verified === true;
  const azureReady = azureDocumentIntelligenceConfigured();

  const [{ data: invoicesRaw }, { count: totalInvoiceCount }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, file_name, status, created_at, ksef_reference")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const uploadBlockedByVerification = !verified && (totalInvoiceCount ?? 0) >= 1;
  const canUpload = profileComplete && azureReady && !uploadBlockedByVerification;
  const environment = p?.ksef_environment === "production" ? "production" : "demo";

  return (
    <div className="space-y-6 pb-8">
      <InvoiceDashboardHero
        title="Dodaj fakturę z Azure"
        description="Azure Document Intelligence odczyta dokument bez użycia modelu językowego."
        environment={environment}
        icon={ScanText}
        tone="azure"
      />

      {!azureReady ? (
        <DashboardAlert title="Brak konfiguracji Azure">
          Ustaw zmienne <code className="text-xs">AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT</code>{" "}
          oraz <code className="text-xs">AZURE_DOCUMENT_INTELLIGENCE_KEY</code>.
        </DashboardAlert>
      ) : null}

      {!profileComplete ? (
        <DashboardAlert title="Dokończ konfigurację firmy" actionHref="/settings" actionLabel="Otwórz ustawienia">
          Dodaj NIP, nazwę i adres sprzedawcy oraz token KSeF, zanim wgrasz pierwszą fakturę.
        </DashboardAlert>
      ) : null}

      {uploadBlockedByVerification ? (
        <DashboardAlert title="Wymagana weryfikacja konta">
          Limit jednej faktury został wykorzystany. Zadzwoń pod{" "}
          <a href="tel:503758919" className="font-medium underline-offset-2 hover:underline">503 758 919</a>, aby odblokować konto.
        </DashboardAlert>
      ) : null}

      <InvoiceUploadPanel
        title="Wgraj dokument do analizy Azure"
        description="Wynik trafia do tego samego formularza weryfikacji co pozostałe metody odczytu."
        icon={ScanText}
        tone="azure"
      >
        <DashboardAzureDiUpload disabled={!canUpload} />
      </InvoiceUploadPanel>

      <KsefRecentInvoicesCard profileComplete={profileComplete} />

      <RecentLocalInvoicesCard invoices={invoicesRaw ?? null} />
    </div>
  );
}
