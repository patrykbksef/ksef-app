import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { LEGAL_DOC_META } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: `${LEGAL_DOC_META["umowa-powierzenia"].title} | KSeF — faktury`,
};

export default function UmowaPowierzeniaPage() {
  return <LegalDocumentPage slug="umowa-powierzenia" />;
}
