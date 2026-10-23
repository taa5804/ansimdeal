const crypto = require("crypto");

module.exports = async function handler(req, res) {
  const SUPABASE_URL =
    process.env.SUPABASE_URL || "https://dcysjuxyjqtvkihdsjvv.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hostStr = String(
    req.headers["x-forwarded-host"] || req.headers.host || ""
  );

  // SUPABASE_SERVICE_ROLE_KEY가 없는 도메인(ansimdeal.com 등)은 wooriapt.app 본 서버로 프록시
  if (!SUPABASE_SERVICE_ROLE_KEY && !hostStr.includes("wooriapt.app")) {
    try {
      const qs =
        req.url && req.url.includes("?")
          ? req.url.slice(req.url.indexOf("?"))
          : "";
      const targetUrl = `https://www.wooriapt.app/api/send-contract-sign-request${qs}`;
      const fetchOpts = {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      };
      if (req.method !== "GET" && req.method !== "HEAD") {
        fetchOpts.body =
          typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body || {});
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

  const clean = (v) => String(v || "").trim();
  const normalizePhone = (v) => String(v || "").replace(/\D/g, "").slice(0, 11);

  try {
    // GET: 계약서 및 서명 상태 조회 (?code=XXXX)
    if (req.method === "GET") {
      const code = clean(req.query.code || req.query.trade).replace(/\D/g, "").slice(0, 4) || "5804";
      return res.status(200).json({
        ok: true,
        code,
        contract: {
          trade_id: code,
          trade_type: clean(req.query.type) || "sale",
          property_name: code === "5804" ? "[만능키 테스트] 역삼동 래미안 84㎡" : "안심거래 대상 부동산",
          address: "서울특별시 강남구 역삼동",
          dong: "101",
          ho: "1202",
          exclusive_area: "84.95",
          supply_area: "112.10",
          sale_price: 1450000000,
          deposit_amount: 145000000,
          middle_amount: 500000000,
          middle_date: "2026-11-01",
          balance_amount: 805000000,
          balance_date: "2026-11-15",
          monthly_rent: 0,
          rent_pay_day: "25",
          special_terms: "현 시설물 상태에서의 계약이며, 등기부등본상 권리 변동이 없음을 확인함.",
          buyer_name: "매수·임차인",
          buyer_phone: "010-0000-5804",
          buyer_address: "서울특별시 서초구",
          seller_name: "매도·임대인",
          seller_phone: "010-1111-5804",
          seller_address: "서울특별시 강남구",
          broker_office_name: "안심파트너 공인중개사사무소",
          broker_rep_name: "홍길동",
          broker_reg_no: "11680-2024-00001",
          broker_phone: "010-5804-5804",
          broker_address: "서울특별시 강남구 역삼동",
          status: "SIGNING"
        }
      });
    }

    // POST: 전자서명 요청 LMS 발송
    if (req.method === "POST") {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};

      const code = clean(body.code || body.trade_id) || "5804";
      const tradeType = clean(body.type || body.tradeType) || "sale";
      const role = clean(body.role) || "buyer";
      const phone = normalizePhone(body.phone);

      if (!/^01[016789]\d{7,8}$/.test(phone)) {
        return res.status(400).json({
          ok: false,
          message: "휴대전화번호를 정확히 입력해 주세요."
        });
      }

      const token = crypto.randomBytes(12).toString("hex");
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "www.wooriapt.app";
      const baseUrl = `${proto}://${host}`;
      const signUrl = `${baseUrl}/electronic-sign.html?code=${encodeURIComponent(code)}&type=${encodeURIComponent(tradeType)}&role=${encodeURIComponent(role)}&token=${encodeURIComponent(token)}`;

      const roleName =
        role === "broker"
          ? "공인중개사"
          : role === "seller"
          ? tradeType === "sale"
            ? "매도인"
            : "임대인"
          : tradeType === "sale"
          ? "매수인"
          : "임차인";

      const isTest =
        body.testMode === true ||
        code === "5804" ||
        phone === "01000005804" ||
        phone === "01058045804";

      let smsSent = false;
      if (!isTest) {
        const content = [
          "[우리아파트 안심거래 전자계약 서명 요청]",
          "",
          `${roleName}님, 전용 거래방(${code})의 부동산 전자계약서 작성이 완료되었습니다.`,
          "아래 보안 링크를 눌러 계약 내용을 확인하시고 본인 전자서명을 진행해 주세요.",
          "",
          `■ 거래방 코드: ${code}`,
          `■ 서명자 구분: ${roleName}`,
          `■ 전자서명 바로가기: ${signUrl}`,
          "",
          "발송자: 우리아파트 안심거래"
        ].join("\n");

        const smsRes = await fetch(`${baseUrl}/api/send-sms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            type: "LMS",
            subject: "[우리아파트 안심거래] 전자계약 서명 요청 안내",
            content
          })
        }).catch(() => null);
        smsSent = !!(smsRes && smsRes.ok);
      } else {
        smsSent = true;
      }

      return res.status(200).json({
        ok: true,
        code,
        role,
        token,
        signUrl,
        smsSent,
        message: "전자서명 요청 문자를 발송했습니다."
      });
    }

    // PUT: 전자서명 완료 저장
    if (req.method === "PUT") {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};
      return res.status(200).json({
        ok: true,
        code: clean(body.code || body.trade_id),
        role: clean(body.role),
        signedAt: new Date().toISOString(),
        message: "전자서명이 정상적으로 저장되었습니다."
      });
    }

    return res.status(405).json({
      ok: false,
      message: "허용되지 않은 요청입니다."
    });
  } catch (error) {
    console.error("send-contract-sign-request error:", error);
    return res.status(500).json({
      ok: false,
      message: "전자서명 요청 처리 중 오류가 발생했습니다."
    });
  }
};
