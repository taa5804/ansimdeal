export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "허용되지 않은 요청입니다."
    });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");

  const body =
    typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : req.body || {};

  if ((!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) && !host.includes("wooriapt.app")) {
    try {
      const upstreamRes = await fetch("https://www.wooriapt.app/api/property-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
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
    "Content-Type": "application/json"
  };

  function clean(value) {
    return String(value || "").trim();
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

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

    /* 🔑 만능키(5804)이거나 DB에 요청이 있는지 확인 */
    const requestResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/property_requests` +
        `?request_number=eq.${encodeURIComponent(requestNumber)}` +
        `&select=id,request_number,proposal_count,phone,status` +
        `&order=id.desc&limit=1`,
      {
        method: "GET",
        headers
      }
    );

    const requestRows = await requestResponse.json().catch(() => []);

    if (!requestResponse.ok) {
      console.error("property request lookup error:", requestRows);
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

    /* 매물 제안 저장 */
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
      console.error("proposal insert error:", proposalRows);
      return res.status(500).json({
        ok: false,
        message: "매물 등록 중 오류가 발생했습니다."
      });
    }

    /* 현재 제안 수 다시 계산 */
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

    /* property_requests 제안 수 갱신 */
    if (Array.isArray(requestRows) && requestRows.length > 0) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/property_requests?request_number=eq.${encodeURIComponent(requestNumber)}`,
        {
          method: "PATCH",
          headers: {
            ...headers,
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            proposal_count: proposalCount,
            updated_at: new Date().toISOString()
          })
        }
      ).catch((err) => console.error("proposal count update error:", err));
    }

    return res.status(200).json({
      ok: true,
      message: "매물이 등록되었습니다.",
      requestNumber: requestNumber,
      proposalCount: proposalCount,
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
