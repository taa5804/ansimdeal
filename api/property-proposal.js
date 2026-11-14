export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "허용되지 않은 요청입니다."
    });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");

  // Proxy to wooriapt.app if env vars are only on main domain
  if ((!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) && !host.includes("wooriapt.app")) {
    try {
      const qs = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      const targetUrl = `https://www.wooriapt.app/api/property-proposal${qs}`;
      const fetchOpts = {
        method: req.method,
        headers: { "Content-Type": "application/json", Accept: "application/json" }
      };
      if (req.method === "POST") {
        const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
        fetchOpts.body = rawBody;
      }
      const upstreamRes = await fetch(targetUrl, fetchOpts);
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

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  function clean(value) {
    return String(value || "").trim();
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatPhone(p) {
    const d = normalizePhone(p);
    if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return d;
  }

  /* =========================================================
     7일 자동소멸 (다음 주 같은 요일 23:59 + 주말 만료 시 월요일 23:59 유예)
     + 48시간 만료보관함 계산기
  ========================================================= */
  function calcSlotWindow(baseDateInput) {
    const base = baseDateInput ? new Date(baseDateInput) : new Date();
    // Convert to KST (+9) calculation
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstTime = new Date(base.getTime() + kstOffset);

    // Add 7 days
    const expKst = new Date(kstTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    // Weekend grace: 6 = Saturday (+2 days -> Monday), 0 = Sunday (+1 day -> Monday)
    const dayOfWeek = expKst.getUTCDay();
    if (dayOfWeek === 6) {
      expKst.setUTCDate(expKst.getUTCDate() + 2);
    } else if (dayOfWeek === 0) {
      expKst.setUTCDate(expKst.getUTCDate() + 1);
    }
    expKst.setUTCHours(23, 59, 59, 999);

    const expiresAt = new Date(expKst.getTime() - kstOffset);
    const holdingUntil = new Date(expiresAt.getTime() + 48 * 60 * 60 * 1000);

    return {
      registeredAt: base.toISOString(),
      expiresAt: expiresAt.toISOString(),
      holdingUntil: holdingUntil.toISOString()
    };
  }

  /* 금액 문자열에서 만원 단위 숫자 추출 및 법정 수수료 / 50% 절약액 계산 */
  function parseAmountToMan(amountStr, tradeType) {
    const s = String(amountStr || "").replace(/,/g, "");
    let totalMan = 0;
    const eokMatch = s.match(/(\d+(?:\.\d+)?)\s*억/);
    const manMatch = s.match(/억\s*(\d+)/) || (!eokMatch && s.match(/(\d+)\s*만/)) || (!eokMatch && s.match(/^(\d+)$/));
    if (eokMatch) {
      totalMan += Math.round(parseFloat(eokMatch[1]) * 10000);
    }
    if (manMatch && manMatch[1]) {
      totalMan += parseInt(manMatch[1], 10);
    }
    // 월세인 경우 환산보증금 (보증금 + 월세 * 100)
    if (tradeType === "monthly" || tradeType === "store" || s.includes("/")) {
      const parts = s.split("/");
      if (parts.length >= 2) {
        const dep = parseInt(parts[0].replace(/\D/g, ""), 10) || 3000;
        const rent = parseInt(parts[1].replace(/\D/g, ""), 10) || 150;
        totalMan = dep + rent * 100;
      }
    }
    if (totalMan <= 0) totalMan = 50000; // 기본 5억
    const isCommercial = tradeType === "store" || tradeType === "commercial";
    const rate = isCommercial ? 0.009 : (totalMan >= 90000 ? 0.005 : totalMan >= 60000 ? 0.004 : 0.004);
    const normalFeeMan = Math.max(30, Math.round(totalMan * rate));
    const halfFeeMan = Math.round(normalFeeMan * 0.5);
    const savedFeeMan = normalFeeMan - halfFeeMan;
    return { totalMan, normalFeeMan, halfFeeMan, savedFeeMan };
  }

  function parseSlotMeta(descText, createdAt) {
    const raw = String(descText || "");
    const match = raw.match(/\[SLOT_META:(\{[\s\S]*?\})\]/);
    let meta = {};
    if (match) {
      try {
        meta = JSON.parse(match[1]);
      } catch (e) {
        meta = {};
      }
    }
    const cleanDesc = raw.replace(/\n?\[SLOT_META:\{[\s\S]*?\}\]/g, "").trim();
    const win = calcSlotWindow(meta.registeredAt || createdAt);
    return {
      cleanDesc,
      sido: meta.sido || "서울특별시",
      sigungu: meta.sigungu || "서초구",
      dong: meta.dong || "반포동",
      tradeType: meta.tradeType || "sale",
      category: meta.category || "apt",
      lat: meta.lat ? Number(meta.lat) : null,
      lng: meta.lng ? Number(meta.lng) : null,
      photos: Array.isArray(meta.photos) ? meta.photos : [],
      registeredAt: meta.registeredAt || win.registeredAt,
      expiresAt: meta.expiresAt || win.expiresAt,
      holdingUntil: meta.holdingUntil || win.holdingUntil,
      normalFeeMan: meta.normalFeeMan || 400,
      halfFeeMan: meta.halfFeeMan || 200,
      savedFeeMan: meta.savedFeeMan || 200
    };
  }

  function evaluateSlotLifecycle(row) {
    const meta = parseSlotMeta(row.description, row.created_at);
    const now = Date.now();
    const expTime = new Date(meta.expiresAt).getTime();
    const holdTime = new Date(meta.holdingUntil).getTime();

    let lifecycle = "ACTIVE";
    if (row.status === "MAP_COMPLETED") {
      lifecycle = "COMPLETED";
    } else if (row.status === "MAP_DELETED") {
      lifecycle = "DELETED";
    } else if (now > holdTime) {
      lifecycle = "PURGED";
    } else if (now > expTime || row.status === "MAP_HOLDING") {
      lifecycle = "HOLDING";
    } else {
      lifecycle = "ACTIVE";
    }

    const remainMs = Math.max(0, expTime - now);
    const remainDays = Math.floor(remainMs / (24 * 60 * 60 * 1000));
    const holdingRemainMs = Math.max(0, holdTime - now);
    const holdingRemainHours = Math.ceil(holdingRemainMs / (60 * 60 * 1000));

    return {
      id: row.id,
      requestNumber: row.request_number,
      apartment: row.apartment,
      amount: row.amount,
      floor: row.floor || "-",
      area: row.area || "-",
      description: meta.cleanDesc,
      officeName: row.office_name || "안심파트너 공인중개사",
      officePhone: formatPhone(row.office_phone || ""),
      rawPhone: normalizePhone(row.office_phone || ""),
      status: row.status,
      lifecycle,
      sido: meta.sido,
      sigungu: meta.sigungu,
      dong: meta.dong,
      tradeType: meta.tradeType,
      category: meta.category,
      lat: meta.lat,
      lng: meta.lng,
      photos: meta.photos,
      registeredAt: meta.registeredAt,
      expiresAt: meta.expiresAt,
      holdingUntil: meta.holdingUntil,
      remainMs,
      remainDays,
      holdingRemainHours,
      normalFeeMan: meta.normalFeeMan,
      halfFeeMan: meta.halfFeeMan,
      savedFeeMan: meta.savedFeeMan,
      createdAt: row.created_at
    };
  }

  /* =========================================================
     GET 요청 처리:
     1) ?mode=map_listings : 지도 노출용 활성 매물 전체 조회
     2) ?mode=broker_slots&phone=010... : 공인중개사 내 10개 슬롯 & 48시간 만료보관함 조회
  ========================================================= */
  if (req.method === "GET") {
    const mode = clean(req.query.mode || "map_listings");
    try {
      const queryUrl =
        `${SUPABASE_URL}/rest/v1/property_proposals` +
        `?select=id,request_number,apartment,amount,floor,area,description,office_name,office_phone,status,created_at` +
        `&order=id.desc&limit=300`;

      const resp = await fetch(queryUrl, { method: "GET", headers });
      const rows = resp.ok ? await resp.json().catch(() => []) : [];
      const list = (Array.isArray(rows) ? rows : []).map(evaluateSlotLifecycle);

      if (mode === "broker_slots") {
        const phoneFilter = normalizePhone(req.query.phone || "");
        const myItems = phoneFilter
          ? list.filter((item) => item.rawPhone === phoneFilter)
          : [];

        const activeSlots = myItems.filter((item) => item.lifecycle === "ACTIVE").slice(0, 10);
        const holdingSlots = myItems.filter((item) => item.lifecycle === "HOLDING");
        const completedSlots = myItems.filter((item) => item.lifecycle === "COMPLETED" || item.lifecycle === "DELETED");

        return res.status(200).json({
          ok: true,
          maxSlots: 10,
          usedSlots: activeSlots.length,
          remainingSlots: Math.max(0, 10 - activeSlots.length),
          activeSlots,
          holdingSlots,
          completedSlots
        });
      }

      // Default: map_listings (ACTIVE items only)
      const activeListings = list.filter((item) => item.lifecycle === "ACTIVE");
      return res.status(200).json({
        ok: true,
        count: activeListings.length,
        listings: activeListings
      });
    } catch (err) {
      console.error("GET property-proposal error:", err);
      return res.status(200).json({ ok: true, count: 0, listings: [] });
    }
  }

  /* =========================================================
     POST 요청 처리:
     1) action === "REGISTER_MAP_SLOT" : 공인중개사 10개 무료 슬롯 매물 등록 (문자비용 0원)
     2) action === "EXTEND_SLOT"       : 48시간 만료보관함 1클릭 7일 재연장
     3) action === "COMPLETE_SLOT" / "DELETE_SLOT" : 거래완료/즉시삭제 및 0.1초 슬롯 반환
     4) 기본 : 4자리 요청번호 맞춤 매물 제안
  ========================================================= */
  const body =
    typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : req.body || {};

  const action = clean(body.action);

  if (action === "REGISTER_MAP_SLOT") {
    try {
      const officePhone = normalizePhone(body.officePhone);
      const officeName = clean(body.officeName) || "안심파트너 공인중개사";
      const apartment = clean(body.apartment);
      const amount = clean(body.amount);
      const floor = clean(body.floor) || "중층";
      const area = clean(body.area) || "84㎡ (34평)";
      const description = clean(body.description);
      const sido = clean(body.sido) || "광주광역시";
      const sigungu = clean(body.sigungu) || "북구";
      const dong = clean(body.dong) || "본촌동";
      const tradeType = clean(body.tradeType) || "sale";
      const category = clean(body.category) || "apt";
      const lat = body.lat ? Number(body.lat) : null;
      const lng = body.lng ? Number(body.lng) : null;
      const photos = Array.isArray(body.photos) ? body.photos.slice(0, 3) : [];

      if (!/^01[016789][0-9]{7,8}$/.test(officePhone)) {
        return res.status(400).json({
          ok: false,
          message: "공인중개사 010 휴대전화번호를 정확히 입력해 주세요."
        });
      }

      if (!apartment || !amount) {
        return res.status(400).json({
          ok: false,
          message: "단지명(또는 상가명)과 거래 희망금액을 입력해 주세요."
        });
      }

      // Check current active slots for this broker (Cap = 10)
      const checkUrl =
        `${SUPABASE_URL}/rest/v1/property_proposals` +
        `?office_phone=eq.${encodeURIComponent(officePhone)}` +
        `&select=id,request_number,apartment,amount,floor,area,description,office_name,office_phone,status,created_at` +
        `&order=id.desc&limit=100`;

      const checkResp = await fetch(checkUrl, { method: "GET", headers });
      const existingRows = checkResp.ok ? await checkResp.json().catch(() => []) : [];
      const activeList = (Array.isArray(existingRows) ? existingRows : [])
        .map(evaluateSlotLifecycle)
        .filter((item) => item.lifecycle === "ACTIVE");

      if (activeList.length >= 10) {
        return res.status(400).json({
          ok: false,
          code: "SLOT_FULL",
          usedSlots: activeList.length,
          maxSlots: 10,
          message: "무료 제공되는 10개 매물 슬롯이 모두 사용 중입니다. 기존 등록 매물 중 거래완료된 매물을 삭제하시면 즉시 슬롯이 반환되어 새 매물을 등록하실 수 있습니다."
        });
      }

      const win = calcSlotWindow(new Date());
      const feeInfo = parseAmountToMan(amount, tradeType);
      const slotMetaObj = {
        sido,
        sigungu,
        dong,
        tradeType,
        category,
        lat,
        lng,
        photos,
        registeredAt: win.registeredAt,
        expiresAt: win.expiresAt,
        holdingUntil: win.holdingUntil,
        normalFeeMan: feeInfo.normalFeeMan,
        halfFeeMan: feeInfo.halfFeeMan,
        savedFeeMan: feeInfo.savedFeeMan
      };

      const fullDesc = (description ? description + "\n" : "") + `[SLOT_META:${JSON.stringify(slotMetaObj)}]`;

      const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/property_proposals`, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          request_number: category === "store" ? "MAP1" : "0000",
          apartment,
          amount,
          floor,
          area,
          description: fullDesc,
          office_name: officeName,
          office_phone: officePhone,
          status: "MAP_ACTIVE"
        })
      });

      const insertedRows = await insertResp.json().catch(() => []);
      if (!insertResp.ok) {
        console.error("REGISTER_MAP_SLOT error:", insertedRows);
        return res.status(500).json({
          ok: false,
          message: "매물 슬롯 등록 중 오류가 발생했습니다."
        });
      }

      const createdItem = Array.isArray(insertedRows) && insertedRows[0]
        ? evaluateSlotLifecycle(insertedRows[0])
        : null;

      return res.status(200).json({
        ok: true,
        message: "지도 반값매물 슬롯에 등록되었습니다! (7일 후 자동소멸 · 48시간 만료보관함 지원)",
        usedSlots: activeList.length + 1,
        remainingSlots: Math.max(0, 10 - (activeList.length + 1)),
        item: createdItem
      });
    } catch (err) {
      console.error("REGISTER_MAP_SLOT exception:", err);
      return res.status(500).json({
        ok: false,
        message: "매물 등록 처리 중 오류가 발생했습니다."
      });
    }
  }

  if (action === "EXTEND_SLOT") {
    try {
      const slotId = Number(body.id);
      const officePhone = normalizePhone(body.officePhone);
      if (!slotId) {
        return res.status(400).json({ ok: false, message: "연장할 매물 번호가 필요합니다." });
      }

      // Fetch target row
      const rowResp = await fetch(
        `${SUPABASE_URL}/rest/v1/property_proposals?id=eq.${slotId}&select=*&limit=1`,
        { method: "GET", headers }
      );
      const rows = rowResp.ok ? await rowResp.json().catch(() => []) : [];
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ ok: false, message: "해당 매물을 찾을 수 없습니다." });
      }

      const target = rows[0];
      const meta = parseSlotMeta(target.description, target.created_at);
      const win = calcSlotWindow(new Date());

      const updatedMetaObj = {
        sido: meta.sido,
        sigungu: meta.sigungu,
        dong: meta.dong,
        tradeType: meta.tradeType,
        category: meta.category,
        lat: meta.lat,
        lng: meta.lng,
        photos: meta.photos,
        registeredAt: win.registeredAt,
        expiresAt: win.expiresAt,
        holdingUntil: win.holdingUntil,
        normalFeeMan: meta.normalFeeMan,
        halfFeeMan: meta.halfFeeMan,
        savedFeeMan: meta.savedFeeMan
      };

      const newDesc = (meta.cleanDesc ? meta.cleanDesc + "\n" : "") + `[SLOT_META:${JSON.stringify(updatedMetaObj)}]`;

      const patchResp = await fetch(
        `${SUPABASE_URL}/rest/v1/property_proposals?id=eq.${slotId}`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify({
            status: "MAP_ACTIVE",
            description: newDesc
          })
        }
      );

      const patchedRows = await patchResp.json().catch(() => []);
      if (!patchResp.ok) {
        return res.status(500).json({ ok: false, message: "7일 재연장 처리에 실패했습니다." });
      }

      return res.status(200).json({
        ok: true,
        message: "1클릭 7일 재연장이 완료되어 지도에 즉시 다시 노출됩니다!",
        item: Array.isArray(patchedRows) && patchedRows[0] ? evaluateSlotLifecycle(patchedRows[0]) : null
      });
    } catch (err) {
      return res.status(500).json({ ok: false, message: "재연장 중 오류가 발생했습니다." });
    }
  }

  if (action === "COMPLETE_SLOT" || action === "DELETE_SLOT") {
    try {
      const slotId = Number(body.id);
      if (!slotId) {
        return res.status(400).json({ ok: false, message: "삭제할 매물 ID가 필요합니다." });
      }

      const newStatus = action === "COMPLETE_SLOT" ? "MAP_COMPLETED" : "MAP_DELETED";
      const patchResp = await fetch(
        `${SUPABASE_URL}/rest/v1/property_proposals?id=eq.${slotId}`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify({ status: newStatus })
        }
      );

      if (!patchResp.ok) {
        return res.status(500).json({ ok: false, message: "슬롯 반환 처리에 실패했습니다." });
      }

      return res.status(200).json({
        ok: true,
        message: action === "COMPLETE_SLOT"
          ? "거래완료 처리되어 0.1초 만에 지도에서 비노출되었으며, 무료 슬롯 1개가 즉시 반환되었습니다!"
          : "매물이 즉시 삭제되었으며 무료 슬롯 1개가 반환되었습니다!"
      });
    } catch (err) {
      return res.status(500).json({ ok: false, message: "삭제 처리 중 오류가 발생했습니다." });
    }
  }

  /* =========================================================
     기존 4자리 요청번호 기반 맞춤 매물 제안 처리 (100% 보존)
  ========================================================= */
  try {
    const requestNumber = clean(body.requestNumber)
      .replace(/\D/g, "")
      .slice(0, 4);

    const apartment = clean(body.apartment);
    const amount = clean(body.amount);
    const floor = clean(body.floor) || "-";
    const area = clean(body.area) || "-";
    const description = clean(body.description);
    const officeName = clean(body.officeName) || "제안 공인중개사";
    const officePhone = normalizePhone(body.officePhone) || "01000000000";

    if (requestNumber.length !== 4) {
      return res.status(400).json({
        ok: false,
        message: "4자리 요청번호를 확인해 주세요."
      });
    }

    if (!apartment || !amount) {
      return res.status(400).json({
        ok: false,
        message: "단지명(또는 건물·상가명)과 거래 금액을 입력해 주세요."
      });
    }

    const requestResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/property_requests` +
        `?request_number=eq.${encodeURIComponent(requestNumber)}` +
        `&select=id,request_number,request_type,apartment,proposal_count,phone,status` +
        `&order=id.desc&limit=1`,
      {
        method: "GET",
        headers
      }
    );

    const requestRows = await requestResponse.json().catch(() => []);

    if (!requestResponse.ok) {
      return res.status(500).json({
        ok: false,
        message: "요청번호 확인 중 오류가 발생했습니다."
      });
    }

    if (
      requestNumber !== "5804" &&
      (!Array.isArray(requestRows) || requestRows.length === 0)
    ) {
      return res.status(404).json({
        ok: false,
        message: "해당 4자리 요청번호로 등록된 매수·임차 요청을 찾을 수 없습니다."
      });
    }

    const reqItem = Array.isArray(requestRows) && requestRows.length > 0 ? requestRows[0] : null;
    const reqAptText = String(reqItem?.apartment || "");
    const reqTypeText = String(reqItem?.request_type || "").toLowerCase();
    const isStore =
      reqTypeText.includes("commercial") ||
      reqTypeText.includes("store") ||
      reqAptText.includes("상가") ||
      reqAptText.includes("점포") ||
      reqAptText.includes("음식") ||
      reqAptText.includes("사무실") ||
      (reqAptText.startsWith("[") && reqAptText.includes(">"));

    const proposalResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/property_proposals`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          request_number: requestNumber,
          apartment: apartment,
          amount: amount,
          floor: floor,
          area: area,
          description: description || null,
          office_name: officeName,
          office_phone: officePhone,
          status: "PROPOSED"
        })
      }
    );

    const proposalRows = await proposalResponse.json().catch(() => []);

    if (!proposalResponse.ok) {
      return res.status(500).json({
        ok: false,
        message: "매물 등록 중 오류가 발생했습니다."
      });
    }

    const countResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/property_proposals` +
        `?request_number=eq.${encodeURIComponent(requestNumber)}` +
        `&select=id`,
      {
        method: "GET",
        headers
      }
    );

    const countRows = await countResponse.json().catch(() => []);
    const proposalCount = Array.isArray(countRows) ? countRows.length : 1;

    if (reqItem) {
      const patchData = {
        proposal_count: proposalCount,
        updated_at: new Date().toISOString()
      };
      await fetch(
        `${SUPABASE_URL}/rest/v1/property_requests?request_number=eq.${encodeURIComponent(requestNumber)}`,
        {
          method: "PATCH",
          headers: {
            ...headers,
            Prefer: "return=representation"
          },
          body: JSON.stringify(patchData)
        }
      ).catch((err) => console.error("proposal count update error:", err));
    }

    const serviceName = isStore ? "안심딜" : "우리아파트 안심거래";
    const domainUrl = isStore ? "https://www.ansimdeal.com" : "https://www.wooriapt.app";
    const targetLabel = isStore ? "상가건물명" : "아파트명";
    const buyerPhone = normalizePhone(reqItem?.phone || "");
    const formattedBuyerPhone = buyerPhone ? formatPhone(buyerPhone) : "010-0000-5804";
    const formattedOfficePhone = formatPhone(officePhone);

    if (buyerPhone && /^01[016789][0-9]{7,8}$/.test(buyerPhone)) {
      try {
        const buyerMsg = [
          `[${serviceName} 맞춤 매물 도착 안내]`,
          ``,
          `고객님께서 요청하신 조건(#${requestNumber})에 공인중개사가 실매물을 제안했습니다! (현재 누적 ${proposalCount}건)`,
          ``,
          `■ 도착한 매물 정보`,
          `• ${targetLabel}: ${apartment}`,
          `• 층수: ${floor}`,
          `• 제안금액: ${amount}`,
          description ? `• 매물특징: ${description}` : ``,
          `• 담당 중개사: ${officeName} (${formattedOfficePhone})`,
          ``,
          `담당 공인중개사 소장님께서 곧 고객님께 전화 또는 문자로 상세 브리핑 및 방문 일정을 안내드릴 예정입니다.`,
          ``,
          `■ [중개보수 50% 반값 혜택 및 직거래 유도 신고 시 '수수료 0원(전액 무료)' 보장 안내]`,
          `• 반드시 아래 링크에서 [거래 결정(4자리 거래방 코드 발급)]을 통해 계약하셔야 중개보수 50% 절감 및 권리분석 안전보증이 적용됩니다.`,
          `• 만약 중개사가 "플랫폼을 빼고 따로 계약하면 수수료를 깎아주겠다"며 플랫폼 외 계약을 유도할 경우, 본사(062-952-4150)로 제보해 주시면 고객님의 플랫폼 이용료를 100% 전액 무료(0원)로 면제해 드립니다!`,
          ``,
          `▶ 제안 매물 확인하기: ${domainUrl}/my-proposals.html?code=${requestNumber}`
        ].filter(Boolean).join("\n");

        await fetch("https://www.wooriapt.app/api/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: buyerPhone,
            type: "LMS",
            subject: `[${serviceName}] 요청하신 매물이 도착했습니다`,
            content: buyerMsg
          })
        });
      } catch (buyerSmsErr) {
        console.error("buyer proposal sms error:", buyerSmsErr);
      }
    }

    if (officePhone && /^01[016789][0-9]{7,8}$/.test(officePhone) && requestNumber !== "5804") {
      try {
        const brokerMsg = [
          `[${serviceName} 매물제안 접수 완료 · 고객 직통 연락처 오픈]`,
          ``,
          `소장님, 제안해주신 매물(#${requestNumber} ${apartment} ${floor} ${amount})이 고객님께 실시간 전달되었습니다!`,
          ``,
          `기다리지 마시고 지금 바로 아래 매수·임차 고객님께 직접 전화 또는 문자로 매물 브리핑 및 방문 일정을 잡아보세요.`,
          ``,
          `■ 매수·임차 고객 직통 연락처`,
          `• 요청번호: #${requestNumber}`,
          `• 고객 직통 전화번호: ${formattedBuyerPhone}`,
          `• 제안하신 매물: ${apartment} (${floor} / ${amount})`,
          ``,
          `■ 공동중개 및 정산 필수 유의사항`,
          `1. [매도·임대측 중개보수 100%] 매도·임대인 측 중개보수는 전액 소장님께서 수령하십니다.`,
          `2. [국토부 실거래가 자동 대조] 제안하신 매물(${apartment} ${floor})은 국토부 실거래가 및 등기 시스템과 자동 대조됩니다.`,
          `3. [플랫폼 우회(뒷거래) 엄금] 고객에게 플랫폼 외 개별 계약을 유도할 경우, '고객 제보 시 고객 수수료 전액 무료(0원) 보상제'가 작동하여 즉시 본사로 제보되며, 위반 시 위약벌(수수료의 5배) 청구 및 영구 제명 처리됩니다.`
        ].join("\n");

        await fetch("https://www.wooriapt.app/api/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: officePhone,
            type: "LMS",
            subject: `[${serviceName}] 고객 직통 연락처 안내 (#${requestNumber})`,
            content: brokerMsg
          })
        });
      } catch (brokerSmsErr) {
        console.error("broker proposal sms error:", brokerSmsErr);
      }
    }

    try {
      const adminMsg = [
        `[우리아파트/안심딜 매물제안 접수 · 양방향 연결 완료]`,
        `공인중개사가 매물을 제안하여 고객 연락처(${formattedBuyerPhone})를 부동산에 즉시 오픈했습니다!`,
        ``,
        `• 요청번호: #${requestNumber} (누적 ${proposalCount}건)`,
        `• 제안매물: ${apartment} (${area} / ${floor})`,
        `• 제안금액: ${amount}`,
        `• 중개사무소: ${officeName} (${formattedOfficePhone})`,
        `• 매수/임차고객: ${formattedBuyerPhone}`,
        description ? `• 상세설명: ${description}` : ``
      ].filter(Boolean).join("\n");

      await fetch("https://www.wooriapt.app/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: "01022864150",
          type: "LMS",
          subject: `[매물제안/번호오픈 #${requestNumber}]`,
          content: adminMsg
        })
      });
    } catch (smsErr) {
      console.error("admin proposal sms error:", smsErr);
    }

    return res.status(200).json({
      ok: true,
      message: "매물이 등록되었으며 고객 직통 연락처가 소장님께 오픈되었습니다.",
      requestNumber: requestNumber,
      proposalCount: proposalCount,
      buyerPhone: formattedBuyerPhone,
      proposal:
        Array.isArray(proposalRows) && proposalRows.length
          ? proposalRows[0]
          : null
    });
  } catch (error) {
    console.error("property-proposal error:", error);
    return res.status(500).json({
      ok: false,
      message: "매물 등록 처리 중 오류가 발생했습니다."
    });
  }
}
