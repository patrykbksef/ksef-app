/** Etykiety statusów faktury w UI (wartość w bazie bez zmian). */
export const invoiceStatusPl: Record<string, string> = {
  parsed: "Sparsowana",
  pending_review: "Do weryfikacji",
  sent: "Wysłana",
  success: "Przyjęta w KSeF",
  error: "Błąd",
};

export function invoiceStatusLabel(status: string): string {
  return invoiceStatusPl[status] ?? status;
}
