"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildFa3XmlFromParsedInvoice,
  buildFa3XmlOptionsFromProfile,
} from "@/lib/invoice/xml-builder";
import { parseInterRiskInvoiceText } from "@/lib/invoice/parser";
import { extractTextFromPdfBuffer } from "@/lib/invoice/pdf-text";
import { sendInvoiceToKsefWithToken } from "@/lib/ksef/client";
import {
  fileUploadSchema,
  parsedInvoiceSchema,
} from "@/lib/validations/invoice";
import { z } from "zod";
import { profileRowSchema } from "@/lib/validations/profile";

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
        "Uzupełnij w Ustawieniach: NIP, token KSeF, nazwę sprzedawcy i pierwszą linię adresu",
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
    parsedInvoice = parseInterRiskInvoiceText(text);
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
        ksefToken: profile.ksef_token!,
        invoiceXml: xml,
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
        "Uzupełnij w Ustawieniach: NIP, token KSeF, nazwę sprzedawcy i pierwszą linię adresu",
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
      ksefToken: prof.data.ksef_token!,
      invoiceXml: xml,
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
