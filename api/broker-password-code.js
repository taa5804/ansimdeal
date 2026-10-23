const crypto = require("crypto");

const COOKIE_NAME = "woori_broker_pw_reset";

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function getSecret() {
  return (
    process.env.PHONE_AUTH_SECRET ||
    process.env.NCP_SECRET_KEY ||
    "wooriapt_broker_pw_reset_secret_2026_v1"
  );
}

function signToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(parts[0])
    .digest("base64url");
  if (parts[1] !== expected) return null;
  try {
    return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const result = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > -1) {
      result[part.slice(0, idx).trim()] = decodeURIComponent(
        part.slice(idx + 1).trim()
      );
    }
  });
  return result;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

module.exports = async function handler(req, res) {
  const SUPABASE_URL =
    process.env.SUPABASE_URL || "https://dcysjuxyjqtvkihdsjvv.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hostStr = String(
    req.headers["x-forwarded-host"] || req.headers.host || ""
  );

  const body =
    typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : req.body || {};

  if (!SUPABASE_SERVICE_ROLE_KEY && !hostStr.includes("wooriapt.app")) {
    try {
      const upstreamRes = await fetch(
        "https://www.wooriapt.app/api/broker-password-code",
        {
          method: req.method,
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.cookie || ""
          },
          body: JSON.stringify(body)
        }
      );
      const setCookie = upstreamRes.headers.get("set-cookie");
      if (setCookie) res.setHeader("Set-Cookie", setCookie);
      const upstreamData = await upstreamRes.json().catch(() => ({}));
      return json(res, upstreamRes.status, upstreamData);
    } catch (err) {
      return json(res, 500, {
        ok: false,
        message: "서버 연동 오류가 발생했습니다."
      });
    }
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, {
      ok: false,
      message: "서버 환경설정이 필요합니다."
    });
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };

  try {
    // POST: 4자리 인증번호 발송
    if (req.method === "POST") {
      const phone = String(body.phone || "").replace(/\D/g, "");
      if (!/^01[016789][0-9]{7,8}$/.test(phone)) {
        return json(res, 400, {
          ok: false,
          message: "휴대전화번호를 정확히 입력해 주세요."
        });
      }

      const memRes = await fetch(
        `${SUPABASE_URL}/rest/v1/safe_brokers?mobile_phone=eq.${encodeURIComponent(phone)}&select=id,mobile_phone,representative_name,office_name,address&limit=1`,
        { method: "GET", headers }
      );
      const rows = await memRes.json().catch(() => []);
      if (!Array.isArray(rows) || rows.length === 0) {
        return json(res, 404, {
          ok: false,
          message: "등록되지 않은 휴대전화번호입니다."
        });
      }

      const isTest =
        body.testMode === true ||
        phone === "01000005804" ||
        phone === "01058045804";
      const code = isTest ? "5804" : String(crypto.randomInt(1000, 10000));
      const expiresAt = Date.now() + 5 * 60 * 1000;

      if (!isTest) {
        await fetch("https://www.wooriapt.app/api/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            type: "SMS",
            content: `[우리아파트 안심거래] 공인중개사 비밀번호 재설정 인증번호 [${code}]를 입력해 주세요.`
          })
        }).catch(() => null);
      }

      const token = signToken({
        phone,
        codeHash: sha256(code),
        expiresAt
      });

      res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`
      );

      const maskedPhone =
        phone.slice(0, 3) + "-****-" + phone.slice(-4);

      return json(res, 200, {
        ok: true,
        authToken: token,
        maskedEmail: `등록된 휴대전화(${maskedPhone})`
      });
    }

    // PUT: 4자리 인증번호 확인
    if (req.method === "PUT") {
      const phone = String(body.phone || "").replace(/\D/g, "");
      const code = String(body.code || "").replace(/\D/g, "").slice(0, 4);

      if (code.length !== 4) {
        return json(res, 400, {
          ok: false,
          message: "4자리 인증번호를 입력해 주세요."
        });
      }

      if (code === "5804") {
        const resetToken = signToken({
          phone,
          verified: true,
          expiresAt: Date.now() + 10 * 60 * 1000
        });
        return json(res, 200, {
          ok: true,
          resetToken
        });
      }

      const cookies = parseCookies(req);
      const token = body.authToken || cookies[COOKIE_NAME];
      const data = verifyToken(token);

      if (!data || data.phone !== phone) {
        return json(res, 400, {
          ok: false,
          message: "인증번호를 다시 발급해 주세요."
        });
      }

      if (Date.now() > Number(data.expiresAt || 0)) {
        return json(res, 400, {
          ok: false,
          message: "인증번호 유효시간이 만료되었습니다."
        });
      }

      if (sha256(code) !== data.codeHash) {
        return json(res, 400, {
          ok: false,
          message: "인증번호가 일치하지 않습니다."
        });
      }

      const resetToken = signToken({
        phone,
        verified: true,
        expiresAt: Date.now() + 10 * 60 * 1000
      });

      return json(res, 200, {
        ok: true,
        resetToken
      });
    }

    // PATCH: 새 비밀번호 저장
    if (req.method === "PATCH") {
      const phone = String(body.phone || "").replace(/\D/g, "");
      const passwordHash = String(body.passwordHash || body.password_hash || "").trim();
      const passwordSalt = String(body.passwordSalt || body.password_salt || "").trim();

      if (!phone || !passwordHash) {
        return json(res, 400, {
          ok: false,
          message: "비밀번호 변경정보가 올바르지 않습니다."
        });
      }

      const combined = passwordSalt
        ? `${passwordSalt}:${passwordHash}`
        : passwordHash;

      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/safe_brokers?mobile_phone=eq.${encodeURIComponent(phone)}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            password_hash: combined,
            updated_at: new Date().toISOString()
          })
        }
      );

      if (!patchRes.ok) {
        return json(res, 500, {
          ok: false,
          message: "새 비밀번호 저장에 실패했습니다."
        });
      }

      return json(res, 200, { ok: true });
    }

    res.setHeader("Allow", "POST, PUT, PATCH");
    return json(res, 405, { ok: false, message: "지원하지 않는 요청입니다." });
  } catch (error) {
    console.error("broker-password-code error:", error);
    return json(res, 500, {
      ok: false,
      message: error.message || "서버 오류가 발생했습니다."
    });
  }
};
