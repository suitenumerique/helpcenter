// Client-side safe exports from docs2dsfr
import { Fragment, createElement, useEffect, useState } from "react";
import production from "react/jsx-runtime";
import rehypeParse from "rehype-parse";
import rehypeReact from "rehype-react";
import { unified } from "unified";
import { htmlComponents } from "./components";

// The CMS can split a single link into several adjacent <a> tags when the link
// text mixes plain and bold spans (one <a> per mark boundary). This plugin
// normalises that by:
//   1. Lifting links out of inline wrappers:
//        <strong><a href="X">text</a></strong>  →  <a href="X"><strong>text</strong></a>
//   2. Merging consecutive sibling <a> elements that share the same href into one.
type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const INLINE_WRAPPERS = new Set(["strong", "em", "s", "u", "mark", "span", "sub", "sup"]);

function normalizeLinks(node: HastNode) {
  const children = node.children;
  if (!children) return;

  // Pass 1 – recurse, then lift any <wrapper><a>…</a></wrapper> pattern.
  for (let i = 0; i < children.length; i++) {
    normalizeLinks(children[i]);
    const child = children[i];
    if (
      child.type === "element" &&
      child.tagName !== undefined &&
      INLINE_WRAPPERS.has(child.tagName) &&
      child.children?.length === 1 &&
      child.children[0].type === "element" &&
      child.children[0].tagName === "a"
    ) {
      const innerLink = child.children[0];
      children[i] = {
        type: "element",
        tagName: "a",
        properties: innerLink.properties,
        children: [
          {
            type: "element",
            tagName: child.tagName,
            properties: child.properties,
            children: innerLink.children,
          },
        ],
      };
    }
  }

  // Pass 2 – merge consecutive <a> siblings with the same href.
  let i = 0;
  while (i + 1 < children.length) {
    const curr = children[i];
    const next = children[i + 1];
    if (
      curr.type === "element" &&
      curr.tagName === "a" &&
      next.type === "element" &&
      next.tagName === "a" &&
      curr.properties?.href === next.properties?.href
    ) {
      curr.children = [...(curr.children ?? []), ...(next.children ?? [])];
      children.splice(i + 1, 1);
    } else {
      i++;
    }
  }
}

function rehypeMergeAdjacentLinks() {
  return normalizeLinks as (tree: HastNode) => void;
}

export interface DocsDocument {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  excerpt?: string;
}

export interface DocsChild {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  excerpt?: string;
  numchild: number;
  document?: DocsContentResponse;
  children: DocsChild[];
  path?: string;
}

export interface DocsChildrenResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: DocsChild[];
}

export interface DocsContentResponse {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  frontmatter: Record<string, string>;
}

export function DocumentContent({ document }: { document: DocsContentResponse | undefined }) {
  return useProcessor(document?.content || "");
}

function useProcessor(text: string) {
  const [Content, setContent] = useState(createElement(Fragment));

  useEffect(
    function () {
      (async function () {
        const file = await unified()
          .use(rehypeParse, { fragment: true })
          .use(rehypeMergeAdjacentLinks)
          .use(rehypeReact, {
            ...production,
            passNode: true,
            components: htmlComponents,
          })
          .process(text);

        setContent(file.result);
      })();
    },
    [text],
  );

  return Content;
}
