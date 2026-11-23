const crypto = require("crypto");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  const requestId = req.query.requestId || "RSLA-1795398295858-3419-78007522-aRmAsJOK";
  const accessKey = process.env.NCP_ACCESS_KEY;
  const secretKey = process.env.NCP_SECRET_KEY;
  const serviceId = "ncp:sms:kr:376942048120:ansimtrade-sms";

  if (!accessKey || !secretKey) {
    return res.status(500).json({ ok: false, message: "NCP API keys missing" });
  }

  const timestamp = Date.now().toString();
  const method = "GET";
  const uri = `/sms/v2/services/${serviceId}/messages?requestId=${requestId}`;
  const signatureMessage = method + " " + uri + "\n" + timestamp + "\n" + accessKey;
  const signature = crypto.createHmac("sha256", secretKey).update(signatureMessage).digest("base64");

  try {
    const response = await fetch(`https://sens.apigw.ntruss.com${uri}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "x-ncp-apigw-timestamp": timestamp,
        "x-ncp-iam-access-key": accessKey,
        "x-ncp-apigw-signature-v2": signature
      }
    });
    const data = await response.json();
    return res.status(200).json({ ok: true, status: response.status, data: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
