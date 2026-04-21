import React, { useCallback, useEffect, useRef, useState } from "react";

interface SearchResult {
  id: string;
  url: string;
  raw_url: string;
  excerpt: string;
  meta: { title?: string; parent_title?: string };
}

interface Pagefind {
  options: (opts: Record<string, unknown>) => Promise<void>;
  search: (query: string) => Promise<{
    results: Array<{ id: string; data: () => Promise<SearchResult> }>;
  }>;
}

let pagefindInstance: Pagefind | null = null;
let pagefindLoading = false;

async function getPagefind(): Promise<Pagefind | null> {
  if (pagefindInstance) return pagefindInstance;
  if (pagefindLoading) return null;
  pagefindLoading = true;
  try {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const pf = await import(/* webpackIgnore: true */ `${basePath}/api/pagefind/pagefind.js`);
    await pf.options({ excerptLength: 20 });
    pagefindInstance = pf;
    return pf;
  } catch {
    return null;
  } finally {
    pagefindLoading = false;
  }
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // DSFR's Header caches renderSearchInput, so onKeyDown's closure can go stale.
  // Read the latest state through refs instead.
  const resultsRef = useRef(results);
  const activeIndexRef = useRef(activeIndex);
  const openRef = useRef(open);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Preload pagefind on mount
  useEffect(() => {
    getPagefind();
  }, []);

  // Track the last successfully-searched query so we only reset activeIndex when new results arrive
  const lastSearchedRef = useRef<string>("");

  const doSearch = useCallback(async (q: string) => {
    const pf = await getPagefind();
    if (!pf || !q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const search = await pf.search(q);
      const data = await Promise.all(search.results.slice(0, 8).map((r) => r.data()));
      if (lastSearchedRef.current !== q) {
        setActiveIndex(0);
        lastSearchedRef.current = q;
      }
      setResults(data);
      setOpen(data.length > 0 || q.trim().length > 0);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  const search = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim()) {
        setResults([]);
        setOpen(false);
        lastSearchedRef.current = "";
        setActiveIndex(0);
        return;
      }
      debounceRef.current = setTimeout(() => doSearch(value), 200);
    },
    [doSearch],
  );

  const close = useCallback(() => setOpen(false), []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const curResults = resultsRef.current;
    if (!openRef.current || curResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % curResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + curResults.length) % curResults.length);
    } else if (e.key === "Enter") {
      const target = curResults[activeIndexRef.current];
      if (target) {
        // Stop DSFR's Header from also firing onSearchButtonClick, which resets activeIndex.
        e.preventDefault();
        e.stopPropagation();
        window.location.href = target.raw_url;
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }, []);

  return { results, loading, open, query, activeIndex, search, close, onKeyDown, setActiveIndex };
}

export function SearchResults({
  results,
  query,
  loading,
  open,
  activeIndex,
  onClose,
  onHoverIndex,
}: {
  results: SearchResult[];
  query: string;
  loading: boolean;
  open: boolean;
  activeIndex: number;
  onClose: () => void;
  onHoverIndex: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  // Position dropdown under the search bar. Use absolute (document) coordinates
  // so the dropdown scrolls with the search bar instead of floating in the viewport.
  useEffect(() => {
    if (!open) return;
    const searchBar = document.querySelector(".fr-header .fr-search-bar");
    if (!searchBar) return;
    const update = () => {
      const rect = searchBar.getBoundingClientRect();
      setStyle({
        position: "absolute",
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 400),
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, results]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={ref} className="helpcenter-search-results-container" style={style}>
      {results.length > 0 ? (
        <ul className="helpcenter-search-results">
          {results.map((r, i) => (
            <li
              key={`${i}-${r.id}`}
              className={i === activeIndex ? "helpcenter-search-active" : undefined}
              onMouseMove={() => {
                if (i !== activeIndex) onHoverIndex(i);
              }}
            >
              <a href={r.raw_url} onClick={onClose}>
                <strong>
                  {r.meta.parent_title ? `${r.meta.parent_title} > ` : ""}
                  {r.meta.title || r.raw_url}
                </strong>
                <span dangerouslySetInnerHTML={{ __html: r.excerpt }} />
              </a>
            </li>
          ))}
        </ul>
      ) : query && !loading ? (
        <div className="helpcenter-search-results helpcenter-search-empty">
          Aucun résultat pour &laquo;&nbsp;{query}&nbsp;&raquo;
        </div>
      ) : null}
    </div>
  );
}
