export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const today = new Date().toISOString().split('T')[0];

  const prompt = `今天是 ${today}。你是一位 Web3 和 AML 領域的資深分析師。

請整理今日最重要的 8 條業界新聞，涵蓋：
- Web3 / DeFi / 加密貨幣最新動態（參考 Decrypt、CoinDesk、The Block、鏈捕手）
- AML / 反洗錢法規更新（參考 FATF、各國金融監管機構）
- 加密貨幣監管動態（OFAC制裁、VASP法規、MiCA等）

每條新聞要包含：
- 標題（繁體中文，20字以內）
- 類別：web3 / aml / crypto 三選一
- 重要程度：high / medium / low
- 摘要（繁體中文，60字以內）
- 對AML學習者的啟示（30字以內）
- 英文關鍵字（3個）

只回傳JSON不加說明：
{"news":[{"id":1,"category":"web3","importance":"high","title":"標題","summary":"摘要","insight":"學習啟示","keywords":"kw1, kw2, kw3","source":"來源名稱"}]}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API error' });

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
