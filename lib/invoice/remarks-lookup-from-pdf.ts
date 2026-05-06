import type { ParsedInvoice } from "@/lib/validations/invoice";

/** Same key as „Tekst prefiksu” on the invoice edit page (localStorage). */
export const REMARKS_PREFIX_TEXT_LS_KEY = "ksef-invoice-remarks-prefix-text";

/** FormData field sent with PDF upload so the server can scan extracted text. */
export const REMARKS_LOOKUP_PREFIX_FORM_FIELD = "remarks_lookup_prefix";

const MAX_PREFIX_LEN = 64;
const MAX_TOKEN_LEN = 500;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * First token in `fullText` starting with `prefix`, then letters/digits/slashes/dots/hyphens.
 * Example: prefix `GAP_` matches `GAP_2026/WNR/355677/1`.
 */
export function findRemarksTokenByPrefix(
  fullText: string,
  prefix: string,
): string | null {
  const p = prefix.trim();
  if (!p || !fullText) return null;
  const re = new RegExp(`${escapeRegExp(p)}([A-Za-z0-9_/.\-]+)`);
  const m = fullText.match(re);
  if (!m?.[0]) return null;
  const token = m[0].trim();
  if (token.length <= p.length) return null;
  return token.length > MAX_TOKEN_LEN ? token.slice(0, MAX_TOKEN_LEN) : token;
}

/** Read optional upload-time prefix from FormData (non-empty, length-capped). */
export function parseRemarksLookupPrefixFromFormData(
  formData: FormData,
): string | null {
  const raw = formData.get(REMARKS_LOOKUP_PREFIX_FORM_FIELD);
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, MAX_PREFIX_LEN);
  if (!t) return null;
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t)) return null;
  return t;
}

/** If `parsed.remarks` is empty and a token is found, set `remarks` to the token. */
export function mergeRemarksFromPdfLookup(
  parsed: ParsedInvoice,
  pdfText: string,
  prefix: string | null,
): ParsedInvoice {
  if (!prefix || parsed.remarks?.trim()) return parsed;
  const token = findRemarksTokenByPrefix(pdfText, prefix);
  if (!token) return parsed;
  return { ...parsed, remarks: token };
}
