import { NextResponse } from "next/server";
import { queryRecentKsefInvoicesMetadata } from "@/lib/ksef/client";
import { createClient } from "@/lib/supabase/server";
import {
  profileReadyForKsefXml,
  profileRowSchema,
} from "@/lib/validations/profile";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  }

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const parsed = profileRaw
    ? profileRowSchema.safeParse(profileRaw)
    : null;
  const p = parsed?.success ? parsed.data : null;

  if (!p || !profileReadyForKsefXml(p)) {
    return NextResponse.json(
      { error: "Uzupełnij profil (NIP, token KSeF, dane sprzedawcy)" },
      { status: 403 },
    );
  }

  try {
    const { invoices, hasMore } = await queryRecentKsefInvoicesMetadata({
      nip: p.nip!,
      ksefToken: p.ksef_token!,
    });
    return NextResponse.json({ invoices, hasMore });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Błąd zapytania do KSeF";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
