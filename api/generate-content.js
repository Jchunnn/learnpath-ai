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

  const { topic, subject, dayNum } = req.body || {};
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });
  if (!topic) return res.status(400).json({ error: 'topic is required' });

  const subjectName = subject === 'aml' ? 'AML反洗錢' : subject === 'web3' ? 'Web3區塊鏈' : '日文N4';
  const level = dayNum <= 7 ? '初學者' : dayNum <= 14 ? '初中級' : dayNum <= 30 ? '中級' : '中高級';

  const prompt = `你是${subjectName}學習教材編寫專家。
學習者目前第${dayNum || 1}天，程度：${level}。
今日學習主題：「${topic}」

請用繁體中文撰寫這個主題的學習內容，格式要求：
1. 開頭用一句話說明這個主題為什麼重要（放在藍色提示框）
2. 3-4個重點小節，每節有標題和2-5個要點
3. 重要術語清單（中英對照）
4. 結尾一個「AML學習啟示」（如果是Web3或AML主題）

只回傳JSON，格式如下：
{
  "title": "主題標題",
  "intro": "一句話說明重要性",
  "sections": [
    { "title": "小節標題", "points": ["要點1", "要點2"] }
  ],
  "terms": [{"zh": "中文", "en": "English"}],
  "tip": "AML學習啟示（可為空字串）"
}`;

  try {
    const result = await httpsPost(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      },
      {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    );

    const data = JSON.parse(result.body);
    if (result.status !== 200) return res.status(result.status).json({ error: data.error?.message || 'API error' });

    const text = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('格式錯誤');
    const parsed = JSON.parse(text.slice(start, end + 1));
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
