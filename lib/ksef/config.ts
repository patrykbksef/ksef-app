/** KSeF REST API 2.0 base paths (MF addressing). */

export type KsefEnvironment = "demo" | "production";

export const KSEF_API_BASE: Record<KsefEnvironment, string> = {
  demo: "https://api-demo.ksef.mf.gov.pl/v2",
  production: "https://api.ksef.mf.gov.pl/v2",
};

/** Web apps for obtaining tokens / managing certificates (user-facing links). */
export const KSEF_WEB_APP_URL: Record<KsefEnvironment, string> = {
  demo: "https://ap-demo.ksef.mf.gov.pl",
  production: "https://ap.ksef.mf.gov.pl",
};

export function ksefApiBaseUrl(env: KsefEnvironment): string {
  return KSEF_API_BASE[env];
}

export function resolveKsefEnvironment(value: unknown): KsefEnvironment {
  return value === "production" ? "production" : "demo";
}
