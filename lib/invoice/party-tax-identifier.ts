export const PARTY_IDENTIFIER_TYPES = [
  "nip",
  "vat_ue",
  "other",
  "none",
] as const;

export type PartyIdentifierType = (typeof PARTY_IDENTIFIER_TYPES)[number];

export type PartyTaxIdentifierFields = {
  /** Legacy field retained so invoices parsed before this change remain readable. */
  nip: string;
  identifierType?: PartyIdentifierType;
  identifierValue?: string;
  identifierCountryCode?: string;
};

export type ResolvedPartyTaxIdentifier = {
  type: PartyIdentifierType;
  value: string;
  countryCode?: string;
};

function normalizeCountryCode(value?: string): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

export function resolvePartyTaxIdentifier(
  party: PartyTaxIdentifierFields,
): ResolvedPartyTaxIdentifier {
  const type = party.identifierType ?? "nip";
  if (type === "none") return { type, value: "" };

  const legacyNip = party.nip.replace(/\D/g, "");
  const value = (party.identifierValue ?? (type === "nip" ? legacyNip : ""))
    .trim()
    .toUpperCase();

  return {
    type,
    value,
    countryCode: normalizeCountryCode(party.identifierCountryCode),
  };
}

export function taxIdentifierFields(
  type: PartyIdentifierType,
  value = "",
  countryCode?: string,
): PartyTaxIdentifierFields {
  const normalizedValue = value.trim().toUpperCase();
  return {
    nip: type === "nip" ? normalizedValue.replace(/\D/g, "").slice(0, 10) : "",
    identifierType: type,
    identifierValue: type === "none" ? "" : normalizedValue,
    identifierCountryCode: normalizeCountryCode(countryCode),
  };
}

export function partyTaxIdentifierLabel(
  party: PartyTaxIdentifierFields,
): string {
  const identifier = resolvePartyTaxIdentifier(party);
  if (identifier.type === "none") return "Brak identyfikatora";
  if (identifier.type === "vat_ue") {
    return `VAT UE ${identifier.countryCode ?? ""}${identifier.value}`.trim();
  }
  if (identifier.type === "other") {
    return `ID podatkowy ${identifier.countryCode ? `${identifier.countryCode} ` : ""}${identifier.value}`.trim();
  }
  return `NIP ${identifier.value}`;
}
