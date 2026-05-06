import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFa3XmlFromParsedInvoice } from "../lib/invoice/xml-builder";
import { extractTextFromPdfBuffer } from "../lib/invoice/pdf-text";
import {
  extractInvoiceNumber,
  parseInterRiskInvoiceText,
} from "../lib/invoice/parser";
import { findRemarksTokenByPrefix } from "../lib/invoice/remarks-lookup-from-pdf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pdfPath = path.join(__dirname, "..", "invoice-example.pdf");

function assertInvoiceNumberSnippets() {
  const a = extractInvoiceNumber("FAKTURA VAT NR 12/ABC/2024\nfoo");
  if (a !== "12/ABC/2024") {
    console.error("extractInvoiceNumber FAKTURA VAT NR:", a);
    process.exit(1);
  }
  const b = extractInvoiceNumber("Faktura nr 138/2026\nSprzedawca");
  if (b !== "138/2026") {
    console.error("extractInvoiceNumber Faktura nr:", b);
    process.exit(1);
  }
  console.log("OK extractInvoiceNumber snippets");
}

function assertRemarksLookupSnippets() {
  const t = findRemarksTokenByPrefix(
    "foo GAP_2026/WNR/355677/1 bar",
    "GAP_",
  );
  if (t !== "GAP_2026/WNR/355677/1") {
    console.error("findRemarksTokenByPrefix GAP_:", t);
    process.exit(1);
  }
  if (findRemarksTokenByPrefix("no match", "GAP_") !== null) {
    console.error("findRemarksTokenByPrefix expected null");
    process.exit(1);
  }
  console.log("OK findRemarksTokenByPrefix snippets");
}

async function main() {
  assertInvoiceNumberSnippets();
  assertRemarksLookupSnippets();

  if (fs.existsSync(pdfPath)) {
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
  } else {
    console.log("Skip invoice-example.pdf (file not present)");
  }

  const europPath = path.join(__dirname, "..", "examples", "1.pdf");
  if (fs.existsSync(europPath)) {
    const eb = fs.readFileSync(europPath);
    const eab = eb.buffer.slice(eb.byteOffset, eb.byteOffset + eb.byteLength);
    const etext = await extractTextFromPdfBuffer(eab as ArrayBuffer);
    const europ = parseInterRiskInvoiceText(etext, {
      issuerName: "MAR-SAT Szmuc Marcin",
    });
    if (europ.invoiceNumber !== "138/2026" || europ.lineItems.length !== 3) {
      console.error("Europ Assistance PDF parse:", {
        invoiceNumber: europ.invoiceNumber,
        lineItems: europ.lineItems.length,
      });
      process.exit(1);
    }
    if (europ.seller.name !== "MAR-SAT Szmuc Marcin") {
      console.error("Europ PDF seller.name expected profile issuer, got:", europ.seller.name);
      process.exit(1);
    }
    if (!europ.buyer.name.toLowerCase().includes("europ assistance")) {
      console.error("Europ PDF buyer.name expected Europ Assistance…, got:", europ.buyer.name);
      process.exit(1);
    }
    console.log("OK examples/1.pdf (Europ Assistance) lineItems:", europ.lineItems.length);
  }

  const diffDatesPath = path.join(__dirname, "..", "examples", "invoice-different-dates.pdf");
  if (fs.existsSync(diffDatesPath)) {
    const db = fs.readFileSync(diffDatesPath);
    const dab = db.buffer.slice(db.byteOffset, db.byteOffset + db.byteLength);
    const dtext = await extractTextFromPdfBuffer(dab as ArrayBuffer);
    const diffDates = parseInterRiskInvoiceText(dtext);
    if (diffDates.issueDate === diffDates.saleDate) {
      console.error(
        "invoice-different-dates.pdf: issueDate and saleDate must differ, got:",
        diffDates.issueDate,
        diffDates.saleDate,
      );
      process.exit(1);
    }
    if (diffDates.issueDate !== "2026-04-23") {
      console.error("invoice-different-dates.pdf: unexpected issueDate:", diffDates.issueDate);
      process.exit(1);
    }
    console.log(
      "OK examples/invoice-different-dates.pdf issueDate:",
      diffDates.issueDate,
      "saleDate:",
      diffDates.saleDate,
    );
  }

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
