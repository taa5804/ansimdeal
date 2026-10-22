export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: '허용되지 않은 요청입니다.' });
  }

  try {
    const upstreamRes = await fetch('https://www.wooriapt.app/api/property-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
    });
    const data = await upstreamRes.json();
    return res.status(upstreamRes.status).json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, message: '서버 연동 오류: ' + err.message });
  }
}
