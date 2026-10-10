const crypto = require("crypto");

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const RESEND_API_KEY =
  process.env.RESEND_API_KEY;

const EMAIL_FROM =
  process.env.EMAIL_FROM;


/* =====================================================
   공통
===================================================== */

function json(res, status, data){

  res.status(status).json(data);

}


function sha256(value){

  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");

}


function generateCode(){

  return String(
    crypto.randomInt(1000, 10000)
  );

}


function generateResetToken(){

  return crypto
    .randomBytes(32)
    .toString("hex");

}


function maskEmail(email){

  const parts =
    String(email || "").split("@");

  if(parts.length !== 2){
    return "등록된 이메일";
  }

  const name = parts[0];
  const domain = parts[1];

  let masked = "";

  if(name.length <= 2){

    masked =
      name.charAt(0) + "*";

  }else{

    masked =
      name.slice(0,2) +
      "*".repeat(
        Math.max(2,name.length - 2)
      );

  }

  return masked + "@" + domain;

}


/* =====================================================
   Supabase 회원 조회
===================================================== */

async function getMember(phone){

  const response =
    await fetch(

      SUPABASE_URL +
      "/rest/v1/agent_members" +
      "?select=id,phone,email,representative_name,office_name" +
      "&phone=eq." +
      encodeURIComponent(phone) +
      "&limit=1",

      {
        method:"GET",

        headers:{
          "apikey":
            SUPABASE_SERVICE_ROLE_KEY,

          "Authorization":
            "Bearer " +
            SUPABASE_SERVICE_ROLE_KEY
        }
      }

    );


  if(!response.ok){

    throw new Error(
      "회원정보 조회에 실패했습니다."
    );

  }


  const rows =
    await response.json();


  if(
    !Array.isArray(rows) ||
    rows.length === 0
  ){

    return null;

  }


  return rows[0];

}


/* =====================================================
   인증정보 저장
===================================================== */

async function saveCode(
  phone,
  codeHash,
  expiresAt
){

  const response =
    await fetch(

      SUPABASE_URL +
      "/rest/v1/broker_password_codes",

      {
        method:"POST",

        headers:{
          "apikey":
            SUPABASE_SERVICE_ROLE_KEY,

          "Authorization":
            "Bearer " +
            SUPABASE_SERVICE_ROLE_KEY,

          "Content-Type":
            "application/json",

          "Prefer":
            "resolution=merge-duplicates"
        },

        body:
          JSON.stringify({

            phone:phone,

            code_hash:
              codeHash,

            expires_at:
              expiresAt,

            attempts:0,

            verified:false,

            reset_token_hash:null,

            reset_expires_at:null,

            updated_at:
              new Date().toISOString()

          })
      }

    );


  if(!response.ok){

    const text =
      await response.text();

    console.error(
      "인증번호 저장 오류",
      text
    );

    throw new Error(
      "인증번호 저장에 실패했습니다."
    );

  }

}


/* =====================================================
   이메일 발송
===================================================== */

async function sendEmail(
  email,
  code
){

  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method:"POST",

        headers:{
          "Authorization":
            "Bearer " +
            RESEND_API_KEY,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            from:
              EMAIL_FROM,

            to:[
              email
            ],

            subject:
              "[우리아파트 안심거래] 비밀번호 찾기 인증번호",

            html:
              `
              <div style="
                font-family:Arial,'Noto Sans KR',sans-serif;
                max-width:520px;
                margin:0 auto;
                padding:25px;
                color:#172b3d;
              ">

                <h2 style="color:#1165d7;">
                  우리아파트 안심거래
                </h2>

                <p>
                  공인중개사 비밀번호 재설정을 위한
                  인증번호입니다.
                </p>

                <div style="
                  margin:25px 0;
                  padding:20px;
                  background:#f2f7ff;
                  border-radius:12px;
                  text-align:center;
                  font-size:30px;
                  font-weight:900;
                  letter-spacing:8px;
                  color:#1165d7;
                ">
                  ${code}
                </div>

                <p>
                  인증번호 유효시간은
                  <strong>5분</strong>입니다.
                </p>

                <p style="
                  margin-top:25px;
                  font-size:13px;
                  color:#718096;
                ">
                  본인이 요청하지 않았다면
                  이 이메일을 무시해 주세요.
                </p>

              </div>
              `
          })
      }
    );


  if(!response.ok){

    const text =
      await response.text();

    console.error(
      "이메일 발송 오류",
      text
    );

    throw new Error(
      "이메일 발송에 실패했습니다."
    );

  }

}


/* =====================================================
   인증정보 조회
===================================================== */

async function getCodeRecord(phone){

  const response =
    await fetch(

      SUPABASE_URL +
      "/rest/v1/broker_password_codes" +
      "?select=*" +
      "&phone=eq." +
      encodeURIComponent(phone) +
      "&limit=1",

      {
        method:"GET",

        headers:{
          "apikey":
            SUPABASE_SERVICE_ROLE_KEY,

          "Authorization":
            "Bearer " +
            SUPABASE_SERVICE_ROLE_KEY
        }
      }

    );


  if(!response.ok){

    throw new Error(
      "인증정보 조회에 실패했습니다."
    );

  }


  const rows =
    await response.json();


  if(
    !Array.isArray(rows) ||
    rows.length === 0
  ){

    return null;

  }


  return rows[0];

}


/* =====================================================
   인증정보 수정
===================================================== */

async function updateCodeRecord(
  phone,
  data
){

  const response =
    await fetch(

      SUPABASE_URL +
      "/rest/v1/broker_password_codes" +
      "?phone=eq." +
      encodeURIComponent(phone),

      {
        method:"PATCH",

        headers:{
          "apikey":
            SUPABASE_SERVICE_ROLE_KEY,

          "Authorization":
            "Bearer " +
            SUPABASE_SERVICE_ROLE_KEY,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(data)
      }

    );


  if(!response.ok){

    throw new Error(
      "인증정보 수정에 실패했습니다."
    );

  }

}


/* =====================================================
   비밀번호 저장
===================================================== */

async function updatePassword(
  phone,
  passwordHash,
  passwordSalt
){

  const response =
    await fetch(

      SUPABASE_URL +
      "/rest/v1/agent_members" +
      "?phone=eq." +
      encodeURIComponent(phone),

      {
        method:"PATCH",

        headers:{
          "apikey":
            SUPABASE_SERVICE_ROLE_KEY,

          "Authorization":
            "Bearer " +
            SUPABASE_SERVICE_ROLE_KEY,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            password_hash:
              passwordHash,

            password_salt:
              passwordSalt

          })
      }

    );


  if(!response.ok){

    throw new Error(
      "비밀번호 저장에 실패했습니다."
    );

  }

}


/* =====================================================
   API
===================================================== */

module.exports =
async function handler(req,res){

  try{


    /* =================================================
       POST
       인증번호 이메일 발송
    ================================================= */

    if(req.method === "POST"){

      const phone =
        String(
          req.body?.phone || ""
        ).replace(/\D/g,"");


      if(
        !/^01[016789][0-9]{7,8}$/.test(phone)
      ){

        return json(
          res,
          400,
          {
            message:
              "휴대전화번호를 정확히 입력해 주세요."
          }
        );

      }


      const member =
        await getMember(phone);


      if(!member){

        return json(
          res,
          404,
          {
            message:
              "등록되지 않은 휴대전화번호입니다."
          }
        );

      }


      if(!member.email){

        return json(
          res,
          400,
          {
            message:
              "등록된 이메일이 없습니다. 본사에 문의해 주세요."
          }
        );

      }


      const code =
        generateCode();


      const codeHash =
        sha256(code);


      const expiresAt =
        new Date(
          Date.now() +
          5 * 60 * 1000
        ).toISOString();


      await saveCode(
        phone,
        codeHash,
        expiresAt
      );


      await sendEmail(
        member.email,
        code
      );


      return json(
        res,
        200,
        {
          ok:true,

          maskedEmail:
            maskEmail(
              member.email
            )
        }
      );

    }


    /* =================================================
       PUT
       4자리 인증번호 확인
    ================================================= */

    if(req.method === "PUT"){

      const phone =
        String(
          req.body?.phone || ""
        ).replace(/\D/g,"");


      const code =
        String(
          req.body?.code || ""
        ).replace(/\D/g,"");


      if(code.length !== 4){

        return json(
          res,
          400,
          {
            message:
              "4자리 인증번호를 입력해 주세요."
          }
        );

      }


      const record =
        await getCodeRecord(phone);


      if(!record){

        return json(
          res,
          400,
          {
            message:
              "인증번호를 다시 발급해 주세요."
          }
        );

      }


      if(
        Number(record.attempts || 0) >= 5
      ){

        return json(
          res,
          429,
          {
            message:
              "인증번호 입력 횟수를 초과했습니다. 다시 발급해 주세요."
          }
        );

      }


      if(
        new Date(record.expires_at).getTime() <
        Date.now()
      ){

        return json(
          res,
          400,
          {
            message:
              "인증번호 유효시간이 만료되었습니다."
          }
        );

      }


      if(
        sha256(code) !==
        record.code_hash
      ){

        await updateCodeRecord(
          phone,
          {
            attempts:
              Number(
                record.attempts || 0
              ) + 1
          }
        );


        return json(
          res,
          400,
          {
            message:
              "인증번호가 일치하지 않습니다."
          }
        );

      }


      const resetToken =
        generateResetToken();


      await updateCodeRecord(
        phone,
        {
          verified:true,

          reset_token_hash:
            sha256(resetToken),

          reset_expires_at:
            new Date(
              Date.now() +
              10 * 60 * 1000
            ).toISOString()

        }
      );


      return json(
        res,
        200,
        {
          ok:true,
          resetToken:resetToken
        }
      );

    }


    /* =================================================
       PATCH
       새 비밀번호 저장
    ================================================= */

    if(req.method === "PATCH"){

      const phone =
        String(
          req.body?.phone || ""
        ).replace(/\D/g,"");


      const resetToken =
        String(
          req.body?.resetToken || ""
        );


      const passwordHash =
        String(
          req.body?.passwordHash || ""
        );


      const passwordSalt =
        String(
          req.body?.passwordSalt || ""
        );


      if(
        !phone ||
        !resetToken ||
        !passwordHash ||
        !passwordSalt
      ){

        return json(
          res,
          400,
          {
            message:
              "비밀번호 변경정보가 올바르지 않습니다."
          }
        );

      }


      const record =
        await getCodeRecord(phone);


      if(
        !record ||
        !record.verified ||
        !record.reset_token_hash
      ){

        return json(
          res,
          403,
          {
            message:
              "이메일 인증을 다시 진행해 주세요."
          }
        );

      }


      if(
        new Date(
          record.reset_expires_at
        ).getTime() <
        Date.now()
      ){

        return json(
          res,
          403,
          {
            message:
              "비밀번호 변경 시간이 만료되었습니다."
          }
        );

      }


      if(
        sha256(resetToken) !==
        record.reset_token_hash
      ){

        return json(
          res,
          403,
          {
            message:
              "인증정보가 올바르지 않습니다."
          }
        );

      }


      await updatePassword(
        phone,
        passwordHash,
        passwordSalt
      );


      await updateCodeRecord(
        phone,
        {
          verified:false,
          reset_token_hash:null,
          reset_expires_at:null
        }
      );


      return json(
        res,
        200,
        {
          ok:true
        }
      );

    }


    res.setHeader(
      "Allow",
      "POST, PUT, PATCH"
    );


    return json(
      res,
      405,
      {
        message:
          "지원하지 않는 요청입니다."
      }
    );


  }catch(error){

    console.error(
      "broker-password-code 오류",
      error
    );


    return json(
      res,
      500,
      {
        message:
          error.message ||
          "서버 오류가 발생했습니다."
      }
    );

  }

};
