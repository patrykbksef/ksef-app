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

  const podmiot2Nip = xml.match(
    /<Podmiot2>[\s\S]*?<NIP>(\d{10})<\/NIP>/,
  )?.[1];
  if (podmiot2Nip !== parsed.seller.nip) {
    console.error(
      "Podmiot2 NIP expected parsed.seller.nip (PDF issuer), got:",
      podmiot2Nip,
      "expected:",
      parsed.seller.nip,
    );
    process.exit(1);
  }
  if (podmiot2Nip === parsed.buyer.nip) {
    console.error("Podmiot2 must not use PDF buyer (second NIP block) NIP");
    process.exit(1);
  }
  console.log("FA(3) Podmiot2 NIP matches PDF seller (first NIP block).");

  const extraPdfs = [
    path.join(__dirname, "..", "invoice-example2.pdf"),
    path.join(
      __dirname,
      "..",
      "examples",
      "invoice-04-03-2026-16-42-2026-03-04-16_42_53.pdf",
    ),
  ];
  for (const p of extraPdfs) {
    if (!fs.existsSync(p)) continue;
    const b = fs.readFileSync(p);
    const ab2 = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    const t = await extractTextFromPdfBuffer(ab2 as ArrayBuffer);
    const parsed2 = parseInterRiskInvoiceText(t);
    if (parsed2.lineItems.length < 1) {
      console.error("Expected line items for", p);
      process.exit(1);
    }
    if (!/^\d{10}$/.test(parsed2.seller.nip) || !/^\d{10}$/.test(parsed2.buyer.nip)) {
      console.error("Expected seller/buyer NIP for", p);
      process.exit(1);
    }
    console.log("OK parse:", path.basename(p), "lineItems:", parsed2.lineItems.length);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
