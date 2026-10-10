export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "허용되지 않은 요청입니다."
    });
  }


  const SUPABASE_URL =
    process.env.SUPABASE_URL;

  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;


  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return res.status(500).json({
      ok: false,
      message: "서버 환경설정이 필요합니다."
    });
  }


  const headers = {
    apikey:
      SUPABASE_SERVICE_ROLE_KEY,

    Authorization:
      `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

    "Content-Type":
      "application/json"
  };


  function clean(value) {
    return String(value || "").trim();
  }


  function normalizePhone(value) {
    return String(value || "")
      .replace(/\D/g, "");
  }


  try {

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});


    const requestNumber =
      clean(body.requestNumber)
        .replace(/\D/g, "")
        .slice(0, 4);

    const apartment =
      clean(body.apartment);

    const amount =
      clean(body.amount);

    const floor =
      clean(body.floor);

    const area =
      clean(body.area);

    const description =
      clean(body.description);

    const officeName =
      clean(body.officeName);

    const officePhone =
      normalizePhone(
        body.officePhone
      );


    if (
      requestNumber.length !== 4
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "4자리 매수요청번호를 확인해 주세요."
      });
    }


    if (
      !apartment ||
      !amount ||
      !floor ||
      !area ||
      !officeName ||
      !officePhone
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "필수 항목을 모두 입력해 주세요."
      });
    }


    /*
      진행 중인 매수요청 확인
    */

    const requestResponse =
      await fetch(
        `${SUPABASE_URL}/rest/v1/property_requests` +
        `?request_number=eq.${encodeURIComponent(requestNumber)}` +
        `&status=eq.OPEN` +
        `&select=id,request_number,proposal_count` +
        `&limit=1`,
        {
          method: "GET",
          headers
        }
      );


    const requestRows =
      await requestResponse.json();


    if (
      !requestResponse.ok
    ) {
      console.error(
        "property request lookup error:",
        requestRows
      );

      return res.status(500).json({
        ok: false,
        message:
          "매수요청 확인 중 오류가 발생했습니다."
      });
    }


    if (
      !Array.isArray(requestRows) ||
      requestRows.length === 0
    ) {
      return res.status(404).json({
        ok: false,
        message:
          "진행 중인 매수요청을 찾을 수 없습니다."
      });
    }


    /*
      매물 제안 저장
    */

    const proposalResponse =
      await fetch(
        `${SUPABASE_URL}/rest/v1/property_proposals`,
        {
          method: "POST",

          headers: {
            ...headers,
            Prefer:
              "return=representation"
          },

          body:
            JSON.stringify({
              request_number:
                requestNumber,

              apartment:
                apartment,

              amount:
                amount,

              floor:
                floor,

              area:
                area,

              description:
                description || null,

              office_name:
                officeName,

              office_phone:
                officePhone,

              status:
                "PROPOSED"
            })
        }
      );


    const proposalRows =
      await proposalResponse.json();


    if (
      !proposalResponse.ok
    ) {
      console.error(
        "proposal insert error:",
        proposalRows
      );

      return res.status(500).json({
        ok: false,
        message:
          "매물 등록 중 오류가 발생했습니다."
      });
    }


    /*
      현재 제안 수 다시 계산
    */

    const countResponse =
      await fetch(
        `${SUPABASE_URL}/rest/v1/property_proposals` +
        `?request_number=eq.${encodeURIComponent(requestNumber)}` +
        `&status=eq.PROPOSED` +
        `&select=id`,
        {
          method: "GET",
          headers
        }
      );


    const countRows =
      await countResponse.json();


    if (
      !countResponse.ok
    ) {
      console.error(
        "proposal count error:",
        countRows
      );

      return res.status(500).json({
        ok: false,
        message:
          "제안 수 확인 중 오류가 발생했습니다."
      });
    }


    const proposalCount =
      Array.isArray(countRows)
        ? countRows.length
        : 0;


    /*
      property_requests 제안 수 갱신
    */

    const updateResponse =
      await fetch(
        `${SUPABASE_URL}/rest/v1/property_requests` +
        `?request_number=eq.${encodeURIComponent(requestNumber)}`,
        {
          method: "PATCH",

          headers: {
            ...headers,
            Prefer:
              "return=representation"
          },

          body:
            JSON.stringify({
              proposal_count:
                proposalCount,

              updated_at:
                new Date().toISOString()
            })
        }
      );


    const updateRows =
      await updateResponse.json();


    if (
      !updateResponse.ok
    ) {
      console.error(
        "proposal count update error:",
        updateRows
      );

      return res.status(500).json({
        ok: false,
        message:
          "제안 수 반영 중 오류가 발생했습니다."
      });
    }


    return res.status(200).json({

      ok: true,

      message:
        "매물이 등록되었습니다.",

      requestNumber:
        requestNumber,

      proposalCount:
        proposalCount,

      proposal:
        Array.isArray(proposalRows) &&
        proposalRows.length
          ? proposalRows[0]
          : null
    });


  } catch (error) {

    console.error(
      "property-proposal error:",
      error
    );


    return res.status(500).json({
      ok: false,
      message:
        "매물 등록 처리 중 오류가 발생했습니다."
    });
  }
}
