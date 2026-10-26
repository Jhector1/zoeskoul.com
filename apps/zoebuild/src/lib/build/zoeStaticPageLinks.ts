/**
 * Deterministic static-site page links. Generated content must not rewrite an
 * entire storefront merely to add a page to its navigation or footer.
 * This is deliberately restricted to registered, top-level document paths.
 */
export const ZOE_STATIC_PAGES = {
  "about.html": { label: "About", fragments: ["about", "about-us"] },
  "privacy.html": { label: "Privacy Policy", fragments: ["privacy", "privacy-policy"] },
  "terms.html": { label: "Terms", fragments: ["terms", "terms-of-service"] },
  "contact.html": { label: "Contact", fragments: ["contact", "contact-us"] },
  "faq.html": { label: "FAQ", fragments: ["faq", "faqs"] },
} as const;

export type ZoeStaticPagePath = keyof typeof ZOE_STATIC_PAGES;

export function isZoeStaticPagePath(value: string): value is ZoeStaticPagePath {
  return Object.prototype.hasOwnProperty.call(ZOE_STATIC_PAGES, value);
}

/** Keep the page paths in one registry; source validation and route share it. */
export function linkZoeStaticPageInHome(home: string, pagePath: ZoeStaticPagePath): string {
  const { label, fragments } = ZOE_STATIC_PAGES[pagePath];
  if (!/<html\b/i.test(home) || !/<body\b/i.test(home) || !/<\/body\s*>/i.test(home)) {
    throw new Error("A complete index.html document is required to add a standalone page.");
  }
  if (home.length > 64_000) {
    throw new Error("The homepage exceeds the supported safe targeted-link size.");
  }

  // Replace legacy same-page navigation anchors, without removing content.
  let result = home.replace(
    /(<a\b[^>]*?\bhref\s*=\s*)(["'])([^"']+)\2/gi,
    (whole, prefix: string, quote: string, href: string) => {
      return fragments.some((value) => value === href.trim().slice(1).toLowerCase()) && href.trim().startsWith("#")
        ? `${prefix}${quote}${pagePath}${quote}`
        : whole;
    },
  );

  const anchor = `<a href="${pagePath}">${label}</a>`;
  const validHref = new RegExp(`\\bhref\\s*=\\s*["'](?:\\./|/)?(?:${pagePath.replace(".", "\\.")}|${pagePath.replace(/\.html$/, "")})["']`, "i");
  const hasLink = (section: string) => /<a\b/i.test(section) && validHref.test(section);
  const appendToTag = (tag: string): boolean => {
    const pattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "i");
    const match = result.match(pattern);
    if (!match) return false;
    if (!hasLink(match[0])) {
      const closing = new RegExp(`</${tag}\\s*>$`, "i");
      const replaced = match[0].replace(closing, `${anchor}</${tag}>`);
      result = result.replace(match[0], replaced);
    }
    return true;
  };

  if (!appendToTag("nav")) {
    if (/<header\b[^>]*>[\s\S]*?<\/header\s*>/i.test(result)) {
      result = result.replace(/<\/header\s*>/i, `<nav aria-label="Pages">${anchor}</nav></header>`);
    } else {
      result = result.replace(/<body\b[^>]*>/i, (opening) => `${opening}<nav aria-label="Pages">${anchor}</nav>`);
    }
  }

  if (!appendToTag("footer")) {
    result = result.replace(/<\/body\s*>/i, `<footer data-zoebuild-pages="true">${anchor}</footer></body>`);
  }
  if (!validHref.test(result)) {
    throw new Error("The standalone page navigation link could not be inserted.");
  }
  return result;
}
