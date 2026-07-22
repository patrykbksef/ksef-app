import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  LEGAL_DOC_META,
  LEGAL_DOCS_VERSION,
  type LegalDocSlug,
} from "@/lib/legal/constants";
import { getAppUrl } from "@/lib/validations/env";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineFormat(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code class=\"rounded bg-muted px-1 py-0.5 text-sm\">$1</code>");
}

/** Minimal markdown → HTML for legal docs (headings, lists, paragraphs, tables, hr). */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  let inUl = false;
  let inTable = false;

  const closeUl = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
  };
  const closeTable = () => {
    if (inTable) {
      html.push("</tbody></table>");
      inTable = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      closeUl();
      closeTable();
      i += 1;
      continue;
    }

    if (trimmed === "---") {
      closeUl();
      closeTable();
      html.push('<hr class="my-8 border-border" />');
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      closeUl();
      closeTable();
      const level = heading[1]!.length;
      const cls =
        level === 1
          ? "text-2xl font-semibold tracking-tight"
          : level === 2
            ? "mt-8 text-xl font-semibold"
            : "mt-6 text-lg font-semibold";
      html.push(`<h${level} class="${cls}">${inlineFormat(heading[2]!)}</h${level}>`);
      i += 1;
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      closeUl();
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      const next = (lines[i + 1] ?? "").trim();
      const isSeparator =
        next.startsWith("|") && /^\|?[\s|:-]+$/.test(next.replaceAll("|", "|"));

      if (!inTable) {
        html.push(
          '<table class="my-4 w-full border-collapse text-sm"><thead>',
        );
        html.push(
          "<tr>" +
            cells
              .map(
                (c) =>
                  `<th class="border border-border bg-muted/50 px-3 py-2 text-left font-medium">${inlineFormat(c)}</th>`,
              )
              .join("") +
            "</tr></thead><tbody>",
        );
        inTable = true;
        i += isSeparator ? 2 : 1;
        continue;
      }

      if (/^[\s|:-]+$/.test(trimmed.replaceAll("|", "|")) || cells.every((c) => /^:?-+:?$/.test(c))) {
        i += 1;
        continue;
      }

      html.push(
        "<tr>" +
          cells
            .map(
              (c) =>
                `<td class="border border-border px-3 py-2 align-top">${inlineFormat(c)}</td>`,
            )
            .join("") +
          "</tr>",
      );
      i += 1;
      continue;
    }

    closeTable();

    if (trimmed.startsWith("- ")) {
      if (!inUl) {
        html.push('<ul class="my-3 list-disc space-y-1 pl-6">');
        inUl = true;
      }
      html.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`);
      i += 1;
      continue;
    }

    closeUl();
    html.push(`<p class="my-3 leading-relaxed text-muted-foreground">${inlineFormat(trimmed)}</p>`);
    i += 1;
  }

  closeUl();
  closeTable();
  return html.join("\n");
}

export async function loadLegalDocumentHtml(slug: LegalDocSlug): Promise<string> {
  const meta = LEGAL_DOC_META[slug];
  const filePath = path.join(process.cwd(), "content", "legal", meta.file);
  const raw = await readFile(filePath, "utf8");
  const withPlaceholders = raw
    .replaceAll("{{APP_URL}}", getAppUrl())
    .replaceAll("{{VERSION}}", LEGAL_DOCS_VERSION);
  return markdownToHtml(withPlaceholders);
}
