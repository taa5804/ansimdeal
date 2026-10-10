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


  function normalizePhone(value) {
    return String(value || "")
      .replace(/\D/g, "");
  }


  function cleanText(value) {
    return String(value ?? "")
      .trim();
  }


  function getFirstValue(
    object,
    keys
  ) {

    for (const key of keys) {

      if (
        object &&
        object[key] !== undefined &&
        object[key] !== null &&
        object[key] !== ""
      ) {
        return object[key];
      }
    }

    return "";
  }


  function parseRequestBody(body) {

    if (!body) {
      return {};
    }


    if (
      typeof body === "object"
    ) {
      return body;
    }


    if (
      typeof body !== "string"
    ) {
      return {};
    }


    const text =
      body.trim();


    if (!text) {
      return {};
    }


    /*
      JSON 요청 처리
    */

    try {

      const parsed =
        JSON.parse(text);

      if (
        parsed &&
        typeof parsed === "object"
      ) {
        return parsed;
      }

    } catch (error) {
      // JSON이 아니면 아래에서 form-urlencoded 처리
    }


    /*
      ClawOps Webhook
      application/x-www-form-urlencoded 처리
    */

    const params =
      new URLSearchParams(text);

    const result = {};


    for (
      const [key, value]
      of params.entries()
    ) {
      result[key] = value;
    }


    return result;
  }


  function parseVariables(value) {

    if (!value) {
      return {};
    }


    if (
      typeof value === "object"
    ) {
      return value;
    }


    if (
      typeof value !== "string"
    ) {
      return {};
    }


    const text =
      value.trim();


    if (!text) {
      return {};
    }


    try {

      const parsed =
        JSON.parse(text);

      if (
        parsed &&
        typeof parsed === "object"
      ) {
        return parsed;
      }

    } catch (error) {
      console.log(
        "Variables JSON parse skipped:",
        text
      );
    }


    return {};
  }


  async function supabaseGet(path) {

    const response =
      await fetch(
        `${SUPABASE_URL}/rest/v1/${path}`,
        {
          method: "GET",
          headers
        }
      );


    const text =
      await response.text();


    let data = null;


    try {
      data =
        text
          ? JSON.parse(text)
          : null;
    } catch {
      data = text;
    }


    if (!response.ok) {

      console.error(
        "Supabase GET error:",
        data
      );

      throw new Error(
        "SUPABASE_GET_FAILED"
      );
    }


    return data;
  }


  async function supabasePatch(
    table,
    query,
    values
  ) {

    const response =
      await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?${query}`,
        {
          method: "PATCH",

          headers: {
            ...headers,

            Prefer:
              "return=representation"
          },

          body:
            JSON.stringify(values)
        }
      );


    const text =
      await response.text();


    let data = null;


    try {
      data =
        text
          ? JSON.parse(text)
          : null;
    } catch {
      data = text;
    }


    if (!response.ok) {

      console.error(
        "Supabase PATCH error:",
        data
      );

      throw new Error(
        "SUPABASE_PATCH_FAILED"
      );
    }


    return data;
  }


  async function supabaseInsert(
    table,
    values
  ) {

    const response =
      await fetch(
        `${SUPABASE_URL}/rest/v1/${table}`,
        {
          method: "POST",

          headers: {
            ...headers,

            Prefer:
              "return=representation"
          },

          body:
            JSON.stringify(values)
        }
      );


    const text =
      await response.text();


    let data = null;


    try {
      data =
        text
          ? JSON.parse(text)
          : null;
    } catch {
      data = text;
    }


    if (!response.ok) {

      console.error(
        "Supabase INSERT error:",
        data
      );

      throw new Error(
        "SUPABASE_INSERT_FAILED"
      );
    }


    return data;
  }


  try {

    /*
      1.
      ClawOps 요청 본문 처리

      JSON
      또는
      application/x-www-form-urlencoded
      둘 다 처리
    */

    const body =
      parseRequestBody(
        req.body
      );


    const payload =
      (
        body.data &&
        typeof body.data === "object"
      )
        ? body.data
        :
      (
        body.Data &&
        typeof body.Data === "object"
      )
        ? body.Data
        : body;


    /*
      2.
      ClawOps Variables는
      JSON 문자열로 전달될 수 있으므로 파싱
    */

    const rawVariables =
      payload.Variables ||
      payload.variables ||
      body.Variables ||
      body.variables ||
      {};


    const variables =
      parseVariables(
        rawVariables
      );


    /*
      3.
      매수요청번호
    */

    const requestNumber =
      cleanText(
        getFirstValue(
          variables,
          [
            "request_number",
            "requestNumber"
          ]
        ) ||
        getFirstValue(
          payload,
          [
            "request_number",
            "requestNumber"
          ]
        )
      )
      .replace(/\D/g, "")
      .slice(0, 4);


    /*
      4.
      수신 전화번호
    */

    const phone =
      normalizePhone(
        getFirstValue(
          payload,
          [
            "To",
            "to",
            "Phone",
            "phone",
            "PhoneNumber",
            "phoneNumber",
            "callee",
            "destination"
          ]
        )
      );


    /*
      5.
      ClawOps 통화 ID
    */

    const callId =
      cleanText(
        getFirstValue(
          payload,
          [
            "CallId",
            "callId",
            "call_id"
          ]
        )
      );


    /*
      6.
      배치 Task ID
    */

    const taskId =
      cleanText(
        getFirstValue(
          payload,
          [
            "TaskId",
            "taskId",
            "task_id",
            "Id",
            "id"
          ]
        )
      );


    /*
      7.
      Batch ID
    */

    const batchId =
      cleanText(
        getFirstValue(
          payload,
          [
            "BatchId",
            "batchId",
            "batch_id",
            "CallBatchId",
            "callBatchId"
          ]
        )
      );


    /*
      8.
      통화 상태
    */

    const callStatus =
      cleanText(
        getFirstValue(
          payload,
          [
            "Status",
            "status",
            "CallStatus",
            "callStatus",
            "Result",
            "result"
          ]
        )
      )
      .toUpperCase();


    /*
      9.
      DTMF 결과

      ClawOps 콜 플로우에서
      캡처된 값은 Variables 안에 들어올 수 있음
    */

    let dtmf =
      cleanText(
        getFirstValue(
          payload,
          [
            "Dtmf",
            "dtmf",
            "DTMF",
            "Digit",
            "digit",
            "Digits",
            "digits",
            "Key",
            "key",
            "PressedKey",
            "pressedKey"
          ]
        )
      );


    if (!dtmf) {

      dtmf =
        cleanText(
          getFirstValue(
            variables,
            [
              "dtmf",
              "DTMF",
              "digit",
              "digits",
              "pressed_key",
              "pressedKey",
              "choice",
              "selection",
              "menu_choice",
              "menuChoice",
              "menu_main"
            ]
          )
        );
    }


    dtmf =
      dtmf
      .replace(/[^0-9*#]/g, "")
      .slice(0, 1);


    console.log(
      "ClawOps callflow.ended:",
      {
        callId,
        phone,
        requestNumber,
        callStatus,
        dtmf,
        variables
      }
    );


    /*
      10.
      기존 ARS 발신 기록 찾기
    */

    let logRows = [];


    if (phone) {

      logRows =
        await supabaseGet(
          "ars_dispatch_logs" +
          `?broker_phone=eq.${encodeURIComponent(phone)}` +
          (
            requestNumber
              ? `&request_number=eq.${encodeURIComponent(requestNumber)}`
              : ""
          ) +
          "&order=created_at.desc" +
          "&limit=1"
        );

    } else if (taskId) {

      logRows =
        await supabaseGet(
          "ars_dispatch_logs" +
          `?clawops_task_id=eq.${encodeURIComponent(taskId)}` +
          "&order=created_at.desc" +
          "&limit=1"
        );
    }


    const log =
      Array.isArray(logRows) &&
      logRows.length
        ? logRows[0]
        : null;


    /*
      Webhook URL 확인용 요청이나
      아직 발신 로그가 없는 통화도
      ClawOps에는 반드시 200 응답
    */

    if (!log) {

      return res.status(200).json({
        ok: true,
        ignored: true,
        message:
          "일치하는 ARS 발신기록이 없습니다."
      });
    }


    const finalRequestNumber =
      requestNumber ||
      cleanText(
        log?.request_number
      );


    const finalPhone =
      phone ||
      normalizePhone(
        log?.broker_phone
      );


    /*
      11.
      기본 통화 결과 저장
    */

    const patchValues = {};


    if (taskId) {
      patchValues.clawops_task_id =
        taskId;
    }


    if (batchId) {
      patchValues.clawops_batch_id =
        batchId;
    }


    if (callStatus) {
      patchValues.call_status =
        callStatus;
    }


    if (dtmf) {
      patchValues.dtmf_result =
        dtmf;
    }


    if (
      Object.keys(
        patchValues
      ).length
    ) {

      await supabasePatch(
        "ars_dispatch_logs",
        `id=eq.${encodeURIComponent(log.id)}`,
        patchValues
      );
    }


    /*
      12.
      1번
      이번 매수요청에 매물 제안 가능
    */

    if (dtmf === "1") {

      await supabasePatch(
        "ars_dispatch_logs",
        `id=eq.${encodeURIComponent(log.id)}`,
        {
          dtmf_result:
            "1",

          call_status:
            "PROPOSAL_AVAILABLE"
        }
      );


      return res.status(200).json({
        ok: true,

        action:
          "PROPOSAL_AVAILABLE",

        requestNumber:
          finalRequestNumber,

        phone:
          finalPhone
      });
    }


    /*
      13.
      2번
      이번 요청에만 제안하지 않음

      영구 수신거부 아님
    */

    if (dtmf === "2") {

      await supabasePatch(
        "ars_dispatch_logs",
        `id=eq.${encodeURIComponent(log.id)}`,
        {
          dtmf_result:
            "2",

          call_status:
            "DECLINED_THIS_REQUEST"
        }
      );


      return res.status(200).json({
        ok: true,

        action:
          "DECLINED_THIS_REQUEST",

        requestNumber:
          finalRequestNumber,

        phone:
          finalPhone
      });
    }


    /*
      14.
      3번
      앞으로 ARS 영구 수신거부
    */

    if (dtmf === "3") {

      if (finalPhone) {

        const existingOptOut =
          await supabaseGet(
            "ars_opt_outs" +
            `?phone=eq.${encodeURIComponent(finalPhone)}` +
            "&select=id" +
            "&limit=1"
          );


        if (
          !Array.isArray(
            existingOptOut
          ) ||
          existingOptOut.length === 0
        ) {

          await supabaseInsert(
            "ars_opt_outs",
            {
              phone:
                finalPhone,

              reason:
                "DTMF_3",

              request_number:
                finalRequestNumber || null,

              created_at:
                new Date()
                .toISOString()
            }
          );
        }
      }


      await supabasePatch(
        "ars_dispatch_logs",
        `id=eq.${encodeURIComponent(log.id)}`,
        {
          dtmf_result:
            "3",

          call_status:
            "OPT_OUT"
        }
      );


      return res.status(200).json({
        ok: true,

        action:
          "OPT_OUT",

        phone:
          finalPhone
      });
    }


    /*
      번호 입력 없이 종료되거나
      통화만 완료된 경우
    */

    return res.status(200).json({
      ok: true,

      action:
        "CALL_RESULT_SAVED",

      requestNumber:
        finalRequestNumber,

      phone:
        finalPhone,

      status:
        callStatus || null,

      dtmf:
        dtmf || null
    });


  } catch (error) {

    console.error(
      "ars-result error:",
      error
    );


    /*
      ClawOps가 Webhook 자체를 실패로
      판단하지 않도록 서버 오류 내용은 로그에 남김
    */

    return res.status(500).json({
      ok: false,

      message:
        "ARS 결과 처리 중 오류가 발생했습니다."
    });
  }
}
