import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  Output,
  zodSchema,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { extractTextFromPdfBuffer } from "@/lib/invoice/pdf-text";
import { recalcParsedInvoice } from "@/lib/invoice/recalc-parsed-invoice";
import {
  parsedInvoiceSchema,
  type ParsedInvoice,
} from "@/lib/validations/invoice";

const LOG_SCOPE = "invoice.ai-parser";

/** Default Gemini model (override via GEMINI_INVOICE_MODEL). */
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** Default OpenAI model when Gemini fails (override via OPENAI_INVOICE_MODEL). */
const DEFAULT_OPENAI_MODEL = "gpt-4o";

/** Shown when every provider fails or overload with no fallback configured. */
export const AI_PARSE_UNAVAILABLE_MESSAGE =
  "Serwis AI jest chwilowo przeciążony. Spróbuj ponownie za chwilę.";

export class AiProvidersExhaustedError extends Error {
  constructor(
    public readonly userMessage: string,
    cause?: unknown,
  ) {
    super("Wszystkie dostawcy AI zwrócili błąd");
    this.name = "AiProvidersExhaustedError";
    this.cause = cause;
  }
}

const SYSTEM_PROMPT = `You extract structured data from Polish VAT invoices (faktury VAT) in PDF form.
Output must strictly match the JSON schema: Polish NIP is always exactly 10 digits.
Dates: ISO 8601 calendar dates only (YYYY-MM-DD).
Currency is PLN only.
- seller = sprzedawca / wystawca; buyer = nabywca / nabywca towaru.
- lineItems: every row from the positions table; lineNumber starts at 1 and increases.
- Each line: name, unit (e.g. szt., km., kg), quantity, netUnitPrice, netAmount, vatRate (percentage), vatAmount, grossAmount.
- vatSummary: aggregate by VAT rate (net, VAT, gross per rate).
- totals: sum net, sum VAT, sum gross (should match invoice if visible).
- addressLines: array of non-empty address lines without redundant NIP lines.
If the document is not a Polish VAT invoice, still fill fields as best as possible; never invent NIPs — use only digits present on the document.`;

const USER_PROMPT_PDF =
  "Przeanalizuj załączony plik PDF faktury i zwróć dane zgodnie ze schematem ParsedInvoice.";

const USER_PROMPT_TEXT_PREFIX =
  "Poniżej wyekstraktowany tekst z PDF faktury (układ może być niespójny). Wyciągnij dane zgodnie ze schematem ParsedInvoice.\n\n---\n\n";

const OUTPUT_SPEC = Output.object({
  schema: zodSchema(parsedInvoiceSchema),
  name: "ParsedInvoice",
  description: "Polish VAT invoice (FA) structured data for KSeF pipeline",
});

function buildPdfUserContent(uint8: Uint8Array) {
  return [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: USER_PROMPT_PDF },
        {
          type: "file" as const,
          data: uint8,
          mediaType: "application/pdf",
        },
      ],
    },
  ];
}

function buildTextUserContent(extractedText: string) {
  const maxChars = 120_000;
  const body =
    extractedText.length > maxChars
      ? `${extractedText.slice(0, maxChars)}\n\n[…tekst obcięty…]`
      : extractedText;
  return [
    {
      role: "user" as const,
      content: [
        {
          type: "text" as const,
          text: `${USER_PROMPT_TEXT_PREFIX}${body}`,
        },
      ],
    },
  ];
}

/** True when trying another provider may help (overload, rate limit, empty object, etc.). */
function shouldTryFallbackProvider(error: unknown): boolean {
  if (NoObjectGeneratedError.isInstance(error)) {
    return true;
  }
  if (APICallError.isInstance(error)) {
    const c = error.statusCode;
    if (c != null) {
      if (c === 401 || c === 403) return false;
      if (
        c === 429 ||
        c === 500 ||
        c === 502 ||
        c === 503 ||
        c === 408 ||
        c === 529
      ) {
        return true;
      }
    }
    if (error.isRetryable === true) return true;
  }
  const msg = (error instanceof Error ? error.message : String(error))
    .toLowerCase();
  const patterns = [
    "high demand",
    "overloaded",
    "rate limit",
    "too many requests",
    "temporarily",
    "try again",
    "timeout",
    "resource exhausted",
    "503",
    "429",
    "502",
    "over capacity",
    "unavailable",
  ];
  return patterns.some((p) => msg.includes(p));
}

async function runGenerate(
  model: LanguageModel,
  messages: ModelMessage[],
): Promise<ParsedInvoice> {
  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    output: OUTPUT_SPEC,
    maxRetries: 2,
  });
  const obj = result.output;
  if (!obj) {
    throw new Error("Model nie zwrócił danych faktury");
  }
  return recalcParsedInvoice(obj);
}

/**
 * Parse PDF bytes into {@link ParsedInvoice} using Gemini first, then OpenAI (text) if configured and primary fails with a transient error.
 */
export async function parseInvoiceWithAi(buffer: ArrayBuffer): Promise<ParsedInvoice> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
    throw new Error(
      "Brak GOOGLE_GENERATIVE_AI_API_KEY — dodaj klucz z Google AI Studio do zmiennych środowiska.",
    );
  }

  const geminiModelId =
    process.env.GEMINI_INVOICE_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const uint8 = new Uint8Array(buffer);
  const pdfMessages = buildPdfUserContent(uint8);

  let lastError: unknown = null;

  try {
    return await runGenerate(google(geminiModelId), pdfMessages);
  } catch (e) {
    lastError = e;
    console.error("AI invoice parse failed (Gemini)", {
      scope: LOG_SCOPE,
      modelId: geminiModelId,
      errorMessage: e instanceof Error ? e.message : String(e),
    });

    if (!shouldTryFallbackProvider(e)) {
      throw e instanceof Error
        ? e
        : new Error(`Błąd parsowania AI: ${String(e)}`);
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey) {
    throw new AiProvidersExhaustedError(
      AI_PARSE_UNAVAILABLE_MESSAGE,
      lastError,
    );
  }

  let extracted: string;
  try {
    extracted = await extractTextFromPdfBuffer(buffer);
  } catch (e) {
    console.error("AI fallback: PDF text extract failed", {
      scope: LOG_SCOPE,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw new AiProvidersExhaustedError(
      AI_PARSE_UNAVAILABLE_MESSAGE,
      lastError,
    );
  }

  if (!extracted.trim()) {
    throw new AiProvidersExhaustedError(
      AI_PARSE_UNAVAILABLE_MESSAGE,
      lastError,
    );
  }

  const openaiModelId =
    process.env.OPENAI_INVOICE_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const textMessages = buildTextUserContent(extracted);

  try {
    console.warn("AI invoice parse: retrying with OpenAI (text)", {
      scope: LOG_SCOPE,
      modelId: openaiModelId,
    });
    return await runGenerate(openai(openaiModelId), textMessages);
  } catch (e) {
    console.error("AI invoice parse failed (OpenAI fallback)", {
      scope: LOG_SCOPE,
      modelId: openaiModelId,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw new AiProvidersExhaustedError(
      AI_PARSE_UNAVAILABLE_MESSAGE,
      e,
    );
  }
}
