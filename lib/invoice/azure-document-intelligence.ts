import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from "@azure-rest/ai-document-intelligence";
import type { AnalyzeOperationOutput, AnalyzeResultOutput } from "@azure-rest/ai-document-intelligence";

const LOG_SCOPE = "invoice.azure-di";

function azureEndpoint(): string {
  const raw =
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim() ||
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOIN?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

function azureKey(): string {
  return process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY?.trim() || "";
}

export function azureDocumentIntelligenceConfigured(): boolean {
  return Boolean(azureEndpoint() && azureKey());
}

export function requireAzureDocumentIntelligenceConfig(): void {
  if (!azureDocumentIntelligenceConfigured()) {
    throw new Error(
      "Brak konfiguracji Azure Document Intelligence — ustaw AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT i AZURE_DOCUMENT_INTELLIGENCE_KEY.",
    );
  }
}

/**
 * Analyze a PDF with the prebuilt invoice model (async LRO).
 */
export async function analyzeInvoicePdfBuffer(buffer: ArrayBuffer): Promise<AnalyzeResultOutput> {
  requireAzureDocumentIntelligenceConfig();
  const client = DocumentIntelligence(azureEndpoint(), { key: azureKey() });
  const base64Source = Buffer.from(buffer).toString("base64");

  const initialResponse = await client.path("/documentModels/{modelId}:analyze", "prebuilt-invoice").post({
    contentType: "application/json",
    body: { base64Source },
  });

  if (isUnexpected(initialResponse)) {
    const msg = (initialResponse.body as { error?: { message?: string } })?.error?.message ?? "Nieznany błąd Azure";
    console.error("Azure DI: analyze request failed", {
      scope: LOG_SCOPE,
      status: initialResponse.status,
      message: msg,
    });
    throw new Error(`Azure Document Intelligence: ${msg}`);
  }

  const poller = getLongRunningPoller(client, initialResponse);
  const done = await poller.pollUntilDone();

  if (isUnexpected(done)) {
    const msg = (done.body as { error?: { message?: string } })?.error?.message ?? "operacja zakończona błędem";
    console.error("Azure DI: poll finished with error", {
      scope: LOG_SCOPE,
      status: done.status,
      message: msg,
    });
    throw new Error(`Azure Document Intelligence: ${msg}`);
  }

  const body = done.body as AnalyzeOperationOutput;
  if (!body.analyzeResult) {
    console.error("Azure DI: missing analyzeResult", { scope: LOG_SCOPE });
    throw new Error("Azure Document Intelligence: brak wyniku analizy");
  }
  return body.analyzeResult;
}
