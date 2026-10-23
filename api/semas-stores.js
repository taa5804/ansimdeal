"use strict";

// 소상공인시장진흥공단 상가(상권)정보 공식 오픈API 프록시 서버리스 함수 (CommonJS 규격)
const SEMAS_SERVICE_KEY = "kNX8u%2F1kv0GAtxGvVE0j4LF2cjZWJJes3oidk%2FzHvSfpXr8MFYqs15KfTcPueL28TKOprQG1KOxoqdQnzroLEA%3D%3D";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { lat, lng, radius = "300", indsLclsCd, indsMclsCd, indsSclsCd } = req.query || {};

  if (!lat || !lng) {
    return res.status(400).json({ ok: false, message: "위도(lat)와 경도(lng)는 필수입니다." });
  }

  try {
    const semasUrl = new URL("https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius");
    semasUrl.searchParams.set("serviceKey", decodeURIComponent(SEMAS_SERVICE_KEY));
    semasUrl.searchParams.set("radius", String(radius));
    semasUrl.searchParams.set("cx", String(lng));
    semasUrl.searchParams.set("cy", String(lat));
    semasUrl.searchParams.set("type", "json");
    semasUrl.searchParams.set("numOfRows", "100");
    semasUrl.searchParams.set("pageNo", "1");

    if (indsLclsCd) semasUrl.searchParams.set("indsLclsCd", String(indsLclsCd));
    if (indsMclsCd) semasUrl.searchParams.set("indsMclsCd", String(indsMclsCd));
    if (indsSclsCd) semasUrl.searchParams.set("indsSclsCd", String(indsSclsCd));

    const response = await fetch(semasUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        ok: false,
        message: "소상공인시장진흥공단 API 응답 오류",
        error: errText
      });
    }

    const data = await response.json();
    return res.status(200).json({
      ok: true,
      source: "소상공인시장진흥공단 공식 상가(상권)정보 API",
      data: data
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "서버 내부 오류",
      error: error.message
    });
  }
};
