"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildFa3XmlFromParsedInvoice,
  buildFa3XmlOptionsFromProfile,
} from "@/lib/invoice/xml-builder";
import {
  AiProvidersExhaustedError,
  parseInvoiceWithAi,
} from "@/lib/invoice/ai-parser";
import { azureDocumentIntelligenceConfigured } from "@/lib/invoice/azure-document-intelligence";
import { parseInvoiceWithAzureDi } from "@/lib/invoice/parse-invoice-azure-di";
import { parseInterRiskInvoiceText } from "@/lib/invoice/parser";
import { extractTextFromPdfBuffer } from "@/lib/invoice/pdf-text";
import {
  mergeRemarksFromPdfLookup,
  parseRemarksLookupPrefixFromFormData,
} from "@/lib/invoice/remarks-lookup-from-pdf";
import { sendInvoiceToKsefWithToken } from "@/lib/ksef/client";
import { resolveKsefEnvironment } from "@/lib/ksef/config";
import { recalcParsedInvoice } from "@/lib/invoice/recalc-parsed-invoice";
import {
  fileUploadSchema,
  parsedInvoiceSchema,
} from "@/lib/validations/invoice";
import { z } from "zod";
import {
  ksefTokenForProfile,
  profileRowSchema,
} from "@/lib/validations/profile";

export type UploadInvoiceState = {
  error?: string;
};

export async function uploadInvoice(
  _prev: UploadInvoiceState,
  formData: FormData,
): Promise<UploadInvoiceState> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Nie wybrano pliku" };
  }

  const uploadParsed = fileUploadSchema.safeParse({
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
  });
  if (!uploadParsed.success) {
    return {
      error: uploadParsed.error.issues[0]?.message ?? "Nieprawidłowy plik",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { error: "Brak sesji — zaloguj się ponownie" };
  }

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profileParsed = profileRaw
    ? profileRowSchema.safeParse(profileRaw)
    : null;
  if (!profileParsed?.success) {
    return {
      error: "Najpierw uzupełnij profil w Ustawieniach",
    };
  }

  const profile = profileParsed.data;
  const xmlOptions = buildFa3XmlOptionsFromProfile(profile);
  if (!xmlOptions) {
    return {
      error:
        "Uzupełnij w Ustawieniach: NIP, token KSeF dla wybranego środowiska (demo lub produkcja), nazwę sprzedawcy i pierwszą linię adresu",
    };
  }

  let text: string;
  try {
    const buf = await file.arrayBuffer();
    text = await extractTextFromPdfBuffer(buf);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Invoice upload: PDF read failed", {
      scope: "invoice.upload",
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      step: "pdf_extract",
      errorMessage,
    });
    return { error: "Nie udało się odczytać pliku PDF" };
  }

  let parsedInvoice;
  try {
    parsedInvoice = parseInterRiskInvoiceText(text, {
      issuerName: profile.issuer_name?.trim(),
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Invoice upload: parse failed", {
      scope: "invoice.upload",
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      step: "parse",
      errorMessage,
    });
    return {
      error:
        e instanceof Error
          ? e.message
          : "Nie udało się sparsować faktury z PDF",
    };
  }

  parsedInvoice = mergeRemarksFromPdfLookup(
    parsedInvoice,
    text,
    parseRemarksLookupPrefixFromFormData(formData),
  );

  let xml: string;
  try {
    xml = buildFa3XmlFromParsedInvoice(parsedInvoice, xmlOptions);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Invoice upload: XML build failed", {
      scope: "invoice.upload",
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      step: "xml",
      errorMessage,
    });
    return {
      error:
        e instanceof Error
          ? e.message
          : "Nie udało się zbudować XML KSeF z faktury",
    };
  }

  const autoSend = profile.auto_send === true;

  let status: "pending_review" | "success" | "error" = "pending_review";
  let ksefRef: string | null = null;
  let errMsg: string | null = null;

  if (autoSend) {
    try {
      const result = await sendInvoiceToKsefWithToken({
        contextNip: xmlOptions.issuerNip,
        ksefToken: ksefTokenForProfile(profile)!,
        invoiceXml: xml,
        ksefEnvironment: resolveKsefEnvironment(profile.ksef_environment),
      });
      ksefRef =
        result.invoiceKsefNumber ?? result.invoiceReferenceNumber ?? null;
      status = "success";
    } catch (e) {
      status = "error";
      errMsg = e instanceof Error ? e.message : String(e);
      console.error("Invoice upload: KSeF send failed", {
        scope: "invoice.upload",
        userId: user.id,
        fileName: file.name,
        fileSize: file.size,
        step: "ksef",
        errorMessage: errMsg,
        xmlLength: xml.length,
        xmlHead: xml.slice(0, 2000),
      });
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("invoices")
    .insert({
      user_id: user.id,
      file_name: file.name,
      parsed_data: parsedInvoice,
      xml_content: xml,
      ksef_reference: ksefRef,
      status,
      error_message: errMsg,
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.error("Invoice upload: DB insert failed", {
      scope: "invoice.upload",
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      step: "db_insert",
      errorMessage: insErr?.message ?? "no_row",
    });
    return { error: insErr?.message ?? "Nie udało się zapisać faktury" };
  }

  revalidatePath("/dashboard");
  redirect(`/invoices/${inserted.id}`);
}

/** Same as {@link uploadInvoice} but parses the PDF with Gemini AI (any layout). */
export async function uploadInvoiceAi(
  _prev: UploadInvoiceState,
  formData: FormData,
): Promise<UploadInvoiceState> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Nie wybrano pliku" };
  }

  const uploadParsed = fileUploadSchema.safeParse({
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
  });
  if (!uploadParsed.success) {
    return {
      error: uploadParsed.error.issues[0]?.message ?? "Nieprawidłowy plik",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { error: "Brak sesji — zaloguj się ponownie" };
  }

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profileParsed = profileRaw
    ? profileRowSchema.safeParse(profileRaw)
    : null;
  if (!profileParsed?.success) {
    return {
      error: "Najpierw uzupełnij profil w Ustawieniach",
    };
  }

  const profile = profileParsed.data;
  const xmlOptions = buildFa3XmlOptionsFromProfile(profile);
  if (!xmlOptions) {
    return {
      error:
        "Uzupełnij w Ustawieniach: NIP, token KSeF dla wybranego środowiska (demo lub produkcja), nazwę sprzedawcy i pierwszą linię adresu",
    };
  }

  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Invoice upload (AI): PDF read failed", {
      scope: "invoice.upload.ai",
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      step: "pdf_buffer",
      errorMessage,
    });
    return { error: "Nie udało się odczytać pliku PDF" };
  }

  let parsedInvoice;
  try {
    parsedInvoice = await parseInvoiceWithAi(buf);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Invoice upload (AI): parse failed", {
      scope: "invoice.upload.ai",
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      step: "ai_parse",
      errorMessage,
    });
    if (e instanceof AiProvidersExhaustedError) {
      return { error: e.userMessage };
    }
    return {
      error:
        e instanceof Error
          ? e.message
          : "Nie udało się sparsować faktury z PDF (AI)",
    };
  }

  let textForRemarksLookup = "";
  try {
    textForRemarksLookup = await extractTextFromPdfBuffer(buf);
  } catch {
    /* optional — remarks lookup only */
  }
  parsedInvoice = mergeRemarksFromPdfLookup(
    parsedInvoice,
    textForRemarksLookup,
    parseRemarksLookupPrefixFromFormData(formData),
  );

  let xml: string;
  try {
    xml = buildFa3XmlFromParsedInvoice(parsedInvoice, xmlOptions);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Invoice upload (AI): XML build failed", {
      scope: "invoice.upload.ai",
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      step: "xml",
      errorMessage,
    });
    return {
      error:
        e instanceof Error
          ? e.message
          : "Nie udało się zbudować XML KSeF z faktury",
    };
  }

  const autoSend = profile.auto_send === true;

  let status: "pending_review" | "success" | "error" = "pending_review";
  let ksefRef: string | null = null;
  let errMsg: string | null = null;

  if (autoSend) {
    try {
      const result = await sendInvoiceToKsefWithToken({
        contextNip: xmlOptions.issuerNip,
        ksefToken: ksefTokenForProfile(profile)!,
        invoiceXml: xml,
        ksefEnvironment: resolveKsefEnvironment(profile.ksef_environment),
      });
      ksefRef =
        result.invoiceKsefNumber ?? result.invoiceReferenceNumber ?? null;
      status = "success";
    } catch (e) {
      status = "error";
      errMsg = e instanceof Error ? e.message : String(e);
      console.error("Invoice upload (AI): KSeF send failed", {
        scope: "invoice.upload.ai",
        userId: user.id,
        fileName: file.name,
        fileSize: file.size,
        step: "ksef",
        errorMessage: errMsg,
        xmlLength: xml.length,
        xmlHead: xml.slice(0, 2000),
      });
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("invoices")
    .insert({
      user_id: user.id,
      file_name: file.name,
      parsed_data: parsedInvoice,
      xml_content: xml,
      ksef_reference: ksefRef,
      status,
      error_message: errMsg,
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.error("Invoice upload (AI): DB insert failed", {
      scope: "invoice.upload.ai",
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      step: "db_insert",
      errorMessage: insErr?.message ?? "no_row",
    });
    return { error: insErr?.message ?? "Nie udało się zapisać faktury" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard-ai");
  redirect(`/invoices/${inserted.id}`);
}

/** Same flow as {@link uploadInvoiceAi} but parses with Azure Document Intelligence + code mapping (no LLM). */
export async function uploadInvoiceAzureDi(
  _prev: UploadInvoiceState,
  formData: FormData,
): Promise<UploadInvoiceState> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Nie wybrano pliku" };
  }

  const uploadParsed = fileUploadSchema.safeParse({
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
  });
  if (!uploadParsed.success) {
    return {
      error: uploadParsed.error.issues[0]?.message ?? "Nieprawidłowy plik",
    };
  }

  if (!azureDocumentIntelligenceConfigured()) {
    return {
      error:
        "Brak AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT i AZURE_DOCUMENT_INTELLIGENCE_KEY w zmiennych środowiska.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { error: "Brak sesji — zaloguj się ponownie" };
  }

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profileParsed = profileRaw
    ? profileRowSchema.safeParse(profileRaw)
    : null;
  if (!profileParsed?.success) {
    return {
      error: "Najpierw uzupełnij profil w Ustawieniach",
    };
  }

  const profile = profileParsed.data;
  const xmlOptions = buildFa3XmlOptionsFromProfile(profile);
  if (!xmlOptions) {
    return {
      error:
        "Uzupełnij w Ustawieniach: NIP, token KSeF dla wybranego środowiska (demo lub produkcja), nazwę sprzedawcy i pierwszą linię adresu",
    };
  }

  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Invoice upload (Azure DI): PDF read failed", {
      scope: "invoice.upload.azure-di",
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      step: "pdf_buffer",
      errorMessage,
    });
    return { error: "Nie udało się odczytać pliku PDF" };
  }

  let parsedInvoice;
  try {
    parsedInvoice = await parseInvoiceWithAzureDi(buf);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Invoice upload (Azure DI): parse failed", {
      scope: "invoice.upload.azure-di",
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      step: "azure_di_parse",
      errorMessage,
    });
    return {
      error:
        e instanceof Error
          ? e.message
          : "Nie udało się sparsować faktury z PDF (Azure Document Intelligence)",
    };
  }

  let textForRemarksLookup = "";
  try {
    textForRemarksLookup = await extractTextFromPdfBuffer(buf);
  } catch {
    /* optional — remarks lookup only */
  }
  parsedInvoice = mergeRemarksFromPdfLookup(
    parsedInvoice,
    textForRemarksLookup,
    parseRemarksLookupPrefixFromFormData(formData),
  );

  let xml: string;
  try {
    xml = buildFa3XmlFromParsedInvoice(parsedInvoice, xmlOptions);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Invoice upload (Azure DI): XML build failed", {
      scope: "invoice.upload.azure-di",
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      step: "xml",
      errorMessage,
    });
    return {
      error:
        e instanceof Error
          ? e.message
          : "Nie udało się zbudować XML KSeF z faktury",
    };
  }

  const autoSend = profile.auto_send === true;

  let status: "pending_review" | "success" | "error" = "pending_review";
  let ksefRef: string | null = null;
  let errMsg: string | null = null;

  if (autoSend) {
    try {
      const result = await sendInvoiceToKsefWithToken({
        contextNip: xmlOptions.issuerNip,
        ksefToken: ksefTokenForProfile(profile)!,
        invoiceXml: xml,
        ksefEnvironment: resolveKsefEnvironment(profile.ksef_environment),
      });
      ksefRef =
        result.invoiceKsefNumber ?? result.invoiceReferenceNumber ?? null;
      status = "success";
    } catch (e) {
      status = "error";
      errMsg = e instanceof Error ? e.message : String(e);
      console.error("Invoice upload (Azure DI): KSeF send failed", {
        scope: "invoice.upload.azure-di",
        userId: user.id,
        fileName: file.name,
        fileSize: file.size,
        step: "ksef",
        errorMessage: errMsg,
        xmlLength: xml.length,
        xmlHead: xml.slice(0, 2000),
      });
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("invoices")
    .insert({
      user_id: user.id,
      file_name: file.name,
      parsed_data: parsedInvoice,
      xml_content: xml,
      ksef_reference: ksefRef,
      status,
      error_message: errMsg,
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.error("Invoice upload (Azure DI): DB insert failed", {
      scope: "invoice.upload.azure-di",
      userId: user.id,
      fileName: file.name,
      fileSize: file.size,
      step: "db_insert",
      errorMessage: insErr?.message ?? "no_row",
    });
    return { error: insErr?.message ?? "Nie udało się zapisać faktury" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard-ai");
  revalidatePath("/dashboard-azure-ai");
  redirect(`/invoices/${inserted.id}`);
}

export type SaveParsedInvoiceState = {
  error?: string;
  ok?: boolean;
};

export async function saveInvoiceParsedData(
  _prev: SaveParsedInvoiceState,
  formData: FormData,
): Promise<SaveParsedInvoiceState> {
  const idRaw = String(formData.get("invoice_id") ?? "");
  const idParsed = z.string().uuid().safeParse(idRaw);
  if (!idParsed.success) {
    return { error: "Nieprawidłowa faktura" };
  }

  let unknown: unknown;
  try {
    unknown = JSON.parse(String(formData.get("parsed_json") ?? "")) as unknown;
  } catch {
    return { error: "Nieprawidłowy format danych" };
  }

  const first = parsedInvoiceSchema.safeParse(unknown);
  if (!first.success) {
    return {
      error:
        first.error.issues[0]?.message ?? "Dane faktury nie przeszły walidacji",
    };
  }

  const recalced = recalcParsedInvoice(first.data);
  const final = parsedInvoiceSchema.safeParse(recalced);
  if (!final.success) {
    return { error: "Po przeliczeniu kwot dane są niespójne" };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { error: "Brak sesji — zaloguj się ponownie" };
  }

  const { error: updErr } = await supabase
    .from("invoices")
    .update({
      parsed_data: final.data,
      status: "pending_review",
      xml_content: null,
      ksef_reference: null,
      error_message: null,
    })
    .eq("id", idParsed.data)
    .eq("user_id", user.id);

  if (updErr) {
    return { error: updErr.message };
  }

  revalidatePath(`/invoices/${idParsed.data}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export type SendInvoiceState = {
  error?: string;
  ok?: boolean;
};

export async function sendInvoiceToKsef(
  _prev: SendInvoiceState,
  formData: FormData,
): Promise<SendInvoiceState> {
  const idRaw = String(formData.get("invoice_id") ?? "");
  const idParsed = z.string().uuid().safeParse(idRaw);
  if (!idParsed.success) {
    return { error: "Nieprawidłowa faktura" };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { error: "Brak sesji — zaloguj się ponownie" };
  }

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const prof = profileRaw ? profileRowSchema.safeParse(profileRaw) : null;
  const xmlOptions = prof?.success
    ? buildFa3XmlOptionsFromProfile(prof.data)
    : null;
  if (!prof?.success || !xmlOptions) {
    return {
      error:
        "Uzupełnij w Ustawieniach: NIP, token KSeF dla wybranego środowiska (demo lub produkcja), nazwę sprzedawcy i pierwszą linię adresu",
    };
  }

  const { data: invRaw } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", idParsed.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!invRaw?.parsed_data) {
    return { error: "Brak danych faktury — wgraj ponownie plik PDF" };
  }

  const parsedStored = parsedInvoiceSchema.safeParse(invRaw.parsed_data);
  if (!parsedStored.success) {
    return { error: "Zapis faktury jest uszkodzony — wgraj ponownie PDF" };
  }

  let xml: string;
  try {
    xml = buildFa3XmlFromParsedInvoice(parsedStored.data, xmlOptions);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }

  try {
    const result = await sendInvoiceToKsefWithToken({
      contextNip: prof.data.nip!,
      ksefToken: ksefTokenForProfile(prof.data)!,
      invoiceXml: xml,
      ksefEnvironment: resolveKsefEnvironment(prof.data.ksef_environment),
    });
    const ksefRef =
      result.invoiceKsefNumber ?? result.invoiceReferenceNumber ?? null;

    await supabase
      .from("invoices")
      .update({
        status: "success",
        ksef_reference: ksefRef,
        error_message: null,
        xml_content: xml,
      })
      .eq("id", idParsed.data)
      .eq("user_id", user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Invoice send: KSeF failed", {
      scope: "invoice.send",
      invoiceId: idParsed.data,
      errorMessage: msg,
      xmlLength: xml.length,
      xmlHead: xml.slice(0, 2000),
    });
    await supabase
      .from("invoices")
      .update({
        status: "error",
        error_message: msg,
      })
      .eq("id", idParsed.data)
      .eq("user_id", user.id);
    return { error: msg };
  }

  revalidatePath(`/invoices/${idParsed.data}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
