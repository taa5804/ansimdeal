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

  // ClawOps Voice Config
  const CLAWOPS_ACCOUNT_ID = process.env.CLAWOPS_ACCOUNT_ID || "ACUfJGlcU6IkNZxuxn";
  const CLAWOPS_API_KEY = process.env.CLAWOPS_API_KEY || "sk_vuT1vZJtqWMHdjROjqAi1x7XpGGpjSY2";
  const CLAWOPS_FROM_NUMBER = String(process.env.CLAWOPS_FROM_NUMBER || "07052767712").replace(/\D/g, "");
  
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

  // Call Flow ID: Ansimdeal vs Wooriapt
  const IS_ANSIMDEAL = rawBody.isAnsimdeal === true || hostStr.includes("ansimdeal");
  const CLAWOPS_CALL_FLOW_ID = IS_ANSIMDEAL
    ? (process.env.CLAWOPS_CALL_FLOW_ID_ANSIM || "cmvitbfy3000t01s6g1yjgebw")
    : (process.env.CLAWOPS_CALL_FLOW_ID || "cmtl15663000t01s6yddn205j");

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

  function pickTenNonMembers(nonMembers, alreadySentPhones, countNeeded = 10) {
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
    return `${minText}부터 ${maxText}까지`;
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
    if (!dateString) return isFlexible ? "협의 가능" : "";
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return isFlexible ? "협의 가능" : "";
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const base = `${y}년 ${m}월 ${day}일`;
    return isFlexible ? `${base} (협의 가능)` : base;
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
      request_number: cleanText(request.request_number)
    };
  }

  /*
    LMS 문자 문구 (우리아파트 vs 안심딜 100% 완전 분리)
  */
  function buildLmsContent(request) {
    const d = requestDetails(request);
    const reqNum = d.request_number;

    if (IS_ANSIMDEAL) {
      // 안심딜 상가·점포 임차 전용 문구
      const lines = [
        "[안심딜] 상가·점포 임차 희망조건 전달",
        "",
        `사장님, [${d.dong}]에 ${d.apartment_name ? d.apartment_name + " " : ""}${d.trade_type} 희망 고객이 등록되었습니다!`
      ];
      if (d.desired_area) lines.push(`희망평수: ${d.desired_area}`);
      if (d.desired_price) lines.push(`희망예산: ${d.desired_price}`);
      if (d.move_in_date) lines.push(`입점희망: ${d.move_in_date}`);
      lines.push(
        "",
        "조건에 맞는 점포·상가 매물이 있으면 지금 바로 제안해 주세요.",
        `임차요청번호: ${reqNum}`,
        `바로 제안하기: https://www.ansimdeal.com/broker-property-register.html?code=${reqNum}`,
        "",
        "발송자: 점포·상가 안심딜"
      );
      return lines.join("\n");
    } else {
      // 우리아파트 아파트 매매·전월세 전용 문구
      const lines = [
        "[우리아파트] 아파트 매수 희망조건 전달",
        "",
        `사장님, [${d.dong}] ${d.apartment_name ? d.apartment_name + " " : ""}아파트 ${d.trade_type} 희망 고객이 있습니다.`
      ];
      if (d.desired_area) lines.push(`희망평수: ${d.desired_area}`);
      if (d.desired_price) lines.push(`희망가격: ${d.desired_price}`);
      if (d.move_in_date) lines.push(`입주시점: ${d.move_in_date}`);
      lines.push(
        "",
        "조건에 맞는 매물이 있으면 바로 제안해 주세요. (수수료 50% 절약 안심매칭)",
        `매수요청번호: ${reqNum}`,
        `바로 제안하기: https://www.wooriapt.app/broker-property-register.html?code=${reqNum}`,
        "",
        "발송자: 우리아파트 안심거래"
      );
      return lines.join("\n");
    }
  }

  async function sendLms(phone, request) {
    const content = buildLmsContent(request);
    const subject = IS_ANSIMDEAL ? "[안심딜] 상가 임차조건 전달" : "[우리아파트] 매수조건 전달";

    // Direct call to send-sms logic
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

  /*
    ClawOps ARS 음성전화 배치 (비회원 유선전화 대상)
  */
  async function createClawOpsBatch(brokers, request) {
    if (!brokers.length) return null;
    const details = requestDetails(request);
    const tasks = brokers.map(b => ({
      To: normalizePhone(b.phone),
      Variables: details
    }));

    try {
      const response = await fetch(
        `https://api.claw-ops.com/v1/accounts/${CLAWOPS_ACCOUNT_ID}/call-batches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CLAWOPS_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            Name: `${IS_ANSIMDEAL ? "안심딜" : "안심거래"}-${request.request_number}`,
            From: normalizePhone(CLAWOPS_FROM_NUMBER),
            CallFlowId: CLAWOPS_CALL_FLOW_ID,
            Status: "running",
            MachineDetection: "Enable",
            Tasks: tasks
          })
        }
      );
      if (!response.ok) {
        console.warn("ClawOps batch warning (status " + response.status + "):", await response.text());
        return null;
      }
      return await response.json();
    } catch (e) {
      console.warn("ClawOps batch exception:", e);
      return null;
    }
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const requestNumber = String(body.requestNumber || "").replace(/\D/g, "").slice(0, 4);
    const round = Number(body.round) || 1;

    if (requestNumber.length !== 4) {
      return res.status(400).json({ ok: false, message: "4자리 매수요청번호를 확인해 주세요." });
    }

    // 발송 시간 확인 (09:00 ~ 21:00 KST) - testMode인 경우 통과
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

    // 대상 동네 중개사 선별
    let nonMembers = await supabaseGet(
      `agent_nonmembers?dong=eq.${encodeURIComponent(request.dong)}&select=id,phone,office_name,receive_blocked`
    ).catch(() => []);

    if ((!Array.isArray(nonMembers) || nonMembers.length === 0) && localBrokersDirectory) {
      const list = localBrokersDirectory[request.dong] || [];
      nonMembers = list.map((item, idx) => ({
        id: "local-" + encodeURIComponent(request.dong) + "-" + idx,
        office_name: item[0],
        phone: item[1],
        receive_blocked: false
      }));
    }

    let selected = [];
    if (body.testMode) {
      // [안전 잠금] 테스트 시 실제 부동산 발송 절대 차단 -> 대표님 테스트 번호로만 발송
      selected = [
        { id: "test-mobile", office_name: "테스트(대표님 휴대폰)", phone: "010-2286-4150", receive_blocked: false },
        { id: "test-landline", office_name: "테스트(회사 전화)", phone: "062-952-4150", receive_blocked: false }
      ];
    } else {
      selected = pickTenNonMembers(nonMembers, alreadySentPhones, 10);
    }
    const mobileRecipients = selected.filter(item => isMobilePhone(item.phone));
    const voiceRecipients = selected.filter(item => !isMobilePhone(item.phone));

    // 1) 휴대폰 번호 보유자 ➔ LMS 문자 발송
    const lmsResults = await Promise.all(
      mobileRecipients.map(async broker => {
        try {
          const r = await sendLms(broker.phone, request);
          return { broker, ok: !!(r && r.ok) };
        } catch (e) {
          return { broker, ok: false };
        }
      })
    );

    // 2) 일반 유선전화 보유자 ➔ ClawOps ARS 음성 전화 발송
    const batch = await createClawOpsBatch(voiceRecipients, request);
    const batchId = batch?.batchId || batch?.BatchId || batch?.Id || batch?.id || null;

    const now = new Date().toISOString();
    const logRows = [
      ...lmsResults.map(item => ({
        request_number: requestNumber,
        broker_id: item.broker.id ? String(item.broker.id) : null,
        broker_type: "NONMEMBER",
        broker_phone: normalizePhone(item.broker.phone),
        broker_office: item.broker.office_name || null,
        round_no: round,
        clawops_batch_id: null,
        call_status: item.ok ? "LMS_SENT" : "LMS_FAILED",
        sent_at: item.ok ? now : null
      })),
      ...voiceRecipients.map(broker => ({
        request_number: requestNumber,
        broker_id: broker.id ? String(broker.id) : null,
        broker_type: "NONMEMBER",
        broker_phone: normalizePhone(broker.phone),
        broker_office: broker.office_name || null,
        round_no: round,
        clawops_batch_id: batchId ? String(batchId) : null,
        call_status: batchId ? "VOICE_SENT" : "VOICE_QUEUED",
        sent_at: batchId ? now : null
      }))
    ];

    if (logRows.length > 0) {
      await supabaseInsert("ars_dispatch_logs", logRows).catch(() => null);
    }

    return res.status(200).json({
      ok: true,
      message: `총 ${selected.length}곳 중개사에 발송 완료 (문자: ${mobileRecipients.length}건, ARS음성: ${voiceRecipients.length}건)`,
      counts: {
        total: selected.length,
        mobile: mobileRecipients.length,
        landline: voiceRecipients.length
      }
    });

  } catch (err) {
    console.error("ars-batch error:", err);
    return res.status(500).json({ ok: false, message: "발송 처리 중 오류가 발생했습니다." });
  }
}
