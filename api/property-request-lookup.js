export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      message: "허용되지 않은 요청입니다."
    });
  }

  const requestNumber = String(req.query.requestNumber || "")
    .replace(/\D/g, "")
    .slice(0, 4);

  if (requestNumber.length !== 4) {
    return res.status(400).json({
      ok: false,
      message: "4자리 요청번호를 입력해 주세요."
    });
  }

  /* 🔑 대표님 만능 마스터키 (5804) 즉시 응답 */
  if (requestNumber === "5804") {
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
    const isAnsimdeal = host.includes("ansimdeal");
    return res.status(200).json({
      ok: true,
      request: {
        requestNumber: "5804",
        requestType: isAnsimdeal ? "monthly" : "sale",
        sido: "서울특별시",
        sigungu: "강남구",
        dong: "역삼동",
        apartment: isAnsimdeal
          ? "역삼역·선릉역 인근 1층 코너/대로변 상가 (카페·베이커리·일반음식점)"
          : "래미안역삼 (전용 84㎡·34평)",
        size: isAnsimdeal ? "전용 18평 이상 (1층 희망)" : "84㎡ (34평형)",
        saleMin: 135000,
        saleMax: 150000,
        jeonseMin: 15000,
        jeonseMax: 25000,
        monthlyDepositMin: 3000,
        monthlyDepositMax: 5000,
        monthlyRent: 250,
        moveDate: "2026-11-15",
        moveFlexible: true,
        memo: "🔑 [만능키 테스트 모드] 권리관계 및 건축물대장 사전 확인 가능한 매물 희망",
        status: "OPEN"
      }
    });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");

  if ((!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) && !host.includes("wooriapt.app")) {
    try {
      const upstreamRes = await fetch(
        `https://www.wooriapt.app/api/property-request-lookup?requestNumber=${encodeURIComponent(requestNumber)}&service=ansimdeal`,
        { method: "GET", headers: { Accept: "application/json" } }
      );
      const upstreamData = await upstreamRes.json().catch(() => ({}));
      return res.status(upstreamRes.status).json(upstreamData);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        message: "서버 연동 오류가 발생했습니다."
      });
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      ok: false,
      message: "서버 환경설정이 필요합니다."
    });
  }

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/property_requests` +
      `?request_number=eq.${encodeURIComponent(requestNumber)}` +
      `&select=request_number,request_type,sido,sigungu,dong,apartment,size,sale_min,sale_max,jeonse_min,jeonse_max,monthly_deposit_min,monthly_deposit_max,monthly_rent,move_date,move_flexible,memo,status` +
      `&order=id.desc&limit=1`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("property-request-lookup error:", data);
      return res.status(500).json({
        ok: false,
        message: "요청정보 조회에 실패했습니다."
      });
    }

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "등록된 매수·임차 요청번호가 없습니다."
      });
    }

    const item = data[0];

    // [중요: 상가 vs 아파트 도메인 분리 검증]
    const serviceParam = String(req.query.service || "");
    const isAnsimdealReq = host.includes("ansimdeal") || serviceParam === "ansimdeal";
    const aptText = String(item.apartment || "");
    const typeText = String(item.request_type || "");
    const isStore = typeText.includes("commercial") || typeText.includes("store") || aptText.includes("상가") || aptText.includes("점포");

    if (isAnsimdealReq && !isStore) {
      return res.status(400).json({
        ok: false,
        isApartment: true,
        message: "해당 번호는 [우리아파트 안심거래] 아파트 매수요청번호입니다. 상가·점포 안심딜에서는 조회 및 등록할 수 없습니다."
      });
    }

    if (!isAnsimdealReq && isStore) {
      return res.status(400).json({
        ok: false,
        isStore: true,
        message: "해당 번호는 [점포·상가 안심딜] 상가 임차요청번호입니다. 점포·상가 안심딜(ansimdeal.com)에서 확인해 주세요."
      });
    }

    return res.status(200).json({
      ok: true,
      request: {
        requestNumber: item.request_number,
        requestType: item.request_type,
        sido: item.sido || "",
        sigungu: item.sigungu || "",
        dong: item.dong || "",
        apartment: item.apartment || "",
        size: item.size || "",
        saleMin: item.sale_min,
        saleMax: item.sale_max,
        jeonseMin: item.jeonse_min,
        jeonseMax: item.jeonse_max,
        monthlyDepositMin: item.monthly_deposit_min,
        monthlyDepositMax: item.monthly_deposit_max,
        monthlyRent: item.monthly_rent,
        moveDate: item.move_date || "",
        moveFlexible: item.move_flexible === true,
        memo: item.memo || "",
        status: item.status
      }
    });
  } catch (error) {
    console.error("property-request-lookup exception:", error);
    return res.status(500).json({
      ok: false,
      message: "서버 오류가 발생했습니다."
    });
  }
}
