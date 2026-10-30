export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || "https://dcysjuxyjqtvkihdsjvv.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hostStr = String(req.headers["x-forwarded-host"] || req.headers.host || "");

  // SUPABASE_SERVICE_ROLE_KEY가 없는 도메인(ansimdeal.com 등)은 wooriapt.app 본 서버로 프록시
  if (!SUPABASE_SERVICE_ROLE_KEY && !hostStr.includes("wooriapt.app")) {
    try {
      const qs = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      const targetUrl = `https://www.wooriapt.app/api/broker-auth${qs}`;
      const fetchOpts = {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      };
      if (req.method !== "GET" && req.method !== "HEAD") {
        fetchOpts.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
      }
      const upstreamRes = await fetch(targetUrl, fetchOpts);
      const upstreamData = await upstreamRes.json().catch(() => ({}));
      return res.status(upstreamRes.status).json(upstreamData);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        message: "서버 연동 오류가 발생했습니다."
      });
    }
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      ok: false,
      message: "서버 환경설정이 필요합니다."
    });
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  const clean = (v) => String(v || "").trim();
  const normalizePhone = (v) => String(v || "").replace(/\D/g, "").slice(0, 11);

  function mapBrokerRow(row) {
    if (!row) return null;
    const rawHash = String(row.password_hash || "");
    let password_salt = "";
    let password_hash = rawHash;
    if (rawHash.includes(":")) {
      const idx = rawHash.indexOf(":");
      password_salt = rawHash.slice(0, idx);
      password_hash = rawHash.slice(idx + 1);
    }
    const rawAddr = String(row.address || "");
    let email = "";
    let cleanAddress = rawAddr;
    const emailMatch = rawAddr.match(/\[EMAIL:([^\]]+)\]/);
    if (emailMatch) {
      email = emailMatch[1];
      cleanAddress = rawAddr.replace(/\s*\[EMAIL:[^\]]+\]/, "").trim();
    }
    return {
      id: row.id,
      phone: row.mobile_phone || row.office_phone || "",
      mobile_phone: row.mobile_phone || "",
      office_phone: row.office_phone || "",
      email,
      password_hash,
      password_salt,
      representative_name: row.representative_name || "",
      office_name: row.office_name || "",
      office_registration_no: row.license_number || "",
      registration_status: row.is_active === false ? "PENDING" : "APPROVED",
      membership_status: row.membership_status || "FREE",
      sido: row.sido || "",
      sigungu: row.sigungu || "",
      dong: row.dong || "",
      address: cleanAddress,
      created_at: row.created_at
    };
  }

  try {
    /* =====================================================
       GET: 회원 조회 (?phone=010...)
    ===================================================== */
    if (req.method === "GET") {
      const phone = normalizePhone(req.query.phone);
      if (!phone) {
        return res.status(400).json({ ok: false, message: "휴대전화번호를 입력해 주세요." });
      }

      const url =
        `${SUPABASE_URL}/rest/v1/safe_brokers` +
        `?mobile_phone=eq.${encodeURIComponent(phone)}` +
        `&select=*&order=id.desc&limit=1`;

      const response = await fetch(url, { method: "GET", headers });
      const rows = await response.json().catch(() => []);

      if (!response.ok) {
        return res.status(500).json({ ok: false, message: "회원정보 조회에 실패했습니다." });
      }

      const mapped = (Array.isArray(rows) ? rows : []).map(mapBrokerRow);
      return res.status(200).json({
        ok: true,
        members: mapped,
        member: mapped[0] || null
      });
    }

    /* =====================================================
       POST: 회원가입 신청 또는 로그인 확인
    ===================================================== */
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const phone = normalizePhone(body.phone || body.mobile_phone);

      if (!/^01[016789][0-9]{7,8}$/.test(phone)) {
        return res.status(400).json({ ok: false, message: "휴대전화번호를 정확히 입력해 주세요." });
      }

      // 기존 가입 여부 확인
      const checkUrl =
        `${SUPABASE_URL}/rest/v1/safe_brokers` +
        `?mobile_phone=eq.${encodeURIComponent(phone)}` +
        `&select=id,mobile_phone&limit=1`;
      const checkRes = await fetch(checkUrl, { method: "GET", headers });
      const existing = await checkRes.json().catch(() => []);

      if (Array.isArray(existing) && existing.length > 0 && !body.allowUpsert) {
        return res.status(409).json({
          ok: false,
          message: "이미 가입된 휴대전화번호입니다."
        });
      }

      const passwordHash = clean(body.password_hash || body.passwordHash);
      const passwordSalt = clean(body.password_salt || body.passwordSalt);
      const combinedHash = passwordSalt ? `${passwordSalt}:${passwordHash}` : passwordHash;

      const email = clean(body.email);
      const rawAddress = clean(body.address || body.officeAddress || "기본 영업지역");
      const storedAddress = email ? `${rawAddress} [EMAIL:${email}]`.trim() : rawAddress;

      const insertPayload = {
        mobile_phone: phone,
        office_phone: clean(body.office_phone || body.officePhone || phone),
        password_hash: combinedHash || "default_hash",
        representative_name: clean(body.representative_name || body.representative || "대표 공인중개사"),
        office_name: clean(body.office_name || body.officeName || "공인중개사사무소"),
        license_number: clean(body.office_registration_no || body.license_number || body.brokerNumber || "-"),
        sido: clean(body.sido || "서울특별시"),
        sigungu: clean(body.sigungu || "강남구"),
        dong: clean(body.dong || "역삼동"),
        address: storedAddress,
        membership_status: "PENDING",
        is_active: true
      };

      let saveRes;
      if (Array.isArray(existing) && existing.length > 0) {
        saveRes = await fetch(
          `${SUPABASE_URL}/rest/v1/safe_brokers?id=eq.${encodeURIComponent(existing[0].id)}`,
          {
            method: "PATCH",
            headers: { ...headers, Prefer: "return=representation" },
            body: JSON.stringify(insertPayload)
          }
        );
      } else {
        saveRes = await fetch(`${SUPABASE_URL}/rest/v1/safe_brokers`, {
          method: "POST",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify(insertPayload)
        });
      }

      const savedRows = await saveRes.json().catch(() => []);
      if (!saveRes.ok) {
        console.error("safe_brokers save error:", savedRows);
        return res.status(500).json({
          ok: false,
          message: "회원가입 정보를 저장하지 못했습니다."
        });
      }

      const member = Array.isArray(savedRows) && savedRows.length > 0 ? mapBrokerRow(savedRows[0]) : null;

      try {
        const formattedPhone =
          phone.length === 11
            ? `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`
            : phone;
        const adminMsg = [
          `[공인중개사 신규 회원가입 알림]`,
          `새로운 공인중개사 가입 신청이 접수되었습니다!`,
          ``,
          `• 상호명: ${insertPayload.office_name}`,
          `• 대표자: ${insertPayload.representative_name}`,
          `• 휴대전화: ${formattedPhone}`,
          `• 사무실전화: ${insertPayload.office_phone}`,
          `• 지역: ${insertPayload.sido} ${insertPayload.sigungu} ${insertPayload.dong}`,
          `• 등록번호: ${insertPayload.license_number}`
        ].join("\n");

        await fetch("https://www.wooriapt.app/api/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: "01022864150",
            type: "LMS",
            subject: `[공인중개사 신규 가입신청]`,
            content: adminMsg
          })
        });
      } catch (smsErr) {
        console.error("admin broker signup sms error:", smsErr);
      }

      return res.status(200).json({
        ok: true,
        message: "회원가입 신청이 접수되었습니다.",
        member
      });
    }

    /* =====================================================
       PATCH: 비밀번호 변경 또는 프로필 수정
    ===================================================== */
    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const phone = normalizePhone(body.phone || body.mobile_phone);
      if (!phone) {
        return res.status(400).json({ ok: false, message: "휴대전화번호가 필요합니다." });
      }

      const patchData = { updated_at: new Date().toISOString() };
      const passwordHash = clean(body.password_hash || body.passwordHash);
      const passwordSalt = clean(body.password_salt || body.passwordSalt);
      if (passwordHash) {
        patchData.password_hash = passwordSalt ? `${passwordSalt}:${passwordHash}` : passwordHash;
      }
      if (body.representative_name || body.representative) {
        patchData.representative_name = clean(body.representative_name || body.representative);
      }
      if (body.office_name || body.officeName) {
        patchData.office_name = clean(body.office_name || body.officeName);
      }
      if (body.office_phone || body.officePhone) {
        patchData.office_phone = clean(body.office_phone || body.officePhone);
      }
      if (body.office_registration_no || body.brokerNumber) {
        patchData.license_number = clean(body.office_registration_no || body.brokerNumber);
      }
      if (body.officeAddress || body.address || body.email) {
        const addr = clean(body.officeAddress || body.address || "");
        const dtl = clean(body.officeAddressDetail || "");
        const em = clean(body.email || "");
        const fullAddr = [addr, dtl].filter(Boolean).join(" ");
        patchData.address = em ? `${fullAddr} [EMAIL:${em}]`.trim() : fullAddr;
      }

      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/safe_brokers?mobile_phone=eq.${encodeURIComponent(phone)}`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify(patchData)
        }
      );

      if (!patchRes.ok) {
        return res.status(500).json({ ok: false, message: "회원정보 수정에 실패했습니다." });
      }

      const rows = await patchRes.json().catch(() => []);
      return res.status(200).json({
        ok: true,
        member: Array.isArray(rows) && rows.length > 0 ? mapBrokerRow(rows[0]) : null
      });
    }

    /* =====================================================
       DELETE: 테스트 회원 정리용
    ===================================================== */
    if (req.method === "DELETE") {
      const phone = normalizePhone(req.query.phone || (req.body && req.body.phone));
      if (!phone) {
        return res.status(400).json({ ok: false, message: "phone required" });
      }
      await fetch(
        `${SUPABASE_URL}/rest/v1/safe_brokers?mobile_phone=eq.${encodeURIComponent(phone)}`,
        { method: "DELETE", headers }
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  } catch (error) {
    console.error("broker-auth error:", error);
    return res.status(500).json({
      ok: false,
      message: error.message || "서버 오류가 발생했습니다."
    });
  }
}
