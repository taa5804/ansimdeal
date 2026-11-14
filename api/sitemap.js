"use strict";

const SUPABASE_URL = "https://dcysjuxyjqtvkihdsjvv.supabase.co";
const SUPABASE_KEY = "sb_publishable_RZBX7u1v8MLBCfEJT0-eRg_jPcIulG2";
const ROWS_PER_SITEMAP = 2000;

const WOORI_PAGES_LIST = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/home", priority: "1.0", changefreq: "daily" },
  { path: "/broker-landing", priority: "1.0", changefreq: "daily" },
  { path: "/broker-guide", priority: "0.95", changefreq: "daily" },
  { path: "/broker-signup", priority: "0.95", changefreq: "daily" },
  { path: "/broker-buyer", priority: "0.90", changefreq: "weekly" },
  { path: "/broker-customer", priority: "0.90", changefreq: "weekly" },
  { path: "/broker-local", priority: "0.90", changefreq: "weekly" },
  { path: "/broker-proposal", priority: "0.90", changefreq: "weekly" },
  { path: "/broker-sales", priority: "0.90", changefreq: "weekly" },
  { path: "/apt", priority: "1.0", changefreq: "daily" },
  { path: "/map", priority: "0.95", changefreq: "daily" },
  { path: "/check", priority: "0.95", changefreq: "daily" },
  { path: "/price", priority: "0.95", changefreq: "daily" },
  { path: "/tools-center", priority: "0.95", changefreq: "daily" },
  { path: "/presale", priority: "0.90", changefreq: "daily" },
  { path: "/presale-landing", priority: "0.90", changefreq: "daily" },
  { path: "/presale-search", priority: "0.90", changefreq: "daily" },
  { path: "/presale-matcher", priority: "0.90", changefreq: "daily" },
  { path: "/request", priority: "0.90", changefreq: "daily" },
  { path: "/apt-buy", priority: "0.85", changefreq: "weekly" },
  { path: "/apt-jeonse", priority: "0.85", changefreq: "weekly" },
  { path: "/apt-monthly", priority: "0.85", changefreq: "weekly" },
  { path: "/apt-find", priority: "0.85", changefreq: "weekly" },
  { path: "/apt-condition", priority: "0.85", changefreq: "weekly" },
  { path: "/app-install", priority: "0.85", changefreq: "weekly" }
];

const ANSIM_PAGES_LIST = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/home", priority: "1.0", changefreq: "daily" },
  { path: "/broker-landing", priority: "1.0", changefreq: "daily" },
  { path: "/broker-guide", priority: "0.95", changefreq: "daily" },
  { path: "/broker-signup", priority: "0.95", changefreq: "daily" },
  { path: "/broker-buyer", priority: "0.90", changefreq: "weekly" },
  { path: "/broker-customer", priority: "0.90", changefreq: "weekly" },
  { path: "/broker-local", priority: "0.90", changefreq: "weekly" },
  { path: "/broker-proposal", priority: "0.90", changefreq: "weekly" },
  { path: "/broker-sales", priority: "0.90", changefreq: "weekly" },
  { path: "/tools-center", priority: "1.0", changefreq: "daily" },
  { path: "/apt", priority: "0.95", changefreq: "daily" },
  { path: "/map", priority: "0.95", changefreq: "daily" },
  { path: "/price", priority: "0.95", changefreq: "daily" },
  { path: "/presale", priority: "0.90", changefreq: "daily" },
  { path: "/presale-landing", priority: "0.90", changefreq: "daily" },
  { path: "/presale-search", priority: "0.90", changefreq: "daily" },
  { path: "/presale-matcher", priority: "0.90", changefreq: "daily" },
  { path: "/request", priority: "0.90", changefreq: "daily" },
  { path: "/app-install", priority: "0.85", changefreq: "weekly" }
];

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  const rawHost = (req && req.headers && req.headers.host) ? String(req.headers.host).toLowerCase() : "";
  const isAnsim = rawHost.includes("ansimdeal.com");
  const reqHost = isAnsim ? "www.ansimdeal.com" : "www.wooriapt.app";
  const SITE_ORIGIN = "https://" + reqHost;
  const lastmod = new Date().toISOString().split("T")[0];

  if (req.query && req.query.mode === "pages") {
    const list = isAnsim ? ANSIM_PAGES_LIST : WOORI_PAGES_LIST;
    let urlItems = "";
    for (const item of list) {
      const escapedLoc = (SITE_ORIGIN + item.path).replace(/&/g, "&amp;");
      urlItems +=
        "  <url>\n" +
        "    <loc>" + escapedLoc + "</loc>\n" +
        "    <lastmod>" + lastmod + "</lastmod>\n" +
        "    <changefreq>" + item.changefreq + "</changefreq>\n" +
        "    <priority>" + item.priority + "</priority>\n" +
        "  </url>\n";
    }
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urlItems +
      '</urlset>'
    );
  }

  try {
    let totalCount = 21437;
    try {
      const response = await fetch(
        SUPABASE_URL + "/rest/v1/safe_apartments?select=%EB%8B%A8%EC%A7%80%EB%AA%85&limit=1",
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY,
            Prefer: "count=exact"
          }
        }
      );
      if (response.ok) {
        const contentRange = response.headers.get("content-range") || "";
        const parsed = Number(contentRange.split("/").pop());
        if (parsed > 0) totalCount = parsed;
      }
    } catch (_) {}

    const pages = Math.max(1, Math.ceil(totalCount / ROWS_PER_SITEMAP));

    // 1순위: 핵심 페이지 & 부동산업자(공인중개사) 자동검색 사이트맵 -> 2순위: 안심거래 아파트 / 안심딜 상가 사이트맵 (마트 완전 제외!)
    const sitemapUrls = [
      SITE_ORIGIN + "/pages-sitemap.xml",
      SITE_ORIGIN + "/broker-sitemap.xml",
      SITE_ORIGIN + "/store-sitemap.xml"
    ];

    for (let page = 1; page <= pages; page += 1) {
      sitemapUrls.push(SITE_ORIGIN + "/sitemaps/apartments-" + page + ".xml");
    }

    const sitemapItems = sitemapUrls
      .map(function(loc) {
        return (
          "  <sitemap>\n" +
          "    <loc>" + loc + "</loc>\n" +
          "    <lastmod>" + lastmod + "</lastmod>\n" +
          "  </sitemap>"
        );
      })
      .join("\n");

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");

    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      sitemapItems + "\n" +
      "</sitemapindex>"
    );
  } catch (error) {
    console.error("SITEMAP INDEX ERROR:", error);
    return res.status(500).send("Sitemap error");
  }
};
