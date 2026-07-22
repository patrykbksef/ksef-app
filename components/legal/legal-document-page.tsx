import Link from "next/link";
import { LEGAL_DOC_META, type LegalDocSlug } from "@/lib/legal/constants";
import { loadLegalDocumentHtml } from "@/lib/legal/render";

export async function LegalDocumentPage({ slug }: { slug: LegalDocSlug }) {
  const html = await loadLegalDocumentHtml(slug);
  const title = LEGAL_DOC_META[slug].title;

  return (
    <div className="bg-background min-h-svh">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <p className="text-muted-foreground mb-6 text-sm">
          <Link href="/login" className="underline underline-offset-2">
            Wróć do logowania
          </Link>
        </p>
        <article
          className="prose-legal"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <p className="text-muted-foreground mt-10 text-sm">
          {title} — KSeF — faktury
        </p>
      </div>
    </div>
  );
}
