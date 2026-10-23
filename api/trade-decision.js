export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || "https://dcysjuxyjqtvkihdsjvv.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hostStr = String(req.headers["x-forwarded-host"] || req.headers.host || "");

  // SUPABASE_SERVICE_ROLE_KEY가 없는 도메인(ansimdeal.com 등)은 wooriapt.app 본 서버로 프록시
  if (!SUPABASE_SERVICE_ROLE_KEY && !hostStr.includes("wooriapt.app")) {
    try {
      const qs = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      const targetUrl = `https://www.wooriapt.app/api/trade-decision${qs}`;
      const fetchOpts = {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      };
      if (req.method !== "GET" && req.method !== "HEAD") {
        fetchOpts.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
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

  const effectiveKey = SUPABASE_SERVICE_ROLE_KEY || "sb_publishable_RZBX7u1v8MLBCfEJT0-eRg_jPcIulG2";

  const headers = {
    apikey: effectiveKey,
    Authorization: `Bearer ${effectiveKey}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  const clean = (v) => String(v || "").trim();
  const normalizePhone = (v) => String(v || "").replace(/\D/g, "");

  // Helper to parse [TRADE_ROOM_CODE:1234|TX:TR12345678|TYPE:monthly|PAID:Y] tag from description
  function parseTradeMeta(desc) {
    const text = String(desc || "");
    const match = text.match(/\[TRADE_ROOM_CODE:(\d{4})\|TX:([A-Z0-9_-]+)(?:\|TYPE:([a-z]+))?(?:\|PAID:([YN]))?\]/);
    if (!match) return null;
    return {
      tradeRoomCode: match[1],
      transactionNumber: match[2],
      tradeType: match[3] || "sale",
      feePaid: match[4] === "Y",
      cleanDescription: text.replace(/\n?\[TRADE_ROOM_CODE:[^\]]+\]/g, "").trim()
    };
  }

  try {
    /* =========================================================
       GET:
       1) ?admin=dashboard -> 본사 관리자 대시보드 통합 조회
       2) ?code=4자리거래방코드 -> 거래 확정된 매물 및 거래방 정보 조회
       3) ?requestNumber=4자리요청번호 또는 ?phone=휴대폰번호 -> 제안 목록 조회
    ========================================================= */
    if (req.method === "GET") {
      if (clean(req.query.admin) === "dashboard") {
        const [bmRes, reqRes, propRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/safe_brokers?select=id,mobile_phone,office_phone,representative_name,office_name,license_number,sido,sigungu,dong,address,membership_status,is_active,created_at&order=id.desc&limit=200`, { method: "GET", headers }).catch(() => null),
          fetch(`${SUPABASE_URL}/rest/v1/property_requests?select=*&order=id.desc&limit=200`, { method: "GET", headers }).catch(() => null),
          fetch(`${SUPABASE_URL}/rest/v1/property_proposals?select=id,request_number,apartment,amount,floor,area,description,office_name,office_phone,status,created_at&order=id.desc&limit=200`, { method: "GET", headers }).catch(() => null)
        ]);
        const brokersRaw = (bmRes && bmRes.ok) ? await bmRes.json().catch(() => []) : [];
        const requestsRaw = (reqRes && reqRes.ok) ? await reqRes.json().catch(() => []) : [];
        const proposalsRaw = (propRes && propRes.ok) ? await propRes.json().catch(() => []) : [];

        const brokers = (Array.isArray(brokersRaw) ? brokersRaw : []).map((b) => ({
          id: b.id,
          phone: b.mobile_phone || b.office_phone || "",
          mobile_phone: b.mobile_phone || "",
          office_phone: b.office_phone || "",
          email: "",
          representative_name: b.representative_name || "",
          office_name: b.office_name || "",
          office_registration_no: b.license_number || "",
          registration_status: b.is_active === false ? "PENDING" : "APPROVED",
          membership_status: b.membership_status || "FREE",
          sido: b.sido || "",
          sigungu: b.sigungu || "",
          dong: b.dong || "",
          address: b.address || "",
          created_at: b.created_at
        }));
        const requests = Array.isArray(requestsRaw) ? requestsRaw : [];
        const proposals = [];
        const transactions = [];

        (Array.isArray(proposalsRaw) ? proposalsRaw : []).forEach((r) => {
          const meta = parseTradeMeta(r.description);
          const item = {
            id: r.id,
            requestNumber: r.request_number,
            apartment: r.apartment,
            amount: r.amount,
            floor: r.floor,
            area: r.area,
            description: meta ? meta.cleanDescription : (r.description || ""),
            officeName: r.office_name,
            officePhone: r.office_phone,
            status: r.status || "OPEN",
            tradeRoomCode: meta ? meta.tradeRoomCode : null,
            transactionNumber: meta ? meta.transactionNumber : null,
            tradeType: meta ? meta.tradeType : "sale",
            feePaid: meta ? !!meta.feePaid : false,
            createdAt: r.created_at
          };
          proposals.push(item);
          if (meta && meta.tradeRoomCode) {
            transactions.push(item);
          }
        });

        return res.status(200).json({
          ok: true,
          brokers,
          requests,
          proposals,
          transactions
        });
      }

      const code = clean(req.query.code).replace(/\D/g, "").slice(0, 4);
      const requestNumber = clean(req.query.requestNumber).replace(/\D/g, "").slice(0, 4);
      const phone = normalizePhone(req.query.phone);

      // 1) 거래방 코드(4자리) 조회
      if (code) {
        if (code === "5804") {
          return res.status(200).json({
            ok: true,
            trade: {
              tradeNumber: "TR58040001",
              transactionNumber: "TR58040001",
              tradeRoomCode: "5804",
              tradeType: "sale",
              requestNumber: "5804",
              propertyId: "prop-5804-1",
              propertyName: "[만능키 테스트] 역삼동 래미안 84㎡ (중층)",
              apartment: "[만능키 테스트] 역삼동 래미안 84㎡ (중층)",
              amount: "매매 14억 5,000만원",
              floor: "12층 / 25층",
              area: "전용 84㎡ (34평)",
              brokerName: "안심파트너 공인중개사사무소",
              brokerOffice: "안심파트너 공인중개사사무소",
              brokerPhone: "010-5804-5804",
              status: "거래 진행 중",
              buyerConfirmed: true,
              sellerConfirmed: false,
              brokerConfirmed: true
            }
          });
        }

        const propUrl =
          `${SUPABASE_URL}/rest/v1/property_proposals` +
          `?description=ilike.*${encodeURIComponent(`[TRADE_ROOM_CODE:${code}|`)}*` +
          `&select=id,request_number,apartment,amount,floor,area,description,office_name,office_phone,status,created_at` +
          `&order=id.desc&limit=1`;

        const propRes = await fetch(propUrl, { method: "GET", headers });
        const propRows = await propRes.json().catch(() => []);

        if (!propRes.ok || !Array.isArray(propRows) || propRows.length === 0) {
          return res.status(404).json({
            ok: false,
            message: "발급된 4자리 거래방 코드를 찾을 수 없습니다. 거래 결정 후 문자로 발송된 4자리 거래방 코드를 확인해 주세요."
          });
        }

        const row = propRows[0];
        const meta = parseTradeMeta(row.description) || {
          tradeRoomCode: code,
          transactionNumber: "TR" + String(row.id || "0001").padStart(8, "0"),
          tradeType: "sale",
          cleanDescription: row.description || ""
        };

        let isMemberBroker = false;
        const cleanBrokerPhone = normalizePhone(row.office_phone);
        if (cleanBrokerPhone) {
          const amUrl = `${SUPABASE_URL}/rest/v1/safe_brokers?mobile_phone=eq.${encodeURIComponent(cleanBrokerPhone)}&select=id,office_name,is_active&limit=1`;
          const amRes = await fetch(amUrl, { method: "GET", headers }).catch(() => null);
          if (amRes && amRes.ok) {
            const amRows = await amRes.json().catch(() => []);
            if (Array.isArray(amRows) && amRows.length > 0) {
              isMemberBroker = true;
            }
          }
        }

        return res.status(200).json({
          ok: true,
          trade: {
            tradeNumber: meta.transactionNumber,
            transactionNumber: meta.transactionNumber,
            tradeRoomCode: code,
            tradeType: meta.tradeType || "sale",
            feePaid: !!meta.feePaid,
            isMemberBroker,
            requestNumber: row.request_number,
            propertyId: row.id,
            propertyName: row.apartment,
            apartment: row.apartment,
            amount: row.amount,
            floor: row.floor,
            area: row.area,
            description: meta.cleanDescription,
            brokerName: row.office_name,
            brokerOffice: row.office_name,
            brokerPhone: row.office_phone,
            status: "거래 진행 중",
            createdAt: row.created_at || new Date().toISOString()
          }
        });
      }

      // 2) 매수요청번호 또는 휴대폰번호로 제안 목록 조회
      let targetReqNo = requestNumber;
      let requestInfo = null;

      if (!targetReqNo && phone) {
        const reqUrl =
          `${SUPABASE_URL}/rest/v1/property_requests` +
          `?phone=eq.${encodeURIComponent(phone)}` +
          `&select=request_number,request_type,sido,sigungu,dong,apartment,size,status,phone` +
          `&order=id.desc&limit=1`;
        const reqRes = await fetch(reqUrl, { method: "GET", headers });
        const reqRows = await reqRes.json().catch(() => []);
        if (Array.isArray(reqRows) && reqRows.length > 0) {
          requestInfo = reqRows[0];
          targetReqNo = String(requestInfo.request_number || "");
        }
      } else if (targetReqNo) {
        const reqUrl =
          `${SUPABASE_URL}/rest/v1/property_requests` +
          `?request_number=eq.${encodeURIComponent(targetReqNo)}` +
          `&select=request_number,request_type,sido,sigungu,dong,apartment,size,status,phone` +
          `&order=id.desc&limit=1`;
        const reqRes = await fetch(reqUrl, { method: "GET", headers });
        const reqRows = await reqRes.json().catch(() => []);
        if (Array.isArray(reqRows) && reqRows.length > 0) {
          requestInfo = reqRows[0];
        }
      }

      if (!targetReqNo) {
        return res.status(200).json({
          ok: true,
          requestNumber: "",
          proposals: []
        });
      }

      const listUrl =
        `${SUPABASE_URL}/rest/v1/property_proposals` +
        `?request_number=eq.${encodeURIComponent(targetReqNo)}` +
        `&select=id,request_number,apartment,amount,floor,area,description,office_name,office_phone,status,created_at` +
        `&order=id.desc`;

      const listRes = await fetch(listUrl, { method: "GET", headers });
      const listRows = await listRes.json().catch(() => []);

      const proposals = (Array.isArray(listRows) ? listRows : []).map((r) => {
        const meta = parseTradeMeta(r.description);
        return {
          propertyId: r.id,
          requestNumber: r.request_number,
          dealType: (requestInfo && requestInfo.request_type) || (meta && meta.tradeType) || "sale",
          apartment: r.apartment,
          amount: r.amount,
          floor: r.floor,
          area: r.area,
          description: meta ? meta.cleanDescription : (r.description || ""),
          officeName: r.office_name,
          officePhone: r.office_phone,
          status: r.status,
          tradeRoomCode: meta ? meta.tradeRoomCode : null,
          transactionNumber: meta ? meta.transactionNumber : null,
          createdAt: r.created_at
        };
      });

      return res.status(200).json({
        ok: true,
        requestNumber: targetReqNo,
        requestType: (requestInfo && requestInfo.request_type) || "sale",
        proposals
      });
    }

    /* =========================================================
       POST:
       매수자(임차인)가 매물 1건을 [거래 결정(확정)] 눌렀을 때
    ========================================================= */
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

      if (body.action === "admin_update_broker") {
        const brokerId = clean(body.id);
        if (!brokerId) {
          return res.status(400).json({ ok: false, message: "중개사 ID가 필요합니다." });
        }
        const patchData = {};
        if (body.registration_status) {
          patchData.is_active = clean(body.registration_status) === "APPROVED";
        }
        if (body.membership_status) {
          patchData.membership_status = clean(body.membership_status);
        }

        const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/safe_brokers?id=eq.${encodeURIComponent(brokerId)}`, {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify(patchData)
        }).catch(() => null);

        return res.status(200).json({ ok: !!(patchRes && patchRes.ok) });
      }

      if (body.action === "admin_update_trade_status") {
        const propId = clean(body.id);
        const nextStatus = clean(body.status) || "COMPLETED";
        if (propId && /^\d+$/.test(propId)) {
          await fetch(`${SUPABASE_URL}/rest/v1/property_proposals?id=eq.${encodeURIComponent(propId)}`, {
            method: "PATCH",
            headers: { ...headers, Prefer: "return=representation" },
            body: JSON.stringify({ status: nextStatus })
          }).catch(() => null);
        }
        return res.status(200).json({ ok: true, status: nextStatus });
      }

      if (body.action === "confirm_payment") {
        const payCode = clean(body.code || body.tradeNo).replace(/\D/g, "").slice(0, 4);
        const rawTradeNo = clean(body.tradeNo || body.code);
        const paidFlag = body.paid === false ? "N" : "Y";
        let searchFilter = "";
        if (payCode && payCode.length === 4) {
          searchFilter = `description=ilike.*${encodeURIComponent(`[TRADE_ROOM_CODE:${payCode}|`)}*`;
        } else if (rawTradeNo) {
          searchFilter = `description=ilike.*${encodeURIComponent(`|TX:${rawTradeNo}`)}*`;
        }
        if (searchFilter) {
          const findUrl = `${SUPABASE_URL}/rest/v1/property_proposals?${searchFilter}&select=id,description&order=id.desc&limit=1`;
          const findRes = await fetch(findUrl, { method: "GET", headers }).catch(() => null);
          if (findRes && findRes.ok) {
            const rows = await findRes.json().catch(() => []);
            if (Array.isArray(rows) && rows.length > 0) {
              const r = rows[0];
              const meta = parseTradeMeta(r.description);
              if (meta) {
                const updatedDesc = `${meta.cleanDescription}\n[TRADE_ROOM_CODE:${meta.tradeRoomCode}|TX:${meta.transactionNumber}|TYPE:${meta.tradeType}|PAID:${paidFlag}]`.trim();
                await fetch(`${SUPABASE_URL}/rest/v1/property_proposals?id=eq.${encodeURIComponent(r.id)}`, {
                  method: "PATCH",
                  headers: { ...headers, Prefer: "return=representation" },
                  body: JSON.stringify({ description: updatedDesc })
                }).catch(() => null);
              }
            }
          }
        }
        return res.status(200).json({ ok: true, feePaid: paidFlag === "Y" });
      }

      const propertyId = clean(body.propertyId);
      const requestNumber = clean(body.requestNumber).replace(/\D/g, "").slice(0, 4);
      const isTest =
        body.testMode === true ||
        requestNumber === "5804" ||
        normalizePhone(body.officePhone) === "01000005804" ||
        normalizePhone(body.buyerPhone) === "01000005804";

      const apartment = clean(body.apartment) || "선택 매물";
      const amount = clean(body.amount) || "-";
      const floor = clean(body.floor) || "-";
      const area = clean(body.area) || "-";
      const officeName = clean(body.officeName) || "담당 공인중개사";
      const officePhone = normalizePhone(body.officePhone);
      const tradeType = clean(body.tradeType) || "sale";

      const transactionNumber = clean(body.transactionNumber) || ("TR" + Date.now().toString().slice(-8));
      const tradeRoomCode = requestNumber === "5804"
        ? "5804"
        : String(Math.floor(1000 + Math.random() * 9000));

      // 1) DB 저장 (실제 DB 행이 있는 경우)
      let buyerPhone = normalizePhone(body.buyerPhone);

      if (requestNumber && requestNumber !== "5804") {
        const reqUrl =
          `${SUPABASE_URL}/rest/v1/property_requests` +
          `?request_number=eq.${encodeURIComponent(requestNumber)}` +
          `&select=id,phone,request_type&limit=1`;
        const reqRes = await fetch(reqUrl, { method: "GET", headers }).catch(() => null);
        if (reqRes && reqRes.ok) {
          const reqRows = await reqRes.json().catch(() => []);
          if (Array.isArray(reqRows) && reqRows.length > 0 && !buyerPhone) {
            buyerPhone = normalizePhone(reqRows[0].phone);
          }
        }
      }

      if (propertyId && /^\d+$/.test(propertyId)) {
        const getPropUrl =
          `${SUPABASE_URL}/rest/v1/property_proposals` +
          `?id=eq.${encodeURIComponent(propertyId)}&select=id,description&limit=1`;
        const getPropRes = await fetch(getPropUrl, { method: "GET", headers }).catch(() => null);
        let currentDesc = clean(body.description);
        if (getPropRes && getPropRes.ok) {
          const rows = await getPropRes.json().catch(() => []);
          if (Array.isArray(rows) && rows.length > 0) {
            const parsed = parseTradeMeta(rows[0].description);
            currentDesc = parsed ? parsed.cleanDescription : (rows[0].description || "");
          }
        }

        const taggedDescription =
          `${currentDesc}\n[TRADE_ROOM_CODE:${tradeRoomCode}|TX:${transactionNumber}|TYPE:${tradeType}]`.trim();

        await fetch(
          `${SUPABASE_URL}/rest/v1/property_proposals?id=eq.${encodeURIComponent(propertyId)}`,
          {
            method: "PATCH",
            headers: {
              ...headers,
              Prefer: "return=representation"
            },
            body: JSON.stringify({
              description: taggedDescription
            })
          }
        ).catch((err) => console.error("proposal patch error:", err));
      }

      // 2) 선택된 중개사에게 전용 4자리 거래방 코드 문자(LMS) 발송
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const baseUrl = host ? `${protocol}://${host}` : "https://www.wooriapt.app";

      let brokerSmsSent = false;
      let buyerSmsSent = false;

      if (host && /^01[016789][0-9]{7,8}$/.test(officePhone) && !isTest) {
        const brokerMessage = [
          "[우리아파트 안심거래 거래결정 확정 안내]",
          "",
          "축하합니다! 제안하신 매물이 매수자(임차인)에게 최종 선택(거래 확정)되었습니다.",
          "",
          `■ 선택 매물: ${apartment} (${floor} / ${area})`,
          `■ 거래 금액: ${amount}`,
          `■ 전용 4자리 거래방 코드(진행번호): ${tradeRoomCode}`,
          `■ 거래번호: ${transactionNumber}`,
          "",
          "[중개사 거래 진행 절차 안내]",
          `1. 우리아파트 안심거래(${baseUrl}) 접속`,
          `2. 메인화면 [거래 진행 상황 확인] 입력창에 위 4자리 거래방 코드(${tradeRoomCode}) 입력`,
          "3. 중개사 1단계 확인 동의 후 전용 거래진행실 입장",
          "4. 거래진행실에서 등기부·건축물대장 등 서류 등록 및 전자계약 진행",
          "",
          "※ 이 4자리 거래방 코드는 선택된 담당 중개사님과 거래 당사자만 입장할 수 있는 전용 보안 코드입니다.",
          "※ 매수인(임차인)의 연락처는 공개되지 않으며, 매수인(임차인)이 직접 알려주기 전까지는 비공개로 보호됩니다.",
          "발송자: 우리아파트 안심거래"
        ].join("\n");

        const smsRes = await fetch(`${baseUrl}/api/send-sms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: officePhone,
            content: brokerMessage,
            type: "LMS",
            subject: "[우리아파트 안심거래] 거래결정 확정 및 4자리 거래방 코드 안내"
          })
        }).catch(() => null);

        brokerSmsSent = !!(smsRes && smsRes.ok);
      }

      // 3) 매수자(임차인)에게도 전용 4자리 거래방 코드 문자(LMS) 발송
      if (host && /^01[016789][0-9]{7,8}$/.test(buyerPhone) && !isTest) {
        const buyerMessage = [
          "[우리아파트 안심거래 거래결정 완료 안내]",
          "",
          "선택하신 매물의 거래 결정이 완료되어 전용 거래진행실이 개설되었습니다.",
          "",
          `■ 선택 매물: ${apartment} (${floor} / ${area})`,
          `■ 거래 금액: ${amount}`,
          `■ 담당 중개사: ${officeName} (${officePhone})`,
          `■ 전용 4자리 거래방 코드(진행번호): ${tradeRoomCode}`,
          "",
          "[매수자(임차인) 진행 절차 안내]",
          `1. 메인화면 [거래 진행 상황 확인]에 4자리 거래방 코드(${tradeRoomCode}) 입력`,
          "2. 담당 중개사가 등록한 권리관계·확인서류 열람",
          "3. 플랫폼 이용료(50% 절감) 확인 및 전자계약 서명 진행",
          "",
          "발송자: 우리아파트 안심거래"
        ].join("\n");

        const buyerSmsRes = await fetch(`${baseUrl}/api/send-sms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: buyerPhone,
            content: buyerMessage,
            type: "LMS",
            subject: "[우리아파트 안심거래] 전용 4자리 거래방 코드 안내"
          })
        }).catch(() => null);

        buyerSmsSent = !!(buyerSmsRes && buyerSmsRes.ok);
      }

      return res.status(200).json({
        ok: true,
        tradeRoomCode,
        transactionNumber,
        brokerSmsSent,
        buyerSmsSent,
        trade: {
          tradeNumber: transactionNumber,
          transactionNumber,
          tradeRoomCode,
          tradeType,
          requestNumber,
          propertyId,
          propertyName: apartment,
          apartment,
          amount,
          floor,
          area,
          brokerName: officeName,
          brokerOffice: officeName,
          brokerPhone: officePhone,
          status: "거래 진행 중",
          createdAt: new Date().toISOString()
        }
      });
    }

    return res.status(405).json({
      ok: false,
      message: "허용되지 않은 요청입니다."
    });
  } catch (error) {
    console.error("trade-decision error:", error);
    return res.status(500).json({
      ok: false,
      message: "거래 결정 처리 중 서버 오류가 발생했습니다."
    });
  }
}
