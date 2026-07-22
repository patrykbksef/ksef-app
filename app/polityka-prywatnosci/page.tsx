import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { LEGAL_DOC_META } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: `${LEGAL_DOC_META["polityka-prywatnosci"].title} | KSeF — faktury`,
};

export default function PolitykaPrywatnosciPage() {
  return <LegalDocumentPage slug="polityka-prywatnosci" />;
}
