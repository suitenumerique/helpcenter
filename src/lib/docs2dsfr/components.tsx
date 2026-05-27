import FaqList from "@/components/FaqList";
import { Button } from "@codegouvfr/react-dsfr/Button";
import { CallOut, type CallOutProps } from "@codegouvfr/react-dsfr/CallOut";
import { Download } from "@codegouvfr/react-dsfr/Download";
import { Tile } from "@codegouvfr/react-dsfr/Tile";
import Image from "next/image";
import React, { ReactNode } from "react";

export const customTags = ["accordion-list", "button", "download", "tile-grid-x3", "iframe"];
export const customVoidTags = ["hr"];

const findAnchor = (node: ReactNode): { href: string; label: ReactNode } | null => {
  let result: { href: string; label: ReactNode } | null = null;
  React.Children.forEach(node, (child) => {
    if (result || !React.isValidElement(child)) return;
    if (child.type === "a") {
      const aProps = child.props as React.AnchorHTMLAttributes<HTMLAnchorElement>;
      result = { href: aProps.href || "", label: aProps.children };
    } else {
      const cProps = child.props as { children?: ReactNode };
      const found = findAnchor(cProps.children);
      if (found) result = found;
    }
  });
  return result;
};

// Recursively clone the tree, replacing any <a> element with its children.
// Used so we can drop a sub-anchor's wrapper while preserving surrounding content
// (e.g. an emoji next to the link inside a <button> custom tag).
const unwrapAnchors = (node: ReactNode): ReactNode => {
  return React.Children.map(node, (child) => {
    if (!React.isValidElement(child)) return child;
    const cProps = child.props as { children?: ReactNode };
    if (child.type === "a") return unwrapAnchors(cProps.children);
    if (cProps.children === undefined) return child;
    return React.cloneElement(child, {}, unwrapAnchors(cProps.children));
  });
};

// Map BlockNote backgroundColor names to DSFR CallOut colorVariant values.
// `default` (and anything unrecognised) falls back to the DSFR default style.
const CALLOUT_COLOR: Record<string, CallOutProps.ColorVariant> = {
  brown: "brown-caramel",
  red: "pink-tuile",
  orange: "orange-terre-battue",
  yellow: "yellow-tournesol",
  green: "green-emeraude",
  blue: "blue-ecume",
  purple: "purple-glycine",
  pink: "pink-macaron",
};

// The page chrome already renders an <h1> for the page title, so bump every
// CMS heading down by one level (h1→h2, …, h5→h6) to keep a single document
// h1. Old h6 has nowhere to go — render as a bold paragraph instead.
// `node` is injected by rehype-react's passNode option; strip it so it doesn't
// leak onto the DOM as node="[object Object]".
type HProps = React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown };

export const htmlComponents = {
  h1: ({ children, node: _n, ...rest }: HProps) => <h2 {...rest}>{children}</h2>,
  h2: ({ children, node: _n, ...rest }: HProps) => <h3 {...rest}>{children}</h3>,
  h3: ({ children, node: _n, ...rest }: HProps) => <h4 {...rest}>{children}</h4>,
  h4: ({ children, node: _n, ...rest }: HProps) => <h5 {...rest}>{children}</h5>,
  h5: ({ children, node: _n, ...rest }: HProps) => <h6 {...rest}>{children}</h6>,
  h6: ({ children, node: _n, ...rest }: HProps) => (
    <p {...rest}>
      <strong>{children}</strong>
    </p>
  ),
  blockquote: (props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => {
    return <p className="helpcenter-callout">{props.children}</p>;
  },
  // Docs CMS callout: <aside role="note" data-emoji="…" data-background-color="…">.
  // Plain <aside>s without role="note" fall through to native rendering.
  // The CMS emits the emoji twice: once as `data-emoji` on the <aside>, and
  // once as an inline <span> at the start of the body. We render the body
  // as-is so the emoji appears inline on the left of the text, matching
  // Docs' own rendering. `bodyAs="div"` avoids invalid <p><p> nesting.
  aside: ({
    children,
    role,
    node: _n,
    ...rest
  }: React.HTMLAttributes<HTMLElement> & {
    "data-emoji"?: string;
    "data-background-color"?: string;
    node?: unknown;
  }) => {
    if (role !== "note") {
      return (
        <aside role={role} {...rest}>
          {children}
        </aside>
      );
    }
    const bg = rest["data-background-color"];
    const colorVariant = bg ? CALLOUT_COLOR[bg] : undefined;
    return (
      <CallOut bodyAs="div" colorVariant={colorVariant}>
        {children}
      </CallOut>
    );
  },
  details: ({
    open: _open,
    node: _n,
    ...rest
  }: React.DetailsHTMLAttributes<HTMLDetailsElement> & { node?: unknown }) => <details {...rest} />,
  img: (props: React.ImgHTMLAttributes<HTMLImageElement> & { "data-text-alignment"?: string }) => {
    const { src, alt, width, height } = props;

    if (!src) return null;

    const isFullWidth = !width || Number(width) >= 760;

    const align = props["data-text-alignment"] || "left";

    return (
      <Image
        src={src as string}
        alt={alt || ""}
        loading="eager"
        width={isFullWidth ? 960 : Math.min(Number(width) || 960, 960)}
        height={isFullWidth ? 640 : Math.min(Number(height) || 640, 640)}
        style={
          isFullWidth
            ? {
                width: "100%",
                height: "auto",
              }
            : {
                display: "block",
                marginLeft: align === "center" || align === "right" ? "auto" : "0",
                marginRight: align === "center" || align === "left" ? "auto" : "0",
                maxWidth: "100%",
                height: "auto",
              }
        }
      />
    );
  },
  video: (props: React.VideoHTMLAttributes<HTMLVideoElement>) => {
    const { src } = props;
    if (!src) return null;
    return (
      <video
        src={src}
        controls
        preload="metadata"
        style={{ display: "block", maxWidth: "100%", height: "auto", margin: "0 auto" }}
      />
    );
  },
  "accordion-list": (props: React.HTMLAttributes<HTMLDivElement>) => {
    const faqs = [];
    let question: ReactNode | null = null,
      answer: ReactNode[] = [];
    React.Children.forEach(props.children, (child) => {
      if (React.isValidElement(child) && child.type === "ul") {
        if (question) faqs.push({ question, answer: answer.length === 1 ? answer[0] : answer });
        const li = React.Children.toArray(
          (child.props as React.HTMLAttributes<HTMLUListElement>).children,
        )[0];
        question = React.isValidElement(li)
          ? (li.props as React.HTMLAttributes<HTMLLIElement>).children
          : li;
        answer = [];
      } else if (React.isValidElement(child) && child.type === "p") {
        answer.push(child);
      }
    });
    if (question) faqs.push({ question, answer: answer.length === 1 ? answer[0] : answer });

    return <FaqList faqs={faqs} />;
  },
  "tile-grid-x3": (props: React.HTMLAttributes<HTMLDivElement>) => {
    const tiles: { imageUrl: string; title: ReactNode; href: string }[] = [];
    let pendingImage: string | undefined;

    React.Children.forEach(props.children, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === htmlComponents.img) {
        pendingImage = (child.props as React.ImgHTMLAttributes<HTMLImageElement>).src as string;
      } else if (child.type === "p" && pendingImage) {
        const anchor = findAnchor((child.props as { children?: ReactNode }).children);
        if (anchor && anchor.href) {
          tiles.push({ imageUrl: pendingImage, title: anchor.label, href: anchor.href });
        }
        pendingImage = undefined;
      }
    });

    if (!tiles.length) return null;

    return (
      <div className="fr-grid-row fr-grid-row--gutters helpcenter-tile-grid">
        {tiles.map((tile, i) => (
          <div key={i} className="fr-col-12 fr-col-sm-6 fr-col-md-4">
            <Tile
              small
              title={tile.title}
              imageUrl={tile.imageUrl}
              imageAlt=""
              linkProps={{ href: tile.href, target: "_self" }}
            />
          </div>
        ))}
      </div>
    );
  },
  button: (props: React.HTMLAttributes<HTMLDivElement>) => {
    const anchor = findAnchor(props.children);
    if (!anchor || !anchor.href) return null;
    return <Button linkProps={{ href: anchor.href }}>{unwrapAnchors(props.children)}</Button>;
  },
  download: (props: React.HTMLAttributes<HTMLDivElement>) => {
    let label: ReactNode = null;
    let href = "";
    let details: ReactNode = "";
    React.Children.forEach(props.children, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === "a") {
        const aProps = child.props as React.AnchorHTMLAttributes<HTMLAnchorElement>;
        href = aProps.href || "";
        label = aProps.children;
      } else if (child.type === "p") {
        const pProps = child.props as React.HTMLAttributes<HTMLParagraphElement>;
        details = pProps.children;
      }
    });
    if (!href) return null;
    return <Download label={label} details={details} linkProps={{ href }} />;
  },
};
