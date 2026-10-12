"use strict";

/* =========================================
   기본 설정 (환경변수 미설정 시 안전한 공개 읽기 전용 키 폴백 적용)
========================================= */

const SUPABASE_URL =
  process.env.MART_SUPABASE_URL ||
  "https://wpshlmijsscmlasqtapa.supabase.co";

const SUPABASE_KEY =
  process.env.MART_SUPABASE_ANON_KEY ||
  "sb_publishable_3QLYewR-TXBd1mNfte6OJg_kre42L7K";

let BASE_URL =
  "https://www.wooriapt.app";


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
    .filter(function (url) {
      try {
        const u = new URL(url);
        return (
          u.protocol === "https:" &&
          (u.hostname === "wooriapt.app" || u.hostname === "www.wooriapt.app")
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

  const response = await fetch("https://searchadvisor.naver.com/indexnow", {
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
  });

  const responseText = await response.text();

  return {
    ok: response.ok,
    naverStatus: response.status,
    submitted: validUrls.length,
    response: responseText || "Success"
  };
}


const PAGE_SIZE = 5000;
const TOTAL_SITEMAPS = 6;


/* =========================================
   공통 함수
========================================= */

function esc(value) {
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

function encodePart(value) {
  return encodeURIComponent(String(value || "").trim());
}


/* =========================================
   1. 마트 자동 검색 페이지 (개별 마트 & 동네 마트 허브 지원)
========================================= */

async function handleMartPage(req, res) {
  const q = req.query || {};
  const region = String(q.region || "").trim();
  const city = String(q.city || "").trim();
  const place = String(q.place || "").trim();
  const mart = String(q.mart || "").trim();

  if (!region && !city && !place && !mart) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>마트 정보를 찾을 수 없습니다</title></head><body><h1>마트 정보를 찾을 수 없습니다.</h1></body></html>`
    );
  }

  try {
    let targetRow = null;
    let nearbyRows = [];

    if (mart) {
      const params = new URLSearchParams();
      params.set("select", "시도,시군구,읍면동,상호명,주소,전화번호");
      if (region) params.set("시도", `eq.${region}`);
      if (city) params.set("시군구", `eq.${city}`);
      if (place) params.set("읍면동", `eq.${place}`);
      params.set("상호명", `eq.${mart}`);
      params.set("limit", "1");

      const dbUrl = `${SUPABASE_URL}/rest/v1/mart_directory?${params.toString()}`;
      const response = await fetch(dbUrl, {
        method: "GET",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Accept: "application/json"
        }
      });

      if (response.ok) {
        const rows = await response.json();
        if (Array.isArray(rows) && rows.length > 0) {
          targetRow = rows[0];
        }
      }
    }

    // 주변 마트 / 동네 마트 목록 조회 (동일 시도 + 시군구 기준 최대 40개)
    if (region) {
      const nearParams = new URLSearchParams();
      nearParams.set("select", "시도,시군구,읍면동,상호명,주소,전화번호");
      nearParams.set("시도", `eq.${region}`);
      if (city) nearParams.set("시군구", `eq.${city}`);
      nearParams.set("order", "읍면동.asc,상호명.asc");
      nearParams.set("limit", "40");

      const nearUrl = `${SUPABASE_URL}/rest/v1/mart_directory?${nearParams.toString()}`;
      const nearRes = await fetch(nearUrl, {
        method: "GET",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Accept: "application/json"
        }
      });

      if (nearRes.ok) {
        const list = await nearRes.json();
        if (Array.isArray(list)) {
          nearbyRows = list;
        }
      }
    }

    // 만약 특정 마트 조회였는데 정확 일치 행이 없더라도 URL 파라미터로 폴백 렌더링 지원 (404 방지 또는 동네 허브 안내)
    if (mart && !targetRow && nearbyRows.length === 0) {
      targetRow = {
        시도: region,
        시군구: city,
        읍면동: place,
        상호명: mart,
        주소: [region, city, place].filter(Boolean).join(" "),
        전화번호: ""
      };
    }

    const dbRegion = String((targetRow && targetRow["시도"]) || region || "서울특별시").trim();
    const dbCity = String((targetRow && targetRow["시군구"]) || city || "강남구").trim();
    const dbPlace = String((targetRow && targetRow["읍면동"]) || place || "역삼동").trim();
    const dbMart = mart ? String((targetRow && targetRow["상호명"]) || mart).trim() : "";
    const dbAddress = String((targetRow && targetRow["주소"]) || [dbRegion, dbCity, dbPlace].filter(Boolean).join(" ")).trim();
    const dbPhone = String((targetRow && targetRow["전화번호"]) || "").trim();

    // 같은 동네 마트를 우선 정렬
    const sortedNearby = nearbyRows
      .filter(r => r && r["상호명"] && r["상호명"] !== dbMart)
      .sort((a, b) => {
        const aSameDong = a["읍면동"] === dbPlace ? 0 : 1;
        const bSameDong = b["읍면동"] === dbPlace ? 0 : 1;
        if (aSameDong !== bSameDong) return aSameDong - bSameDong;
        return String(a["상호명"] || "").localeCompare(String(b["상호명"] || ""), "ko");
      })
      .slice(0, 20);

    const pathParts = (dbMart
      ? [dbRegion, dbCity, dbPlace, dbMart]
      : [dbRegion, dbCity, dbPlace]
    )
      .filter(Boolean)
      .map(encodePart);

    const canonical = `${BASE_URL}/mart-search/${pathParts.join("/")}`;
    const dongHubUrl = `${BASE_URL}/mart-search/${[dbRegion, dbCity, dbPlace].filter(Boolean).map(encodePart).join("/")}`;
    const aptSaleUrl = `${BASE_URL}/apt-search/${[dbRegion, dbCity, dbPlace, "sale"].filter(Boolean).map(encodePart).join("/")}`;
    const aptJeonseUrl = `${BASE_URL}/apt-search/${[dbRegion, dbCity, dbPlace, "jeonse"].filter(Boolean).map(encodePart).join("/")}`;
    const brokerHubUrl = `${BASE_URL}/broker-search/${[dbRegion, dbCity, dbPlace].filter(Boolean).map(encodePart).join("/")}`;

    const locationText = [dbRegion, dbCity, dbPlace].filter(Boolean).join(" ");

    const pageSubject = dbMart
      ? `${locationText} ${dbMart}`
      : `${locationText} 동네마트·식자재마트 디렉토리`;

    const title = dbMart
      ? `${locationText} ${dbMart} | 오늘의 마트 시세·온라인 주문·고객유치 | 우리아파트`
      : `${locationText} 마트·슈퍼마켓 총정리 | 오늘의 장보기 시세·할인쿠폰 | 우리아파트`;

    const description = dbMart
      ? `${locationText} 소재 ${dbMart}(${dbAddress}) 매장 정보와 오늘의 장보기 시세 비교, 반값 할인쿠폰, 신규고객 유치·QR 단골등록·문자비용 0원 우리아파트 마트 플랫폼을 확인하세요.`
      : `${locationText} 지역 동네마트·식자재마트·슈퍼마켓 주소 및 연락처 디렉토리입니다. 우리동네 마트 특가 정보와 60개 생필품 오늘의 시세를 한눈에 비교하세요.`;

    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "우리아파트 홈", "item": `${BASE_URL}/` },
        { "@type": "ListItem", "position": 2, "name": "우리아파트 마트 플랫폼", "item": `${BASE_URL}/mart-landing.html` },
        { "@type": "ListItem", "position": 3, "name": `${locationText} 마트 목록`, "item": dongHubUrl }
      ]
    };
    if (dbMart) {
      breadcrumbSchema.itemListElement.push({
        "@type": "ListItem",
        "position": 4,
        "name": dbMart,
        "item": canonical
      });
    }

    const mainEntitySchema = dbMart
      ? {
          "@context": "https://schema.org",
          "@type": "GroceryStore",
          "name": dbMart,
          "description": description,
          "address": {
            "@type": "PostalAddress",
            "addressRegion": dbRegion,
            "addressLocality": `${dbCity} ${dbPlace}`.trim(),
            "streetAddress": dbAddress || locationText,
            "addressCountry": "KR"
          },
          "url": canonical,
          ...(dbPhone ? { "telephone": dbPhone } : {})
        }
      : {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "name": title,
          "description": description,
          "url": canonical
        };

    const nearbyHtml = sortedNearby.length > 0
      ? sortedNearby.map(item => {
          const rReg = String(item["시도"] || dbRegion).trim();
          const rCity = String(item["시군구"] || dbCity).trim();
          const rPlace = String(item["읍면동"] || dbPlace).trim();
          const rName = String(item["상호명"] || "").trim();
          const rAddr = String(item["주소"] || `${rReg} ${rCity} ${rPlace}`).trim();
          const rTel = String(item["전화번호"] || "매장 문의").trim();
          const href = `/mart-search/${[rReg, rCity, rPlace, rName].map(encodePart).join("/")}`;
          return `<a class="near-item" href="${esc(href)}">
            <div class="near-top">
              <strong class="near-name">${esc(rName)}</strong>
              <span class="near-dong">${esc(rPlace)}</span>
            </div>
            <div class="near-addr">${esc(rAddr)}</div>
            <div class="near-tel">📞 ${esc(rTel)} · 매장 상세보기 →</div>
          </a>`;
        }).join("")
      : `<div style="padding:16px;color:#64748b;font-size:14px;">같은 시·군·구 내 추가 등록된 마트 정보를 불러오는 중입니다.</div>`;

    const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta property="og:type" content="website">
<meta property="og:site_name" content="우리아파트 마트 플랫폼">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${BASE_URL}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
<script type="application/ld+json">${JSON.stringify(mainEntitySchema)}</script>
<style>
*{box-sizing:border-box;}
body{margin:0;font-family:"Pretendard","Noto Sans KR",Arial,sans-serif;background:#f4f7f5;color:#1e293b;line-height:1.6;}
a{color:inherit;text-decoration:none;}
.wrap{max-width:920px;margin:0 auto;padding:28px 16px 60px;}
.breadcrumb{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;color:#475569;margin-bottom:16px;background:#fff;padding:10px 14px;border-radius:10px;border:1px solid #e2e8f0;}
.breadcrumb a{color:#075b32;font-weight:700;}
.card{background:#fff;border-radius:18px;padding:28px 24px;box-shadow:0 4px 20px rgba(0,0,0,.06);border:1px solid #e2e8f0;margin-bottom:20px;}
.badge{display:inline-block;padding:6px 12px;border-radius:20px;background:#e8f5ee;color:#075b32;font-size:13px;font-weight:800;margin-bottom:12px;}
h1{margin:0 0 12px;font-size:28px;line-height:1.35;color:#0f172a;letter-spacing:-0.5px;}
.sub-lead{font-size:16px;color:#475569;margin-bottom:20px;}
.spec-table{width:100%;border-collapse:collapse;margin:16px 0 22px;font-size:15px;}
.spec-table th,.spec-table td{padding:12px 14px;border-bottom:1px solid #e2e8f0;text-align:left;}
.spec-table th{width:140px;background:#f8fafc;color:#334155;font-weight:700;}
.spec-table td{color:#0f172a;font-weight:500;}
.info-box{margin:20px 0;padding:20px;background:#f7fbf8;border:1px solid #dcebe2;border-radius:14px;}
.info-box h2{margin:0 0 10px;color:#075b32;font-size:20px;}
.info-box p{margin:8px 0;font-size:15px;color:#334155;}
.features{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0;}
.feature{padding:14px 10px;background:#fff;border:1px solid #dce7e0;border-radius:10px;text-align:center;font-size:14px;font-weight:700;color:#14532d;}
.owner-box{margin-top:20px;padding:20px;border-radius:14px;background:#fff8e8;border:1px solid #f0dfb8;}
.owner-box h2{margin:0 0 10px;font-size:19px;color:#713f12;}
.owner-box p{margin:6px 0;font-size:15px;color:#57534e;}
.cta-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:20px;}
.cta{display:block;padding:15px 18px;text-align:center;border-radius:12px;background:#075b32;color:#fff;font-size:16px;font-weight:800;}
.cta.secondary{background:#0f172a;}
.near-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:14px;}
.near-item{display:block;padding:14px 16px;border-radius:12px;border:1px solid #e2e8f0;background:#f8fafc;transition:border-color .15s,background .15s;}
.near-item:hover{border-color:#075b32;background:#f0fdf4;}
.near-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;}
.near-name{font-size:16px;color:#0f172a;}
.near-dong{font-size:12px;font-weight:700;padding:3px 8px;border-radius:999px;background:#e2e8f0;color:#334155;}
.near-addr{font-size:13px;color:#475569;margin-bottom:4px;}
.near-tel{font-size:12px;color:#075b32;font-weight:700;}
.cross-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
.cross-pill{padding:9px 14px;border-radius:999px;background:#f1f5f9;border:1px solid #cbd5e1;font-size:13px;font-weight:700;color:#1e293b;}
.cross-pill:hover{background:#e2e8f0;}
.footer{margin-top:24px;text-align:center;color:#64748b;font-size:13px;}
@media(max-width:640px){
  h1{font-size:23px;}
  .features{grid-template-columns:repeat(2,1fr);}
  .cta-grid,.near-grid{grid-template-columns:1fr;}
  .spec-table th{width:105px;}
}
</style>
</head>
<body>
<div class="wrap">
  <nav class="breadcrumb" aria-label="위치 경로">
    <a href="/">우리아파트 홈</a> <span>›</span>
    <a href="/mart-landing.html">마트 플랫폼</a> <span>›</span>
    <a href="${esc(dongHubUrl)}">${esc(locationText)} 마트</a>
    ${dbMart ? `<span>›</span> <strong>${esc(dbMart)}</strong>` : ""}
  </nav>

  <section class="card">
    <div class="badge">우리아파트 동네마트·장보기 시세 플랫폼</div>
    <h1>${esc(pageSubject)}</h1>
    <p class="sub-lead">
      ${esc(locationText)} 주민을 위한 우리동네 마트 상세 정보와 60개 핵심 생필품 오늘의 장보기 시세, QR 단골 할인쿠폰 및 온라인 배달주문 연결 페이지입니다.
    </p>

    <table class="spec-table" aria-label="매장 기본 정보">
      <tbody>
        <tr>
          <th>상호명</th>
          <td><strong>${esc(dbMart || `${locationText} 등록 마트`)}</strong></td>
        </tr>
        <tr>
          <th>행정구역</th>
          <td>${esc(dbRegion)} ${esc(dbCity)} ${esc(dbPlace)}</td>
        </tr>
        <tr>
          <th>도로명/지번 주소</th>
          <td>${esc(dbAddress || locationText)}</td>
        </tr>
        <tr>
          <th>대표 전화번호</th>
          <td>${esc(dbPhone || "매장 직접 문의 (우리아파트 마트 디렉토리 등록 매장)")}</td>
        </tr>
        <tr>
          <th>플랫폼 지원 서비스</th>
          <td>오늘의 장보기 시세 비교 · QR 반값 쿠폰북 · 온라인/배달 주문 · 문자비용 0원 단골 알림</td>
        </tr>
      </tbody>
    </table>

    <div class="info-box">
      <h2>🛒 ${esc(dbMart || locationText)} 장보기 & 단골 혜택 안내</h2>
      <p>
        우리아파트 마트 플랫폼은 <strong>${esc(locationText)}</strong> 아파트 입주민과 동네 마트를 직접 연결하여
        농축수산물·신선식품·생필품 60개 핵심 품목의 오늘 시세와 매장 특가 정보를 제공합니다.
      </p>
      <p>
        매장 방문 전 오늘의 장보기 물가를 비교하고, QR 스캔 한 번으로 우리동네 마트 단골 회원 등록 및 반값 할인쿠폰 혜택을 받아보세요.
      </p>
    </div>

    <div class="features">
      <div class="feature">📊 60개 품목 오늘의 시세</div>
      <div class="feature">🎟️ 우리동네 반값 쿠폰북</div>
      <div class="feature">🛵 마트 온라인·배달주문</div>
      <div class="feature">📱 QR 스캔 1초 단골등록</div>
      <div class="feature">💬 문자발송비 0원 푸시알림</div>
      <div class="feature">🥕 아파트 단지 타겟 홍보</div>
    </div>

    <div class="owner-box">
      <h2>💡 ${esc(dbMart || `${locationText} 마트`)} 사장님이신가요? (매출·신규고객 유치 솔루션)</h2>
      <p>
        매월 수십만~수백만 원씩 나가는 문자 발송비와 종이 전단지 비용을 <strong>0원</strong>으로 절감하세요!
        우리아파트 마트 플랫폼은 매장 반경 내 아파트 입주민(30~50대 주부 핵심 타겟)에게 오늘의 특가와 반값 쿠폰을 실시간으로 전달합니다.
      </p>
      <p>
        도입 및 제휴 문의: <strong>010-9850-3388</strong> (우리아파트 마트 디지털전환 지원센터)
      </p>
    </div>

    <div class="cta-grid">
      <a class="cta" href="/mart-landing.html">🏪 마트 사장님 고객유치·도입 안내</a>
      <a class="cta secondary" href="/price">🥦 오늘의 장보기 60대 생필품 시세표</a>
    </div>
  </section>

  <section class="card">
    <h2 style="margin:0 0 8px;font-size:21px;color:#0f172a;">📍 ${esc(dbRegion)} ${esc(dbCity)} 우리동네 마트·슈퍼마켓 둘러보기</h2>
    <p style="margin:0 0 12px;font-size:14px;color:#475569;">
      ${esc(dbPlace)} 및 ${esc(dbCity)} 인근에 위치한 동네마트·식자재마트 상세 정보를 확인해보세요.
    </p>
    <div class="near-grid">
      ${nearbyHtml}
    </div>
  </section>

  <section class="card">
    <h2 style="margin:0 0 8px;font-size:19px;color:#0f172a;">🔗 ${esc(locationText)} 아파트 실거래 · 중개사 · 생활도구 바로가기</h2>
    <p style="margin:0 0 10px;font-size:14px;color:#475569;">
      ${esc(locationText)} 지역의 아파트 매매·전세·월세 시세와 안심 공인중개사, 장보기 물가 도구를 한눈에 확인하세요.
    </p>
    <div class="cross-links">
      <a class="cross-pill" href="${esc(dongHubUrl)}">🛒 ${esc(dbPlace)} 마트 전체보기</a>
      <a class="cross-pill" href="${esc(aptSaleUrl)}">🏢 ${esc(dbPlace)} 아파트 매매 안심매칭</a>
      <a class="cross-pill" href="${esc(aptJeonseUrl)}">🏠 ${esc(dbPlace)} 아파트 전세 안심매칭</a>
      <a class="cross-pill" href="${esc(brokerHubUrl)}">🤝 ${esc(dbPlace)} 등록 공인중개사 찾기</a>
      <a class="cross-pill" href="/price">📈 오늘의 장보기 물가 시세</a>
      <a class="cross-pill" href="/mart">🧮 마트 문자비용 절감 계산기</a>
      <a class="cross-pill" href="/check">🛡️ 부동산 등기·전세사기 팩트체크</a>
      <a class="cross-pill" href="/aura">🌊 신안 임자도 아우라펜션</a>
    </div>
  </section>

  <footer class="footer">
    © 우리아파트 (wooriapt.app) · 전국 아파트 안심거래 & 우리동네 마트 디지털 전환 플랫폼
  </footer>
</div>
</body>
</html>`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.end(html);

  } catch (error) {
    console.error("MART PAGE ERROR:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end("마트 정보를 불러오는 중 오류가 발생했습니다.");
  }
}


/* =========================================
   2. 마트 검색 API
========================================= */

async function handleMartSearch(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");

  const q = String(req.query.q || "").trim();
  if (!q) {
    return res.status(400).json({
      ok: false,
      message: "마트 검색어를 입력해주세요."
    });
  }

  try {
    const params = new URLSearchParams();
    params.set("select", "시도,시군구,읍면동,상호명,주소,전화번호");
    params.set("상호명", `ilike.*${q}*`);
    params.set("order", "상호명.asc");
    params.set("limit", "50");

    const url = `${SUPABASE_URL}/rest/v1/mart_directory?${params.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        ok: false,
        message: "마트 DB 조회에 실패했습니다.",
        error: errorText
      });
    }

    const rows = await response.json();
    return res.status(200).json({
      ok: true,
      query: q,
      count: rows.length,
      marts: rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "마트 검색 중 오류가 발생했습니다.",
      error: String(error.message || error)
    });
  }
}


/* =========================================
   2-1. 마트 DB 직접 연결 테스트
========================================= */

async function handleMartDbTest(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    const params = new URLSearchParams();
    params.set("select", "시도,시군구,읍면동,상호명,주소,전화번호");
    params.set("limit", "1");

    const url = `${SUPABASE_URL}/rest/v1/mart_directory?${params.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        ok: false,
        test: "mart-db-test",
        status: response.status,
        error: errorText
      });
    }

    const rows = await response.json();
    return res.status(200).json({
      ok: true,
      test: "mart-db-test",
      count: rows.length,
      rows: rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      test: "mart-db-test",
      error: String(error.message || error)
    });
  }
}


/* =========================================
   3. 마트 사이트맵 INDEX
========================================= */

function handleMartSitemapIndex(req, res) {
  let items = "";
  for (let page = 1; page <= TOTAL_SITEMAPS; page++) {
    const loc = `${BASE_URL}/sitemaps/marts-${page}.xml`;
    items += `\n  <sitemap>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>2026-10-13</lastmod>\n  </sitemap>`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}\n</sitemapindex>`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  return res.end(xml);
}


/* =========================================
   4. 개별 마트 사이트맵 (1,000개씩 5회 분할 조회 = 5,000개/파일)
========================================= */

async function handleMartSitemap(req, res) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");

  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;

  try {
    const params = new URLSearchParams();
    params.set("select", "시도,시군구,읍면동,상호명,주소,전화번호");
    params.set("order", "시도.asc,시군구.asc,읍면동.asc,상호명.asc");

    const apiUrl = `${SUPABASE_URL}/rest/v1/mart_directory?${params.toString()}`;
    const rows = [];

    for (let batchStart = start; batchStart <= end; batchStart += 1000) {
      const batchEnd = Math.min(batchStart + 999, end);
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Accept: "application/json",
          Range: `${batchStart}-${batchEnd}`,
          Prefer: "count=exact"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase request failed: ${response.status} ${errorText}`);
      }

      const batchRows = await response.json();
      rows.push(...batchRows);

      if (batchRows.length < 1000) {
        break;
      }
    }

    const urls = rows
      .filter(row => row && row["시도"] && row["시군구"] && row["읍면동"] && row["상호명"])
      .map(row => {
        const region = encodePart(row["시도"]);
        const city = encodePart(row["시군구"]);
        const place = encodePart(row["읍면동"]);
        const mart = encodePart(row["상호명"]);
        const loc = `${BASE_URL}/mart-search/${region}/${city}/${place}/${mart}`;
        return `\n  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>2026-10-13</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
      })
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}\n</urlset>`;

    res.statusCode = 200;
    return res.end(xml);
  } catch (error) {
    console.error("MART SITEMAP ERROR:", error);
    res.statusCode = 500;
    res.setHeader("Cache-Control", "no-store");
    return res.end(`Mart sitemap error: ${String(error.message || error)}`);
  }
}


/* =========================================
   통합 HANDLER
========================================= */

module.exports = async function handler(req, res) {
  const rawHost = (req && req.headers && req.headers.host) ? String(req.headers.host).toLowerCase() : "";
  const reqHost = rawHost.includes("ansimdeal.com")
    ? "www.ansimdeal.com"
    : "www.wooriapt.app";
  BASE_URL = "https://" + reqHost;

  const mode = String(req.query.mode || "mart-page").trim();

  if (mode === "indexnow") {
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        message: "Naver IndexNow API ready",
        host: INDEXNOW_HOST,
        keyLocation: INDEXNOW_KEY_LOCATION
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method Not Allowed"
      });
    }

    try {
      const body = req.body || {};
      const urls = body.urls || body.urlList || [];
      const result = await submitIndexNow(urls);
      if (!result.ok) {
        const status = result.naverStatus || 400;
        return res.status(status).json(result);
      }
      return res.status(200).json(result);
    } catch (error) {
      console.error("INDEXNOW ERROR:", error);
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }

  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method Not Allowed");
  }

  if (mode === "mart-search") {
    return handleMartSearch(req, res);
  }

  if (mode === "mart-db-test") {
    return handleMartDbTest(req, res);
  }

  if (mode === "mart-sitemap") {
    return handleMartSitemap(req, res);
  }

  if (mode === "mart-sitemap-index") {
    return handleMartSitemapIndex(req, res);
  }

  return handleMartPage(req, res);
};
