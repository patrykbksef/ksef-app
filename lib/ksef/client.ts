import { createCipheriv, createHash, constants, publicEncrypt, randomBytes } from "node:crypto";
import { z } from "zod";
import { type KsefEnvironment, ksefApiBaseUrl } from "@/lib/ksef/config";
import { ksefSendResultSchema, type KsefSendResult } from "@/lib/validations/invoice";
function pemFromBase64Cert(base64Cert: string): string {
  const clean = base64Cert.replace(/\s/g, "");
  return `-----BEGIN CERTIFICATE-----\n${clean}\n-----END CERTIFICATE-----`;
}

function sha256Base64Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("base64");
}

type PublicCert = {
  certificate: string;
  usage: string[];
  validFrom: string;
  validTo: string;
};

function pickCert(certs: PublicCert[], usage: "KsefTokenEncryption" | "SymmetricKeyEncryption"): PublicCert {
  const now = Date.now();
  const found = certs.filter((c) => {
    const ok =
      c.usage?.includes(usage) && new Date(c.validFrom).getTime() <= now && new Date(c.validTo).getTime() >= now;
    return ok;
  });
  found.sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime());
  const c = found[0];
  if (!c) throw new Error(`No valid public certificate for ${usage}`);
  return c;
}

async function ksefJson<T>(baseUrl: string, path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 60000, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...rest.headers,
      },
    });
    const text = await res.text();
    let data: unknown = {};
    if (text) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = { raw: text };
      }
    }
    if (!res.ok) {
      console.error("[KSeF HTTP] error response", {
        scope: "ksef.http",
        path,
        status: res.status,
        bodyPreview: text.slice(0, 4000),
        parsed: typeof data === "object" ? data : undefined,
      });
      const err = new Error(
        `KSeF HTTP ${res.status}: ${typeof data === "object" && data && "exception" in data ? JSON.stringify((data as { exception?: unknown }).exception) : text.slice(0, 500)}`,
      );
      throw err;
    }
    return data as T;
  } finally {
    clearTimeout(t);
  }
}

function encryptKsefTokenPayload(plaintext: string, certBase64: string): string {
  const pem = pemFromBase64Cert(certBase64);
  const encrypted = publicEncrypt(
    {
      key: pem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(plaintext, "utf8"),
  );
  return encrypted.toString("base64");
}

function encryptInvoicePayload(invoiceXml: string, symmetricKey: Buffer, iv: Buffer) {
  const xmlBuffer = Buffer.from(invoiceXml, "utf8");
  const cipher = createCipheriv("aes-256-cbc", symmetricKey, iv);
  const encrypted = Buffer.concat([cipher.update(xmlBuffer), cipher.final()]);
  return {
    invoiceHash: sha256Base64Buffer(xmlBuffer),
    invoiceSize: xmlBuffer.length,
    encryptedContent: encrypted.toString("base64"),
    encryptedHash: sha256Base64Buffer(encrypted),
    encryptedSize: encrypted.length,
  };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

type ChallengeRes = {
  challenge: string;
  timestampMs?: number;
  timestamp?: string;
};

type AuthInitRes = {
  referenceNumber: string;
  authenticationToken: { token: string };
};

type AuthStatusRes = {
  status?: { code?: number; description?: string };
  processingCode?: number;
  exception?: { serviceMessage?: string };
  upo?: unknown;
  elementReferenceNumber?: string;
};

type RedeemRes = {
  accessToken: { token: string };
};

/**
 * Authenticate with KSeF API 2.0 using a KSeF token + NIP.
 * @param baseUrl e.g. from {@link ksefApiBaseUrl}
 */
export async function authenticateWithKsefToken(nip: string, ksefToken: string, baseUrl: string): Promise<string> {
  const publicCerts = await ksefJson<PublicCert[]>(baseUrl, "/security/public-key-certificates", {
    method: "GET",
  });
  const tokenCert = pickCert(publicCerts, "KsefTokenEncryption");

  const challengeRes = await ksefJson<ChallengeRes>(baseUrl, "/auth/challenge", {
    method: "POST",
  });

  const timestampMs =
    challengeRes.timestampMs ?? (challengeRes.timestamp ? new Date(challengeRes.timestamp).getTime() : Date.now());

  const plaintext = `${ksefToken}|${timestampMs}`;
  const encryptedToken = encryptKsefTokenPayload(plaintext, tokenCert.certificate);

  const init = await ksefJson<AuthInitRes>(baseUrl, "/auth/ksef-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challenge: challengeRes.challenge,
      contextIdentifier: { type: "Nip", value: nip },
      encryptedToken,
    }),
  });

  const ref = init.referenceNumber;
  const bearer = init.authenticationToken.token;

  const deadline = Date.now() + 45_000;
  let last: AuthStatusRes | null = null;
  while (Date.now() < deadline) {
    last = await ksefJson<AuthStatusRes>(baseUrl, `/auth/${encodeURIComponent(ref)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${bearer}` },
    });
    const code = last.status?.code ?? last.processingCode;
    if (code === 200 || last.upo !== undefined || last.elementReferenceNumber !== undefined) {
      break;
    }
    if (code !== undefined && code >= 400) {
      throw new Error(last.exception?.serviceMessage ?? last.status?.description ?? `Auth failed (${code})`);
    }
    await sleep(1200);
  }

  const redeem = await ksefJson<RedeemRes>(baseUrl, "/auth/token/redeem", {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}` },
  });

  return redeem.accessToken.token;
}

/**
 * Send FA(3) invoice XML to KSeF using token authentication (demo or production API).
 */
export async function sendInvoiceToKsefWithToken(options: {
  contextNip: string;
  ksefToken: string;
  invoiceXml: string;
  ksefEnvironment: KsefEnvironment;
}): Promise<KsefSendResult> {
  const baseUrl = ksefApiBaseUrl(options.ksefEnvironment);

  const accessToken = await authenticateWithKsefToken(options.contextNip, options.ksefToken, baseUrl);

  const publicCerts = await ksefJson<PublicCert[]>(baseUrl, "/security/public-key-certificates", {
    method: "GET",
  });
  const symCert = pickCert(publicCerts, "SymmetricKeyEncryption");
  const symmetricKey = randomBytes(32);
  const iv = randomBytes(16);
  const encryptedSymmetricKey = publicEncrypt(
    {
      key: pemFromBase64Cert(symCert.certificate),
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    symmetricKey,
  );

  const sessionOpen = await ksefJson<{ referenceNumber: string }>(baseUrl, "/sessions/online", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      formCode: {
        systemCode: "FA (3)",
        schemaVersion: "1-0E",
        value: "FA",
      },
      encryption: {
        encryptedSymmetricKey: encryptedSymmetricKey.toString("base64"),
        initializationVector: iv.toString("base64"),
      },
    }),
  });

  const sessionRef = sessionOpen.referenceNumber;
  const enc = encryptInvoicePayload(options.invoiceXml, symmetricKey, iv);

  const invoiceSend = await ksefJson<{ referenceNumber: string }>(
    baseUrl,
    `/sessions/online/${encodeURIComponent(sessionRef)}/invoices`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        invoiceHash: enc.invoiceHash,
        invoiceSize: enc.invoiceSize,
        encryptedInvoiceHash: enc.encryptedHash,
        encryptedInvoiceSize: enc.encryptedSize,
        encryptedInvoiceContent: enc.encryptedContent,
        offlineMode: false,
      }),
    },
  );

  const invoiceRef = invoiceSend.referenceNumber;

  try {
    await ksefJson(baseUrl, `/sessions/online/${encodeURIComponent(sessionRef)}/close`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    /* best-effort */
  }

  for (let i = 0; i < 8; i++) {
    const st = await ksefJson<{
      status?: { code?: number; description?: string };
      invoiceCount?: number;
      successfulInvoiceCount?: number;
    }>(baseUrl, `/sessions/${encodeURIComponent(sessionRef)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const code = st.status?.code;
    if (code === 200 || (st.invoiceCount && (st.successfulInvoiceCount ?? 0) > 0)) {
      break;
    }
    if (code !== undefined && code >= 400) {
      console.error("[KSeF send] session status failure", {
        scope: "ksef.send",
        sessionRef,
        attempt: i,
        sessionStatus: st,
      });
      throw new Error(st.status?.description ?? `Session error ${code}`);
    }
    await sleep(3000);
  }

  let ksefNumber: string | null = null;
  for (let i = 0; i < 8; i++) {
    const meta = await ksefJson<{
      invoices?: Array<{ ksefNumber?: string; status?: { code?: number } }>;
    }>(baseUrl, `/sessions/${encodeURIComponent(sessionRef)}/invoices?pageSize=10`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const inv = meta.invoices?.[0];
    if (inv?.ksefNumber) {
      ksefNumber = inv.ksefNumber;
      break;
    }
    await sleep(3000);
  }

  const raw: KsefSendResult = {
    status: 200,
    invoiceKsefNumber: ksefNumber,
    invoiceReferenceNumber: invoiceRef,
    sessionReferenceNumber: sessionRef,
    invoiceHash: enc.invoiceHash,
    invoiceSize: enc.invoiceSize,
  };

  const parsed = ksefSendResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`KSeF result validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** First page of POST /invoices/query/metadata (same contract as ksef-lite). */
type InvoiceMetadataApiResponse = {
  invoices?: Array<Record<string, unknown>>;
  hasMore?: boolean;
  isTruncated?: boolean;
  permanentStorageHwmDate?: string;
};

/** Fields used by „Ostatnie faktury w KSEF” on the dashboard. */
export type KsefInvoiceListRow = {
  ksefNumber: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  invoicingDate: string | null;
  buyerIdentifier: string | null;
};

function pickStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return null;
}

/** KSeF metadata often nests buyer id as `buyer.identifier.value`. */
function buyerIdentifierFromMetadataRow(row: Record<string, unknown>): string | null {
  const buyer = row.buyer;
  if (buyer && typeof buyer === "object") {
    const id = (buyer as Record<string, unknown>).identifier;
    if (id && typeof id === "object") {
      const value = (id as Record<string, unknown>).value;
      if (value != null && String(value).trim() !== "") return String(value).trim();
    }
  }
  return pickStr(row, ["buyerNip", "buyerIdentifier", "counterpartyIdentifier", "counterpartyNip"]);
}

const ksefMetadataInvoiceRowSchema = z
  .object({})
  .catchall(z.unknown())
  .transform((row): KsefInvoiceListRow | null => {
    const r = row as Record<string, unknown>;
    const ksefNumber = pickStr(r, ["ksefNumber", "ksefReferenceNumber"]);
    if (!ksefNumber) return null;
    return {
      ksefNumber,
      invoiceNumber: pickStr(r, ["invoiceNumber", "invoiceNo", "number"]),
      issueDate: pickStr(r, ["issueDate", "invoiceIssueDate", "issueDateTime"]),
      invoicingDate: pickStr(r, ["invoicingDate", "acquisitionDate"]),
      buyerIdentifier: buyerIdentifierFromMetadataRow(r),
    };
  });

const RECENT_INVOICES_PAGE_SIZE = 20;
const RECENT_INVOICES_LOOKBACK_DAYS = 90;

/**
 * Recent invoices from KSeF (metadata query), newest first. Uses token auth + selected API base.
 * Subject1 = context NIP as seller (issued invoices).
 */
export async function queryRecentKsefInvoicesMetadata(options: {
  nip: string;
  ksefToken: string;
  ksefEnvironment: KsefEnvironment;
}): Promise<{ invoices: KsefInvoiceListRow[]; hasMore: boolean }> {
  const baseUrl = ksefApiBaseUrl(options.ksefEnvironment);
  const accessToken = await authenticateWithKsefToken(options.nip, options.ksefToken, baseUrl);
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - RECENT_INVOICES_LOOKBACK_DAYS);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const qs = new URLSearchParams({
    sortOrder: "Desc",
    pageOffset: "0",
    pageSize: String(RECENT_INVOICES_PAGE_SIZE),
  });
  const path = `/invoices/query/metadata?${qs.toString()}`;
  const body = {
    subjectType: "Subject1",
    dateRange: {
      dateType: "PermanentStorage",
      from: fromIso,
      to: toIso,
    },
  };

  const res = await ksefJson<InvoiceMetadataApiResponse>(baseUrl, path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    timeoutMs: 90_000,
  });

  const raw = res.invoices ?? [];
  const invoices: KsefInvoiceListRow[] = [];
  for (const item of raw) {
    const parsed = ksefMetadataInvoiceRowSchema.safeParse(item);
    if (parsed.success && parsed.data) invoices.push(parsed.data);
  }

  return { invoices, hasMore: Boolean(res.hasMore) };
}
