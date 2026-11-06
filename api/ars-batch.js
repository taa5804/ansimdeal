let localBrokersDirectory = null;
try {
  localBrokersDirectory = require("./brokers_dispatch_directory.json");
} catch (e) {}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "허용되지 않은 요청입니다." });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || "https://dcysjuxyjqtvkihdsjvv.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_publishable_RZBX7u1v8MLBCfEJT0-eRg_jPcIulG2";

  const rawBody = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const hostStr = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !hostStr.includes("wooriapt.app")) {
    try {
      const upstreamRes = await fetch("https://www.wooriapt.app/api/ars-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rawBody, isAnsimdeal: true })
      });
      const upstreamData = await upstreamRes.json().catch(() => ({}));
      return res.status(upstreamRes.status).json(upstreamData);
    } catch (err) {
      return res.status(500).json({ ok: false, message: "서버 연동 오류: " + err.message });
    }
  }

  const IS_ANSIMDEAL = rawBody.isAnsimdeal === true || hostStr.includes("ansimdeal");

  const supabaseHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };

  const normalizePhone = (v) => String(v || "").replace(/\D/g, "");
  const cleanText = (v) => String(v ?? "").trim();
  const isMobilePhone = (v) => /^01[016789][0-9]{7,8}$/.test(normalizePhone(v));

  function shuffle(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pickNonMembers(nonMembers, alreadySentPhones, countNeeded = 20) {
    const sent = new Set(alreadySentPhones.map(normalizePhone));
    const eligible = (Array.isArray(nonMembers) ? nonMembers : []).filter(item => {
      const phone = normalizePhone(item.phone);
      return phone && !sent.has(phone) && item.receive_blocked !== true;
    });

    const mobiles = shuffle(eligible.filter(item => isMobilePhone(item.phone)));
    const landlines = shuffle(eligible.filter(item => !isMobilePhone(item.phone)));
    const picked = [];

    for (const m of mobiles) {
      if (picked.length >= countNeeded) break;
      picked.push(m);
    }
    if (picked.length < countNeeded) {
      for (const l of landlines) {
        if (picked.length >= countNeeded) break;
        picked.push(l);
      }
    }
    return picked;
  }

  async function supabaseGet(path) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: "GET",
      headers: supabaseHeaders
    });
    const data = await response.json();
    if (!response.ok) throw new Error("SUPABASE_GET_FAILED");
    return data;
  }

  async function supabaseInsert(table, rows) {
    if (!rows.length) return [];
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...supabaseHeaders, Prefer: "return=representation" },
      body: JSON.stringify(rows)
    });
    return response.json();
  }

  async function supabasePatch(table, query, values) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method: "PATCH",
      headers: { ...supabaseHeaders, Prefer: "return=representation" },
      body: JSON.stringify(values)
    });
    return response.json();
  }

  function tradeTypeText(type) {
    if (type === "sale") return "매매";
    if (type === "jeonse") return "전세";
    if (type === "monthly") return "월세";
    return "임차";
  }

  function formatMoney(amount) {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) return "";
    const eok = Math.floor(num / 10000);
    const man = num % 10000;
    if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString("ko-KR")}만원`;
    if (eok > 0) return `${eok}억원`;
    return `${man.toLocaleString("ko-KR")}만원`;
  }

  function formatRange(min, max) {
    const minText = formatMoney(min);
    const maxText = formatMoney(max);
    if (!minText && !maxText) return "";
    if (!minText) return `${maxText} 이하`;
    if (!maxText) return `${minText} 이상`;
    if (Number(min) === Number(max)) return minText;
    return `${minText} ~ ${maxText}`;
  }

  function desiredPriceText(request) {
    if (request.request_type === "sale") return formatRange(request.sale_min, request.sale_max);
    if (request.request_type === "jeonse") return formatRange(request.jeonse_min, request.jeonse_max);
    const deposit = formatRange(request.monthly_deposit_min, request.monthly_deposit_max);
    const rent = request.monthly_rent ? `${Number(request.monthly_rent).toLocaleString("ko-KR")}만원` : "";
    if (deposit && rent) return `보증금 ${deposit} / 월세 ${rent}`;
    if (deposit) return `보증금 ${deposit}`;
    if (rent) return `월세 ${rent}`;
    return "";
  }

  function formatMoveDate(dateString, isFlexible) {
    if (!dateString) return isFlexible ? "조율 가능" : "";
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return isFlexible ? "조율 가능" : "";
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const base = `${y}년 ${m}월 ${day}일`;
    return isFlexible ? `${base} (조율 가능)` : base;
  }

  function formatArea(size) {
    const text = cleanText(size);
    if (!text) return "";
    return text.includes("평") || text.includes("㎡") ? text : `${text}평`;
  }

  function requestDetails(request) {
    return {
      dong: cleanText(request.dong),
      apartment_name: cleanText(request.apartment),
      trade_type: tradeTypeText(request.request_type),
      desired_area: formatArea(request.size),
      desired_price: desiredPriceText(request),
      move_in_date: formatMoveDate(request.move_date, request.move_flexible === true),
      memo: cleanText(request.memo),
      request_number: cleanText(request.request_number)
    };
  }

  /*
    LMS 문자 문구 (휴대폰 010 및 일반전화 PC 통화매니저 모두 동일하게 LMS 문자 발송)
  */
  function buildLmsContent(request, isStoreReq) {
    const d = requestDetails(request);
    const reqNum = d.request_number;
    const targetTitle = d.apartment_name || d.dong || "희망지역";

    if (isStoreReq) {
      const lines = [
        `[${d.dong} ${targetTitle} ${d.desired_area} 임차손님 대기]`,
        "",
        "사장님 안녕하십니까, 상가 매칭센터 '안심딜'입니다.",
        "본인인증 완료된 실임차 고객이 아래 조건의 상가를 찾고 있어 공동중개 요청드립니다.",
        "",
        `■ 임차 고객 조건 (#${reqNum})`,
        `• 희망지역: ${d.dong}`,
        d.apartment_name ? `• 희망업종/층: ${d.apartment_name} / ${d.desired_area}` : `• 희망평형: ${d.desired_area}`,
        d.desired_price ? `• 희망예산: ${d.desired_price}` : "",
        d.move_in_date ? `• 입점희망: ${d.move_in_date}` : "",
        d.memo ? `• 고객메모: "${d.memo}"` : "",
        "",
        "■ 공동중개 핵심 안내",
        "1. [임대측 중개보수 100%] 임대인 측 중개보수는 전액 사장님께서 수령하십니다.",
        "2. [등록 즉시 고객 전화번호 오픈] 매물 등록 즉시 사장님께 임차 고객 직통 전화번호가 공개되어 바로 전화·문자 브리핑이 가능합니다.\n3. [상세 호수 비공개] 매물 보호를 위해 동·호수는 입력하지 않으며 [상가건물명·층수·금액]만 안내됩니다.",
        "3. [선착순 3건 마감] 매물 제안 3건 접수 시 자동 마감되며, 계약은 임차인 선택으로 진행됩니다.",
        "4. [실매물 등록 원칙] 고객 신뢰를 위해 임대인 확인된 실매물만 제안 부탁드립니다. (기계약 매물이나 현장 타 매물 유도 시 서비스 이용이 영구 제한됩니다.)",
        "",
        "■ 10초 간편 매물 제안 (회원가입 없음)",
        "아래 링크를 누르시면 5칸 입력으로 10초 만에 제안이 완료됩니다.",
        `▶ 바로 제안하기: https://www.ansimdeal.com/p/${reqNum}`,
        "",
        "무료수신거부: 080-156-4359"
      ];
      return lines.filter(l => l !== null && l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");
    } else {
      const isSale = request.request_type === "sale";
      const sideLabel = isSale ? "매도측" : "임대측";
      const ownerLabel = isSale ? "매도인" : "임대인";
      const clientLabel = isSale ? "매수" : d.trade_type;
      const lines = [
        `[${targetTitle} ${d.desired_area} ${clientLabel}손님 대기 / 공동중개]`,
        "",
        "사장님 안녕하십니까, '우리아파트 안심거래' 매칭센터입니다.",
        `본인인증 완료된 실${clientLabel} 고객이 아래 조건의 매물을 찾고 있어 공동중개 요청드립니다.`,
        "",
        `■ ${clientLabel} 고객 조건 (#${reqNum})`,
        `• 희망단지: ${d.apartment_name ? d.apartment_name : d.dong + " 인근 아파트"} (${d.desired_area} / ${d.trade_type})`,
        d.desired_price ? `• 희망예산: ${d.desired_price}` : "",
        d.move_in_date ? `• 입주희망: ${d.move_in_date}` : "",
        d.memo ? `• 고객메모: "${d.memo}"` : "",
        "",
        "■ 공동중개 핵심 안내",
        `1. [${sideLabel} 중개보수 100%] ${ownerLabel} 측 중개보수는 전액 사장님께서 수령하십니다.`,
        "2. [등록 즉시 고객 전화번호 오픈] 매물 등록 즉시 사장님께 매수·임차 고객 직통 전화번호가 공개되어 바로 전화·문자 브리핑이 가능합니다.\n3. [동·호수 비공개 보호] 매물 보호를 위해 동·호수는 입력하지 않으며 [아파트명·층수·금액]만 안내됩니다.",
        `3. [선착순 3건 마감] 매물 제안 3건 접수 시 자동 마감되며, 계약은 ${isSale ? "매수자" : "임차인"} 선택으로 진행됩니다.`,
        "4. [실매물 등록 원칙] 고객 신뢰를 위해 소유자 확인된 실매물만 제안 부탁드립니다. (기계약 매물이나 현장 타 매물 유도 시 서비스 이용이 영구 제한됩니다.)",
        "",
        "■ 10초 간편 매물 제안 (회원가입 없음)",
        "아래 링크를 누르시면 5칸 입력으로 10초 만에 제안이 완료됩니다.",
        `▶ 바로 제안하기: https://www.wooriapt.app/p/${reqNum}`,
        "",
        "무료수신거부: 080-156-4359"
      ];
      return lines.filter(l => l !== null && l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");
    }
  }

  async function sendLms(phone, request, isStoreReq) {
    const content = buildLmsContent(request, isStoreReq);
    const d = requestDetails(request);
    const subject = isStoreReq
      ? `[${d.dong} 상가 임차손님 대기 / 공동중개]`
      : `[${d.apartment_name || d.dong} ${d.trade_type}손님 대기 / 공동중개]`;

    const smsRes = await fetch("https://www.wooriapt.app/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: normalizePhone(phone),
        content,
        type: "LMS",
        subject
      })
    }).catch(err => {
      console.warn("SMS send warning:", err);
      return null;
    });

    if (smsRes && smsRes.ok) return smsRes.json();
    return { ok: false };
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const requestNumber = String(body.requestNumber || "").replace(/\D/g, "").slice(0, 4);
    const round = Number(body.round) || 1;

    if (requestNumber.length !== 4) {
      return res.status(400).json({ ok: false, message: "4자리 매수요청번호를 확인해 주세요." });
    }

    if (!body.testMode) {
      const kstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
      if (kstHour < 9 || kstHour >= 21) {
        return res.status(400).json({
          ok: false,
          message: "발송 가능 시간은 오전 9시부터 오후 9시까지(09:00~21:00)입니다."
        });
      }
    }

    let requests = await supabaseGet(
      `property_requests?request_number=eq.${encodeURIComponent(requestNumber)}&select=*&limit=1`
    ).catch(() => []);

    if (!Array.isArray(requests) || requests.length === 0) {
      if (body.testMode) {
        requests = [{
          request_number: requestNumber,
          request_type: "sale",
          dong: body.dong || "수완동",
          apartment: "안심테스트단지",
          size: "34평",
          sale_min: 40000,
          sale_max: 50000,
          move_date: "2026-11-30",
          move_flexible: true
        }];
      } else {
        return res.status(404).json({ ok: false, message: "매수요청을 찾을 수 없습니다." });
      }
    }

    const request = requests[0];
    const previousLogs = await supabaseGet(
      `ars_dispatch_logs?request_number=eq.${encodeURIComponent(requestNumber)}&select=broker_phone`
    ).catch(() => []);
    const alreadySentPhones = (Array.isArray(previousLogs) ? previousLogs : []).map(r => r.broker_phone);

    let nonMembers = await supabaseGet(
      `agent_nonmembers?dong=eq.${encodeURIComponent(request.dong)}&select=id,phone,office_name,receive_blocked`
    ).catch(() => []);

    if ((!Array.isArray(nonMembers) || nonMembers.length === 0) && localBrokersDirectory) {
      let list = localBrokersDirectory[request.dong] || [];
      if (list.length === 0) {
        const adjacentDongMap = {
          "세종로": ["당주동", "청진동", "수송동", "내수동", "종로1가", "종로2가", "종로3가", "종로4가", "관철동", "공평동", "사직동", "견지동", "인사동", "익선동", "무교동", "다동", "태평로1가", "을지로1가", "을지로2가", "명동1가", "명동2가", "소공동", "북창동"],
          "태평로1가": ["소공동", "북창동", "무교동", "다동"],
          "태평로2가": ["소공동", "북창동", "남대문로4가"]
        };
        const adjDongs = adjacentDongMap[request.dong] || [];
        for (const adj of adjDongs) {
          if (Array.isArray(localBrokersDirectory[adj])) {
            list = list.concat(localBrokersDirectory[adj]);
          }
        }
      }
      nonMembers = list.map((item, idx) => ({
        id: "local-" + encodeURIComponent(request.dong) + "-" + idx,
        office_name: item[0],
        phone: item[1],
        receive_blocked: false
      }));
    }

    const isCommercial = IS_ANSIMDEAL || (request.apartment && (request.apartment.includes("음식") || request.apartment.includes("상가") || request.apartment.includes("근린") || request.apartment.includes("사무실") || (request.apartment.startsWith("[") && request.apartment.includes(">"))));
    const defaultBatchCount = isCommercial ? 40 : 20;
    const intervalHours = isCommercial ? 4 : 6;
    const targetCount = Number(body.count) || defaultBatchCount;
    let selected = [];
    if (body.testMode) {
      selected = [
        { id: "test-mobile", office_name: "테스트(대표님 휴대폰)", phone: "010-2286-4150", receive_blocked: false },
        { id: "test-landline", office_name: "테스트(회사 전화)", phone: "062-952-4150", receive_blocked: false }
      ];
    } else {
      selected = pickNonMembers(nonMembers, alreadySentPhones, targetCount);
    }

    // 휴대폰(010) 및 일반전화(PC 통화매니저 연동) 모두 LMS 문자 방식으로 발송 (ARS 음성 미사용)
    const lmsResults = await Promise.all(
      selected.map(async broker => {
        try {
          const r = await sendLms(broker.phone, request, isCommercial);
          return { broker, ok: !!(r && r.ok) };
        } catch (e) {
          return { broker, ok: false };
        }
      })
    );

    const now = new Date().toISOString();
    const logRows = lmsResults.map(item => ({
      request_number: requestNumber,
      broker_id: item.broker.id ? String(item.broker.id) : null,
      broker_type: "NONMEMBER",
      broker_phone: normalizePhone(item.broker.phone),
      broker_office: item.broker.office_name || null,
      round_no: round,
      clawops_batch_id: null,
      call_status: item.ok ? "LMS_SENT" : "LMS_FAILED",
      sent_at: item.ok ? now : null
    }));

    if (logRows.length > 0) {
      await supabaseInsert("ars_dispatch_logs", logRows).catch(() => null);

      const nextDispatchTime = new Date(Date.now() + intervalHours * 60 * 60 * 1000).toISOString();
      await supabasePatch(`property_requests?request_number=eq.${encodeURIComponent(requestNumber)}`, {
        ars_round: (Number(request.ars_round) || 0) + 1,
        next_ars_at: nextDispatchTime
      }).catch(() => null);
    }

    const mobileCnt = selected.filter(item => isMobilePhone(item.phone)).length;
    const landlineCnt = selected.length - mobileCnt;

    return res.status(200).json({
      ok: true,
      message: `총 ${selected.length}곳 중개사에 문자(LMS) 발송 완료 (휴대폰: ${mobileCnt}건, PC연동 일반전화: ${landlineCnt}건)`,
      counts: {
        total: selected.length,
        mobile: mobileCnt,
        landline: landlineCnt
      }
    });

  } catch (err) {
    console.error("ars-batch error:", err);
    return res.status(500).json({ ok: false, message: "발송 처리 중 오류가 발생했습니다." });
  }
}
