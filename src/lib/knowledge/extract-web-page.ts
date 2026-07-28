import * as cheerio from "cheerio";

export function extractWebPage(html: string, url: URL) {
  const $ = cheerio.load(html);

  $(
    [
      "script",
      "style",
      "noscript",
      "template",
      "nav",
      "aside",
      "footer",
      "form",
      "iframe",
      "object",
      "embed",
      "canvas",
      "svg",
      "[hidden]",
      '[aria-hidden="true"]',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="complementary"]',
      '[role="contentinfo"]',
      '[class~="nav"]',
      '[class~="navbar"]',
      '[class~="navigation"]',
      '[class~="site-navigation"]',
      '[class~="sidebar"]',
      '[class~="site-sidebar"]',
      '[class~="site-header"]',
      '[class~="footer"]',
      '[class~="site-footer"]',
      '[class~="menu"]',
      '[class~="breadcrumb"]',
      '[class~="breadcrumbs"]',
    ].join(","),
  ).remove();

  const candidates = $("main, [role='main'], article").toArray();
  const contentRoot =
    candidates.sort(
      (left, right) =>
        normalizeText($(right).text()).length -
        normalizeText($(left).text()).length,
    )[0] ?? $("body").get(0);
  const blocks: string[] = [];

  if (contentRoot) {
    $(contentRoot)
      .find("h1, h2, h3, h4, h5, h6, p, li, blockquote, pre")
      .each((_index, element) => {
        const text = normalizeText($(element).text());

        if (!text) {
          return;
        }

        const headingLevel = /^h([1-6])$/u.exec(element.tagName)?.[1];
        blocks.push(
          headingLevel
            ? `${"#".repeat(Number(headingLevel))} ${text}`
            : text,
        );
      });

    if (blocks.length === 0) {
      const text = normalizeText($(contentRoot).text());
      if (text) {
        blocks.push(text);
      }
    }
  }

  const title =
    normalizeText($('meta[property="og:title"]').attr("content") ?? "") ||
    normalizeText($("title").first().text()) ||
    normalizeText($("h1").first().text()) ||
    url.hostname;

  return {
    title,
    body: blocks.join("\n\n"),
    finalUrl: url.href,
  };
}

function normalizeText(value: string) {
  return value.replaceAll("\u00a0", " ").replace(/\s+/gu, " ").trim();
}
