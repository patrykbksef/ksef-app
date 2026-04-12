/** Shared TanStack Query keys — avoid magic strings across the app. */

export const ksefQueryKeys = {
  /** Dashboard + API: GET /api/ksef/invoices/recent */
  recentInvoices: ["ksef", "invoices", "recent"] as const,
};
