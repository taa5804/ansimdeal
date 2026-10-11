export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  const clean = (v) => String(v || "").trim();
  const normalizePhone = (v) => String(v || "").replace(/\D/g, "");

  // Helper to parse [TRADE_ROOM_CODE:1234|TX:TR12345678|TYPE:monthly] tag from description
  function parseTradeMeta(desc) {
    const text = String(desc || "");
    const match = text.match(/\[TRADE_ROOM_CODE:(\d{4})\|TX:([A-Z0-9_-]+)(?:\|TYPE:([a-z]+))?\]/);
    if (!match) return null;
    return {
      tradeRoomCode: match[1],
      transactionNumber: match[2],
      tradeType: match[3] || "monthly",
      cleanDescription: text.replace(/\n?\[TRADE_ROOM_CODE:[^\]]+\]/g, "").trim()
    };
  }

  try {
    /* =========================================================
       GET:
       1) ?code=4자리거래방코드 -> 거래 확정된 상가 매물 및 거래방 정보 조회
       2) ?requestNumber=4자리요청번호 또는 ?phone=휴대폰번호 -> 제안 목록 조회
    ========================================================= */
    if (req.method === "GET") {
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
              tradeType: "monthly",
              requestNumber: "5804",
              propertyId: "prop-5804-1",
              propertyName: "[상가 월세] 역삼역 도보 3분 대로변 이면 1층 코너 점포 (전용 22평)",
              apartment: "[상가 월세] 역삼역 도보 3분 대로변 이면 1층 코너 점포 (전용 22평)",
              amount: "보증금 3,000만원 / 월세 230만원 · 무권리(0원)",
              floor: "지상 1층 (전면 통유리 코너)",
              area: "전용 22평 (약 72.7㎡) · 제2종 근린생활시설",
              brokerName: "강남안심 공인중개사사무소",
              brokerOffice: "강남안심 공인중개사사무소",
              brokerPhone: "010-5804-1234",
              status: "가계약·인허가 사전확인 및 전자계약 진행 중",
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
          tradeType: "monthly",
          cleanDescription: row.description || ""
        };

        return res.status(200).json({
          ok: true,
          trade: {
            tradeNumber: meta.transactionNumber,
            transactionNumber: meta.transactionNumber,
            tradeRoomCode: code,
            tradeType: meta.tradeType || "monthly",
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
            status: "가계약·인허가 사전확인 및 전자계약 진행 중",
            createdAt: row.created_at || new Date().toISOString()
          }
        });
      }

      // 2) 임차요청번호 또는 휴대폰번호로 제안 목록 조회
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
          dealType: (requestInfo && requestInfo.request_type) || (meta && meta.tradeType) || "monthly",
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
        requestType: (requestInfo && requestInfo.request_type) || "monthly",
        proposals
      });
    }

    /* =========================================================
       POST:
       임차인(매수자)이 상가 매물 1건을 [거래 결정(확정)] 눌렀을 때:
       1) 전용 4자리 거래방 코드(tradeRoomCode) 생성
       2) DB(property_proposals)에 확정 상태 및 거래방 코드 저장
       3) 선택된 담당 공인중개사 휴대폰(officePhone)으로 4자리 거래방 코드 문자(LMS) 자동 발송
       4) 임차인(매수자) 휴대폰으로도 4자리 거래방 코드 문자(LMS) 발송
    ========================================================= */
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const propertyId = clean(body.propertyId);
      const requestNumber = clean(body.requestNumber).replace(/\D/g, "").slice(0, 4);
      const isTest = body.testMode === true || requestNumber === "5804";

      const apartment = clean(body.apartment) || "선택 상가·점포 매물";
      const amount = clean(body.amount) || "-";
      const floor = clean(body.floor) || "-";
      const area = clean(body.area) || "-";
      const officeName = clean(body.officeName) || "담당 공인중개사";
      const officePhone = normalizePhone(body.officePhone);
      const tradeType = clean(body.tradeType) || "monthly";

      const transactionNumber = clean(body.transactionNumber) || ("TR" + Date.now().toString().slice(-8));
      const tradeRoomCode = isTest
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
      const baseUrl = host ? `${protocol}://${host}` : "https://www.ansimdeal.com";

      let brokerSmsSent = false;
      let buyerSmsSent = false;

      if (host && /^01[016789][0-9]{7,8}$/.test(officePhone) && !isTest) {
        const brokerMessage = [
          "[안심딜 상가·점포 거래결정 확정 안내]",
          "",
          "축하합니다! 제안하신 상가·점포 매물이 임차인에게 최종 선택(거래 확정)되었습니다.",
          "",
          `■ 선택 매물: ${apartment} (${floor} / ${area})`,
          `■ 거래 조건: ${amount}`,
          `■ 전용 4자리 거래방 코드(진행번호): ${tradeRoomCode}`,
          `■ 거래번호: ${transactionNumber}`,
          "",
          "[중개사 거래 진행 절차 안내]",
          `1. 안심딜(${baseUrl}) 접속`,
          `2. 메인화면 [거래 진행 상황 확인] 입력창에 위 4자리 거래방 코드(${tradeRoomCode}) 입력`,
          "3. 중개사 1단계 확인 동의 후 전용 거래진행실 입장",
          "4. 거래진행실에서 건축물대장·등기부 등 인허가/권리관계 서류 등록 및 전자계약 진행",
          "",
          "※ 이 4자리 거래방 코드는 선택된 담당 중개사님과 거래 당사자만 입장할 수 있는 전용 보안 코드입니다.",
          "※ 임차인(매수자)의 연락처는 공개되지 않으며, 임차인(매수자)이 직접 알려주기 전까지는 비공개로 보호됩니다.",
          "발송자: 안심딜 상가 전월세 안전거래"
        ].join("\n");

        const smsRes = await fetch(`${baseUrl}/api/send-sms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: officePhone,
            content: brokerMessage,
            type: "LMS",
            subject: "[안심딜] 상가 거래결정 확정 및 4자리 거래방 코드 안내"
          })
        }).catch(() => null);

        brokerSmsSent = !!(smsRes && smsRes.ok);
      }

      // 3) 임차인(매수자)에게도 전용 4자리 거래방 코드 문자(LMS) 발송
      if (host && /^01[016789][0-9]{7,8}$/.test(buyerPhone) && !isTest) {
        const buyerMessage = [
          "[안심딜 상가·점포 거래결정 완료 안내]",
          "",
          "선택하신 상가·점포 매물의 거래 결정이 완료되어 전용 거래진행실이 개설되었습니다.",
          "",
          `■ 선택 매물: ${apartment} (${floor} / ${area})`,
          `■ 거래 조건: ${amount}`,
          `■ 담당 중개사: ${officeName} (${officePhone})`,
          `■ 전용 4자리 거래방 코드(진행번호): ${tradeRoomCode}`,
          "",
          "[임차인 진행 절차 안내]",
          `1. 메인화면 [거래 진행 상황 확인]에 4자리 거래방 코드(${tradeRoomCode}) 입력`,
          "2. 가계약 전 건축물대장 용도·영업 인허가 및 권리관계 서류 확인",
          "3. 플랫폼 이용료(50% 절감) 확인 및 전자계약 서명 진행",
          "",
          "발송자: 안심딜 상가 전월세 안전거래"
        ].join("\n");

        const buyerSmsRes = await fetch(`${baseUrl}/api/send-sms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: buyerPhone,
            content: buyerMessage,
            type: "LMS",
            subject: "[안심딜] 전용 4자리 거래방 코드 안내"
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
          status: "가계약·인허가 사전확인 및 전자계약 진행 중",
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
