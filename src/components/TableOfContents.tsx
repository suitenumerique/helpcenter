import { slugify } from "@/lib/collections";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export default function TableOfContents({ deps = [] }: { deps?: unknown[] }) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasScrolledToHash = useRef(false);

  useEffect(() => {
    const article = document.querySelector("article.helpcenter-article");
    if (!article) return;

    let toc: TocItem[] = [];
    const visible = new Set<string>();
    let observer: IntersectionObserver | null = null;

    const scan = () => {
      // CMS headings are bumped one level (h1→h2 … h5→h6), so scan h2-h5 and
      // skip the page title's own h1. minLevel logic still renders CMS-h1 at
      // the leftmost indent.
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
        return { id, text, level: parseInt(h.tagName[1], 10) };
      });

      const sameAsPrev = next.length === toc.length && next.every((it, i) => it.id === toc[i].id);
      if (sameAsPrev) return;

      toc = next;
      setItems(next);
      if (next.length > 0) setActiveId((cur) => cur || next[0].id);

      if (!hasScrolledToHash.current && window.location.hash) {
        const targetId = window.location.hash.slice(1);
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          hasScrolledToHash.current = true;
          const top = targetEl.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top, behavior: "instant" });
          setActiveId(targetId);
        }
      }

      if (observer) observer.disconnect();
      visible.clear();
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) visible.add(e.target.id);
            else visible.delete(e.target.id);
          });
          if (visible.size > 0) {
            const firstVisible = toc.find((t) => visible.has(t.id));
            if (firstVisible) setActiveId(firstVisible.id);
          } else {
            let lastAbove = toc[0]?.id || "";
            for (const t of toc) {
              const el = document.getElementById(t.id);
              if (el && el.getBoundingClientRect().top < 80) lastAbove = t.id;
              else break;
            }
            setActiveId(lastAbove);
          }
        },
        { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
      );
      headings.forEach((h) => observer!.observe(h));
      observerRef.current = observer;
    };

    hasScrolledToHash.current = false;
    scan();
    const mutationObserver = new MutationObserver(scan);
    mutationObserver.observe(article, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  if (items.length === 0) return null;

  const minLevel = Math.min(...items.map((i) => i.level));

  const navItems = (onNavigate?: () => void) =>
    items.map((item) => (
      <li
        key={item.id}
        className={activeId === item.id ? "helpcenter-toc-active" : undefined}
        style={{ paddingLeft: `${(item.level - minLevel) * 0.75}rem` }}
      >
        <a
          href={`#${item.id}`}
          onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById(item.id);
            if (!el) return;
            const top = el.getBoundingClientRect().top + window.scrollY - 80;
            window.scrollTo({ top, behavior: "smooth" });
            history.replaceState(null, "", `#${item.id}`);
            setActiveId(item.id);
            onNavigate?.();
          }}
        >
          {item.text}
        </a>
      </li>
    ));

  return (
    <>
      <nav className="helpcenter-toc" aria-label="Sommaire de la page">
        <p className="helpcenter-toc-title">Sur cette page</p>
        <ul>{navItems()}</ul>
      </nav>

      {createPortal(
        <>
          <button
            className="helpcenter-toc-fab"
            aria-label="Sommaire de la page"
            onClick={() => setDrawerOpen(true)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
              <path d="M3 4h2v2H3V4zm4 0h14v2H7V4zM3 11h2v2H3v-2zm4 0h14v2H7v-2zM3 18h2v2H3v-2zm4 0h14v2H7v-2z"/>
            </svg>
          </button>

          {drawerOpen && (
            <>
              <div
                className="helpcenter-toc-backdrop"
                aria-hidden="true"
                onClick={() => setDrawerOpen(false)}
              />
              <div
                className="helpcenter-toc-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Sommaire de la page"
              >
                <div className="helpcenter-toc-drawer-header">
                  <p className="helpcenter-toc-title" style={{ margin: 0 }}>Sur cette page</p>
                  <button
                    className="helpcenter-toc-drawer-close"
                    aria-label="Fermer le sommaire"
                    onClick={() => setDrawerOpen(false)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
                    </svg>
                  </button>
                </div>
                <nav aria-label="Sommaire de la page">
                  <ul className="helpcenter-toc-drawer-list">
                    {navItems(() => setDrawerOpen(false))}
                  </ul>
                </nav>
              </div>
            </>
          )}
        </>,
        document.body,
      )}
    </>
  );
}
