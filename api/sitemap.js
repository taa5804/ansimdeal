"use strict";

const SUPABASE_URL = "https://dcysjuxyjqtvkihdsjvv.supabase.co";
const SUPABASE_KEY = "sb_publishable_RZBX7u1v8MLBCfEJT0-eRg_jPcIulG2";
const ROWS_PER_SITEMAP = 5000;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  const reqHost = (req && req.headers && req.headers.host && req.headers.host.includes("wooriapt.app"))
    ? req.headers.host
    : "wooriapt.app";
  const SITE_ORIGIN = "https://" + reqHost;

  if (req.query && req.query.mode === "pages") {
    const pagesPaths = [
      { path: "/price", priority: "1.0", changefreq: "daily" },
      { path: "/aura", priority: "1.0", changefreq: "daily" },
      { path: "/pension", priority: "0.95", changefreq: "daily" },
      { path: "/check", priority: "1.0", changefreq: "daily" },
      { path: "/", priority: "1.0", changefreq: "daily" },
      { path: "/apt", priority: "1.0", changefreq: "daily" },
      { path: "/mart", priority: "0.95", changefreq: "daily" },
      { path: "/broker-signup", priority: "0.9", changefreq: "weekly" },
      { path: "/broker-guide", priority: "0.9", changefreq: "weekly" },
      { path: "/app-install", priority: "0.85", changefreq: "monthly" },
      { path: "/broker-landing.html", priority: "0.8", changefreq: "weekly" },
      { path: "/mart-landing.html", priority: "0.8", changefreq: "weekly" },
      { path: "/map", priority: "0.8", changefreq: "weekly" }
    ];
    let urlItems = "";
    for (const item of pagesPaths) {
      urlItems += "  <url><loc>" + SITE_ORIGIN + item.path + "</loc><lastmod>2026-10-10</lastmod><changefreq>" + item.changefreq + "</changefreq><priority>" + item.priority + "</priority></url>\n";
    }
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urlItems +
      '</urlset>'
    );
  }

  try {
    const response = await fetch(
      SUPABASE_URL + "/rest/v1/safe_apartments?select=단지명",
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
          Prefer: "count=exact",
          Range: "0-0"
        }
      }
    );

    if (!response.ok) {
      return res.status(502).send("Sitemap count error");
    }

    const contentRange = response.headers.get("content-range") || "0/0";
    const totalCount = Number(contentRange.split("/").pop()) || 0;
    const pages = Math.max(1, Math.ceil(totalCount / ROWS_PER_SITEMAP));

    let sitemapItems = "";
    sitemapItems += "<sitemap><loc>" + SITE_ORIGIN + "/pages-sitemap.xml</loc></sitemap>";

    for (let page = 1; page <= pages; page += 1) {
      sitemapItems += "<sitemap><loc>" + SITE_ORIGIN + "/sitemaps/apartments-" + page + ".xml</loc></sitemap>";
    }

    sitemapItems += "<sitemap><loc>" + SITE_ORIGIN + "/broker-sitemap.xml</loc></sitemap>";

    for (let m = 1; m <= 6; m += 1) {
      sitemapItems += "<sitemap><loc>" + SITE_ORIGIN + "/sitemaps/marts-" + m + ".xml</loc></sitemap>";
    }

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");

    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      sitemapItems +
      "</sitemapindex>"
    );
  } catch (error) {
    console.error("SITEMAP INDEX ERROR:", error);
    return res.status(500).send("Sitemap error");
  }
};
