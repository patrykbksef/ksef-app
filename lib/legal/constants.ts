/** Bump when Regulamin / Polityka / DPA content changes — forces re-acceptance. */
export const LEGAL_DOCS_VERSION = "2026-07-22-v2";

export const SERVICE_PROVIDER = {
  productName: "KSeF — faktury",
  fullName: "Patryk Budnicki",
  companyName: "PATRYK BUDNICKI FRUITAGE CLTH",
  nip: "9552540785",
  regon: "386020992",
  address:
    "ul. Ks. bpa Władysława Bandurskiego 70/11, 71-685 Szczecin",
  email: "p.budnicki95@gmail.com",
} as const;

export const LEGAL_DOC_SLUGS = [
  "regulamin",
  "polityka-prywatnosci",
  "umowa-powierzenia",
] as const;

export type LegalDocSlug = (typeof LEGAL_DOC_SLUGS)[number];

export const LEGAL_DOC_META: Record<
  LegalDocSlug,
  { title: string; file: string }
> = {
  regulamin: {
    title: "Regulamin świadczenia usług drogą elektroniczną",
    file: "regulamin.md",
  },
  "polityka-prywatnosci": {
    title: "Polityka prywatności",
    file: "polityka-prywatnosci.md",
  },
  "umowa-powierzenia": {
    title: "Umowa powierzenia przetwarzania danych osobowych",
    file: "umowa-powierzenia.md",
  },
};
