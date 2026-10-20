"use strict";

// 통계청 SGIS 및 소상공인시장진흥공단 통합 상권분석 서버리스 프록시
const SGIS_SERVICE_ID = "42677d50815743a39472";
const SGIS_SECRET_KEY = "56d7cbc0765c47859790";

let cachedToken = null;
let tokenExpiresAt = 0;

// 지역명 -> 통계청 행정동 코드 매핑 캐시
const ADM_CACHE = {
  "양산동": "24040800",
  "건국동": "24040810",
  "용봉동": "24040550",
  "일곡동": "24040700",
  "운암1동": "24040560",
  "동림동": "24040610",
  "문흥1동": "24040650",
  "치평동": "24020610",
  "상무1동": "24020580",
  "수완동": "24050630",
  "첨단1동": "24050610",
  "첨단2동": "24050620"
};

async function getSgisToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }
  const authUrl = `https://sgisapi.mods.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${SGIS_SERVICE_ID}&consumer_secret=${SGIS_SECRET_KEY}`;
  const resp = await fetch(authUrl);
  const data = await resp.json();
  if (data.errCd === 0 && data.result && data.result.accessToken) {
    cachedToken = data.result.accessToken;
    tokenExpiresAt = Number(data.result.accessTimeout) || (now + 7200000);
    return cachedToken;
  }
  throw new Error("SGIS 토큰 발급 실패: " + JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { dongName = "양산동", adm_cd, year = "2023" } = req.query || {};

  try {
    const token = await getSgisToken();
    let targetCd = adm_cd || ADM_CACHE[dongName] || "24040800";

    const url = `https://sgisapi.mods.go.kr/OpenAPI3/stats/population.json?accessToken=${token}&year=${year}&adm_cd=${targetCd}`;
    const resp = await fetch(url);
    const result = await resp.json();

    if (result.errCd === 0 && result.result && result.result[0]) {
      const row = result.result[0];
      return res.status(200).json({
        ok: true,
        source: "통계청 SGIS 국가통계포털 공인 실데이터",
        adm_nm: row.adm_nm,
        adm_cd: row.adm_cd,
        tot_ppltn: Number(row.tot_ppltn) || 0, // 총 거주인구
        tot_family: Number(row.tot_family) || 0, // 세대(가구)수
        tot_house: Number(row.tot_house) || 0, // 주택수
        corp_cnt: Number(row.corp_cnt) || 0, // 사업체(점포)수
        employee_cnt: Number(row.employee_cnt) || 0, // 직장인(종사자)수
        avg_age: Number(row.avg_age) || 0, // 평균나이
        ppltn_dnsty: Number(row.ppltn_dnsty) || 0, // 인구밀도
        avg_fmember_cnt: Number(row.avg_fmember_cnt) || 0 // 평균가구원수
      });
    }

    return res.status(200).json({
      ok: false,
      message: "통계청 데이터 조회 결과 없음",
      raw: result
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message
    });
  }
};
