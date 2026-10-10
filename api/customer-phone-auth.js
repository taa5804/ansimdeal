const crypto = require("crypto");

/*
=========================================================
우리아파트 안심거래
휴대전화 4자리 인증번호 발송 / 확인

파일 위치:
api/customer-phone-auth.js

Vercel Environment Variables 필요:
NCP_ACCESS_KEY
NCP_SECRET_KEY
NCP_SMS_SERVICE_ID
NCP_SMS_FROM
PHONE_AUTH_SECRET
=========================================================
*/


/* =====================================================
   기본 설정
===================================================== */

const COOKIE_NAME = "woori_phone_auth";

const CODE_EXPIRE_MS = 5 * 60 * 1000; // 5분

const MAX_ATTEMPTS = 5;


/* =====================================================
   JSON 응답
===================================================== */

function sendJson(res, status, data) {

  res.statusCode = status;

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.end(
    JSON.stringify(data)
  );

}


/* =====================================================
   전화번호 정리
===================================================== */

function cleanPhone(value) {

  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 11);

}


/* =====================================================
   쿠키 읽기
===================================================== */

function parseCookies(req) {

  const result = {};

  const cookieHeader =
    req.headers.cookie || "";

  cookieHeader
    .split(";")
    .forEach(function(item) {

      const index =
        item.indexOf("=");

      if (index === -1) {
        return;
      }

      const key =
        item
          .slice(0, index)
          .trim();

      const value =
        item
          .slice(index + 1)
          .trim();

      result[key] =
        decodeURIComponent(value);

    });

  return result;

}


/* =====================================================
   안전한 문자열 비교
===================================================== */

function safeCompare(a, b) {

  const aa =
    Buffer.from(String(a));

  const bb =
    Buffer.from(String(b));

  if (
    aa.length !== bb.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    aa,
    bb
  );

}


/* =====================================================
   PHONE_AUTH_SECRET
===================================================== */

function getAuthSecret() {

  return (
    process.env.PHONE_AUTH_SECRET ||
    ""
  );

}


/* =====================================================
   인증 쿠키 서명
===================================================== */

function signPayload(payload) {

  const secret =
    getAuthSecret();

  if (!secret) {

    throw new Error(
      "PHONE_AUTH_SECRET 환경변수가 없습니다."
    );

  }

  const encoded =
    Buffer
      .from(
        JSON.stringify(payload)
      )
      .toString("base64url");

  const signature =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(encoded)
      .digest("base64url");

  return (
    encoded +
    "." +
    signature
  );

}


/* =====================================================
   인증 쿠키 검증
===================================================== */

function verifySignedPayload(token) {

  if (!token) {
    return null;
  }

  const parts =
    token.split(".");

  if (
    parts.length !== 2
  ) {
    return null;
  }

  const encoded =
    parts[0];

  const signature =
    parts[1];

  const secret =
    getAuthSecret();

  if (!secret) {
    return null;
  }

  const expected =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(encoded)
      .digest("base64url");

  if (
    !safeCompare(
      signature,
      expected
    )
  ) {
    return null;
  }

  try {

    const json =
      Buffer
        .from(
          encoded,
          "base64url"
        )
        .toString("utf8");

    return JSON.parse(json);

  } catch (error) {

    return null;

  }

}


/* =====================================================
   인증번호 해시
===================================================== */

function hashCode(
  phone,
  code,
  expiresAt
) {

  const secret =
    getAuthSecret();

  return crypto
    .createHmac(
      "sha256",
      secret
    )
    .update(
      phone +
      ":" +
      code +
      ":" +
      expiresAt
    )
    .digest("hex");

}


/* =====================================================
   인증번호 생성
===================================================== */

function createCode() {

  return String(
    crypto.randomInt(
      1000,
      10000
    )
  );

}


/* =====================================================
   NCP Signature V2
===================================================== */

function createNcpSignature(
  method,
  uri,
  timestamp,
  accessKey,
  secretKey
) {

  const message =
    method +
    " " +
    uri +
    "\n" +
    timestamp +
    "\n" +
    accessKey;

  return crypto
    .createHmac(
      "sha256",
      secretKey
    )
    .update(message)
    .digest("base64");

}


/* =====================================================
   NCP SMS 발송
===================================================== */

async function sendSms(
  phone,
  code
) {

  const accessKey =
    process.env.NCP_ACCESS_KEY;

  const secretKey =
    process.env.NCP_SECRET_KEY;

  const serviceId =
    process.env.NCP_SMS_SERVICE_ID;

  const from =
    String(
      process.env.NCP_SMS_FROM || ""
    )
      .replace(/\D/g, "");


  if (!accessKey) {

    throw new Error(
      "NCP_ACCESS_KEY가 설정되지 않았습니다."
    );

  }

  if (!secretKey) {

    throw new Error(
      "NCP_SECRET_KEY가 설정되지 않았습니다."
    );

  }

  if (!serviceId) {

    throw new Error(
      "NCP_SMS_SERVICE_ID가 설정되지 않았습니다."
    );

  }

  if (!from) {

    throw new Error(
      "NCP_SMS_FROM 발신번호가 설정되지 않았습니다."
    );

  }


  const uri =
    "/sms/v2/services/" +
    serviceId +
    "/messages";

  const timestamp =
    Date.now().toString();

  const signature =
    createNcpSignature(
      "POST",
      uri,
      timestamp,
      accessKey,
      secretKey
    );


  const smsBody = {

    type: "SMS",

    contentType: "COMM",

    countryCode: "82",

    from: from,

    content:
      "[우리아파트 안심거래] 인증번호 [" +
      code +
      "]를 입력해 주세요.",

    messages: [
      {
        to: phone
      }
    ]

  };


  const response =
    await fetch(
      "https://sens.apigw.ntruss.com" +
      uri,
      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json; charset=utf-8",

          "x-ncp-apigw-timestamp":
            timestamp,

          "x-ncp-iam-access-key":
            accessKey,

          "x-ncp-apigw-signature-v2":
            signature

        },

        body:
          JSON.stringify(
            smsBody
          )

      }
    );


  const data =
    await response
      .json()
      .catch(
        function() {
          return {};
        }
      );


  if (!response.ok) {

    console.error(
      "NCP SMS 발송 오류",
      response.status,
      data
    );

    throw new Error(
      data.message ||
      "문자 발송에 실패했습니다."
    );

  }


  return data;

}


/* =====================================================
   메인 API
===================================================== */

module.exports =
async function handler(
  req,
  res
) {


  /* -------------------------------------------------
     POST만 허용
  ------------------------------------------------- */

  if (
    req.method !== "POST"
  ) {

    res.setHeader(
      "Allow",
      "POST"
    );

    return sendJson(
      res,
      405,
      {
        ok: false,
        message:
          "허용되지 않은 요청입니다."
      }
    );

  }


  try {


    /* -------------------------------------------------
       환경변수 확인
    ------------------------------------------------- */

    if (
      !getAuthSecret()
    ) {

      return sendJson(
        res,
        500,
        {
          ok: false,
          message:
            "휴대전화 인증 서버 설정이 완료되지 않았습니다."
        }
      );

    }


    /* -------------------------------------------------
       요청값
    ------------------------------------------------- */

    const body =
      req.body || {};

    const action =
      String(
        body.action || ""
      )
        .trim()
        .toLowerCase();

    const phone =
      cleanPhone(
        body.phone
      );

    const purpose =
      String(
        body.purpose ||
        "property_request"
      );


    /* -------------------------------------------------
       휴대전화 형식 검사
    ------------------------------------------------- */

    if (
      !/^01[016789][0-9]{7,8}$/
        .test(phone)
    ) {

      return sendJson(
        res,
        400,
        {
          ok: false,
          message:
            "휴대전화번호를 정확히 입력해 주세요."
        }
      );

    }


    /* =================================================
       인증번호 발송
    ================================================= */

    if (
      action === "send"
    ) {


      const code =
        createCode();

      const expiresAt =
        Date.now() +
        CODE_EXPIRE_MS;

      const codeHash =
        hashCode(
          phone,
          code,
          expiresAt
        );


      /* 문자 먼저 발송 */

      await sendSms(
        phone,
        code
      );


      /* 인증정보 쿠키 저장 */

      const token =
        signPayload({

          phone:
            phone,

          purpose:
            purpose,

          codeHash:
            codeHash,

          expiresAt:
            expiresAt,

          attempts:
            0

        });


      res.setHeader(
        "Set-Cookie",

        COOKIE_NAME +
        "=" +
        encodeURIComponent(token) +
        "; Path=/" +
        "; HttpOnly" +
        "; Secure" +
        "; SameSite=Lax" +
        "; Max-Age=300"
      );


      return sendJson(
        res,
        200,
        {

          ok: true,

          sent: true,

          message:
            "인증번호를 발송했습니다."

        }
      );

    }


    /* =================================================
       인증번호 확인
    ================================================= */

    if (
      action === "verify"
    ) {


      const code =
        String(
          body.code || ""
        )
          .replace(/\D/g, "")
          .slice(0, 4);


      if (
        !/^\d{4}$/
          .test(code)
      ) {

        return sendJson(
          res,
          400,
          {
            ok: false,
            verified: false,
            message:
              "인증번호 4자리를 입력해 주세요."
          }
        );

      }


      const cookies =
        parseCookies(req);

      const token =
        cookies[
          COOKIE_NAME
        ];


      const authData =
        verifySignedPayload(
          token
        );


      if (!authData) {

        return sendJson(
          res,
          400,
          {
            ok: false,
            verified: false,
            message:
              "인증정보가 없습니다. 인증번호를 다시 받아 주세요."
          }
        );

      }


      /* 전화번호 확인 */

      if (
        authData.phone !== phone
      ) {

        return sendJson(
          res,
          400,
          {
            ok: false,
            verified: false,
            message:
              "인증을 요청한 휴대전화번호와 일치하지 않습니다."
          }
        );

      }


      /* 용도 확인 */

      if (
        authData.purpose !==
        purpose
      ) {

        return sendJson(
          res,
          400,
          {
            ok: false,
            verified: false,
            message:
              "인증 요청정보가 일치하지 않습니다."
          }
        );

      }


      /* 만료 확인 */

      if (
        !authData.expiresAt ||
        Date.now() >
        Number(
          authData.expiresAt
        )
      ) {

        res.setHeader(
          "Set-Cookie",
          COOKIE_NAME +
          "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
        );

        return sendJson(
          res,
          400,
          {
            ok: false,
            verified: false,
            message:
              "인증번호 유효시간이 만료되었습니다. 다시 받아 주세요."
          }
        );

      }


      /* 시도 횟수 */

      const attempts =
        Number(
          authData.attempts || 0
        );


      if (
        attempts >= MAX_ATTEMPTS
      ) {

        res.setHeader(
          "Set-Cookie",
          COOKIE_NAME +
          "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
        );

        return sendJson(
          res,
          400,
          {
            ok: false,
            verified: false,
            message:
              "인증번호 입력 횟수를 초과했습니다. 인증번호를 다시 받아 주세요."
          }
        );

      }


      /* 입력 코드 해시 */

      const inputHash =
        hashCode(
          phone,
          code,
          authData.expiresAt
        );


      /* 코드 불일치 */

      if (
        !safeCompare(
          inputHash,
          authData.codeHash
        )
      ) {


        const retryToken =
          signPayload({

            phone:
              authData.phone,

            purpose:
              authData.purpose,

            codeHash:
              authData.codeHash,

            expiresAt:
              authData.expiresAt,

            attempts:
              attempts + 1

          });


        res.setHeader(
          "Set-Cookie",

          COOKIE_NAME +
          "=" +
          encodeURIComponent(
            retryToken
          ) +
          "; Path=/" +
          "; HttpOnly" +
          "; Secure" +
          "; SameSite=Lax" +
          "; Max-Age=300"
        );


        return sendJson(
          res,
          400,
          {
            ok: false,
            verified: false,
            message:
              "인증번호가 올바르지 않습니다."
          }
        );

      }


      /* =================================================
         인증 성공
      ================================================= */

      res.setHeader(
        "Set-Cookie",

        COOKIE_NAME +
        "=; Path=/" +
        "; HttpOnly" +
        "; Secure" +
        "; SameSite=Lax" +
        "; Max-Age=0"
      );


      return sendJson(
        res,
        200,
        {

          ok: true,

          verified: true,

          phone:
            phone,

          message:
            "휴대전화 인증이 완료되었습니다."

        }
      );

    }


    /* -------------------------------------------------
       action 오류
    ------------------------------------------------- */

    return sendJson(
      res,
      400,
      {
        ok: false,
        message:
          "잘못된 인증 요청입니다."
      }
    );


  } catch (error) {


    console.error(
      "customer-phone-auth error:",
      error
    );


    return sendJson(
      res,
      500,
      {

        ok: false,

        message:
          error.message ||
          "인증번호 발송에 실패했습니다."

      }
    );

  }

};
