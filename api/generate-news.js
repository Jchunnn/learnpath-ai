import https from 'node:https';

function httpsPost(url, data, headers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const today = new Date().toISOString().split('T')[0];

  const prompt = `今天是 ${today}。你是 Web3 和 AML 領域資深分析師。
整理今日最重要的 8 條業界新聞，涵蓋 Web3、DeFi、加密貨幣、AML法規、監管動態。
每條使用以下來源之一：鏈捕手(https://www.chaincatcher.com)、Decrypt(https://decrypt.co)、CoinDesk(https://www.coindesk.com)、The Block(https://www.theblock.co)、FATF(https://www.fatf-gafi.org)、金管會(https://www.fsc.gov.tw)。
每條摘要限60字，啟示限30字。
只回傳JSON不加說明：
{"news":[{"id":1,"category":"web3","importance":"high","title":"標題","summary":"摘要","insight":"學習啟示","keywords":"kw1,kw2","source":"來源","url":"https://連結"}]}`;

  try {
    const result = await httpsPost(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-haiku-4-5-20251001', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] },
      { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    );

    const data = JSON.parse(result.body);
    if (result.status !== 200) return res.status(result.status).json({ error: data.error?.message || 'API error' });

    const text = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('回傳格式錯誤');
    const parsed = JSON.parse(text.slice(start, end + 1));
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
