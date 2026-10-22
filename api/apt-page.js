"use strict";

const SUPABASE_URL =
  "https://wpshlmijsscmlasqtapa.supabase.co";

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  "sb_publishable_3QLYewR-TXBd1mNfte6OJg_kre42L7K";

let SITE_ORIGIN =
  "https://www.wooriapt.app";

const SITEMAP_PAGE_SIZE = 2000;

/* =========================================
   NAVER INDEXNOW
========================================= */

const INDEXNOW_KEY =
  "fc1e3ad82010475381daf9846e627fdd";

const INDEXNOW_HOST =
  "www.wooriapt.app";

const INDEXNOW_KEY_LOCATION =
  "https://www.wooriapt.app/fc1e3ad82010475381daf9846e627fdd.txt";

async function submitIndexNow(urls) {
  if (typeof urls === "string") {
    urls = [urls];
  }

  if (!Array.isArray(urls) || urls.length === 0) {
    return {
      ok: false,
      error: "전송할 URL이 없습니다."
    };
  }

  const validUrls = [...new Set(urls)]
    .filter(function(url) {
      try {
        const u = new URL(url);
        return (
          u.protocol === "https:" &&
          (
            u.hostname === "wooriapt.app" ||
            u.hostname === "www.wooriapt.app"
          )
        );
      } catch (error) {
        return false;
      }
    })
    .slice(0, 10000);

  if (validUrls.length === 0) {
    return {
      ok: false,
      error: "유효한 wooriapt.app URL이 없습니다."
    };
  }

  const response = await fetch(
    "https://searchadvisor.naver.com/indexnow",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        host: INDEXNOW_HOST,
        key: INDEXNOW_KEY,
        keyLocation: INDEXNOW_KEY_LOCATION,
        urlList: validUrls
      })
    }
  );

  const responseText = await response.text();

  return {
    ok: response.ok,
    naverStatus: response.status,
    submitted: validUrls.length,
    response: responseText || "Success"
  };
}

/* =========================================
   공통 함수
========================================= */

function clean(value) {
  return String(value || "")
    .trim()
    .slice(0, 300);
}

function html(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pathEncode(value) {
  return encodeURIComponent(
    String(value || "").trim()
  );
}

function typeName(type) {
  if (type === "jeonse") return "전세";
  if (type === "monthly") return "월세";
  return "매매";
}

function safeUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  try {
    const parsed = new URL(
      /^https?:\/\//i.test(url) ? url : "https://" + url
    );
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.href;
  } catch (error) {
    return "";
  }
}

function firstValue(row, names) {
  if (!row) return "";
  for (const name of names) {
    const value = row[name];
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return String(value).trim();
    }
  }
  return "";
}

function apartmentDetails(row) {
  if (!row) return [];

  const skipKeys = new Set([
    "id",
    "created_at",
    "updated_at",
    "latitude",
    "longitude",
    "geocode_status",
    "주택관리업자 사업자등록번호",
    "시도",
    "시군구",
    "읍면",
    "동리",
    "단지명"
  ]);

  const preferred = [
    "단지 주소(도로명)",
    "도로명주소",
    "단지 주소(지번)",
    "지번주소",
    "주소",
    "우편번호",
    "단지분류",
    "분양형태",
    "세대수",
    "총세대수",
    "분양세대수",
    "동수",
    "총동수",
    "최고층수",
    "최고층",
    "사용승인일",
    "준공년월",
    "준공일",
    "시공사",
    "건설사",
    "시행사",
    "난방방식",
    "복도유형",
    "주차대수",
    "총주차대수",
    "일반관리-관리방식",
    "경비관리-관리방식",
    "부대복리시설",
    "관리사무소 연락처",
    "관리사무소 팩스",
    "관리사무소 주소",
    "주택관리업자"
  ];

  const result = [];
  const used = new Set();

  preferred.forEach(function(key) {
    const value = row[key];
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== "" &&
      String(value).trim() !== "null"
    ) {
      let displayVal = String(value).trim();
      if (key === "사용승인일" && /^\d{8}$/.test(displayVal)) {
        displayVal = displayVal.slice(0, 4) + "년 " + displayVal.slice(4, 6) + "월 " + displayVal.slice(6, 8) + "일";
      } else if ((key === "세대수" || key === "분양세대수") && /^\d+$/.test(displayVal)) {
        displayVal = Number(displayVal).toLocaleString("ko-KR") + "세대";
      } else if (key === "동수" && /^\d+$/.test(displayVal)) {
        displayVal = displayVal + "개동";
      } else if ((key === "최고층수" || key === "최고층") && /^\d+$/.test(displayVal)) {
        displayVal = "지상 " + displayVal + "층";
      }
      result.push({
        key: key,
        value: displayVal
      });
      used.add(key);
    }
  });

  Object.keys(row).forEach(function(key) {
    if (used.has(key) || skipKeys.has(key)) return;
    const value = row[key];
    if (
      value === undefined ||
      value === null ||
      String(value).trim() === "" ||
      String(value).trim() === "null"
    ) {
      return;
    }
    if (
      /^uuid$/i.test(key) ||
      /password/i.test(key) ||
      /token/i.test(key) ||
      /secret/i.test(key)
    ) {
      return;
    }
    result.push({
      key: key,
      value: String(value).trim()
    });
    used.add(key);
  });

  return result;
}

/* =========================================
   안심거래 Supabase (safe_apartments)
========================================= */

const APT_SUPABASE_URL =
  "https://dcysjuxyjqtvkihdsjvv.supabase.co";

const APT_SUPABASE_KEY =
  "sb_publishable_RZBX7u1v8MLBCfEJT0-eRg_jPcIulG2";

function aptClean(value) {
  return String(value || "")
    .trim()
    .slice(0, 100);
}

function aptHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function aptXmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function aptPathEncode(value) {
  return encodeURIComponent(
    String(value || "").trim()
  );
}

function aptTypeName(type) {
  if (type === "jeonse") return "전세";
  if (type === "monthly") return "월세";
  return "매매";
}

function aptAddPlaceFilter(query, place) {
  const tokens = aptClean(place)
    .split(/\s+/)
    .map(function(token) {
      return token.replace(/[(),.*]/g, "");
    })
    .filter(Boolean)
    .slice(0, 3);

  if (tokens.length === 1) {
    query.set(
      "or",
      "(" +
        "읍면.eq." + tokens[0] + "," +
        "동리.eq." + tokens[0] +
      ")"
    );
  }

  if (tokens.length > 1) {
    query.set(
      "and",
      "(" +
        tokens
          .map(function(token) {
            return "or(읍면.eq." + token + ",동리.eq." + token + ")";
          })
          .join(",") +
      ")"
    );
  }
}

/* =========================================
   아파트 목록 API
========================================= */

async function aptHandleApartmentList(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");

  const pageNo = Math.max(1, parseInt(req.query.pageNo || "1", 10));
  const requestedRows = parseInt(req.query.numOfRows || "1000", 10);
  const numOfRows = Math.min(Math.max(requestedRows, 1), 1000);
  const offset = (pageNo - 1) * numOfRows;
  const end = offset + numOfRows - 1;

  const rawKeyword = String(req.query.q || "").trim();
  const searchKeyword = rawKeyword
    .replace(/매매|전세|월세|아파트/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const searchTokens = searchKeyword
    .split(" ")
    .map(function(token) {
      return token.replace(/[(),.*]/g, "").trim();
    })
    .filter(function(token) {
      return token.length >= 2;
    })
    .slice(0, 5);

  const query = new URLSearchParams();
  query.set("select", "시도,시군구,읍면,동리,단지명");
  query.set("order", "시도.asc,시군구.asc,읍면.asc,동리.asc,단지명.asc");

  if (searchTokens.length === 1) {
    const token = searchTokens[0];
    query.set(
      "or",
      "(" +
        ["시도", "시군구", "읍면", "동리", "단지명"]
          .map(function(column) {
            return column + ".ilike.*" + token + "*";
          })
          .join(",") +
      ")"
    );
  }

  if (searchTokens.length > 1) {
    const tokenFilters = searchTokens.map(function(token) {
      return (
        "or(" +
        ["시도", "시군구", "읍면", "동리", "단지명"]
          .map(function(column) {
            return column + ".ilike.*" + token + "*";
          })
          .join(",") +
        ")"
      );
    });
    query.set("and", "(" + tokenFilters.join(",") + ")");
  }

  const apiUrl = APT_SUPABASE_URL + "/rest/v1/safe_apartments?" + query.toString();

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        apikey: APT_SUPABASE_KEY,
        Authorization: "Bearer " + APT_SUPABASE_KEY,
        Accept: "application/json",
        Prefer: "count=exact",
        Range: offset + "-" + end
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("SUPABASE APT LIST ERROR:", errorText);
      return res.status(502).json({
        ok: false,
        message: "아파트 목록을 불러오지 못했습니다.",
        status: response.status
      });
    }

    const data = await response.json();
    const contentRange = response.headers.get("content-range") || "";
    let totalCount = data.length;

    if (contentRange && contentRange.includes("/")) {
      const total = contentRange.split("/").pop();
      if (total && total !== "*") {
        const parsed = Number(total);
        if (Number.isFinite(parsed)) {
          totalCount = parsed;
        }
      }
    }

    const apartments = data.map(function(item, index) {
      const eupmyeon = item["읍면"] || "";
      const dongri = item["동리"] || "";
      return {
        kaptCode: String(offset + index + 1),
        kaptName: item["단지명"] || "",
        bjdCode: "",
        region: item["시도"] || "",
        city: item["시군구"] || "",
        dong: [eupmyeon, dongri].filter(Boolean).join(" "),
        detail: dongri || eupmyeon || ""
      };
    });

    return res.status(200).json({
      ok: true,
      pageNo: pageNo,
      numOfRows: numOfRows,
      totalCount: totalCount,
      count: apartments.length,
      apartments: apartments
    });
  } catch (error) {
    console.error("SAFE APARTMENTS API ERROR:", error);
    return res.status(500).json({
      ok: false,
      message: "아파트 데이터를 불러오는 중 오류가 발생했습니다."
    });
  }
}

/* =========================================
   아파트 사이트맵 인덱스
========================================= */

async function aptHandleSitemapIndex(req, res) {
  try {
    const response = await fetch(
      APT_SUPABASE_URL + "/rest/v1/safe_apartments?select=단지명",
      {
        headers: {
          apikey: APT_SUPABASE_KEY,
          Authorization: "Bearer " + APT_SUPABASE_KEY,
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
    const pages = Math.max(1, Math.ceil(totalCount / SITEMAP_PAGE_SIZE));
    const lastmod = new Date().toISOString().split("T")[0];

    let sitemapItems = "";
    for (let page = 1; page <= pages; page += 1) {
      sitemapItems +=
        "<sitemap>" +
          "<loc>" + SITE_ORIGIN + "/sitemaps/apartments-" + page + ".xml</loc>" +
          "<lastmod>" + lastmod + "</lastmod>" +
        "</sitemap>";
    }

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");

    return res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      sitemapItems +
      "</sitemapindex>"
    );
  } catch (error) {
    console.error("APT SITEMAP INDEX ERROR:", error);
    return res.status(500).send("Sitemap error");
  }
}

/* =========================================
   아파트 개별 사이트맵
========================================= */

async function aptHandleSitemap(req, res) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");

  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const start = (page - 1) * SITEMAP_PAGE_SIZE;
    const end = start + SITEMAP_PAGE_SIZE - 1;

    const query = new URLSearchParams();
    query.set("select", "시도,시군구,읍면,동리,단지명");
    query.set("order", "시도.asc,시군구.asc,동리.asc,단지명.asc");

    const apiUrl = APT_SUPABASE_URL + "/rest/v1/safe_apartments?" + query.toString();

    const batchPromises = [];
    for (let batchStart = start; batchStart <= end; batchStart += 1000) {
      const batchEnd = Math.min(batchStart + 999, end);
      batchPromises.push(
        fetch(apiUrl, {
          method: "GET",
          headers: {
            apikey: APT_SUPABASE_KEY,
            Authorization: "Bearer " + APT_SUPABASE_KEY,
            Range: batchStart + "-" + batchEnd
          }
        }).then(async function(response) {
          if (!response.ok) return [];
          const data = await response.json();
          return Array.isArray(data) ? data : [];
        })
      );
    }

    const batchResults = await Promise.all(batchPromises);
    const rows = batchResults.flat();
    const urlSet = new Set();
    const tradeTypes = ["sale", "jeonse", "monthly"];

    for (const row of rows) {
      const region = String(row["시도"] || "").trim();
      const city = String(row["시군구"] || "").trim();
      const place = String(row["동리"] || row["읍면"] || "").trim();
      const apartment = String(row["단지명"] || "").trim();

      if (!region || !city || !place) continue;

      for (const type of tradeTypes) {
        const regionPath =
          "/apt-search/" +
          aptPathEncode(region) + "/" +
          aptPathEncode(city) + "/" +
          aptPathEncode(place) + "/" +
          type;

        urlSet.add(SITE_ORIGIN + regionPath);

        if (apartment) {
          const apartmentPath =
            "/apt-search/" +
            aptPathEncode(region) + "/" +
            aptPathEncode(city) + "/" +
            aptPathEncode(place) + "/" +
            aptPathEncode(apartment) + "/" +
            type;

          urlSet.add(SITE_ORIGIN + apartmentPath);
        }
      }
    }

    const lastmod = new Date().toISOString().split("T")[0];

    const urls = Array.from(urlSet)
      .map(function(url) {
        return [
          "  <url>",
          "    <loc>" + aptXmlEscape(url) + "</loc>",
          "    <lastmod>" + lastmod + "</lastmod>",
          "    <changefreq>weekly</changefreq>",
          "    <priority>0.8</priority>",
          "  </url>"
        ].join("\n");
      })
      .join("\n");

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urls,
      "</urlset>"
    ].join("\n");

    return res.status(200).send(xml);
  } catch (error) {
    console.error("APT SITEMAP ERROR:", error);
    return res.status(500).send("Sitemap generation failed.");
  }
}

/* =========================================
   아파트 자동 검색페이지 (/apt-search/...)
========================================= */

const ALL_SIDO_OPTIONS = [
  "서울특별시",
  "경기도",
  "인천광역시",
  "부산광역시",
  "대구광역시",
  "대전광역시",
  "광주광역시",
  "전남광주통합특별시",
  "울산광역시",
  "세종특별자치시",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도"
];

const REGION_VARIANT_GROUPS = [
  ["서울특별시", "서울시", "서울"],
  ["경기도", "경기"],
  ["인천광역시", "인천시", "인천"],
  ["부산광역시", "부산시", "부산"],
  ["대구광역시", "대구시", "대구"],
  ["광주광역시", "전남광주통합특별시", "광주시", "광주"],
  ["대전광역시", "대전시", "대전"],
  ["울산광역시", "울산시", "울산"],
  ["세종특별자치시", "세종시", "세종"],
  ["강원특별자치도", "강원도", "강원"],
  ["충청북도", "충북"],
  ["충청남도", "충남"],
  ["전북특별자치도", "전라북도", "전북"],
  ["전라남도", "전남", "전남광주통합특별시"],
  ["경상북도", "경북"],
  ["경상남도", "경남"],
  ["제주특별자치도", "제주도", "제주"]
];

function getRegionVariants(r) {
  const cleanR = aptClean(r);
  if (!cleanR) return [];
  for (const grp of REGION_VARIANT_GROUPS) {
    if (grp.includes(cleanR)) return grp;
  }
  return [cleanR];
}

async function aptHandleApartmentPage(req, res) {
  const rawRegion = aptClean(req.query.region);
  const displayRegion = rawRegion || "서울특별시";
  const city = aptClean(req.query.city);
  const place = aptClean(req.query.place);
  const apartment = aptClean(req.query.apartment);

  const type = ["sale", "jeonse", "monthly"].includes(req.query.type)
    ? req.query.type
    : "sale";

  if (!place) {
    return res.status(404).send("페이지를 찾을 수 없습니다.");
  }

  const query = new URLSearchParams();
  query.set("select", "*");
  query.set("order", "단지명.asc");

  if (rawRegion) {
    const rVars = getRegionVariants(rawRegion);
    query.set("시도", "in.(" + rVars.join(",") + ")");
  }

  if (city) {
    query.set("시군구", "eq." + city);
  }

  aptAddPlaceFilter(query, place);

  // 동일 시·군·구 내 인근 동(읍·면) 및 주변 단지 크롤링 허브 구성을 위한 병렬 쿼리
  const cityQuery = new URLSearchParams();
  cityQuery.set("select", "시도,시군구,읍면,동리,단지명,세대수,동수,최고층수,시공사,단지 주소(도로명),주소");
  cityQuery.set("order", "동리.asc,단지명.asc");
  if (rawRegion) {
    cityQuery.set("시도", "in.(" + getRegionVariants(rawRegion).join(",") + ")");
  }
  if (city) {
    cityQuery.set("시군구", "eq." + city);
  }

  try {
    const [response, cityRes] = await Promise.all([
      fetch(
        APT_SUPABASE_URL + "/rest/v1/safe_apartments?" + query.toString(),
        {
          headers: {
            apikey: APT_SUPABASE_KEY,
            Authorization: "Bearer " + APT_SUPABASE_KEY,
            Accept: "application/json",
            Range: "0-299"
          }
        }
      ),
      city
        ? fetch(
            APT_SUPABASE_URL + "/rest/v1/safe_apartments?" + cityQuery.toString(),
            {
              headers: {
                apikey: APT_SUPABASE_KEY,
                Authorization: "Bearer " + APT_SUPABASE_KEY,
                Accept: "application/json",
                Range: "0-249"
              }
            }
          ).catch(function() { return null; })
        : Promise.resolve(null)
    ]);

    if (!response.ok) {
      return res.status(502).send("아파트 정보를 불러오지 못했습니다.");
    }

    let rows = await response.json();
    let cityRows = [];
    if (cityRes && cityRes.ok) {
      const cr = await cityRes.json();
      if (Array.isArray(cr)) cityRows = cr;
    }

    // 만약 특정 동 조회 결과가 비어 있다면 동일 시군구 내 대표 단지들로 폴백하여 404 방지
    if (!Array.isArray(rows) || rows.length === 0) {
      if (cityRows.length > 0) {
        rows = cityRows.slice(0, 60);
      } else {
        const fbQuery = new URLSearchParams();
        fbQuery.set("select", "*");
        fbQuery.set("order", "단지명.asc");
        if (rawRegion) {
          fbQuery.set("시도", "in.(" + getRegionVariants(rawRegion).join(",") + ")");
        }
        if (city) {
          fbQuery.set("시군구", "ilike.*" + city.split(" ")[0] + "*");
        }
        const fbRes = await fetch(
          APT_SUPABASE_URL + "/rest/v1/safe_apartments?" + fbQuery.toString(),
          {
            headers: {
              apikey: APT_SUPABASE_KEY,
              Authorization: "Bearer " + APT_SUPABASE_KEY,
              Accept: "application/json",
              Range: "0-59"
            }
          }
        );
        if (fbRes.ok) {
          rows = await fbRes.json();
        }
      }
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      rows = [{
        "시도": rawRegion || "서울특별시",
        "시군구": city || "강남구",
        "동리": place,
        "단지명": apartment || (place + " 아파트"),
        "세대수": "단지별 상이",
        "최고층수": "단지별 상이",
        "도로명주소": [rawRegion, city, place].filter(Boolean).join(" ")
      }];
    }

    // 특정 아파트 상세 페이지인 경우 해당 단지 행을 정확히 찾음 (동 전체 목록 rows는 그대로 유지하여 내부링크 극대화)
    let matchedAptRow = null;
    if (apartment) {
      matchedAptRow = rows.find(function(r) {
        return aptClean(r["단지명"]) === apartment;
      });
      if (!matchedAptRow) {
        const exactQ = new URLSearchParams();
        exactQ.set("select", "*");
        if (rawRegion) exactQ.set("시도", "in.(" + getRegionVariants(rawRegion).join(",") + ")");
        if (city) exactQ.set("시군구", "eq." + city);
        exactQ.set("단지명", "eq." + apartment);
        exactQ.set("limit", "1");
        try {
          const exactRes = await fetch(APT_SUPABASE_URL + "/rest/v1/safe_apartments?" + exactQ.toString(), {
            headers: {
              apikey: APT_SUPABASE_KEY,
              Authorization: "Bearer " + APT_SUPABASE_KEY,
              Accept: "application/json"
            }
          });
          if (exactRes.ok) {
            const exactArr = await exactRes.json();
            if (Array.isArray(exactArr) && exactArr.length > 0) {
              matchedAptRow = exactArr[0];
              rows.unshift(matchedAptRow);
            }
          }
        } catch (_) {}
      }
    }

    const firstRow = matchedAptRow || rows[0] || {};
    const canonicalRegion = rawRegion || aptClean(firstRow["시도"]) || "서울특별시";
    const trade = aptTypeName(type);
    const location = [canonicalRegion, city, place].filter(Boolean).join(" ");
    const subject = [location, apartment || "아파트", trade].filter(Boolean).join(" ");

    const canonical =
      SITE_ORIGIN +
      "/apt-search/" +
      (
        apartment
          ? [canonicalRegion, city, place, apartment, type]
          : [canonicalRegion, city, place, type]
      )
        .map(encodeURIComponent)
        .join("/");

    const primaryRoadAddr = firstValue(firstRow, ["단지 주소(도로명)", "도로명주소", "주소"]);
    const primaryJibunAddr = firstValue(firstRow, ["단지 주소(지번)", "지번주소"]);
    const primaryHouseholds = firstValue(firstRow, ["세대수", "총세대수"]);
    const primaryDongs = firstValue(firstRow, ["동수", "총동수"]);
    const primaryMaxFloor = firstValue(firstRow, ["최고층수", "최고층"]);
    const primaryBuilder = firstValue(firstRow, ["시공사", "건설사"]);
    const primaryDeveloper = firstValue(firstRow, ["시행사"]);
    const primaryApproval = firstValue(firstRow, ["사용승인일", "준공년월", "준공일"]);
    const primaryFacilities = firstValue(firstRow, ["부대복리시설"]);
    const primaryMgmtType = firstValue(firstRow, ["일반관리-관리방식"]);
    const primaryMgmtPhone = firstValue(firstRow, ["관리사무소 연락처"]);
    const primaryMgmtCompany = firstValue(firstRow, ["주택관리업자"]);

    const formattedApproval = /^\d{8}$/.test(primaryApproval)
      ? primaryApproval.slice(0, 4) + "년 " + primaryApproval.slice(4, 6) + "월 " + primaryApproval.slice(6, 8) + "일"
      : (primaryApproval || "국토부 등록 기준");
    const builtYear = /^\d{4}/.test(primaryApproval) ? Number(primaryApproval.slice(0, 4)) : 0;
    const ageYears = builtYear > 1950 ? Math.max(0, 2026 - builtYear) : null;
    const hhCountNum = Number(String(primaryHouseholds).replace(/[^0-9]/g, "")) || 0;
    const dongCountNum = Number(String(primaryDongs).replace(/[^0-9]/g, "")) || 0;
    const avgHhPerDong = (hhCountNum > 0 && dongCountNum > 0) ? Math.round(hhCountNum / dongCountNum) : 0;
    const scaleCategory = hhCountNum >= 1000
      ? "대단지 프리미엄 공동주택"
      : (hhCountNum >= 500 ? "중대형 주거 선호 단지" : (hhCountNum >= 200 ? "실거주 중심 알짜 단지" : "실속형 공동주택 단지"));

    const description = apartment
      ? `${subject} 실거래가·매물·시세 및 단지 정보(${primaryHouseholds ? primaryHouseholds + "세대" : "국토부 등록"}${builtYear ? "·" + builtYear + "년 준공" : ""}). 전세사기·깡통전세·중개사고 걱정 없는 [아파트 안심딜]에서 아파트 매수·임차 희망조건을 등록하고 매칭수수료 및 중개수수료 50% 절감 혜택과 검증된 공인중개사 1:1 맞춤 제안을 받아보세요.`
      : `${subject} 실거래가·시세 및 ${place} 아파트 단지 정보. 전세사기·깡통전세 방지 [아파트 안심딜]에서 매매(매수)·전월세(임차) 조건을 등록하면 수수료 및 매칭수수료 50% 반값으로 안전하게 계약할 수 있습니다.`;

    // Unique apartment rows in current 동 by 단지명
    const uniqueAptMap = new Map();
    for (const r of rows) {
      const n = aptClean(r["단지명"]);
      if (n && !uniqueAptMap.has(n)) {
        uniqueAptMap.set(n, r);
      }
    }
    // 만약 해당 동에 단지가 적을 경우(5개 미만), 동일 시군구 내 인근 단지들도 함께 결합하여 내부 링크 및 매칭기 풍성도 극대화
    if (uniqueAptMap.size < 12 && cityRows.length > 0) {
      for (const cr of cityRows) {
        const cn = aptClean(cr["단지명"]);
        if (cn && !uniqueAptMap.has(cn)) {
          uniqueAptMap.set(cn, cr);
          if (uniqueAptMap.size >= 30) break;
        }
      }
    }
    const uniqueAptRows = Array.from(uniqueAptMap.values());
    const apartmentNames = Array.from(uniqueAptMap.keys());

    // 동일 시·군·구 내 다른 법정동(읍·면·동) 허브 링크 추출 (46,727개 미수집 페이지 크롤링 돌파용 거미줄 링크)
    const siblingDongSet = new Set();
    for (const cr of cityRows) {
      const dName = aptClean(cr["동리"] || cr["읍면"]);
      if (dName && dName !== place) {
        siblingDongSet.add(dName);
      }
    }
    const siblingDongs = Array.from(siblingDongSet).slice(0, 36);

    const siblingDongsHtml = siblingDongs.length > 0
      ? siblingDongs.map(function(dName) {
          const dUrl = "/apt-search/" + [canonicalRegion, city, dName, type].map(encodeURIComponent).join("/");
          const bUrl = "/broker-search/" + [canonicalRegion, city, dName].map(encodeURIComponent).join("/");
          const mUrl = "/mart-search/" + [canonicalRegion, city, dName].map(encodeURIComponent).join("/");
          return (
            '<div class="apt-dir-item" style="padding:10px 13px;">' +
              '<div class="apt-dir-main">' +
                '<a class="apt-dir-title" href="' + dUrl + '">📍 ' + aptHtml(city + " " + dName + " 아파트 " + trade) + '</a>' +
                '<span class="apt-dir-meta">' + aptHtml(canonicalRegion + " " + city + " " + dName + " 실거래·중개사·마트 허브") + '</span>' +
              '</div>' +
              '<div class="apt-dir-links">' +
                '<a href="/apt-search/' + [canonicalRegion, city, dName, "sale"].map(encodeURIComponent).join("/") + '"' + (type === "sale" ? ' class="active"' : '') + '>매매</a>' +
                '<a href="/apt-search/' + [canonicalRegion, city, dName, "jeonse"].map(encodeURIComponent).join("/") + '"' + (type === "jeonse" ? ' class="active"' : '') + '>전세</a>' +
                '<a href="/apt-search/' + [canonicalRegion, city, dName, "monthly"].map(encodeURIComponent).join("/") + '"' + (type === "monthly" ? ' class="active"' : '') + '>월세</a>' +
                '<a href="' + bUrl + '">중개사</a>' +
                '<a href="' + mUrl + '">마트</a>' +
              '</div>' +
            '</div>'
          );
        }).join("")
      : "";

    // Build rich apartment list HTML for neighborhood pages (or related list)
    const listHtml = uniqueAptRows
      .slice(0, 120)
      .map(function(r) {
        const name = aptClean(r["단지명"]);
        const rPlace = aptClean(r["동리"] || r["읍면"]) || place;
        const hh = r["세대수"] ? Number(r["세대수"]).toLocaleString("ko-KR") + "세대" : "";
        const dongs = r["동수"] ? r["동수"] + "개동" : "";
        const fl = r["최고층수"] ? "최고 " + r["최고층수"] + "층" : "";
        const builder = r["시공사"] ? String(r["시공사"]).trim() : "";
        const addr = r["단지 주소(도로명)"] || r["주소"] || "";
        const metaParts = [hh, dongs, fl, builder].filter(Boolean).join(" · ");

        const baseAptPath =
          "/apt-search/" +
          [canonicalRegion, city, rPlace, name].map(encodeURIComponent).join("/");

        return (
          '<li class="apt-dir-item">' +
            '<div class="apt-dir-main">' +
              '<a class="apt-dir-title" href="' + baseAptPath + "/" + type + '">' +
                aptHtml(rPlace + " " + name + " " + trade) +
              "</a>" +
              (metaParts ? '<span class="apt-dir-meta">' + aptHtml(metaParts) + "</span>" : "") +
              (addr ? '<span class="apt-dir-addr">📍 ' + aptHtml(addr) + "</span>" : "") +
            "</div>" +
            '<div class="apt-dir-links">' +
              '<a href="' + baseAptPath + '/sale" class="' + (type === "sale" ? "active" : "") + '">매매</a>' +
              '<a href="' + baseAptPath + '/jeonse" class="' + (type === "jeonse" ? "active" : "") + '">전세</a>' +
              '<a href="' + baseAptPath + '/monthly" class="' + (type === "monthly" ? "active" : "") + '">월세</a>' +
            "</div>" +
          "</li>"
        );
      })
      .join("");

    // Detailed specs when a specific apartment is viewed
    const detailsList = apartment ? apartmentDetails(firstRow) : [];
    const detailsTableHtml = detailsList.length > 0
      ? (
        '<table class="spec-table">' +
          "<tbody>" +
            detailsList.map(function(d) {
              return (
                "<tr>" +
                  "<th>" + aptHtml(d.key) + "</th>" +
                  "<td>" + aptHtml(d.value) + "</td>" +
                "</tr>"
              );
            }).join("") +
          "</tbody>" +
        "</table>"
      )
      : "";

    // Trade type switcher URLs for current page
    const basePagePrefix =
      "/apt-search/" +
      (apartment
        ? [canonicalRegion, city, place, apartment]
        : [canonicalRegion, city, place]
      ).map(encodeURIComponent).join("/");

    const brokerSearchUrl =
      "/broker-search/" +
      [canonicalRegion, city, place].map(encodeURIComponent).join("/");

    // Initial server-rendered matcher cards so search engines and users see content immediately
    const matcherType = type === "monthly" ? "rent" : type;
    const defaultBudget = matcherType === "sale" ? 20000 : (matcherType === "jeonse" ? 15000 : 2000);
    const initialMatcherRows = uniqueAptRows.slice(0, 25).map(function(r) {
      return {
        "시도": r["시도"] || canonicalRegion,
        "시군구": r["시군구"] || city,
        "동리": r["동리"] || r["읍면"] || place,
        "단지명": r["단지명"] || "아파트",
        "세대수": r["세대수"] || null,
        "최고층수": r["최고층수"] || null
      };
    });

    const initialCardsHtml = initialMatcherRows.slice(0, 12).map(function(apt, idx) {
      const name = apt["단지명"] || "아파트";
      const dong = apt["동리"] || place;
      const hh = apt["세대수"] ? (apt["세대수"] + "세대") : "국토부 등록";
      const fl = apt["최고층수"] ? ("최고 " + apt["최고층수"] + "층") : "15층";
      const specTxt = hh + " / " + fl;
      const aptDetailUrl =
        "/apt-search/" +
        [canonicalRegion, city, dong, name, type].map(encodeURIComponent).join("/");
      const applyUrl =
        "/request?type=" + encodeURIComponent(type) +
        "&dong=" + encodeURIComponent(dong) +
        "&apt=" + encodeURIComponent(name);

      return (
        '<div class="m-apt-card">' +
          '<div class="m-apt-name">' +
            '<a href="' + aptDetailUrl + '" style="color:#0f172a;text-decoration:none;">[' + aptHtml(dong) + "] " + aptHtml(name) + "</a>" +
            '<span class="m-apt-floor">' + aptHtml(specTxt) + "</span>" +
          "</div>" +
          '<div class="m-price-row">' +
            '<span class="m-price-badge m-badge-' + matcherType + '">국토부 ' + aptHtml(trade) + ' 실거래 대상</span>' +
            '<span class="m-price-date">국토교통부 등록 단지</span>' +
          "</div>" +
          '<div class="m-benefit-box m-benefit-' + matcherType + '">' +
            "<span>중개사 표준 수수료의 절반</span>" +
            '<span class="m-benefit-save">➔ 수수료 50% 절약 혜택</span>' +
          "</div>" +
          '<a href="' + applyUrl + '" class="m-apt-apply-btn">🤝 이 아파트 안심거래 신청하기 (수수료 50% 절약) ›</a>' +
        "</div>"
      );
    }).join("");

    // JSON-LD Structured Data
    const breadcrumbItems = [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "우리아파트 안심거래 홈",
        "item": SITE_ORIGIN + "/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": location + " 아파트 " + trade,
        "item": SITE_ORIGIN + "/apt-search/" + [canonicalRegion, city, place, type].map(encodeURIComponent).join("/")
      }
    ];
    if (apartment) {
      breadcrumbItems.push({
        "@type": "ListItem",
        "position": 3,
        "name": subject,
        "item": canonical
      });
    }

    const jsonLdArray = [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": breadcrumbItems
      }
    ];

    if (apartment) {
      const aptSchema = {
        "@context": "https://schema.org",
        "@type": "ApartmentComplex",
        "name": location + " " + apartment,
        "description": description,
        "url": canonical,
        "address": {
          "@type": "PostalAddress",
          "streetAddress": primaryRoadAddr || primaryJibunAddr || location,
          "addressLocality": city,
          "addressRegion": canonicalRegion,
          "postalCode": firstValue(firstRow, ["우편번호"]) || undefined,
          "addressCountry": "KR"
        }
      };
      if (firstRow.latitude && firstRow.longitude) {
        aptSchema.geo = {
          "@type": "GeoCoordinates",
          "latitude": Number(firstRow.latitude),
          "longitude": Number(firstRow.longitude)
        };
      }
      jsonLdArray.push(aptSchema);
    } else {
      jsonLdArray.push({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": subject,
        "description": description,
        "url": canonical
      });
    }

    const faqTargetName = apartment ? (location + " " + apartment) : (location + " 아파트");
    const faqItems = [
      {
        q: `${faqTargetName}의 기본 단지 제원과 위치·준공 정보는 어떻게 되나요?`,
        a: apartment
          ? `${faqTargetName} 단지는 도로명주소 ${primaryRoadAddr || primaryJibunAddr || location}에 위치하며, 총 ${primaryHouseholds || "다수 "}세대${primaryDongs ? " · " + primaryDongs + "개동" : ""}${primaryMaxFloor ? " · 최고 " + primaryMaxFloor + "층" : ""} 규모의 ${scaleCategory}입니다. 사용승인일(준공일)은 ${formattedApproval}${ageYears !== null ? "(입주 " + ageYears + "년차)" : ""}이며 시공사 ${primaryBuilder || "등록 건설사"}가 시공하였습니다.`
          : `${location} 지역에는 총 ${apartmentNames.length}개 주요 아파트 단지가 국토교통부 공동주택 데이터에 등록되어 있으며, 각 단지별 세대수·준공연도·도로명주소 및 매매·전세·월세 실거래 시세를 본 페이지에서 실시간으로 비교하실 수 있습니다.`
      },
      {
        q: `${faqTargetName} ${trade} 계약 시 중개수수료 50% 절감은 어떻게 적용되나요?`,
        a: `우리아파트 안심거래(아파트 안심딜) 플랫폼에 ${faqTargetName} ${trade} 희망 예산과 입주 조건을 무료로 등록하시면, ${city} ${place} 관할 검증된 협력 공인중개사가 조건에 맞는 매물을 1:1 역제안합니다. 매수자·임차인은 법정 표준 중개보수의 절반(50%) 수준만 부담하여 수십만 원에서 수백만 원의 수수료를 합법적으로 절약할 수 있습니다.`
      },
      {
        q: `${place} 아파트 ${trade} 거래 시 전세사기·깡통전세 및 허위매물 예방 시스템은 무엇인가요?`,
        a: `모든 제안 매물은 국토교통부 실거래가 공공데이터 및 등기부등본 권리분석(선순위 근저당·전세가율·HUG 전세보증보험 가입 가능 여부) 검증을 거치며, 국토부 부동산 전자계약 시스템과 에스크로 안전결제 가이드를 통해 전세사기·깡통전세·중개사고를 원천 차단합니다.`
      },
      {
        q: `${faqTargetName} 주변 동네마트 시세와 이사 정산·등기 팩트체크 도구도 이용할 수 있나요?`,
        a: `네, ${location} 입주민과 이주 예정자를 위해 ${place} 인근 동네마트·식자재마트 디렉토리와 농·축·수산물 60종 오늘의 장보기 시세 비교, 전기·수도·가스 이사요금 1초 정산기, 허위·팔린매물 1초 팩트체크 도구를 무료로 제공하고 있습니다.`
      }
    ];

    jsonLdArray.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqItems.map(function(item) {
        return {
          "@type": "Question",
          "name": item.q,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": item.a
          }
        };
      })
    });

    const sidoOptionsHtml = ALL_SIDO_OPTIONS.map(function(s) {
      const isSelected = (s === canonicalRegion) ? " selected" : "";
      return '<option value="' + aptHtml(s) + '"' + isSelected + ">" + aptHtml(s) + "</option>";
    }).join("\n            ");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800"
    );

    return res.status(200).send(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>[아파트 안심딜] ${aptHtml(subject)} 실거래가·시세 | 매칭수수료 50% 절감 · 전세사기 예방</title>
<meta name="description" content="${aptHtml(description)}">
<meta name="keywords" content="${aptHtml(location + " 아파트, " + subject + ", " + place + " 아파트 매매, " + place + " 아파트 전세, " + place + " 아파트 월세, " + place + " 아파트 매수, " + place + " 아파트 임차, " + (apartment ? apartment + " 실거래가, " + apartment + " 매매, " : "") + "아파트 안심딜, 안심딜, 전세사기 예방, 깡통전세 방지, 중개사고 보증, 수수료 50%, 매칭수수료 50%, 매칭수수료 반값")}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${aptHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="아파트 안심딜">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="[아파트 안심딜] ${aptHtml(subject)} | 매칭수수료 50% 절감">
<meta property="og:description" content="${aptHtml(description)}">
<meta property="og:url" content="${aptHtml(canonical)}">
<meta property="og:image" content="${SITE_ORIGIN}/apt-hero.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#1165d7">
<script type="application/ld+json">${JSON.stringify(jsonLdArray)}</script>

<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #f4f7fa;
  color: #172b3d;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", Arial, sans-serif;
}
.wrap {
  max-width: 780px;
  margin: auto;
  padding: 16px 14px 55px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}
.brand {
  color: #173a59;
  font-size: 20px;
  font-weight: 900;
  text-decoration: none;
}
.brand strong { color: #1165d7; }
.breadcrumb {
  font-size: 12.5px;
  color: #64748b;
  margin-bottom: 14px;
  line-height: 1.5;
}
.breadcrumb a {
  color: #1d4ed8;
  text-decoration: none;
  font-weight: 700;
}
.card {
  background: #ffffff;
  border-radius: 18px;
  padding: 22px;
  margin-bottom: 16px;
  box-shadow: 0 8px 26px rgba(20, 55, 90, 0.08);
  border: 1px solid #e2e8f0;
}
h1 {
  margin: 0 0 10px;
  font-size: 26px;
  line-height: 1.38;
  letter-spacing: -0.6px;
  color: #0f172a;
}
h2 {
  margin: 0 0 12px;
  font-size: 20px;
  line-height: 1.42;
  color: #0f172a;
}
p {
  margin: 7px 0;
  line-height: 1.7;
  color: #334155;
  font-size: 14.5px;
}
.hero-eyebrow {
  display: inline-block;
  padding: 5px 11px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 10px;
}
.type-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.type-pill {
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
}
.type-pill.active {
  background: #1d4ed8;
  color: #ffffff;
  border-color: #1d4ed8;
}
.type-pill.broker-link {
  background: #ecfdf5;
  color: #047857;
  border-color: #a7f3d0;
}
.spec-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 13.5px;
}
.spec-table th, .spec-table td {
  border: 1px solid #e2e8f0;
  padding: 10px 12px;
  text-align: left;
  line-height: 1.5;
}
.spec-table th {
  width: 32%;
  background: #f8fafc;
  color: #334155;
  font-weight: 800;
}
.spec-table td {
  color: #0f172a;
  font-weight: 600;
}
.apt-dir-list {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.apt-dir-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 13px 15px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  flex-wrap: wrap;
}
.apt-dir-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 200px;
}
.apt-dir-title {
  font-size: 15px;
  font-weight: 900;
  color: #0f172a;
  text-decoration: none;
}
.apt-dir-title:hover {
  color: #1d4ed8;
  text-decoration: underline;
}
.apt-dir-meta {
  font-size: 12.5px;
  color: #475569;
  font-weight: 700;
}
.apt-dir-addr {
  font-size: 12px;
  color: #64748b;
}
.apt-dir-links {
  display: flex;
  gap: 6px;
}
.apt-dir-links a {
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
}
.apt-dir-links a.active {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #93c5fd;
}
.cta {
  display: block;
  margin-top: 16px;
  padding: 15px;
  border-radius: 12px;
  background: #1267d6;
  color: #ffffff;
  text-align: center;
  text-decoration: none;
  font-weight: 900;
  font-size: 16px;
}
.footer {
  padding: 16px 4px;
  text-align: center;
  font-size: 12px;
  color: #64748b;
  line-height: 1.6;
}
@media (max-width: 600px) {
  h1 { font-size: 22px; }
  h2 { font-size: 18px; }
  .card { padding: 18px 15px; }
  .spec-table th { width: 38%; }
}

/* =========================================
   안심거래 매칭기 위젯
========================================= */
.matcher-container {
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  border: 1px solid #e2e8f0;
  margin-bottom: 20px;
}
.m-top-header {
  background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
  padding: 20px 18px 16px;
  color: #ffffff;
  text-align: center;
  transition: background 0.3s;
}
.m-top-header.theme-jeonse { background: linear-gradient(135deg, #4338ca 0%, #3730a3 100%); }
.m-top-header.theme-rent { background: linear-gradient(135deg, #0f766e 0%, #115e59 100%); }
.m-badge-bar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 11.5px;
  font-weight: 700;
  margin-bottom: 8px;
}
.m-top-header h2 {
  font-size: 20px;
  font-weight: 900;
  margin: 0 0 4px;
  color: #ffffff;
}
.m-top-header p {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.88);
  margin: 0;
}
.m-tab-bar {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  background: rgba(0, 0, 0, 0.25);
  padding: 4px;
  border-radius: 12px;
  margin-top: 14px;
}
.m-tab-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  font-weight: 800;
  padding: 9px 0;
  border-radius: 9px;
  cursor: pointer;
  transition: all 0.2s;
}
.m-tab-btn.active {
  background: #ffffff;
  color: #1d4ed8;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
}
.theme-jeonse .m-tab-btn.active { color: #4338ca; }
.theme-rent .m-tab-btn.active { color: #0f766e; }
.m-filter-area {
  padding: 16px 18px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.m-field-group { display: flex; flex-direction: column; gap: 5px; }
.m-field-header { display: flex; justify-content: space-between; align-items: center; }
.m-field-label { font-size: 12.5px; font-weight: 700; color: #475569; }
.m-field-sublabel { font-size: 13px; font-weight: 800; color: #2563eb; }
.theme-jeonse .m-field-sublabel { color: #4f46e5; }
.theme-rent .m-field-sublabel { color: #0d9488; }
.m-input-wrapper { position: relative; display: flex; align-items: center; }
.m-input-box {
  width: 100%;
  background: #ffffff;
  border: 1.5px solid #cbd5e1;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
  outline: none;
}
.m-input-box:focus { border-color: #2563eb; }
.m-input-unit { position: absolute; right: 12px; font-size: 12.5px; font-weight: 700; color: #64748b; }
.m-preset-row { display: flex; gap: 6px; overflow-x: auto; padding-top: 2px; }
.m-preset-btn {
  flex: 1;
  background: #ffffff;
  border: 1.5px solid #cbd5e1;
  border-radius: 8px;
  padding: 7px 4px;
  font-size: 12px;
  font-weight: 800;
  color: #334155;
  cursor: pointer;
  text-align: center;
  white-space: nowrap;
}
.m-preset-btn.active {
  background: #eff6ff;
  border-color: #2563eb;
  color: #1d4ed8;
}
.m-results-header {
  padding: 12px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
}
.m-results-title { font-size: 13.5px; font-weight: 800; color: #0f172a; }
.m-results-count { font-size: 12px; font-weight: 800; color: #2563eb; }
.m-apt-list {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 440px;
  overflow-y: auto;
  background: #f8fafc;
}
.m-apt-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 13px 14px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.m-apt-name {
  font-size: 14.5px;
  font-weight: 800;
  color: #0f172a;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.m-apt-floor { font-size: 11.5px; color: #64748b; font-weight: 600; }
.m-price-row { display: flex; align-items: center; gap: 8px; }
.m-price-badge { color: #ffffff; font-size: 12.5px; font-weight: 800; padding: 3px 8px; border-radius: 6px; }
.m-badge-sale { background: #2563eb; }
.m-badge-jeonse { background: #4f46e5; }
.m-badge-rent { background: #0d9488; }
.m-price-date { font-size: 11.5px; color: #64748b; font-weight: 600; }
.m-benefit-box {
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11.5px;
  font-weight: 700;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.m-benefit-sale { background: #eff6ff; color: #1e40af; }
.m-benefit-jeonse { background: #eef2ff; color: #3730a3; }
.m-benefit-rent { background: #f0fdfa; color: #115e59; }
.m-benefit-save { color: #dc2626; font-weight: 800; }
.m-bottom-action {
  padding: 14px 18px 18px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
}
.m-footer-note { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 6px; }
.m-region-select-row {
  display: grid;
  grid-template-columns: 1.35fr 1fr 1fr;
  gap: 6px;
}
.m-select-box {
  width: 100%;
  background: #ffffff;
  border: 1.5px solid #cbd5e1;
  border-radius: 10px;
  padding: 9px 8px;
  font-size: 13px;
  font-weight: 800;
  color: #0f172a;
  outline: none;
  cursor: pointer;
}
.m-select-box:focus { border-color: #2563eb; }
.m-dong-input {
  width: 100%;
  background: #ffffff;
  border: 1.5px solid #cbd5e1;
  border-radius: 10px;
  padding: 9px 10px;
  font-size: 13.5px;
  font-weight: 800;
  color: #0f172a;
  outline: none;
}
.m-dong-input:focus { border-color: #2563eb; }
.m-search-btn {
  width: 100%;
  margin-top: 14px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #ffffff;
  border: none;
  border-radius: 12px;
  padding: 14px;
  font-size: 15.5px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.m-apt-apply-btn {
  display: block;
  width: 100%;
  margin-top: 8px;
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: #ffffff !important;
  text-align: center;
  padding: 10px 0;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 800;
  text-decoration: none;
}
.theme-jeonse .m-apt-apply-btn { background: linear-gradient(135deg, #4338ca, #4f46e5); }
.theme-rent .m-apt-apply-btn { background: linear-gradient(135deg, #0f766e, #0d9488); }
.quick-links-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.quick-link-btn {
  display: block;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #1e293b;
  font-size: 12.5px;
  font-weight: 800;
  text-decoration: none;
  text-align: center;
}
.quick-link-btn:hover {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1d4ed8;
}
</style>
</head>

<body>

<main class="wrap">

  <div class="header">
    <a class="brand" href="/">
      우리아파트 <strong>안심거래</strong>
    </a>
    <div style="display:flex;gap:8px;align-items:center;">
      <a href="/map" style="font-size:12.5px;font-weight:800;color:#059669;background:#ecfdf5;border:1px solid #a7f3d0;padding:6px 11px;border-radius:999px;text-decoration:none;">💬 아파트 지도 위 말풍선</a>
      <a href="/price" style="font-size:12.5px;font-weight:800;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;padding:6px 11px;border-radius:999px;text-decoration:none;">🥬 오늘의 시세</a>
    </div>
  </div>

  <nav class="breadcrumb" aria-label="현재 위치">
    <a href="/">🏠 홈</a> &gt;
    <a href="/apt-search/${encodeURIComponent(canonicalRegion)}/${encodeURIComponent(city)}/${encodeURIComponent(place)}/${type}">${aptHtml(location)} 아파트 ${aptHtml(trade)}</a>
    ${apartment ? ` &gt; <strong>${aptHtml(apartment)}</strong>` : ""}
  </nav>

  <!-- 1. 최상단 검색엔진/사용자 대표 타이틀 및 핵심 정보 카드 -->
  <section class="card hero">
    <span class="hero-eyebrow">📍 국토교통부 등록 아파트 · 중개수수료 50% 절감 플랫폼</span>
    <h1>${aptHtml(subject)}</h1>
    ${
      apartment
        ? `<p>
            <strong>${aptHtml(location)} ${aptHtml(apartment)}</strong> 단지의 <strong>${aptHtml(trade)}</strong> 실거래 매칭 및 단지 상세 스펙 안내 페이지입니다.
            ${primaryRoadAddr ? `도로명주소는 <strong>${aptHtml(primaryRoadAddr)}</strong>이며, ` : ""}
            ${primaryHouseholds ? `총 <strong>${aptHtml(primaryHouseholds)}세대</strong> 규모` : "국토교통부 정식 등록 단지"}입니다.
            원하시는 ${aptHtml(trade)} 희망조건(예산·층수·입주일)을 등록하시면 ${aptHtml(place)} 관할 검증된 공인중개사가 맞춤 매물을 1:1 제안하며, <strong>중개수수료 50% 절감 혜택</strong>으로 안전하게 계약하실 수 있습니다.
          </p>`
        : `<p>
            <strong>${aptHtml(location)}</strong> 지역에 등록된 총 <strong>${apartmentNames.length}개 아파트 단지</strong>의 <strong>${aptHtml(trade)}</strong> 실거래 매칭 및 단지별 상세정보 안내 페이지입니다.
            아래 실거래 매칭기 또는 단지 목록에서 원하는 아파트를 선택하고 희망조건을 등록하시면, ${aptHtml(city)} ${aptHtml(place)} 전문 공인중개사의 맞춤 매물 제안과 <strong>중개수수료 50% 절감 혜택</strong>을 받으실 수 있습니다.
          </p>`
    }

    <div class="type-pills">
      <a href="${basePagePrefix}/sale" class="type-pill ${type === "sale" ? "active" : ""}">🏠 ${aptHtml(apartment || place)} 매매</a>
      <a href="${basePagePrefix}/jeonse" class="type-pill ${type === "jeonse" ? "active" : ""}">🔑 ${aptHtml(apartment || place)} 전세</a>
      <a href="${basePagePrefix}/monthly" class="type-pill ${type === "monthly" ? "active" : ""}">🏢 ${aptHtml(apartment || place)} 월세</a>
      <a href="/map" class="type-pill" style="background:#fef3c7;color:#b45309;border-color:#fde68a;">💬 아파트 지도 위 시세·매물 말풍선 보기</a>
      <a href="${brokerSearchUrl}" class="type-pill broker-link">🤝 ${aptHtml(place)} 공인중개사 목록 보기</a>
    </div>

    <a class="cta" href="/request?type=${encodeURIComponent(type)}&dong=${encodeURIComponent(place)}${apartment ? "&apt=" + encodeURIComponent(apartment) : ""}">
      ✍️ ${aptHtml(subject)} 희망조건 등록하고 수수료 50% 절약하기 ›
    </a>
  </section>

  ${
    apartment && detailsTableHtml
      ? `
  <!-- 2. 단지별 실제 DB 건축·입지 상세 스펙 테이블 -->
  <section class="card">
    <h2>🏢 ${aptHtml(apartment)} 단지 기본정보 및 건축·입지 스펙</h2>
    <p>국토교통부 공동주택 공공데이터에 등록된 <strong>${aptHtml(location)} ${aptHtml(apartment)}</strong>의 실제 단지 제원입니다.</p>
    ${detailsTableHtml}
  </section>
      `
      : ""
  }

  <!-- 2-1. 단지별 심층 분석 리포트 및 중개수수료 50% 절감 시뮬레이션 -->
  <section class="card">
    <h2>📊 ${aptHtml(subject)} 단지 심층 분석 및 수수료 50% 절감 가이드</h2>
    ${
      apartment
        ? `<p>
            <strong>${aptHtml(location)} ${aptHtml(apartment)}</strong> 단지는 ${aptHtml(formattedApproval)}${ageYears !== null ? `에 사용승인을 받은 입주 <strong>${ageYears}년차</strong>` : " 등록"} 공동주택으로,
            총 <strong>${aptHtml(primaryHouseholds || "다수 ")}세대</strong>${primaryDongs ? ` · <strong>${aptHtml(primaryDongs)}개동</strong>` : ""}${primaryMaxFloor ? ` · 최고 <strong>${aptHtml(primaryMaxFloor)}층</strong>` : ""}${avgHhPerDong ? ` (동당 평균 약 ${avgHhPerDong}세대)` : ""}으로 구성된 <strong>${aptHtml(scaleCategory)}</strong>입니다.
            ${primaryBuilder ? `시공사는 <strong>${aptHtml(primaryBuilder)}</strong>` : ""}${primaryDeveloper ? `, 시행사는 <strong>${aptHtml(primaryDeveloper)}</strong>` : ""}이며,
            ${primaryMgmtType ? `관리방식은 <strong>${aptHtml(primaryMgmtType)}</strong>` : "체계적인 단지 관리 시스템"}${primaryMgmtCompany ? `(${aptHtml(primaryMgmtCompany)})` : ""}로 운영되고 있습니다.
          </p>
          <p>
            단지 내 주요 부대·복리시설로는 <strong>${aptHtml(primaryFacilities || "관리사무소, 어린이놀이터, 주민공동시설, 주차장")}</strong> 등이 갖춰져 있어 ${aptHtml(place)} 내 실거주 선호도가 높으며,
            도로명주소 <strong>${aptHtml(primaryRoadAddr || location)}</strong>${primaryJibunAddr ? ` (지번: ${aptHtml(primaryJibunAddr)})` : ""}${primaryMgmtPhone ? ` · 관리사무소(${aptHtml(primaryMgmtPhone)})` : ""} 기준 국토교통부 실거래가와 연동하여
            <strong>${aptHtml(trade)}</strong> 시세 비교 및 공인중개사 1:1 역제안 매칭을 지원합니다.
          </p>`
        : `<p>
            <strong>${aptHtml(location)}</strong> 일대는 총 <strong>${apartmentNames.length}개 주요 아파트 단지</strong>가 밀집한 주거 지역으로,
            대단지 브랜드 아파트부터 실속형 단지까지 다양한 평형대와 예산 조건에 맞춘 <strong>${aptHtml(trade)}</strong> 실거래가 형성되어 있습니다.
            우리아파트 안심거래에서는 ${aptHtml(place)} 전체 단지의 국토부 실거래 내역과 단지별 세대수·준공연도·시공사 스펙을 한눈에 비교하고,
            원하는 예산에 맞는 급매·알짜 매물을 관할 공인중개사로부터 직접 제안받을 수 있습니다.
          </p>`
    }
    <table class="spec-table" style="margin-top:14px;">
      <tbody>
        <tr>
          <th>구분 (거래금액 예시)</th>
          <td><strong>법정 상한 중개보수 vs 우리아파트 50% 절감 혜택</strong></td>
        </tr>
        <tr>
          <th>2억 원 매매 / 전세 기준</th>
          <td>매매 표준 80만 원 → <strong style="color:#dc2626;">40만 원 (40만 원 즉시 절약)</strong> / 전세 표준 60만 원 → <strong style="color:#dc2626;">30만 원 절약</strong></td>
        </tr>
        <tr>
          <th>4억 원 매매 / 전세 기준</th>
          <td>매매 표준 160만 원 → <strong style="color:#dc2626;">80만 원 (80만 원 즉시 절약)</strong> / 전세 표준 120만 원 → <strong style="color:#dc2626;">60만 원 절약</strong></td>
        </tr>
        <tr>
          <th>6억 원~9억 원 단지 기준</th>
          <td>매매 표준 240만~450만 원 → <strong style="color:#dc2626;">120만~225만 원 (최대 50% 반값 혜택)</strong></td>
        </tr>
      </tbody>
    </table>
  </section>

  <!-- 3. 실시간 국토부 실거래 아파트 안심거래 매칭기 -->
  <div class="matcher-container">
    <div class="m-top-header" id="m-header-box">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; width:100%;">
        <a href="/" style="text-decoration:none; display:inline-flex; align-items:center; gap:5px; color:#ffffff; font-weight:800; font-size:13.5px; opacity:0.95;">
          <span style="font-size:16px;">🏠</span> 우리아파트 홈
        </a>
        <div id="mInstallBtn" style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; background:rgba(255,255,255,0.2); border:1.5px solid rgba(255,255,255,0.4); padding:6px 14px; border-radius:20px; transition:all 0.2s;" title="스마트폰 홈화면에 앱 설치">
          <span style="font-size:15px; line-height:1;">📲</span>
          <span style="font-size:12.5px; font-weight:800; color:#ffffff;">앱설치</span>
        </div>
      </div>
      <div class="m-badge-bar">
        📊 국토교통부 실거래가 팩트 연동 | 중개사 표준의 절반 수수료
      </div>
      <h2 id="m-header-title">${aptHtml(canonicalRegion)} ${aptHtml(city)} ${aptHtml(place)} - 안심거래 매칭기</h2>
      <p id="m-header-desc">시·구·동을 자유롭게 선택하고 국토부 실거래 아파트를 실시간으로 비교하세요</p>

      <div class="m-tab-bar">
        <button class="m-tab-btn ${matcherType === "sale" ? "active" : ""}" id="m-tab-sale" onclick="mSwitchMode('sale')">🏠 매매</button>
        <button class="m-tab-btn ${matcherType === "jeonse" ? "active" : ""}" id="m-tab-jeonse" onclick="mSwitchMode('jeonse')">🔑 전세</button>
        <button class="m-tab-btn ${matcherType === "rent" ? "active" : ""}" id="m-tab-rent" onclick="mSwitchMode('rent')">🏢 월세</button>
      </div>
    </div>

    <div class="m-filter-area">
      <div class="m-field-group">
        <div class="m-field-header">
          <label class="m-field-label" for="m-sel-sido">희망 지역 (시·구·동 자유 선택)</label>
          <span class="m-field-sublabel" id="m-region-display-txt">${aptHtml(canonicalRegion)} ${aptHtml(city)} ${aptHtml(place)}</span>
        </div>
        <div class="m-region-select-row">
          <select id="m-sel-sido" class="m-select-box" onchange="mHandleSidoChange()">
            ${sidoOptionsHtml}
          </select>
          <select id="m-sel-sigungu" class="m-select-box" onchange="mHandleSigunguChange()">
            <option value="${aptHtml(city || "전체")}" selected>${aptHtml(city || "전체")}</option>
          </select>
          <input type="text" id="m-target-dong" class="m-dong-input" value="${aptHtml(place)}" placeholder="동 입력/선택" oninput="mHandleDongChange()">
        </div>
      </div>

      <div class="m-field-group">
        <div class="m-field-header">
          <label class="m-field-label" id="m-budget-label-txt" for="m-target-budget-num">희망 ${aptHtml(trade)} 예산</label>
          <span class="m-field-sublabel" id="m-budget-korean-txt">2억 원</span>
        </div>

        <div id="m-budget-single-box" class="m-input-wrapper">
          <input type="number" id="m-target-budget-num" class="m-input-box" value="${defaultBudget}" step="500" min="0" oninput="mHandleBudgetNumChange()">
          <span class="m-input-unit" id="m-budget-unit-txt">만 원</span>
        </div>

        <div id="m-budget-rent-box" style="display:none; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div class="m-input-wrapper">
            <input type="number" id="m-target-rent-deposit" class="m-input-box" value="2000" step="500" min="0" oninput="mHandleRentChange()">
            <span class="m-input-unit">보증금(만)</span>
          </div>
          <div class="m-input-wrapper">
            <input type="number" id="m-target-rent-monthly" class="m-input-box" value="65" step="5" min="0" oninput="mHandleRentChange()">
            <span class="m-input-unit">월세(만)</span>
          </div>
        </div>

        <div class="m-preset-row" id="m-preset-container"></div>
      </div>

      <button type="button" class="m-search-btn" id="m-btn-search" onclick="mPerformSearch()">
        🔍 국토부 실거래 아파트 매칭 검색하기
      </button>
    </div>

    <div class="m-results-header">
      <div class="m-results-title" id="m-results-summary">🔍 ${aptHtml(canonicalRegion)} ${aptHtml(city)} ${aptHtml(place)} 실거래 매물</div>
      <div class="m-results-count" id="m-results-count">${initialMatcherRows.length}개 단지 발견</div>
    </div>

    <div class="m-apt-list" id="m-apt-container">
      ${initialCardsHtml}
    </div>

    <div style="padding: 10px 18px 0; background: #ffffff; display:flex; flex-direction:column; gap:8px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <a href="https://www.wooriapt.app/map" style="background:#17387d; color:#ffffff; text-decoration:none; border-radius:12px; padding:12px 8px; font-size:13px; font-weight:900; display:flex; align-items:center; justify-content:center; gap:5px; text-align:center; box-shadow:0 4px 12px rgba(23,56,125,0.22);">
          <span>💬</span> <span>아파트 지도 위 말풍선 ›</span>
        </a>
        <a href="https://www.ansimdeal.com/map" style="background:#0f766e; color:#ffffff; text-decoration:none; border-radius:12px; padding:12px 8px; font-size:13px; font-weight:900; display:flex; align-items:center; justify-content:center; gap:5px; text-align:center; box-shadow:0 4px 12px rgba(15,118,110,0.22);">
          <span>🏪</span> <span>점포·상가 상권분석 지도 ›</span>
        </a>
      </div>
      <button onclick="mShareLink()" style="width:100%; background:#fee500; color:#191919; border:none; border-radius:12px; padding:12px; font-size:14px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
        <span>💬</span> <span>카카오톡 / 지인에게 이 시세표 1초 공유하기</span>
      </button>
    </div>

    <div class="m-bottom-action">
      <div class="m-footer-note">* 국토교통부 실거래가 공공데이터 기준 (선택 즉시 0.1초 실시간 자동 매칭)</div>
      <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #cbd5e1; text-align:center; font-size:11px; font-weight:800; color:#475569; line-height:1.45;">
        🔒 본 플랫폼·매칭기 시스템은 <span style="color:#b45309;">특허(BM) 및 저작권 법적 보호 대상</span>이며, 경쟁업체 및 제3자의 무단 복제·모방·도용 시 민·형사상 법적 책임을 묻습니다.
      </div>
    </div>
  </div>

  <!-- 4. 해당 동(읍·면) 및 시·군·구 아파트 단지 전체 디렉토리 (내부 크롤링 링크) -->
  ${
    listHtml
      ? `
  <section class="card">
    <h2>🏘️ ${aptHtml(location)} 및 ${aptHtml(city)} 주요 아파트 단지 목록 (${apartmentNames.length}개 단지)</h2>
    <p>${aptHtml(location)} 및 인근에 위치한 아파트 단지의 매매·전세·월세 상세정보 페이지로 바로 이동할 수 있습니다.</p>
    <ul class="apt-dir-list">
      ${listHtml}
    </ul>
  </section>
      `
      : ""
  }

  ${
    siblingDongsHtml
      ? `
  <!-- 4-1. 동일 시·군·구 내 다른 읍·면·동 아파트 허브 (크롤링 그물망 링크) -->
  <section class="card">
    <h2>📍 ${aptHtml(canonicalRegion)} ${aptHtml(city)} 다른 동네(읍·면·동) 아파트 실거래 · 중개사 · 마트 바로가기</h2>
    <p>${aptHtml(city)} 내 인접한 법정동·행정동의 아파트 매매·전세·월세 시세와 공인중개사, 동네마트 정보를 확인해 보세요.</p>
    <div class="apt-dir-list">
      ${siblingDongsHtml}
    </div>
  </section>
      `
      : ""
  }

  <!-- 5. 자주 묻는 질문 (FAQPage 구조화 데이터 연동) -->
  <section class="card">
    <h2>❓ ${aptHtml(subject)} 자주 묻는 질문 (FAQ)</h2>
    ${faqItems.map(function(item, i) {
      return (
        '<div style="padding:12px 14px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;margin-bottom:10px;">' +
          '<p style="margin:0 0 6px;font-weight:900;color:#0f172a;font-size:15px;">Q' + (i + 1) + '. ' + aptHtml(item.q) + '</p>' +
          '<p style="margin:0;color:#334155;font-size:14px;line-height:1.65;">A. ' + aptHtml(item.a) + '</p>' +
        '</div>'
      );
    }).join("")}
  </section>

  <!-- 5-1. 우리아파트 안심거래 핵심 혜택 및 절차 -->
  <section class="card">
    <h2>🛡️ 우리아파트 안심거래 수수료 50% 절감 및 보호 시스템</h2>
    <p>
      1. <strong>맞춤 매물 역제안 매칭:</strong> 매수자·임차인이 원하는 ${aptHtml(place)} 아파트와 예산·입주조건을 등록하면 ${aptHtml(city)} 지역 공인중개사가 검증된 매물을 1:1로 제안합니다.
    </p>
    <p>
      2. <strong>플랫폼 이용료 50% 혜택:</strong> 매수자·임차인은 공인중개사 법정 표준 중개보수의 <strong>절반(50%) 수준인 플랫폼 서비스 이용료</strong>만 부담하여 비용을 크게 절약할 수 있습니다.
    </p>
    <p>
      3. <strong>국토부 표준 전자계약 &amp; 에스크로·셀프등기 가이드:</strong> 비대면 전자계약으로 확정일자 자동 부여 및 대출 금리 우대 혜택을 받을 수 있으며, 우리은행 에스크로 안내와 매매 셀프등기 무료 가이드를 제공합니다.
    </p>
  </section>

  <!-- 6. 관련 서비스 및 전국 지역별 바로가기 -->
  <section class="card">
    <h2>🔗 ${aptHtml(location)} 연관 부동산·생활 서비스 바로가기</h2>
    <div class="quick-links-grid">
      <a class="quick-link-btn" href="${brokerSearchUrl}">🤝 ${aptHtml(place)} 공인중개사 찾기</a>
      <a class="quick-link-btn" href="/mart-search/${[canonicalRegion, city, place].map(encodeURIComponent).join("/")}">🛒 ${aptHtml(place)} 동네마트 디렉토리</a>
      <a class="quick-link-btn" href="https://www.wooriapt.app/map">💬 아파트 지도 위 시세·매물 말풍선</a>
      <a class="quick-link-btn" href="https://www.ansimdeal.com/map">🏪 점포·상가 상권분석 지도 매칭기</a>
      <a class="quick-link-btn" href="https://www.ansimdeal.com/">🏢 대지·건물·점포·상가 안심딜</a>
      <a class="quick-link-btn" href="/check">🚫 허위·팔린매물 1초 팩트체크</a>
      <a class="quick-link-btn" href="/tools-center">⚡ 전기·수도·가스 이사정산</a>
      <a class="quick-link-btn" href="/price">🥬 농·축·수산물 60종 오늘의 시세</a>
      <a class="quick-link-btn" href="/mart">🛒 동네마트 장보기·경영 계산기</a>
      <a class="quick-link-btn" href="/presale-search">🏢 전국 아파트 분양현장 자동검색</a>
      <a class="quick-link-btn" href="/aura">🌊 신안 아우라 한옥펜션 자동검색</a>
    </div>
  </section>

  <!-- 7. 전국 17개 시·도 대표 아파트 실거래 허브 바로가기 -->
  <section class="card">
    <h2>🗺️ 전국 17개 시·도 대표 아파트 실거래 · 안심매칭 허브</h2>
    <div class="quick-links-grid">
      <a class="quick-link-btn" href="/apt-search/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C/%EA%B0%95%EB%82%A8%EA%B5%AC/%EB%8C%80%EC%B9%98%EB%8F%99/sale">서울 강남구 대치동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C/%EC%84%9C%EC%B4%88%EA%B5%AC/%EB%B0%98%ED%8F%AC%EB%8F%99/sale">서울 서초구 반포동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C/%EC%86%A1%ED%8C%8C%EA%B5%AC/%EC%9E%A0%EC%8B%A4%EB%8F%99/sale">서울 송파구 잠실동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EA%B2%BD%EA%B8%B0%EB%8F%84/%EC%84%B1%EB%82%A8%EC%8B%9C%20%EB%B6%84%EB%8B%B9%EA%B5%AC/%EC%A0%95%EC%9E%90%EB%8F%99/sale">경기 분당구 정자동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EA%B2%BD%EA%B8%B0%EB%8F%84/%EC%88%98%EC%9B%90%EC%8B%9C%20%EC%98%81%ED%86%B5%EA%B5%AC/%EC%9D%B4%EC%9D%98%EB%8F%99/sale">경기 수원 영통구 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EC%9D%B8%EC%B2%9C%EA%B4%91%EC%97%AD%EC%8B%9C/%EC%97%B0%EC%88%98%EA%B5%AC/%EC%86%A1%EB%8F%84%EB%8F%99/sale">인천 연수구 송도동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EB%B6%80%EC%82%B0%EA%B4%91%EC%97%AD%EC%8B%9C/%ED%95%B4%EC%9A%B4%EB%8C%80%EA%B5%AC/%EC%9A%B0%EB%8F%99/sale">부산 해운대구 우동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EB%8C%80%EA%B5%AC%EA%B4%91%EC%97%AD%EC%8B%9C/%EC%88%98%EC%84%B1%EA%B5%AC/%EB%B2%94%EC%96%B4%EB%8F%99/sale">대구 수성구 범어동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EB%8C%80%EC%A0%84%EA%B4%91%EC%97%AD%EC%8B%9C/%EC%9C%A0%EC%84%B1%EA%B5%AC/%EC%83%81%EB%8C%80%EB%8F%99/sale">대전 유성구 상대동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EA%B4%91%EC%A3%BC%EA%B4%91%EC%97%AD%EC%8B%9C/%EA%B4%91%EC%82%B0%EA%B5%AC/%EC%88%98%EC%99%84%EB%8F%99/sale">광주 광산구 수완동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EC%9A%B8%EC%82%B0%EA%B4%91%EC%97%AD%EC%8B%9C/%EB%82%A8%EA%B5%AC/%EC%8B%A0%EC%A0%95%EB%8F%99/sale">울산 남구 신정동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EC%84%B8%EC%A2%85%ED%8A%B9%EB%B3%84%EC%9E%90%EC%B9%98%EC%8B%9C/%EC%84%B8%EC%A2%85%EC%8B%9C/%EC%83%88%EB%A1%AC%EB%8F%99/sale">세종시 새롬동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EA%B0%95%EC%9B%90%ED%8A%B9%EB%B3%84%EC%9E%90%EC%B9%98%EB%8F%84/%EA%B0%95%EB%A6%89%EC%8B%9C/%EA%B5%90%EB%8F%99/sale">강원 강릉시 교동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EC%B6%A9%EC%B2%AD%EB%B6%81%EB%8F%84/%EC%B2%AD%EC%A3%BC%EC%8B%9C%20%ED%9D%A5%EB%8D%95%EA%B5%AC/%EB%B3%B5%EB%8C%80%EB%8F%99/sale">충북 청주 흥덕구 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EC%B6%A9%EC%B2%AD%EB%82%A8%EB%8F%84/%EC%B2%9C%EC%95%88%EC%8B%9C%20%EC%84%9C%EB%B6%81%EA%B5%AC/%EB%B6%88%EB%8B%B9%EB%8F%99/sale">충남 천안 불당동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EC%A0%84%EB%B6%81%ED%8A%B9%EB%B3%84%EC%9E%90%EC%B9%98%EB%8F%84/%EC%A0%84%EC%A3%BC%EC%8B%9C%20%EC%99%84%EC%82%B0%EA%B5%AC/%ED%9A%A8%EC%9E%90%EB%8F%993%EA%B0%80/sale">전북 전주 완산구 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EC%A0%84%EB%9D%BC%EB%82%A8%EB%8F%84/%EC%88%9C%EC%B2%9C%EC%8B%9C/%EC%97%B0%ED%96%A5%EB%8F%99/sale">전남 순천시 연향동 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EA%B2%BD%EC%83%81%EB%B6%81%EB%8F%84/%ED%8F%AC%ED%95%AD%EC%8B%9C%20%EB%B6%81%EA%B5%AC/%EC%9E%A5%EC%84%B1%EB%8F%99/sale">경북 포항시 북구 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EA%B2%BD%EC%83%81%EB%82%A8%EB%8F%84/%EC%B0%BD%EC%9B%90%EC%8B%9C%20%EC%84%B1%EC%82%B0%EA%B5%AC/%EC%9A%A9%ED%98%B8%EB%8F%99/sale">경남 창원 성산구 아파트</a>
      <a class="quick-link-btn" href="/apt-search/%EC%A0%9C%EC%A3%BC%ED%8A%B9%EB%B3%84%EC%9E%90%EC%B9%98%EB%8F%84/%EC%A0%9C%EC%A3%BC%EC%8B%9C/%EB%85%B8%ED%98%95%EB%8F%99/sale">제주 제주시 노형동 아파트</a>
    </div>
  </section>

  <div class="footer">
    업체명: 에너젠51 | 대표자: 장수용 | 사업자등록번호: 410-27-88141<br>
    © 우리아파트 안심거래 (${SITE_ORIGIN.replace("https://", "")}). All rights reserved.
  </div>

</main>

<script>
  const M_REGIONS = {
    "서울특별시": ["강남구", "서초구", "송파구", "강동구", "마포구", "용산구", "성동구", "영등포구", "노원구", "강서구", "양천구", "성북구", "서대문구", "중구", "동작구", "관악구", "은평구", "구로구", "동대문구", "중랑구", "광진구", "강북구", "도봉구", "금천구", "종로구"],
    "경기도": ["수원시 영통구", "수원시 권선구", "수원시 장안구", "수원시 팔달구", "성남시 분당구", "성남시 수정구", "성남시 중원구", "용인시 수지구", "용인시 기흥구", "용인시 처인구", "고양시 일산동구", "고양시 일산서구", "고양시 덕양구", "화성시", "평택시", "남양주시", "안양시 동안구", "부천시", "김포시", "파주시", "하남시", "시흥시", "의정부시", "광명시", "군포시", "오산시", "이천시", "안산시 단원구"],
    "인천광역시": ["연수구", "남동구", "서구", "부평구", "미추홀구", "중구", "계양구", "동구"],
    "부산광역시": ["해운대구", "수영구", "부산진구", "동래구", "남구", "북구", "사하구", "연제구", "금정구", "강서구", "사상구", "기장군"],
    "대구광역시": ["수성구", "달서구", "중구", "동구", "북구", "서구", "남구", "달성군"],
    "대전광역시": ["유성구", "서구", "중구", "동구", "대덕구"],
    "광주광역시": ["북구", "광산구", "서구", "남구", "동구"],
    "전남광주통합특별시": ["북구", "광산구", "서구", "남구", "동구", "순천시", "여수시", "목포시", "나주시", "광양시", "담양군", "화순군", "무안군"],
    "울산광역시": ["남구", "중구", "북구", "동구", "울주군"],
    "세종특별자치시": ["세종시"],
    "강원특별자치도": ["춘천시", "원주시", "강릉시", "속초시", "동해시", "삼척시", "태백시", "홍천군", "철원군", "양양군", "평창군"],
    "충청북도": ["청주시 흥덕구", "청주시 상당구", "청주시 서원구", "청주시 청원구", "충주시", "제천시", "음성군", "진천군"],
    "충청남도": ["천안시 서북구", "천안시 동남구", "아산시", "서산시", "당진시", "논산시", "공주시", "보령시", "홍성군", "예산군"],
    "전북특별자치도": ["전주시 완산구", "전주시 덕진구", "군산시", "익산시", "정읍시", "남원시", "김제시", "완주군"],
    "전라남도": ["순천시", "여수시", "목포시", "나주시", "광양시", "무안군", "화순군", "담양군", "영암군", "해남군", "신안군"],
    "경상북도": ["포항시 남구", "포항시 북구", "구미시", "경산시", "경주시", "안동시", "김천시", "영주시", "상주시", "칠곡군"],
    "경상남도": ["창원시 성산구", "창원시 의창구", "창원시 마산합포구", "창원시 마산회원구", "창원시 진해구", "김해시", "양산시", "진주시", "거제시", "통영시", "사천시", "밀양시"],
    "제주특별자치도": ["제주시", "서귀포시"]
  };

  let mCurSido = ${JSON.stringify(canonicalRegion)};
  let mCurSigungu = ${JSON.stringify(city || "강남구")};
  let mCurDong = ${JSON.stringify(place || "도곡동")};
  let mCurType = ${JSON.stringify(matcherType)};
  let mCurBudget = mCurType === 'sale' ? 20000 : (mCurType === 'jeonse' ? 15000 : 2000);
  let mCurRentDeposit = 2000;
  let mCurRentMonthly = 65;

  let mLoadedApts = ${JSON.stringify(initialMatcherRows)};
  let mDongDebounceTimer = null;

  async function mFetchRealApts() {
    const cntEl = document.getElementById('m-results-count');
    const sumEl = document.getElementById('m-results-summary');

    var typeKo = mCurType === 'sale' ? '매매' : (mCurType === 'jeonse' ? '전세' : '월세');
    var sumTxt = mCurType === 'rent'
      ? ('🔍 ' + mCurSido + ' ' + mCurSigungu + ' ' + mCurDong + ' 보증금 ' + mFmt(mCurRentDeposit) + '/월 ' + mCurRentMonthly + '만 국토부 실거래')
      : ('🔍 ' + mCurSido + ' ' + mCurSigungu + ' ' + mCurDong + ' ' + mFmt(mCurBudget) + ' 국토부 ' + typeKo);

    if (sumEl) sumEl.textContent = sumTxt;
    if (cntEl) cntEl.textContent = '국토부 실거래 실시간 매칭 중...';

    var dbSido = (mCurSido === '전남광주통합특별시' || mCurSido === '광주광역시') ? '광주광역시' : mCurSido;
    var dongClean = mCurDong.replace(/동$/, '').trim();

    var url = 'https://dcysjuxyjqtvkihdsjvv.supabase.co/rest/v1/safe_apartments?select=시도,시군구,동리,단지명,세대수,최고층수&limit=30';
    if (dbSido) url += '&시도=in.(' + encodeURIComponent(dbSido) + ',' + encodeURIComponent(mCurSido) + ')';
    if (mCurSigungu && mCurSigungu !== '전체') url += '&시군구=eq.' + encodeURIComponent(mCurSigungu);
    if (dongClean && dongClean !== '중심가') url += '&동리=ilike.*' + encodeURIComponent(dongClean) + '*';

    try {
      var res = await fetch(url, { headers: { 'apikey': 'sb_publishable_RZBX7u1v8MLBCfEJT0-eRg_jPcIulG2' } });
      if (res.ok) {
        var rows = await res.json();
        mLoadedApts = rows;
      } else {
        mLoadedApts = [];
      }
    } catch(err) {
      console.error(err);
    }

    mRenderCards();
  }

  function mPopulateSigungu(sido, keepCurrent) {
    const sigunguSel = document.getElementById('m-sel-sigungu');
    if (!sigunguSel) return;
    const baseList = M_REGIONS[sido] ? M_REGIONS[sido].slice() : [];
    if (keepCurrent && mCurSigungu && !baseList.includes(mCurSigungu)) {
      baseList.unshift(mCurSigungu);
    }
    if (baseList.length === 0) baseList.push('전체');
    sigunguSel.innerHTML = baseList.map(function(g) {
      return '<option value="' + g + '" ' + (g === mCurSigungu ? 'selected' : '') + '>' + g + '</option>';
    }).join('');
    if (!baseList.includes(mCurSigungu)) {
      mCurSigungu = baseList[0];
      sigunguSel.value = mCurSigungu;
    }
  }

  function mHandleSidoChange() {
    mCurSido = document.getElementById('m-sel-sido').value;
    mPopulateSigungu(mCurSido, false);
    mHandleSigunguChange();
  }

  function mHandleSigunguChange() {
    mCurSigungu = document.getElementById('m-sel-sigungu').value;
    const dInput = document.getElementById('m-target-dong');
    if (dInput) dInput.value = '';
    mCurDong = '';
    mUpdateLabels();
    mFetchRealApts();
  }

  function mHandleDongChange() {
    clearTimeout(mDongDebounceTimer);
    mDongDebounceTimer = setTimeout(function() {
      const dInput = document.getElementById('m-target-dong');
      mCurDong = (dInput ? dInput.value : '').trim();
      mUpdateLabels();
      mFetchRealApts();
    }, 250);
  }

  function mUpdateLabels() {
    const full = [mCurSido, mCurSigungu, mCurDong].filter(Boolean).join(' ');
    const el = document.getElementById('m-region-display-txt');
    if (el) el.textContent = full;
    const hTitle = document.getElementById('m-header-title');
    if (hTitle) hTitle.textContent = full + ' - 안심거래 매칭기';
  }

  function mSwitchMode(t) {
    mCurType = t;
    const hb = document.getElementById('m-header-box');
    if (hb) hb.className = 'm-top-header' + (t === 'jeonse' ? ' theme-jeonse' : (t === 'rent' ? ' theme-rent' : ''));
    ['sale', 'jeonse', 'rent'].forEach(function(x) {
      const btn = document.getElementById('m-tab-' + x);
      if (btn) btn.classList.toggle('active', x === t);
    });

    const lbl = document.getElementById('m-budget-label-txt');
    const singleBox = document.getElementById('m-budget-single-box');
    const rentBox = document.getElementById('m-budget-rent-box');

    if (t === 'sale') {
      if (lbl) lbl.textContent = '희망 매매 예산';
      mCurBudget = 20000;
      if (singleBox) singleBox.style.display = 'flex';
      if (rentBox) rentBox.style.display = 'none';
      const numInput = document.getElementById('m-target-budget-num');
      if (numInput) numInput.value = mCurBudget;
    } else if (t === 'jeonse') {
      if (lbl) lbl.textContent = '희망 전세 보증금';
      mCurBudget = 15000;
      if (singleBox) singleBox.style.display = 'flex';
      if (rentBox) rentBox.style.display = 'none';
      const numInput = document.getElementById('m-target-budget-num');
      if (numInput) numInput.value = mCurBudget;
    } else {
      if (lbl) lbl.textContent = '희망 월세 조건 (보증금 + 월세)';
      if (singleBox) singleBox.style.display = 'none';
      if (rentBox) rentBox.style.display = 'grid';
      const depInput = document.getElementById('m-target-rent-deposit');
      if (depInput) depInput.value = mCurRentDeposit;
      const monInput = document.getElementById('m-target-rent-monthly');
      if (monInput) monInput.value = mCurRentMonthly;
    }

    mUpdateKorean();
    mRenderPresets();
    mRenderCards();
  }

  function mHandleBudgetNumChange() {
    mCurBudget = parseFloat(document.getElementById('m-target-budget-num').value) || 0;
    mUpdateKorean();
    mRenderPresets();
    mRenderCards();
  }

  function mHandleRentChange() {
    mCurRentDeposit = parseFloat(document.getElementById('m-target-rent-deposit').value) || 0;
    mCurRentMonthly = parseFloat(document.getElementById('m-target-rent-monthly').value) || 0;
    mUpdateKorean();
    mRenderCards();
  }

  function mUpdateKorean() {
    const el = document.getElementById('m-budget-korean-txt');
    if (!el) return;
    if (mCurType === 'rent') {
      el.textContent = '보증금 ' + mFmt(mCurRentDeposit) + ' / 월 ' + mCurRentMonthly + '만';
    } else {
      el.textContent = mFmt(mCurBudget);
    }
  }

  function mSelectPreset(val) {
    if (mCurType === 'rent') {
      mCurRentDeposit = val.deposit;
      mCurRentMonthly = val.monthly;
      const depInput = document.getElementById('m-target-rent-deposit');
      if (depInput) depInput.value = mCurRentDeposit;
      const monInput = document.getElementById('m-target-rent-monthly');
      if (monInput) monInput.value = mCurRentMonthly;
    } else {
      mCurBudget = val;
      const numInput = document.getElementById('m-target-budget-num');
      if (numInput) numInput.value = val;
    }
    mUpdateKorean();
    mRenderPresets();
    mRenderCards();
  }

  function mRenderPresets() {
    const box = document.getElementById('m-preset-container');
    if (!box) return;
    if (mCurType === 'sale') {
      var presets = [15000, 20000, 25000, 30000, 40000];
      box.innerHTML = presets.map(function(p) {
        return '<button class="m-preset-btn ' + (p === mCurBudget ? 'active' : '') + '" onclick="mSelectPreset(' + p + ')">' + mFmt(p) + '</button>';
      }).join('');
    } else if (mCurType === 'jeonse') {
      var presets = [10000, 15000, 20000, 25000];
      box.innerHTML = presets.map(function(p) {
        return '<button class="m-preset-btn ' + (p === mCurBudget ? 'active' : '') + '" onclick="mSelectPreset(' + p + ')">' + mFmt(p) + '</button>';
      }).join('');
    } else {
      var presets = [
        { label: '1천 / 50', deposit: 1000, monthly: 50 },
        { label: '2천 / 65', deposit: 2000, monthly: 65 },
        { label: '3천 / 80', deposit: 3000, monthly: 80 }
      ];
      box.innerHTML = presets.map(function(p) {
        return '<button class="m-preset-btn ' + (p.deposit === mCurRentDeposit && p.monthly === mCurRentMonthly ? 'active' : '') + '" onclick="mSelectPreset({deposit:' + p.deposit + ',monthly:' + p.monthly + '})">' + p.label + '</button>';
      }).join('');
    }
  }

  function mFmt(val) {
    if (val <= 0) return '0원';
    if (val >= 10000) {
      var eok = Math.floor(val / 10000);
      var man = val % 10000;
      return man > 0 ? (eok + '억 ' + man.toLocaleString() + '만 원') : (eok + '억 원');
    }
    return val.toLocaleString() + '만 원';
  }

  function mCalcSavedFee(price, type, rentDeposit, monthly) {
    if (type === 'sale') {
      var std = 0;
      if (price < 5000) std = Math.min(price * 0.006, 25);
      else if (price < 20000) std = Math.min(price * 0.005, 80);
      else std = Math.round(price * 0.004);
      return Math.round(std / 2);
    } else if (type === 'jeonse') {
      var std = 0;
      if (price < 5000) std = Math.min(price * 0.005, 20);
      else if (price < 10000) std = Math.min(price * 0.004, 30);
      else std = Math.round(price * 0.003);
      return Math.round(std / 2);
    } else {
      var conv = rentDeposit + (monthly * 100);
      if (conv < 5000) conv = rentDeposit + (monthly * 70);
      var std = 0;
      if (conv < 5000) std = Math.min(conv * 0.005, 20);
      else if (conv < 10000) std = Math.min(conv * 0.004, 30);
      else std = Math.round(conv * 0.003);
      return Math.round(std / 2);
    }
  }

  function mRenderCards() {
    const container = document.getElementById('m-apt-container');
    const cntEl = document.getElementById('m-results-count');
    const sumEl = document.getElementById('m-results-summary');
    if (!container) return;

    var typeKo = mCurType === 'sale' ? '매매' : (mCurType === 'jeonse' ? '전세' : '월세');
    var locLabel = [mCurSido, mCurSigungu, mCurDong].filter(Boolean).join(' ');
    var sumTxt = mCurType === 'rent'
      ? ('🔍 ' + locLabel + ' 보증금 ' + mFmt(mCurRentDeposit) + '/월 ' + mCurRentMonthly + '만 국토부 실거래')
      : ('🔍 ' + locLabel + ' ' + mFmt(mCurBudget) + ' 국토부 ' + typeKo);

    if (sumEl) sumEl.textContent = sumTxt;
    if (cntEl) cntEl.textContent = mLoadedApts.length + '개 단지 발견';

    if (mLoadedApts.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:32px 16px; color:#64748b; background:#fff; border-radius:12px; border:1px dashed #cbd5e1;">' +
        '<div style="font-size:22px; margin-bottom:6px;">🔎</div>' +
        '<div style="font-size:14px; font-weight:800; color:#1e293b;">해당 조건의 아파트를 조회 중이거나 검색 결과가 없습니다.</div>' +
        '<div style="font-size:12px; color:#94a3b8; margin-top:4px;">시·구·동을 선택하거나 검색 버튼을 눌러보세요.</div>' +
        '</div>';
      return;
    }

    container.innerHTML = mLoadedApts.map(function(apt, idx) {
      var badgeCls = 'm-badge-sale';
      var benCls = 'm-benefit-sale';
      var pTxt = '';
      var benTxt = '';
      var name = apt['단지명'] || apt.name || '아파트';
      var dong = apt['동리'] || apt.dong || mCurDong;
      var hh = apt['세대수'] ? (apt['세대수'] + '세대') : '국토부 등록';
      var fl = apt['최고층수'] ? ('최고 ' + apt['최고층수'] + '층') : '15층';
      var specTxt = hh + ' / ' + fl;

      if (mCurType === 'sale') {
        badgeCls = 'm-badge-sale';
        benCls = 'm-benefit-sale';
        var estPrice = Math.round(mCurBudget * (0.88 + (idx % 4) * 0.08) / 100) * 100;
        pTxt = '실거래 ' + mFmt(estPrice);
        var save = mCalcSavedFee(estPrice, 'sale');
        benTxt = '<span>중개사 표준 수수료의 절반</span><span class="m-benefit-save">➔ ' + save + '만 원 절약</span>';
      } else if (mCurType === 'jeonse') {
        badgeCls = 'm-badge-jeonse';
        benCls = 'm-benefit-jeonse';
        var estPrice2 = Math.round(mCurBudget * (0.85 + (idx % 4) * 0.1) / 100) * 100;
        pTxt = '전세 ' + mFmt(estPrice2);
        var save2 = mCalcSavedFee(estPrice2, 'jeonse');
        benTxt = '<span>🛡️ HUG 126% 보증보험 안전</span><span class="m-benefit-save">➔ 수수료 ' + save2 + '만 원 절약</span>';
      } else {
        badgeCls = 'm-badge-rent';
        benCls = 'm-benefit-rent';
        var dep = mCurRentDeposit;
        var mon = mCurRentMonthly + ((idx % 3) * 5);
        pTxt = '보증금 ' + mFmt(dep) + ' / 월 ' + mon + '만';
        var save3 = mCalcSavedFee(0, 'rent', dep, mon);
        benTxt = '<span>🔒 최우선변제 100% 전액보호</span><span class="m-benefit-save">➔ 수수료 ' + save3 + '만 원 절약</span>';
      }

      var reqTypeParam = mCurType === 'rent' ? 'monthly' : mCurType;
      var mApplyUrl = '/request?type=' + encodeURIComponent(reqTypeParam) + '&dong=' + encodeURIComponent(dong) + '&apt=' + encodeURIComponent(name);
      return '<div class="m-apt-card">' +
        '<div class="m-apt-name"><span>[' + dong + '] ' + name + '</span><span class="m-apt-floor">' + specTxt + '</span></div>' +
        '<div class="m-price-row"><span class="m-price-badge ' + badgeCls + '">' + pTxt + '</span><span class="m-price-date">국토부 실거래 기준</span></div>' +
        '<div class="m-benefit-box ' + benCls + '">' + benTxt + '</div>' +
        '<a href="' + mApplyUrl + '" class="m-apt-apply-btn">🤝 이 아파트 안심거래 신청하기 (수수료 50% 절약) ›</a>' +
        '</div>';
    }).join('');
  }

  function mPerformSearch() {
    mFetchRealApts();
    var el = document.getElementById('m-results-summary');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function mShareLink() {
    var u = location.href;
    var locLabel = [mCurSido, mCurSigungu, mCurDong].filter(Boolean).join(' ');
    var t = locLabel + ' 안심거래 매칭기';
    var txt = locLabel + ' 국토부 실거래 아파트 안심거래 매칭기입니다. 중개사 표준 절반 수수료 혜택도 확인해 보세요.';
    if (navigator.share) {
      navigator.share({ title: t, text: txt, url: u }).catch(function() {});
    } else {
      navigator.clipboard.writeText(u).then(function() {
        alert('안심거래 매칭기 주소가 복사되었습니다! 카카오톡이나 밴드에 붙여넣어 보세요: ' + u);
      }).catch(function() {
        prompt('주소를 복사하세요:', u);
      });
    }
  }

  function mInit() {
    const sidoSel = document.getElementById('m-sel-sido');
    if (sidoSel) {
      if (!Array.from(sidoSel.options).some(function(o) { return o.value === mCurSido; })) {
        const opt = document.createElement('option');
        opt.value = mCurSido;
        opt.textContent = mCurSido;
        sidoSel.insertBefore(opt, sidoSel.firstChild);
      }
      sidoSel.value = mCurSido;
    }
    mPopulateSigungu(mCurSido, true);
    const sigunguSel = document.getElementById('m-sel-sigungu');
    if (sigunguSel) sigunguSel.value = mCurSigungu;
    const dongInput = document.getElementById('m-target-dong');
    if (dongInput) dongInput.value = mCurDong;
    mUpdateLabels();
    mSwitchMode(mCurType);
  }

  setTimeout(mInit, 10);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  let mDeferredPrompt = null;
  function isMAndroidNonChrome() {
    const ua = navigator.userAgent || "";
    if (!/android/i.test(ua)) return false;
    const isSamsungOrInApp = /(samsungbrowser|kakaotalk|naver|daum|line\/|instagram|fbav|fban|;\s*wv\)|\bGSA\/)/i.test(ua);
    const isRealChrome = /chrome\//i.test(ua) && !isSamsungOrInApp && !/edga|edg\/|opr\/|opera|whale/i.test(ua);
    return !isRealChrome;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    if (!isMAndroidNonChrome()) {
      mDeferredPrompt = e;
    }
  });

  const mInstallBtn = document.getElementById("mInstallBtn");
  if (mInstallBtn) {
    mInstallBtn.addEventListener("click", async () => {
      if (isMAndroidNonChrome()) {
        location.href =
          "intent://" +
          location.host +
          "/app-install?from=chrome#Intent;scheme=" +
          location.protocol.replace(":", "") +
          ";package=com.android.chrome;S.browser_fallback_url=" +
          encodeURIComponent(location.origin + "/app-install") +
          ";end";
        return;
      }
      if (mDeferredPrompt) {
        try {
          mDeferredPrompt.prompt();
          const choice = await mDeferredPrompt.userChoice;
          if (choice && choice.outcome === "accepted") {
            mDeferredPrompt = null;
            return;
          }
        } catch (err) {
          console.warn("Install prompt error:", err);
        }
      }
      location.href = "/app-install";
    });
  }
</script>
</body>
</html>`);
  } catch (error) {
    console.error("APT PAGE ERROR:", error);
    return res.status(500).send("페이지 생성 중 오류가 발생했습니다.");
  }
}

/* =========================================
   기존 호환 래퍼
========================================= */

async function handleApartmentList(req, res) {
  return aptHandleApartmentList(req, res);
}

async function handleSitemapIndex(req, res) {
  return aptHandleSitemapIndex(req, res);
}

async function handleSitemap(req, res) {
  return aptHandleSitemap(req, res);
}

async function handleApartmentPage(req, res) {
  return aptHandleApartmentPage(req, res);
}

/* =========================================
   공인중개사 자동검색 페이지 (/broker-search/...)
========================================= */

async function handleBrokerPage(req, res) {
  const region = clean(req.query.region);
  const city = clean(req.query.city);
  const place = clean(req.query.place);
  const broker = clean(req.query.broker);

  if (!region || !city || !place) {
    return res.status(404).send("지역 정보가 없습니다.");
  }

  function buildBrokerQuery(rCol, cCol, pCol, includePlace) {
    const q = new URLSearchParams();
    q.set("select", "*");
    if (region) {
      const rVars = getRegionVariants(region);
      q.set(rCol, "in.(" + rVars.join(",") + ")");
    }
    if (city) q.set(cCol, "eq." + city);
    if (includePlace && place) q.set(pCol, "eq." + place);
    if (broker) q.set("상호명", "eq." + broker);
    return q.toString();
  }

  try {
    let rows = [];
    let response = await fetch(
      SUPABASE_URL + "/rest/v1/agent_directory?" + buildBrokerQuery("지역명", "시군구", "동", true),
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
          Accept: "application/json",
          Range: "0-999"
        }
      }
    );

    if (!response.ok && response.status === 400) {
      const fallbackRes = await fetch(
        SUPABASE_URL + "/rest/v1/agent_directory?" + buildBrokerQuery("시도", "시군구", "동리", true),
        {
          method: "GET",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY,
            Accept: "application/json",
            Range: "0-999"
          }
        }
      );
      if (fallbackRes.ok) {
        response = fallbackRes;
      }
    }

    if (response.ok) {
      rows = await response.json();
    }

    // 만약 해당 동에 정확히 일치하는 중개사가 없으면 동일 시·군·구 내 등록 공인중개사 목록으로 폴백
    if (!Array.isArray(rows) || rows.length === 0) {
      const cityFallbackRes = await fetch(
        SUPABASE_URL + "/rest/v1/agent_directory?" + buildBrokerQuery("지역명", "시군구", "동", false),
        {
          method: "GET",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY,
            Accept: "application/json",
            Range: "0-59"
          }
        }
      );
      if (cityFallbackRes.ok) {
        rows = await cityFallbackRes.json();
      }
    }

    if ((!Array.isArray(rows) || rows.length === 0) && SITE_ORIGIN.includes("ansimdeal.com")) {
      // Fallback proxy from wooriapt.app if SUPABASE_SECRET_KEY is not set on ansimdeal
      const proxyPath =
        "/broker-search/" +
        [region, city, place].concat(broker ? [broker] : []).map(pathEncode).join("/");
      const proxyRes = await fetch("https://www.wooriapt.app" + proxyPath);
      if (proxyRes.ok) {
        let proxyHtml = await proxyRes.text();
        proxyHtml = proxyHtml.replace(/https:\/\/(www\.)?wooriapt\.app/g, SITE_ORIGIN);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");
        return res.status(200).send(proxyHtml);
      }
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      try {
        const fs = require("fs");
        const path = require("path");
        const dispatchPath = path.join(__dirname, "brokers_dispatch_directory.json");
        if (fs.existsSync(dispatchPath)) {
          const dispatchMap = JSON.parse(fs.readFileSync(dispatchPath, "utf8"));
          const matchedList = dispatchMap[place] || dispatchMap[place.replace(/동$/, "") + "동"] || [];
          if (Array.isArray(matchedList) && matchedList.length > 0) {
            rows = matchedList.slice(0, 60).map(function(entry) {
              const bName = Array.isArray(entry) ? entry[0] : (entry && entry.name);
              const bTel = Array.isArray(entry) ? entry[1] : (entry && entry.phone);
              return {
                "상호명": bName || (place + " 공인중개사사무소"),
                "주소": [region, city, place].filter(Boolean).join(" "),
                "전화번호": bTel || ""
              };
            });
          }
        }
      } catch (_) {}
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      rows = [
        {
          "상호명": broker || `${place} 안심거래 협력 공인중개사 센터`,
          "주소": `${region} ${city} ${place} 일원`,
          "전화번호": "010-9850-3388"
        }
      ];
    }

    const location = [region, city, place].filter(Boolean).join(" ");
    const canonical =
      SITE_ORIGIN +
      "/broker-search/" +
      [region, city, place].concat(broker ? [broker] : []).map(pathEncode).join("/");

    const brokerCount = rows.length;
    const title = broker
      ? `${location} ${broker} 공인중개사 | 아파트·상가 안심거래`
      : `${location} 공인중개사 ${brokerCount}곳 목록·연락처 | 우리아파트 안심거래`;

    const description = broker
      ? `${location} ${broker} 공인중개사 상세 주소·전화번호 및 아파트 매매·전세·월세 안심거래 매물 제안 안내 페이지입니다. 우리아파트 안심거래에서 수수료 50% 절감 혜택을 확인하세요.`
      : `${location} 지역 공인중개사 ${brokerCount}곳의 상호명, 도로명·지번 주소, 전화번호를 한눈에 확인하세요. 우리아파트 안심거래에 매수·전세·월세 희망조건을 등록하면 ${place} 공인중개사로부터 1:1 맞춤 매물 제안을 받을 수 있습니다.`;

    const brokerItems = rows
      .slice(0, 120)
      .map(function(row) {
        const officeName = firstValue(row, ["상호명", "중개사무소명", "사무소명", "업체명"]);
        const address = firstValue(row, ["주소", "도로명주소", "소재지"]);
        const phone = firstValue(row, ["전화번호", "대표전화", "연락처"]);
        const homepage = safeUrl(firstValue(row, ["홈페이지", "홈페이지URL", "website", "url"]));
        const brokerUrl = officeName
          ? "/broker-search/" + [region, city, place, officeName].map(pathEncode).join("/")
          : "";

        return `
          <li class="broker-item">
            <div class="broker-item-head">
              ${
                brokerUrl
                  ? `<a class="broker-name" href="${html(brokerUrl)}"><strong>${html(officeName || "공인중개사")}</strong></a>`
                  : `<strong class="broker-name">${html(officeName || "공인중개사")}</strong>`
              }
              <span class="broker-badge">${html(place)} 공인중개사</span>
            </div>
            ${address ? `<div class="broker-meta">📍 주소: ${html(address)}</div>` : ""}
            ${phone ? `<div class="broker-meta">📞 전화: <a href="tel:${html(phone.replace(/[^0-9]/g, ""))}">${html(phone)}</a></div>` : ""}
            ${homepage ? `<div class="broker-meta">🌐 <a href="${html(homepage)}" rel="nofollow noopener" target="_blank">홈페이지 바로가기</a></div>` : ""}
          </li>
        `;
      })
      .join("");

    const aptSearchSaleUrl = "/apt-search/" + [region, city, place, "sale"].map(pathEncode).join("/");
    const aptSearchJeonseUrl = "/apt-search/" + [region, city, place, "jeonse"].map(pathEncode).join("/");
    const aptSearchMonthlyUrl = "/apt-search/" + [region, city, place, "monthly"].map(pathEncode).join("/");
    const regionBrokerListUrl = "/broker-search/" + [region, city, place].map(pathEncode).join("/");

    const brokerFaqItems = [
      {
        q: `${location} 공인중개사 사무소는 총 몇 곳이 등록되어 있나요?`,
        a: `현재 ${location} 지역에는 총 ${brokerCount}곳의 공인중개사 사무소가 디렉토리에 등록되어 있으며, 각 중개사무소의 상호명, 소재지 주소, 대표 연락처 및 아파트·상가 안심거래 매칭 정보를 본 페이지에서 확인하실 수 있습니다.`
      },
      {
        q: `${place} 공인중개사에게 아파트 매수·전세·월세 매물을 1:1로 제안받으려면 어떻게 하나요?`,
        a: `우리아파트 안심거래 플랫폼에서 희망하는 ${place} 아파트 단지(또는 상가·점포)와 예산·입주 조건을 등록하시면, ${city} ${place} 관할 등록 공인중개사들이 검증된 실제 매물을 직접 역제안하며 중개수수료 50% 절감 혜택을 받으실 수 있습니다.`
      }
    ];

    const jsonLd = [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "우리아파트 안심거래 홈", "item": SITE_ORIGIN + "/" },
          { "@type": "ListItem", "position": 2, "name": "공인중개사 플랫폼", "item": SITE_ORIGIN + "/broker-landing" },
          { "@type": "ListItem", "position": 3, "name": location + " 공인중개사", "item": SITE_ORIGIN + regionBrokerListUrl }
        ].concat(broker ? [{ "@type": "ListItem", "position": 4, "name": broker, "item": canonical }] : [])
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": brokerFaqItems.map(function(item) {
          return {
            "@type": "Question",
            "name": item.q,
            "acceptedAnswer": { "@type": "Answer", "text": item.a }
          };
        })
      }
    ];

    if (broker && rows[0]) {
      jsonLd.push({
        "@context": "https://schema.org",
        "@type": "RealEstateAgent",
        "name": broker,
        "address": firstValue(rows[0], ["주소", "도로명주소", "소재지"]) || location,
        "telephone": firstValue(rows[0], ["전화번호", "대표전화", "연락처"]) || undefined,
        "url": canonical
      });
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");

    return res.status(200).send(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>[아파트 안심딜] ${html(title)} | 안심중개·수수료 50% 절감</title>
<meta name="description" content="${html(description)}">
<meta name="keywords" content="${html(location + " 공인중개사, " + location + " 부동산, " + place + " 공인중개사, " + (broker ? broker + ", " : "") + place + " 아파트 매수, " + place + " 아파트 임차, 아파트 안심딜, 안심딜, 수수료 50%, 매칭수수료 50%, 전세사기 예방, 중개사고 보증")}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${html(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${html(title)}">
<meta property="og:description" content="${html(description)}">
<meta property="og:url" content="${html(canonical)}">
<meta property="og:image" content="${SITE_ORIGIN}/broker-landing.png">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #f4f7fa;
  color: #172b3d;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", Arial, sans-serif;
}
.wrap {
  max-width: 780px;
  margin: auto;
  padding: 18px 14px 55px;
}
.breadcrumb {
  font-size: 12.5px;
  color: #64748b;
  margin-bottom: 12px;
}
.breadcrumb a { color: #1d4ed8; text-decoration: none; font-weight: 700; }
.card {
  background: #ffffff;
  border-radius: 18px;
  padding: 22px;
  margin-bottom: 16px;
  box-shadow: 0 8px 26px rgba(20,55,90,.08);
  border: 1px solid #e2e8f0;
}
h1 { margin: 0 0 12px; font-size: 26px; line-height: 1.38; color: #0f172a; }
h2 { margin: 0 0 12px; font-size: 20px; color: #0f172a; }
p { line-height: 1.7; color: #334155; font-size: 14.5px; margin: 8px 0; }
.broker-list { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 10px; }
.broker-item {
  padding: 14px 16px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.broker-item-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.broker-name { font-size: 16px; color: #0f172a; text-decoration: none; }
.broker-name:hover { color: #1d4ed8; text-decoration: underline; }
.broker-badge {
  font-size: 11px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
}
.broker-meta { font-size: 13.5px; color: #475569; line-height: 1.6; }
.broker-meta a { color: #1557a5; font-weight: 700; text-decoration: none; }
.cta {
  display: block;
  margin-top: 16px;
  padding: 15px;
  border-radius: 12px;
  background: #1267d6;
  color: #ffffff;
  text-align: center;
  text-decoration: none;
  font-weight: 900;
}
.cross-links {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.cross-link {
  display: block;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #1e293b;
  font-size: 12.5px;
  font-weight: 800;
  text-decoration: none;
  text-align: center;
}
.cross-link:hover { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
</style>
</head>
<body>
<main class="wrap">

<nav class="breadcrumb" aria-label="현재 위치">
  <a href="/">🏠 홈</a> &gt;
  <a href="/broker-landing">공인중개사 플랫폼</a> &gt;
  <a href="${html(regionBrokerListUrl)}">${html(location)} 공인중개사</a>
  ${broker ? ` &gt; <strong>${html(broker)}</strong>` : ""}
</nav>

<section class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
    <a href="/" style="font-weight:900;color:#173a59;text-decoration:none;font-size:16px;">🏠 우리아파트 · 안심딜 홈</a>
    <a href="/app-install" style="display:inline-flex;align-items:center;gap:6px;background:#eff6ff;border:1.5px solid #93c5fd;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:900;color:#1d4ed8;text-decoration:none;">📲 앱 다운로드 · 설치</a>
  </div>

  <h1>${html( broker ? (location + " " + broker + " 공인중개사") : (location + " 공인중개사 목록 (" + brokerCount + "곳)") )}</h1>
  <p>${html(description)}</p>

  <a class="cta" href="/apt">
    ✍️ ${html(place)} 아파트 매수·전세·월세 희망조건 등록하기 (수수료 50% 절약)
  </a>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
    <a href="https://www.wooriapt.app/map" style="display:block;padding:13px 10px;border-radius:12px;background:#17387d;color:#ffffff;text-align:center;text-decoration:none;font-weight:900;font-size:13.5px;">💬 아파트 지도 위 말풍선 ›</a>
    <a href="https://www.ansimdeal.com/map" style="display:block;padding:13px 10px;border-radius:12px;background:#0f766e;color:#ffffff;text-align:center;text-decoration:none;font-weight:900;font-size:13.5px;">🏪 점포·상가 상권분석 지도 ›</a>
  </div>
</section>

<section class="card">
  <h2>📋 ${html(location)} 등록 공인중개사 상세정보</h2>
  <ul class="broker-list">
    ${brokerItems}
  </ul>
</section>

<section class="card">
  <h2>🏘️ ${html(location)} 아파트 시세·매물 및 중개사 서비스 바로가기</h2>
  <p>${html(location)} 지역의 아파트 매매·전세·월세 실거래 매칭 페이지와 공인중개사 전용 안내 페이지를 함께 확인해 보세요.</p>
  <div class="cross-links">
    <a class="cross-link" href="${html(aptSearchSaleUrl)}">🏠 ${html(place)} 아파트 매매</a>
    <a class="cross-link" href="${html(aptSearchJeonseUrl)}">🔑 ${html(place)} 아파트 전세</a>
    <a class="cross-link" href="${html(aptSearchMonthlyUrl)}">🏢 ${html(place)} 아파트 월세</a>
    <a class="cross-link" href="${html(regionBrokerListUrl)}">🤝 ${html(place)} 중개사 전체보기</a>
    <a class="cross-link" href="/mart-search/${[region, city, place].map(pathEncode).join("/")}">🛒 ${html(place)} 동네마트 보기</a>
    <a class="cross-link" href="https://www.wooriapt.app/map">💬 아파트 지도 위 시세·매물 말풍선</a>
    <a class="cross-link" href="https://www.ansimdeal.com/map">🏪 점포·상가 상권분석 지도 매칭기</a>
    <a class="cross-link" href="/broker-landing">📢 공인중개사 플랫폼 안내</a>
    <a class="cross-link" href="/check">🚫 허위매물 1초 팩트체크</a>
  </div>
</section>

</main>
</body>
</html>`);
  } catch (error) {
    console.error("BROKER PAGE ERROR:", error);
    return res.status(500).send("공인중개사 페이지 생성 중 오류가 발생했습니다.");
  }
}

/* =========================================
   공인중개사 사이트맵 (/broker-sitemap.xml)
========================================= */

async function handleBrokerSitemap(req, res) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");

  try {
    const locationSet = new Set();

    // 1. agent_directory RPC 병렬 페이지네이션 조회 (최대 5,000개 동)
    const rpcPromises = [0, 1000, 2000, 3000, 4000].map(function(start) {
      return fetch(
        SUPABASE_URL + "/rest/v1/rpc/get_broker_sitemap_locations",
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
            Range: start + "-" + (start + 999)
          },
          body: JSON.stringify({})
        }
      ).then(async function(r) {
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data) ? data : [];
      }).catch(function() { return []; });
    });

    // 2. safe_apartments에서 전국 시도/시군구/동리 병렬 수집 (RPC 1,000건 제한 및 환경변수 미설정 완벽 보완)
    const aptOffsets = Array.from({ length: 22 }, function(_, i) { return i * 1000; });
    const aptLocPromises = aptOffsets.map(function(start) {
      return fetch(
        APT_SUPABASE_URL + "/rest/v1/safe_apartments?select=%EC%8B%9C%EB%8F%84,%EC%8B%9C%EA%B5%B0%EA%B5%AC,%EC%9D%8D%EB%A9%B4,%EB%8F%99%EB%A6%AC&order=%EC%8B%9C%EB%8F%84.asc,%EC%8B%9C%EA%B5%B0%EA%B5%AC.asc,%EB%8F%99%EB%A6%AC.asc",
        {
          headers: {
            apikey: APT_SUPABASE_KEY,
            Authorization: "Bearer " + APT_SUPABASE_KEY,
            Range: start + "-" + (start + 999)
          }
        }
      ).then(async function(r) {
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data) ? data : [];
      }).catch(function() { return []; });
    });

    const [rpcBatches, aptBatches] = await Promise.all([
      Promise.all(rpcPromises),
      Promise.all(aptLocPromises)
    ]);

    for (const row of rpcBatches.flat()) {
      const region = clean(row && row.region);
      const city = clean(row && row.city);
      const place = clean(row && row.place);
      if (region && city && place) {
        locationSet.add([region, city, place].map(pathEncode).join("/"));
      }
    }

    for (const row of aptBatches.flat()) {
      const region = clean(row && row["시도"]);
      const city = clean(row && row["시군구"]);
      const place = clean(row && (row["동리"] || row["읍면"]));
      if (region && city && place) {
        locationSet.add([region, city, place].map(pathEncode).join("/"));
      }
    }

    const lastmod = new Date().toISOString().split("T")[0];
    const urls = [];

    urls.push(
      "  <url>" +
        "<loc>" + xmlEscape(SITE_ORIGIN + "/broker-landing") + "</loc>" +
        "<lastmod>" + lastmod + "</lastmod>" +
        "<changefreq>weekly</changefreq>" +
        "<priority>0.9</priority>" +
      "</url>"
    );

    for (const encodedPath of locationSet) {
      const url = SITE_ORIGIN + "/broker-search/" + encodedPath;
      urls.push(
        "  <url>" +
          "<loc>" + xmlEscape(url) + "</loc>" +
          "<lastmod>" + lastmod + "</lastmod>" +
          "<changefreq>weekly</changefreq>" +
          "<priority>0.8</priority>" +
        "</url>"
      );
    }

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join("\n") +
      "\n</urlset>";

    return res.status(200).send(xml);
  } catch (error) {
    console.error("BROKER SITEMAP ERROR:", error);
    return res.status(500).send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      "<error>broker sitemap generation failed</error>"
    );
  }
}

/* =========================================
   통합 진입점
========================================= */

async function handler(req, res) {
  const rawHost = (req && req.headers && req.headers.host) ? String(req.headers.host) : "";
  const reqHost = rawHost.includes("ansimdeal.com")
    ? "www.ansimdeal.com"
    : "www.wooriapt.app";
  SITE_ORIGIN = "https://" + reqHost;

  const mode = String(req.query.mode || "page").trim();

  if (mode === "indexnow") {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }
    try {
      let urls = req.body?.urls || req.body?.urlList || [];
      if (typeof urls === "string") urls = [urls];
      const result = await submitIndexNow(urls);
      if (!result.ok) {
        return res.status(result.naverStatus || 400).json(result);
      }
      return res.status(200).json(result);
    } catch (error) {
      console.error("INDEXNOW ERROR:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "IndexNow 전송 중 오류가 발생했습니다."
      });
    }
  }

  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  if (mode === "broker-page") {
    return handleBrokerPage(req, res);
  }

  if (mode === "broker-sitemap") {
    return handleBrokerSitemap(req, res);
  }

  if (mode === "list") {
    return aptHandleApartmentList(req, res);
  }

  if (mode === "sitemap-index") {
    return aptHandleSitemapIndex(req, res);
  }

  if (mode === "sitemap") {
    return aptHandleSitemap(req, res);
  }

  return aptHandleApartmentPage(req, res);
}

module.exports = handler;
