import { slugify } from "@/lib/collections";
import { Summary } from "@codegouvfr/react-dsfr/Summary";
import { MouseEvent, useEffect, useRef, useState } from "react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TocNode extends TocItem {
  children: TocNode[];
}

type SummaryLink = {
  text: string;
  linkProps: { href: string; onClick: (e: MouseEvent) => void };
  subLinks?: SummaryLink[];
};

function buildTree(items: TocItem[]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const item of items) {
    const node: TocNode = { ...item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return roots;
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top, behavior: "smooth" });
  history.replaceState(null, "", `#${id}`);
}

function toSummaryLinks(nodes: TocNode[]): SummaryLink[] {
  return nodes.map((node) => ({
    text: node.text,
    linkProps: {
      href: `#${node.id}`,
      onClick: (e: MouseEvent) => {
        e.preventDefault();
        scrollToId(node.id);
      },
    },
    subLinks: node.children.length > 0 ? toSummaryLinks(node.children) : undefined,
  }));
}

export default function TableOfContents({ deps = [] }: { deps?: unknown[] }) {
  const [items, setItems] = useState<TocItem[]>([]);
  const hasScrolledToHash = useRef(false);

  useEffect(() => {
    const article = document.querySelector("article.helpcenter-article");
    if (!article) return;

    hasScrolledToHash.current = false;

    const scan = () => {
      const headings = (
        Array.from(article.querySelectorAll("h1, h2, h3, h4, h5")) as HTMLHeadingElement[]
      ).filter(
        (h) =>
          !h.classList.contains("helpcenter-page-title") &&
          !h.closest(".helpcenter-tile-grid"),
      );

      const usedIds = new Set<string>();
      const next: TocItem[] = headings.map((h) => {
        const text = (h.textContent || "").trim();
        let id = h.id;
        if (!id) {
          const base = slugify(text) || "heading";
          id = base;
          let n = 2;
          while (usedIds.has(id)) id = `${base}-${n++}`;
          h.id = id;
        }
        usedIds.add(id);

        if (!h.querySelector(".helpcenter-heading-anchor")) {
          const a = document.createElement("a");
          a.href = `#${id}`;
          a.className = "helpcenter-heading-anchor";
          a.setAttribute("aria-label", "Copier le lien");
          a.title = "Copier le lien";
          a.innerHTML =
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
            `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>` +
            `<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>` +
            `</svg>`;
          a.addEventListener("click", (e) => {
            e.preventDefault();
            const url = `${window.location.origin}${window.location.pathname}#${id}`;
            navigator.clipboard.writeText(url);
          });
          h.appendChild(a);
        }

        return { id, text, level: parseInt(h.tagName[1], 10) };
      });

      setItems(next);

      if (!hasScrolledToHash.current && window.location.hash) {
        const targetId = window.location.hash.slice(1);
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          hasScrolledToHash.current = true;
          const top = targetEl.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top, behavior: "instant" });
        }
      }
    };

    scan();
    const mutationObserver = new MutationObserver(scan);
    mutationObserver.observe(article, { childList: true, subtree: true });

    return () => mutationObserver.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  if (items.length === 0) return null;

  return <Summary links={toSummaryLinks(buildTree(items))} />;
}
