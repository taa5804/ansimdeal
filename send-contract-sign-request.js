const crypto = require("crypto");

module.exports = async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "허용되지 않은 요청입니다."
    });
  }

  try {

    const {
      code,
      trade_id,
      type,
      role,
      phone
    } = req.body || {};

    const tradeId =
      String(trade_id || code || "").trim();

    const tradeType =
      String(type || "").trim();

    const signerRole =
      String(role || "").trim();

    const signerPhone =
      String(phone || "")
        .replace(/\D/g, "");


    /* =========================
       기본 확인
    ========================= */

    if (!tradeId) {
      return res.status(400).json({
        ok: false,
        message: "안심거래 코드가 없습니다."
      });
    }

    if (
      tradeType !== "sale" &&
      tradeType !== "jeonse" &&
      tradeType !== "monthly"
    ) {
      return res.status(400).json({
        ok: false,
        message: "거래유형이 올바르지 않습니다."
      });
    }

    if (
      signerRole !== "buyer" &&
      signerRole !== "seller" &&
      signerRole !== "broker"
    ) {
      return res.status(400).json({
        ok: false,
        message: "전자서명 대상자가 올바르지 않습니다."
      });
    }

    if (!/^01[016789]\d{7,8}$/.test(signerPhone)) {
      return res.status(400).json({
        ok: false,
        message: "휴대전화번호가 올바르지 않습니다."
      });
    }


    /* =========================
       Vercel 환경변수
    ========================= */

    const SUPABASE_URL =
      process.env.SUPABASE_URL;

    const SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_SECRET_KEY;

    const NCP_ACCESS_KEY =
      process.env.NCP_ACCESS_KEY;

    const NCP_SECRET_KEY =
      process.env.NCP_SECRET_KEY;

    const NCP_SMS_SERVICE_ID =
      process.env.NCP_SMS_SERVICE_ID;

    const NCP_SMS_FROM =
      String(
        process.env.NCP_SMS_FROM || ""
      ).replace(/\D/g, "");

    const SITE_URL =
      String(
        process.env.SITE_URL ||
        "https://wooriapt.app"
      ).replace(/\/+$/, "");


    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error(
        "Supabase 서버 환경변수가 설정되지 않았습니다."
      );
    }

    if (
      !NCP_ACCESS_KEY ||
      !NCP_SECRET_KEY ||
      !NCP_SMS_SERVICE_ID ||
      !NCP_SMS_FROM
    ) {
      throw new Error(
        "NCP 문자 발송 환경변수가 설정되지 않았습니다."
      );
    }


    /* =========================
       기존 전자서명 요청 확인
    ========================= */

    const encodedTrade =
      encodeURIComponent(tradeId);

    const encodedRole =
      encodeURIComponent(signerRole);

    const findUrl =
      SUPABASE_URL +
      "/rest/v1/electronic_signatures" +
      "?trade_id=eq." + encodedTrade +
      "&signer_role=eq." + encodedRole +
      "&select=*";


    const existingResponse =
      await fetch(
        findUrl,
        {
          headers: {
            "apikey":
              SUPABASE_SERVICE_ROLE_KEY,

            "Authorization":
              "Bearer " +
              SUPABASE_SERVICE_ROLE_KEY
          }
        }
      );


    if (!existingResponse.ok) {

      const detail =
        await existingResponse.text();

      throw new Error(
        "전자서명 요청 조회 실패: " +
        detail
      );
    }


    const existingRows =
      await existingResponse.json();

    const existing =
      Array.isArray(existingRows) &&
      existingRows.length
        ? existingRows[0]
        : null;


    /* =========================
       개인 전자서명 토큰
    ========================= */

    let token = "";

    if (
      existing &&
      existing.signed !== true &&
      existing.sign_token
    ) {

      token =
        existing.sign_token;

    } else {

      token =
        crypto
          .randomBytes(24)
          .toString("base64url");

    }


    /* =========================
       Supabase 저장
    ========================= */

    if (existing) {

      const patchUrl =
        SUPABASE_URL +
        "/rest/v1/electronic_signatures" +
        "?trade_id=eq." + encodedTrade +
        "&signer_role=eq." + encodedRole;


      const patchResponse =
        await fetch(
          patchUrl,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",

              "apikey":
                SUPABASE_SERVICE_ROLE_KEY,

              "Authorization":
                "Bearer " +
                SUPABASE_SERVICE_ROLE_KEY,

              "Prefer":
                "return=minimal"
            },

            body: JSON.stringify({

              signer_phone:
                signerPhone,

              sign_token:
                token,

              signed:
                false,

              signed_at:
                null,

              signature_image:
                null,

              identity_verified:
                false,

              identity_verified_at:
                null,

              contract_confirmed:
                false

            })
          }
        );


      if (!patchResponse.ok) {

        const detail =
          await patchResponse.text();

        throw new Error(
          "전자서명 요청 저장 실패: " +
          detail
        );
      }

    } else {

      const insertUrl =
        SUPABASE_URL +
        "/rest/v1/electronic_signatures";


      const insertResponse =
        await fetch(
          insertUrl,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "apikey":
                SUPABASE_SERVICE_ROLE_KEY,

              "Authorization":
                "Bearer " +
                SUPABASE_SERVICE_ROLE_KEY,

              "Prefer":
                "return=minimal"
            },

            body: JSON.stringify({

              trade_id:
                tradeId,

              signer_role:
                signerRole,

              signer_phone:
                signerPhone,

              sign_token:
                token,

              identity_verified:
                false,

              contract_confirmed:
                false,

              signed:
                false

            })
          }
        );


      if (!insertResponse.ok) {

        const detail =
          await insertResponse.text();

        throw new Error(
          "전자서명 요청 생성 실패: " +
          detail
        );
      }

    }


    /* =========================
       개인 전자서명 링크
    ========================= */

    const signLink =
      SITE_URL +
      "/electronic-sign.html" +
      "?trade=" +
      encodeURIComponent(tradeId) +
      "&type=" +
      encodeURIComponent(tradeType) +
      "&role=" +
      encodeURIComponent(signerRole) +
      "&token=" +
      encodeURIComponent(token);


    /* =========================
       문자 내용
    ========================= */

    const message =
      "[우리아파트 안심거래]\n" +
      "전자계약 서명요청입니다.\n" +
      "아래 링크를 눌러 계약서 확인 후\n" +
      "전자서명해 주세요.\n" +
      signLink;


    /* =========================
       NCP SENS 인증 서명
    ========================= */

    const timestamp =
      Date.now().toString();

    const requestPath =
      "/sms/v2/services/" +
      NCP_SMS_SERVICE_ID +
      "/messages";


    const signatureText =
      "POST" +
      " " +
      requestPath +
      "\n" +
      timestamp +
      "\n" +
      NCP_ACCESS_KEY;


    const ncpSignature =
      crypto
        .createHmac(
          "sha256",
          NCP_SECRET_KEY
        )
        .update(
          signatureText,
          "utf8"
        )
        .digest(
          "base64"
        );


    /* =========================
       NCP 문자 발송
    ========================= */

    const ncpResponse =
      await fetch(
        "https://sens.apigw.ntruss.com" +
        requestPath,
        {
          method: "POST",

          headers: {

            "Content-Type":
              "application/json; charset=utf-8",

            "x-ncp-apigw-timestamp":
              timestamp,

            "x-ncp-iam-access-key":
              NCP_ACCESS_KEY,

            "x-ncp-apigw-signature-v2":
              ncpSignature
          },

          body: JSON.stringify({

            type: "LMS",

            contentType: "COMM",

            countryCode: "82",

            from:
              NCP_SMS_FROM,

            subject:
              "전자계약 서명요청",

            content:
              message,

            messages: [
              {
                to:
                  signerPhone
              }
            ]

          })
        }
      );


    const ncpResultText =
      await ncpResponse.text();


    let ncpResult = null;

    try {

      ncpResult =
        JSON.parse(
          ncpResultText
        );

    } catch (e) {

      ncpResult = {
        raw:
          ncpResultText
      };

    }


    if (!ncpResponse.ok) {

      console.error(
        "NCP SMS ERROR",
        ncpResult
      );

      throw new Error(
        "전자서명 요청 문자 발송에 실패했습니다."
      );
    }


    /* =========================
       성공
    ========================= */

    return res.status(200).json({

      ok: true,

      message:
        "전자서명 요청 문자를 발송했습니다.",

      role:
        signerRole,

      requestId:
        ncpResult &&
        ncpResult.requestId
          ? ncpResult.requestId
          : ""

    });


  } catch (error) {

    console.error(error);

    return res.status(500).json({

      ok: false,

      message:
        error &&
        error.message
          ? error.message
          : "문자 발송 중 오류가 발생했습니다."

    });

  }

};
