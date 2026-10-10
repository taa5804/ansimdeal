const crypto = require("crypto");

module.exports = async function handler(req, res) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message:
        "POST 요청만 가능합니다."
    });
  }


  try {

    const {
      phone,
      content,
      type = "LMS",
      subject =
        "매수 희망조건 전달"
    } = req.body || {};


    const normalizedPhone =
      String(phone || "")
        .replace(/\D/g, "");


    const normalizedContent =
      String(content || "")
        .trim();


    const normalizedType =
      String(type || "LMS")
        .trim()
        .toUpperCase();


    if (
      !/^01[016789][0-9]{7,8}$/
        .test(normalizedPhone)
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "수신 휴대전화번호를 확인해 주세요."
      });
    }


    if (!normalizedContent) {
      return res.status(400).json({
        ok: false,
        message:
          "문자 내용이 없습니다."
      });
    }


    if (
      ![
        "SMS",
        "LMS"
      ].includes(normalizedType)
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "문자 유형을 확인해 주세요."
      });
    }


    const accessKey =
      process.env.NCP_ACCESS_KEY;

    const secretKey =
      process.env.NCP_SECRET_KEY;


    const serviceId =
      "ncp:sms:kr:376942048120:ansimtrade-sms";


    const callingNumber =
      "0629524150";


    if (
      !accessKey ||
      !secretKey
    ) {
      return res.status(500).json({
        ok: false,
        message:
          "NCP API 키가 설정되지 않았습니다."
      });
    }


    const timestamp =
      Date.now().toString();

    const method =
      "POST";

    const uri =
      `/sms/v2/services/${serviceId}/messages`;


    const signatureMessage =
      method +
      " " +
      uri +
      "\n" +
      timestamp +
      "\n" +
      accessKey;


    const signature =
      crypto
        .createHmac(
          "sha256",
          secretKey
        )
        .update(signatureMessage)
        .digest("base64");


    const messageBody = {

      type:
        normalizedType,

      contentType:
        "COMM",

      countryCode:
        "82",

      from:
        callingNumber,

      content:
        normalizedContent,

      messages: [
        {
          to:
            normalizedPhone
        }
      ]
    };


    if (
      normalizedType === "LMS"
    ) {
      messageBody.subject =
        String(subject || "")
          .trim()
          .slice(0, 40);
    }


    const response =
      await fetch(
        `https://sens.apigw.ntruss.com${uri}`,
        {
          method:
            "POST",

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
              messageBody
            )
        }
      );


    const responseText =
      await response.text();


    let data = null;


    try {
      data =
        responseText
          ? JSON.parse(responseText)
          : null;
    } catch {
      data =
        responseText;
    }


    if (!response.ok) {

      console.error(
        "NCP LMS ERROR:",
        data
      );


      return res
        .status(response.status)
        .json({
          ok: false,
          message:
            "문자 발송에 실패했습니다.",
          error:
            data
        });
    }


    return res.status(200).json({

      ok:
        true,

      message:
        "LMS 발송 요청이 완료되었습니다.",

      result:
        data
    });


  } catch (error) {

    console.error(
      "SEND LMS ERROR:",
      error
    );


    return res.status(500).json({
      ok: false,
      message:
        "문자 발송 중 오류가 발생했습니다."
    });
  }
};
