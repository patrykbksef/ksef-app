import { LEGAL_DOCS_VERSION } from "@/lib/legal/constants";

export type LegalAcceptanceFields = {
  terms_accepted_at: string | null;
  privacy_accepted_at: string | null;
  dpa_accepted_at: string | null;
  legal_docs_version: string | null;
};

export function hasAcceptedCurrentLegalDocs(
  profile: LegalAcceptanceFields | null | undefined,
): boolean {
  if (!profile) return false;
  return (
    profile.legal_docs_version === LEGAL_DOCS_VERSION &&
    Boolean(profile.terms_accepted_at) &&
    Boolean(profile.privacy_accepted_at) &&
    Boolean(profile.dpa_accepted_at)
  );
}
