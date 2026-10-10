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


  try {

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});


    const requestType =
      String(
        body.requestType || ""
      ).trim();


    const phone =
      String(
        body.phone || ""
      )
      .replace(/\D/g, "");


    const sido =
      String(
        body.sido || ""
      ).trim();


    const sigungu =
      String(
        body.sigungu || ""
      ).trim();


    const dong =
      String(
        body.dong || ""
      ).trim();


    const apartment =
      String(
        body.apartment || ""
      ).trim();


    const size =
      String(
        body.size || ""
      ).trim();


    const moveDate =
      String(
        body.moveDate || ""
      ).trim();


    const moveFlexible =
      body.moveFlexible === true;


    const memo =
      String(
        body.memo || ""
      ).trim();


    if (
      ![
        "sale",
        "jeonse",
        "monthly"
      ].includes(
        requestType
      )
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "거래유형을 확인해 주세요."
      });
    }


    if (
      !/^01[016789][0-9]{7,8}$/
        .test(phone)
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "휴대전화번호를 확인해 주세요."
      });
    }


    if (
      !sido ||
      !sigungu ||
      !dong ||
      !size ||
      !moveDate
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "필수 입력사항을 확인해 주세요."
      });
    }


    function numberOrNull(
      value
    ) {

      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        return null;
      }


      const number =
        Number(
          String(value)
            .replace(/,/g, "")
        );


      return Number.isFinite(
        number
      )
        ? number
        : null;
    }


    const saleMin =
      numberOrNull(
        body.saleMin
      );


    const saleMax =
      numberOrNull(
        body.saleMax
      );


    const jeonseMin =
      numberOrNull(
        body.jeonseMin
      );


    const jeonseMax =
      numberOrNull(
        body.jeonseMax
      );


    const monthlyDepositMin =
      numberOrNull(
        body.monthlyDepositMin
      );


    const monthlyDepositMax =
      numberOrNull(
        body.monthlyDepositMax
      );


    const monthlyRent =
      numberOrNull(
        body.monthlyRent
      );


    if (
      requestType === "sale" &&
      (
        saleMin === null ||
        saleMax === null
      )
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "매매 희망가격을 확인해 주세요."
      });
    }


    if (
      requestType === "jeonse" &&
      (
        jeonseMin === null ||
        jeonseMax === null
      )
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "전세 희망가격을 확인해 주세요."
      });
    }


    if (
      requestType === "monthly" &&
      (
        monthlyDepositMin === null ||
        monthlyDepositMax === null ||
        monthlyRent === null
      )
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "월세 희망가격을 확인해 주세요."
      });
    }


    /*
      동일 휴대전화 매수요청 제한
      - 동시에 OPEN 요청 1건만 가능
      - 휴대전화번호 기준 전체 최대 2건
    */

    const existingRequestUrl =
      `${SUPABASE_URL}` +
      `/rest/v1/property_requests` +
      `?phone=eq.` +
      encodeURIComponent(
        phone
      ) +
      `&select=id,request_number,status,sido,sigungu,dong` +
      `&order=id.desc`;


    const existingRequestResponse =
      await fetch(
        existingRequestUrl,
        {
          method:
            "GET",

          headers: {

            apikey:
              SUPABASE_SERVICE_ROLE_KEY,

            Authorization:
              `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

            Accept:
              "application/json"
          }
        }
      );


    if (
      !existingRequestResponse.ok
    ) {

      throw new Error(
        "PROPERTY_REQUEST_CHECK_FAILED"
      );
    }


    const existingRequests =
      await existingRequestResponse.json();


    const requestCount =
      Array.isArray(
        existingRequests
      )
        ? existingRequests.length
        : 0;


    const hasOpenRequest =
      Array.isArray(
        existingRequests
      ) &&
      existingRequests.some(
        function(row) {

          return (
            String(
              row.status || ""
            )
            .trim()
            .toUpperCase() ===
            "OPEN"
          );
        }
      );


    if (
      hasOpenRequest
    ) {

      return res.status(409).json({
        ok:
          false,

        message:
          "현재 진행 중인 매수요청이 있습니다. 기존 요청이 종료된 후 다른 지역을 등록해 주세요."
      });
    }


    if (
      requestCount >= 2
    ) {

      return res.status(409).json({
        ok:
          false,

        message:
          "매수요청은 휴대전화번호 기준 최대 2개 지역까지만 등록할 수 있습니다."
      });
    }


    async function requestNumberExists(
      requestNumber
    ) {

      const url =
        `${SUPABASE_URL}` +
        `/rest/v1/property_requests` +
        `?request_number=eq.` +
        encodeURIComponent(
          requestNumber
        ) +
        `&select=id&limit=1`;


      const response =
        await fetch(
          url,
          {
            method: "GET",

            headers: {
              apikey:
                SUPABASE_SERVICE_ROLE_KEY,

              Authorization:
                `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

              Accept:
                "application/json"
            }
          }
        );


      if (!response.ok) {
        throw new Error(
          "REQUEST_NUMBER_CHECK_FAILED"
        );
      }


      const data =
        await response.json();


      return (
        Array.isArray(data) &&
        data.length > 0
      );
    }


    async function createRequestNumber() {

      for (
        let attempt = 0;
        attempt < 30;
        attempt++
      ) {

        const requestNumber =
          String(
            Math.floor(
              1000 +
              Math.random() * 9000
            )
          );


        const exists =
          await requestNumberExists(
            requestNumber
          );


        if (!exists) {
          return requestNumber;
        }
      }


      throw new Error(
        "REQUEST_NUMBER_GENERATION_FAILED"
      );
    }


    const requestNumber =
      await createRequestNumber();


    const row = {

      request_number:
        requestNumber,

      request_type:
        requestType,

      phone:
        phone,

      sido:
        sido,

      sigungu:
        sigungu,

      dong:
        dong,

      apartment:
        apartment || null,

      size:
        size,

      sale_min:
        requestType === "sale"
          ? saleMin
          : null,

      sale_max:
        requestType === "sale"
          ? saleMax
          : null,

      jeonse_min:
        requestType === "jeonse"
          ? jeonseMin
          : null,

      jeonse_max:
        requestType === "jeonse"
          ? jeonseMax
          : null,

      monthly_deposit_min:
        requestType === "monthly"
          ? monthlyDepositMin
          : null,

      monthly_deposit_max:
        requestType === "monthly"
          ? monthlyDepositMax
          : null,

      monthly_rent:
        requestType === "monthly"
          ? monthlyRent
          : null,

      move_date:
        moveDate,

      move_flexible:
        moveFlexible,

      memo:
        memo || null,

      status:
        "OPEN",

      proposal_count:
        0,

      ars_round:
        0,

      next_ars_at:
        new Date().toISOString()
    };


    const insertUrl =
      `${SUPABASE_URL}` +
      `/rest/v1/property_requests`;


    const insertResponse =
      await fetch(
        insertUrl,
        {
          method:
            "POST",

          headers: {

            apikey:
              SUPABASE_SERVICE_ROLE_KEY,

            Authorization:
              `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

            "Content-Type":
              "application/json",

            Prefer:
              "return=representation"
          },

          body:
            JSON.stringify(
              row
            )
        }
      );


    const insertData =
      await insertResponse.json();


    if (
      !insertResponse.ok
    ) {

      console.error(
        "property-request insert error:",
        insertData
      );


      return res.status(500).json({
        ok: false,
        message:
          "거래 요청 저장에 실패했습니다."
      });
    }


    /*
      1차 회원 공인중개사 알림 자동 시작
      ars-batch의 round 1은 회원만 처리
    */

    try {

      const protocol =
        req.headers[
          "x-forwarded-proto"
        ] || "https";


      const host =
        req.headers.host;


      if (host) {

        const arsUrl =
          `${protocol}://${host}` +
          `/api/ars-batch`;


        const arsResponse =
          await fetch(
            arsUrl,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  requestNumber:
                    requestNumber,

                  round:
                    1
                })
            }
          );


        const arsData =
          await arsResponse
            .json()
            .catch(
              () => null
            );


        if (
          !arsResponse.ok
        ) {

          console.error(
            "first member notification failed:",
            arsData
          );
        }
      }

    } catch (
      notificationError
    ) {

      console.error(
        "first member notification error:",
        notificationError
      );
    }


    return res.status(200).json({

      ok:
        true,

      requestNumber:
        requestNumber
    });


  } catch (
    error
  ) {

    console.error(
      "property-request error:",
      error
    );


    return res.status(500).json({
      ok: false,
      message:
        "서버 오류가 발생했습니다."
    });
  }
}
