"use server";

import { z } from "zod";
import { MASKED_TOKEN } from "@/lib/encryption";
import {
  KsefConnectionTestError,
  testKsefInvoiceWriteAccess,
} from "@/lib/ksef/client";
import { createClient } from "@/lib/supabase/server";
import {
  ksefEnvironmentSchema,
  ksefTokenForProfile,
  nipSchema,
  profileRowSchema,
} from "@/lib/validations/profile";

const connectionTestSchema = z.object({
  nip: nipSchema,
  ksef_environment: ksefEnvironmentSchema,
  ksef_token: z
    .string()
    .trim()
    .min(1, "Podaj token KSeF dla wybranego środowiska")
    .max(8192, "Token jest zbyt długi"),
});

export type KsefConnectionTestActionState = {
  ok: boolean;
  message: string;
};

function invalidConnectionMessage(
  environment: z.infer<typeof ksefEnvironmentSchema>,
) {
  if (environment === "production") {
    return "KSeF nie potwierdził połączenia. Sprawdź NIP i token oraz upewnij się, że token został wygenerowany w środowisku produkcyjnym (PRD), a nie demonstracyjnym (DEMO) ani testowym (TEST).";
  }

  return "KSeF nie potwierdził połączenia. Sprawdź NIP i token oraz upewnij się, że token został wygenerowany w środowisku demonstracyjnym (DEMO), a nie produkcyjnym (PRD) ani testowym (TEST).";
}

export async function testKsefConnection(
  formData: FormData,
): Promise<KsefConnectionTestActionState> {
  const parsed = connectionTestSchema.safeParse({
    nip: String(formData.get("nip") ?? ""),
    ksef_environment: String(formData.get("ksef_environment") ?? ""),
    ksef_token: String(formData.get("ksef_token") ?? ""),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane połączenia",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Brak sesji — zaloguj się ponownie" };
  }

  let ksefToken = parsed.data.ksef_token;
  if (ksefToken === MASKED_TOKEN) {
    const { data: rawProfile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !rawProfile) {
      return {
        ok: false,
        message: "Nie udało się odczytać zapisanego tokenu. Wprowadź token ponownie.",
      };
    }

    const profile = profileRowSchema.safeParse(rawProfile);
    if (!profile.success) {
      return {
        ok: false,
        message: "Zapisany profil ma nieprawidłowy format. Wprowadź token ponownie.",
      };
    }

    try {
      ksefToken = ksefTokenForProfile({
        ...profile.data,
        ksef_environment: parsed.data.ksef_environment,
      }) ?? "";
    } catch {
      return {
        ok: false,
        message: "Nie udało się odczytać zapisanego tokenu. Wprowadź token ponownie.",
      };
    }

    if (!ksefToken) {
      return {
        ok: false,
        message: "Brak zapisanego tokenu dla wybranego środowiska KSeF.",
      };
    }
  }

  try {
    await testKsefInvoiceWriteAccess({
      contextNip: parsed.data.nip,
      ksefToken,
      ksefEnvironment: parsed.data.ksef_environment,
    });

    const environmentLabel =
      parsed.data.ksef_environment === "production" ? "produkcyjnym" : "demonstracyjnym";
    return {
      ok: true,
      message: `Połączenie działa. Token pasuje do NIP-u i pozwala wysyłać faktury w środowisku ${environmentLabel}.`,
    };
  } catch (error) {
    if (error instanceof KsefConnectionTestError) {
      if (error.code === "AUTHENTICATION_FAILED") {
        return {
          ok: false,
          message: invalidConnectionMessage(parsed.data.ksef_environment),
        };
      }
      if (error.code === "INVOICE_WRITE_MISSING") {
        return {
          ok: false,
          message:
            "Token pasuje do NIP-u, ale nie ma uprawnienia do wystawiania faktur (InvoiceWrite).",
        };
      }
    }

    console.error("[KSeF connection test] service failure", {
      scope: "ksef.connection-test",
      environment: parsed.data.ksef_environment,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      ok: false,
      message: invalidConnectionMessage(parsed.data.ksef_environment),
    };
  }
}
