import { describe, expect, it, vi } from "vitest";

import { rewriteInterlinks } from "../collection-tree";
import { extractFrontmatter, restoreEscapedTags } from "../docs2dsfr/server";

describe("extractFrontmatter", () => {
  it("returns empty frontmatter when no block is present", () => {
    const { frontmatter, content } = extractFrontmatter("<p>hello</p>");
    expect(frontmatter).toEqual({});
    expect(content).toBe("<p>hello</p>");
  });

  it("parses keys and strips the block", () => {
    const html = "<p>---</p><p>title: My doc</p><p>path: my-doc</p><p>---</p><p>body</p>";
    const { frontmatter, content } = extractFrontmatter(html);
    expect(frontmatter.title).toBe("My doc");
    expect(frontmatter.path).toBe("my-doc");
    expect(content).toBe("<p>body</p>");
  });

  it("derives dateFormatted from frontmatter.date", () => {
    const html = "<p>---</p><p>date: 2026-01-15</p><p>---</p>";
    const { frontmatter } = extractFrontmatter(html);
    expect(frontmatter.date).toBe("2026-01-15");
    expect(frontmatter.dateFormatted).toMatch(/janvier/);
  });

  it("ignores a stray --- not part of a real block", () => {
    const html = "<p>before</p><p>---</p>";
    const { frontmatter, content } = extractFrontmatter(html);
    expect(frontmatter).toEqual({});
    expect(content).toBe(html);
  });
});

describe("restoreEscapedTags", () => {
  it("restores a paired accordion-list in two <p> blocks", () => {
    const html = "<p>&lt;accordion-list&gt;</p><p>q</p><p>&lt;/accordion-list&gt;</p>";
    expect(restoreEscapedTags(html)).toBe("<accordion-list><p>q</p></accordion-list>");
  });

  it("restores a single-block empty tag", () => {
    expect(restoreEscapedTags("<p>&lt;button&gt;&lt;/button&gt;</p>")).toBe("<button></button>");
  });

  it("restores an iframe with attrs and decodes &amp; in src", () => {
    const html =
      '<p>&lt;iframe title="v" src="https://tube.numerique.gouv.fr/x?a=1&amp;b=2"&gt;&lt;/iframe&gt;</p>';
    const out = restoreEscapedTags(html);
    expect(out).toContain('src="https://tube.numerique.gouv.fr/x?a=1&b=2"');
    expect(out).toContain("<iframe");
    expect(out).toContain("</iframe>");
  });

  it("collapses CMS-auto-linkified URLs nested inside an attribute value", () => {
    const html =
      '<p>&lt;iframe src="<a target="_blank" href="https://tube.numerique.gouv.fr/x">https://tube.numerique.gouv.fr/x</a>"&gt;&lt;/iframe&gt;</p>';
    const out = restoreEscapedTags(html);
    expect(out).toContain('src="https://tube.numerique.gouv.fr/x"');
    expect(out).not.toContain("<a target");
  });

  it("restores <hr/> and <hr /> but leaves bare <hr> as text", () => {
    expect(restoreEscapedTags("<p>&lt;hr/&gt;</p>")).toBe("<hr/>");
    expect(restoreEscapedTags("<p>&lt;hr /&gt;</p>")).toBe("<hr/>");
    expect(restoreEscapedTags("<p>&lt;hr&gt;</p>")).toBe("<p>&lt;hr&gt;</p>");
  });

  it("ignores untracked tags", () => {
    expect(restoreEscapedTags("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });
});

describe("rewriteInterlinks", () => {
  it("rewrites a known docId, stripping data-doc-id", () => {
    const html =
      '<a href="/docs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/" data-doc-id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" title="X">X</a>';
    const out = rewriteInterlinks(html, (uuid) => (uuid.startsWith("aaaa") ? "/socle/x" : null));
    expect(out).toContain('href="/socle/x"');
    expect(out).not.toContain("data-doc-id");
    expect(out).toContain("X</a>");
  });

  it("strips href + data-doc-id when the docId is unknown, keeps text", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html =
      '<a data-doc-id="dead-dead-dead-dead-deaddeaddead" href="/docs/dead-dead-dead-dead-deaddeaddead/" title="missing">missing</a>';
    const out = rewriteInterlinks(html, () => null);
    expect(out).not.toContain("href=");
    expect(out).not.toContain("data-doc-id");
    expect(out).toContain("missing</a>");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("leaves external links untouched", () => {
    const html = '<a href="https://example.com/x">external</a>';
    expect(rewriteInterlinks(html, () => "/should/not/apply")).toBe(html);
  });

  it("handles trailing-slash and no-trailing-slash hrefs identically", () => {
    const resolve = () => "/c/p";
    expect(
      rewriteInterlinks('<a href="/docs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/">x</a>', resolve),
    ).toContain('href="/c/p"');
    expect(
      rewriteInterlinks('<a href="/docs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa">x</a>', resolve),
    ).toContain('href="/c/p"');
  });
});
