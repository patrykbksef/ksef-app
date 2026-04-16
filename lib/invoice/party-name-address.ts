export function looksLikePolishAddressStart(line: string): boolean {
  const s = (line ?? "").trim();
  if (!s) return false;

  // Polish postal code: 00-000
  if (/^\d{2}-\d{3}\b/.test(s)) return true;

  // Common street/location prefixes. Keep conservative to avoid false positives on names.
  return /^(?:ul\.|al\.|pl\.|os\.|bulw\.|rondo|ulica|aleje|plac|osiedle|bulwar|skwer|trakt|droga|rynek)\s+/i.test(
    s,
  );
}

export function mergeLeadingNameLinesFromAddress<
  T extends { name: string; addressLines: string[] },
>(input: T): T {
  let name = (input.name ?? "").trim();
  const addressLines = (input.addressLines ?? [])
    .map((l) => (l ?? "").trim())
    .filter(Boolean);

  while (addressLines.length > 0 && !looksLikePolishAddressStart(addressLines[0]!)) {
    const shifted = addressLines.shift()!;
    name = name ? `${name} ${shifted}` : shifted;
  }

  return { ...input, name, addressLines };
}

