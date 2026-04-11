import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFa3XmlFromParsedInvoice } from "../lib/invoice/xml-builder";
import { extractTextFromPdfBuffer } from "../lib/invoice/pdf-text";
import { parseInterRiskInvoiceText } from "../lib/invoice/parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pdfPath = path.join(__dirname, "..", "invoice-example.pdf");
async function main() {
  const buf = fs.readFileSync(pdfPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const text = await extractTextFromPdfBuffer(ab as ArrayBuffer);
  const parsed = parseInterRiskInvoiceText(text);
  console.log("lineItemCount:", parsed.lineItems.length);
  if (parsed.lineItems.length !== 8) {
    process.exit(1);
  }

  const fakeIssuer = {
    issuerNip: "9552540785",
    issuerName: "Test Issuer Sp. z o.o.",
    issuerAddressLine1: "ul. Przykładowa 1",
    issuerAddressLine2: "00-001 Warszawa",
  };
  const xml = buildFa3XmlFromParsedInvoice(parsed, fakeIssuer);
  const podmiot1Nip = xml.match(
    /<Podmiot1>[\s\S]*?<NIP>(\d{10})<\/NIP>/,
  )?.[1];
  if (podmiot1Nip !== fakeIssuer.issuerNip) {
    console.error("Podmiot1 NIP expected profile-style issuer, got:", podmiot1Nip);
    process.exit(1);
  }
  if (podmiot1Nip === parsed.seller.nip) {
    console.error("Podmiot1 must not use PDF seller NIP");
    process.exit(1);
  }
  console.log("FA(3) Podmiot1 NIP matches issuer options (not PDF seller).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
