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
        `&select=id,request_number,request_type,apartment,proposal_count,phone,status` +
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

    /* property_requests 제안 수 갱신 (3건 이상 시 마감 상태 반영) */
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

    /* 1) 매수자·임차인(고객)에게 실시간 매물 도착 문자 발송 ([아파트명/상가건물명·층수·금액]만 공개, 동·호수 및 중개사 연락처는 거래요청 전 비공개 보호) */
    const buyerPhone = normalizePhone(reqItem?.phone || "");
    if (buyerPhone && /^01[016789][0-9]{7,8}$/.test(buyerPhone)) {
      try {
        const serviceName = isStore ? "안심딜" : "우리아파트 안심거래";
        const domainUrl = isStore ? "https://www.ansimdeal.com" : "https://www.wooriapt.app";
        const targetLabel = isStore ? "상가건물명" : "아파트명";
        const buyerMsg = [
          `[${serviceName} 매물 제안 도착 안내]`,
          ``,
          `고객님께서 요청하신 조건(#${requestNumber})에 공인중개사가 실매물을 제안했습니다! (현재 누적 ${proposalCount}건)`,
          ``,
          `■ 도착한 매물 정보`,
          `• ${targetLabel}: ${apartment}`,
          `• 층수: ${floor}`,
          `• 제안금액: ${amount}`,
          description ? `• 매물특징: ${description}` : ``,
          ``,
          `아래 링크에서 제안받은 매물을 체크하시고 [거래 요청]을 누르시면 담당 공인중개사 사무소명과 연락처가 즉시 공개됩니다.`,
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

    /* 2) 대표님(010-2286-4150) 실시간 문자 알림 발송 */
    try {
      const adminMsg = [
        `[우리아파트/안심딜 매물제안 접수]`,
        `공인중개사가 고객 요청에 매물을 제안했습니다! (고객 ${buyerPhone || "번호없음"}에게도 자동 안내 완료)`,
        ``,
        `• 요청번호: #${requestNumber} (누적 ${proposalCount}건)`,
        `• 제안매물: ${apartment} (${area} / ${floor})`,
        `• 제안금액: ${amount}`,
        `• 중개사무소: ${officeName} (${officePhone})`,
        description ? `• 상세설명: ${description}` : ``
      ].filter(Boolean).join("\n");

      await fetch("https://www.wooriapt.app/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: "01022864150",
          type: "LMS",
          subject: `[중개사 매물제안 #${requestNumber}]`,
          content: adminMsg
        })
      });
    } catch (smsErr) {
      console.error("admin proposal sms error:", smsErr);
    }

    return res.status(200).json({
      ok: true,
      message: "매물이 등록되었으며 고객에게 실시간 안내 문자가 발송되었습니다.",
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
