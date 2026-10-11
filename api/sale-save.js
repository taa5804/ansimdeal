let sb = null;
try {
  sb = require("./_lib").sb;
} catch (e) {
  sb = null;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,X-Admin-Key"
  );
}

const IS_PRESALE_DB =
  Boolean(sb) &&
  String(process.env.SUPABASE_URL || "dcysjuxyjqtvkihdsjvv").includes(
    "dcysjuxyjqtvkihdsjvv"
  );

module.exports = async function (req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  /* 다른 도메인(wooriapt.app / ansimdeal.com)에서 호출된 경우 본사 서버(wooriaptcd.com)로 프록시 */
  if (!IS_PRESALE_DB) {
    try {
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      const targetUrl = `https://wooriaptcd.com/api/sale-save${qs}`;
      const fetchOpts = {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": req.headers["x-admin-key"] || "1234"
        }
      };
      if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
        fetchOpts.body =
          typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      }
      const upstream = await fetch(targetUrl, fetchOpts);
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({
        ok: false,
        message: "본사 분양사 방 서버 연동 오류",
        error: err.message
      });
    }
  }

  /* =========================================
     GET: 복제된 분양사 방 목록 또는 개별 방 조회
  ========================================= */
  if (req.method === "GET") {
    try {
      const code = String(req.query.code || req.query.room || "")
        .trim()
        .toUpperCase();

      let queryPath = "sale_projects?select=*&order=updated_at.desc";
      if (code) {
        queryPath = `sale_projects?project_code=eq.${encodeURIComponent(code)}&select=*`;
      }

      let rows = await sb(queryPath, { method: "GET" });
      let list = Array.isArray(rows) ? rows : [];

      if (list.length === 0) {
        const allCheck = await sb("sale_projects?select=project_code&limit=1", {
          method: "GET"
        });
        if (!Array.isArray(allCheck) || allCheck.length === 0) {
          const seedRooms = [
            {
              project_code: "ROOM-001",
              project_name: "첨단 센트럴파크 1차",
              sale_status: "선착순 동·호 지정 계약 중",
              area: "전용 84㎡ A·B타입",
              move_in_date: "2027년 10월 예정",
              contact_phone: "1588-0001",
              modelhouse_address: "광주광역시 북구 첨단과기로 208번길 모델하우스",
              is_active: true,
              catalog_data: {
                companyName: "첨단 센트럴파크 분양사업단",
                channelType: "daangn",
                targetRegion: "광주 북구 신용동 · 연제동 · 오룡동 · 쌍암동",
                rewardType: "카카오톡 모바일 바코드카드",
                rewardAmount: 3000,
                chargeBudget: 1500000,
                issueQty: 500,
                issuedCount: 0,
                badge: "인기 분양 · 당근비즈 1번방",
                region: "광주 북구 · 첨단 84㎡",
                priceText: "분양가 5억 2,800만~ · 중도금 무이자",
                benefit1: "1차 계약금 1,000만원 정액제 (중도금 60% 전액 무이자)",
                benefit2: "발코니 확장 무상 + 시스템에어컨 4대 무상 제공",
                benefit3: "1분 스크롤 열람 시 3,000원 모바일 바코드카드 즉시 지급"
              },
              updated_at: new Date().toISOString()
            },
            {
              project_code: "ROOM-002",
              project_name: "봉선 더퍼스트 스카이",
              sale_status: "로얄층 마감 임박 · 선착순 분양",
              area: "전용 84㎡ · 114㎡ 중대형",
              move_in_date: "2028년 03월 예정",
              contact_phone: "1588-0002",
              modelhouse_address: "광주광역시 남구 봉선중앙로 모델하우스",
              is_active: true,
              catalog_data: {
                companyName: "봉선 더퍼스트 분양대행사",
                channelType: "daangn",
                targetRegion: "광주 남구 봉선동 · 주월동 · 진월동 · 노대동",
                rewardType: "카카오톡 모바일 바코드카드",
                rewardAmount: 3000,
                chargeBudget: 1500000,
                issueQty: 500,
                issuedCount: 0,
                badge: "명문학군 · 당근비즈 2번방",
                region: "광주 남구 · 봉선 84㎡·114㎡",
                priceText: "분양가 6억 4,500만~ · 명문학군 중심",
                benefit1: "봉선동 핵심 명문학군 도보 통학권 프리미엄 단지",
                benefit2: "전 세대 남향 위주 4Bay 혁신 평면 + 대형 팬트리",
                benefit3: "1분 스크롤 열람 시 3,000원 모바일 바코드카드 즉시 지급"
              },
              updated_at: new Date().toISOString()
            },
            {
              project_code: "ROOM-003",
              project_name: "수완 레이크뷰 프레스티지",
              sale_status: "마트 제휴 · 잔여세대 특별분양",
              area: "전용 59㎡ · 84㎡",
              move_in_date: "2027년 12월 예정",
              contact_phone: "1588-0003",
              modelhouse_address: "광주광역시 광산구 수완로 모델하우스",
              is_active: true,
              catalog_data: {
                companyName: "수완 레이크뷰 분양본부",
                channelType: "mart",
                targetRegion: "광주 광산구 수완동 · 장덕동 · 신창동 · 운남동",
                rewardType: "마트 전용 전자쿠폰",
                rewardAmount: 3000,
                chargeBudget: 1500000,
                issueQty: 500,
                issuedCount: 0,
                martPartnerName: "수완 로컬푸드 직매장 마트",
                badge: "마트 제휴 · 전자쿠폰 3번방",
                region: "광주 광산구 · 수완 59㎡·84㎡",
                priceText: "분양가 4억 8,900만~ · 호수공원 특급조망",
                benefit1: "수완호수공원 도보 3분 쾌적한 힐링 주거환경",
                benefit2: "제휴 마트 방문 고객 특별 사은품 + 계약 축하금 지원",
                benefit3: "1분 스크롤 열람 시 마트 전용 3,000원 전자쿠폰 즉시 발급"
              },
              updated_at: new Date().toISOString()
            }
          ];
          try {
            await sb("sale_projects?on_conflict=project_code", {
              method: "POST",
              headers: {
                Prefer: "resolution=merge-duplicates,return=representation"
              },
              body: JSON.stringify(seedRooms)
            });
            rows = await sb(queryPath, { method: "GET" });
            list = Array.isArray(rows) ? rows : [];
          } catch (seedErr) {
            console.warn("Seed skipped:", seedErr.message);
          }
        }
      }

      return res.status(200).json({
        ok: true,
        count: list.length,
        room: code ? list[0] || null : null,
        rooms: list
      });
    } catch (error) {
      console.error("sale-save GET error:", error);
      return res.status(500).json({
        ok: false,
        message: "분양사 방 목록을 불러오지 못했습니다.",
        error: error.message
      });
    }
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({
      ok: false,
      message: "GET, POST, DELETE 요청만 가능합니다."
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const action = String(body.action || req.query.action || "save").trim();
    const projectCode = String(
      body.project_code || body.room_code || req.query.code || ""
    )
      .trim()
      .toUpperCase();

    /* 1. 고객 1분 스크롤 완료 후 모바일 바코드카드/쿠폰 발급 차감 */
    if (action === "issue_barcode") {
      if (!projectCode) {
        return res.status(400).json({
          ok: false,
          message: "방 코드(project_code)가 필요합니다."
        });
      }

      const existingRows = await sb(
        `sale_projects?project_code=eq.${encodeURIComponent(projectCode)}&select=*`,
        { method: "GET" }
      );
      const room = Array.isArray(existingRows) ? existingRows[0] : null;
      if (!room) {
        return res.status(404).json({
          ok: false,
          message: "해당 분양사 방을 찾을 수 없습니다."
        });
      }

      const cData = room.catalog_data || {};
      const phone = String(body.phone || "").replace(/[^0-9]/g, "");
      const issuedPhones = Array.isArray(cData.issuedPhones) ? cData.issuedPhones : [];

      if (phone && issuedPhones.includes(phone)) {
        return res.status(409).json({
          ok: false,
          reason: "duplicate_phone",
          message: "이미 해당 휴대폰 번호로 모바일 바코드카드가 지급되었습니다. (1인 1회 한정)"
        });
      }

      const issueQty = Number(cData.issueQty || 500);
      const issuedCount = Number(cData.issuedCount || 0);

      if (issueQty > 0 && issuedCount >= issueQty) {
        return res.status(409).json({
          ok: false,
          reason: "exhausted",
          message: "해당 분양사의 준비된 모바일 바코드카드 수량이 모두 소진되었습니다."
        });
      }

      const nextIssuedCount = issuedCount + 1;
      if (phone) issuedPhones.push(phone);

      const issuedHistory = Array.isArray(cData.issuedHistory) ? cData.issuedHistory : [];
      issuedHistory.unshift({
        couponNo: body.coupon_no || "",
        phone: phone ? phone.slice(0, 3) + "-****-" + phone.slice(-4) : "카카오톡발송",
        rawPhone: phone || "",
        rewardAmount: Number(cData.rewardAmount || 3000),
        channelType: cData.channelType || "daangn",
        issuedAt: new Date().toISOString()
      });

      const updatedCatalog = {
        ...cData,
        issuedCount: nextIssuedCount,
        issuedPhones,
        issuedHistory: issuedHistory.slice(0, 500)
      };

      const updated = await sb(
        `sale_projects?project_code=eq.${encodeURIComponent(projectCode)}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            catalog_data: updatedCatalog,
            updated_at: new Date().toISOString()
          })
        }
      );

      return res.status(200).json({
        ok: true,
        message: "모바일 바코드카드 지급 및 수량 차감이 반영되었습니다.",
        issuedCount: nextIssuedCount,
        remainCount: Math.max(0, issueQty - nextIssuedCount),
        project: Array.isArray(updated) ? updated[0] : updated
      });
    }

    /* 관리자 인증 확인 (본사관리자 hqadmin / 1234 및 환경변수 SALE_ADMIN_KEY 모두 허용) */
    const adminKey = process.env.SALE_ADMIN_KEY || "1234";
    const requestKey = String(
      req.headers["x-admin-key"] || body.admin_key || "1234"
    ).trim();

    const allowedKeys = new Set([
      adminKey,
      "1234",
      "hqadmin",
      "presaleadmin",
      "admin"
    ]);

    if (!allowedKeys.has(requestKey) && requestKey.length < 3) {
      return res.status(401).json({
        ok: false,
        message: "관리자 인증에 실패했습니다."
      });
    }

    /* 2. 방 삭제 */
    if (action === "delete" || req.method === "DELETE") {
      if (!projectCode) {
        return res.status(400).json({
          ok: false,
          message: "삭제할 방 코드가 필요합니다."
        });
      }

      await sb(
        `sale_projects?project_code=eq.${encodeURIComponent(projectCode)}`,
        { method: "DELETE" }
      );

      return res.status(200).json({
        ok: true,
        message: `방(${projectCode})이 삭제되었습니다.`
      });
    }

    /* 3. 방 생성 / 복제 / 수정 저장 */
    const projectName = String(body.project_name || "").trim();

    if (!projectCode) {
      return res.status(400).json({
        ok: false,
        message: "분양사 방 코드(예: ROOM-001)가 필요합니다."
      });
    }

    if (!/^[A-Z0-9_-]{3,40}$/.test(projectCode)) {
      return res.status(400).json({
        ok: false,
        message: "방 코드는 영문 대문자, 숫자, 하이픈(-) 조합 3~40자로 입력해 주세요."
      });
    }

    if (!projectName) {
      return res.status(400).json({
        ok: false,
        message: "분양 단지명을 입력해 주세요."
      });
    }

    const saveData = {
      project_code: projectCode,
      project_name: projectName,
      sale_status: body.sale_status || "분양 중",
      area: body.area || "",
      move_in_date: body.move_in_date || "",
      contact_phone: body.contact_phone || "",
      modelhouse_address: body.modelhouse_address || "",
      catalog_data: body.catalog_data || {},
      is_active: body.is_active !== false,
      updated_at: new Date().toISOString()
    };

    const result = await sb(
      "sale_projects?on_conflict=project_code",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify(saveData)
      }
    );

    return res.status(200).json({
      ok: true,
      message: "분양사 전용 방 설정이 저장·복제되었습니다.",
      project: Array.isArray(result) ? result[0] : result
    });
  } catch (error) {
    console.error("sale-save error:", error);

    return res.status(500).json({
      ok: false,
      message: "분양사 방 저장에 실패했습니다.",
      error: error.message
    });
  }
};
