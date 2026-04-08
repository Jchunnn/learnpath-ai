export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subject, day, count } = req.body || {};
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const today = new Date().toISOString().split('T')[0];
  const numQ = count || 5;
  const dayNum = day || 1;
  const level = dayNum <= 7 ? '初學者' : dayNum <= 30 ? '初中級' : '中級';

  const configs = {
    aml:  { name: 'AML反洗錢',  topics: 'KYC,CDD,EDD,STR,PEP,Structuring,FATF,Sanctions', bilingual: true },
    web3: { name: 'Web3 AML',   topics: 'VASP,Travel Rule,Mixer,DeFi,On-chain,OFAC',         bilingual: true },
    jp:   { name: '日文N4',      topics: 'N4文法,助詞,動詞活用,て形,た形,詞彙',               bilingual: false }
  };

  const cfg = configs[subject] || configs.aml;
  const bi = cfg.bilingual;

  const prompt = `你是${cfg.name}出題老師。日期${today}，第${dayNum}天，${level}程度。
生成${numQ}題選擇題，主題：${cfg.topics}。
${bi ? '題目和選項中英雙語，格式「中文/English」。解析附key terms。' : '題目全中文。'}
每題解析限25字，選項限8字。
只回傳JSON不加任何說明：
{"questions":[{"id":1,"subject":"${subject}","question_zh":"","question_en":"","options":[{"letter":"A","zh":"","en":""},{"letter":"B","zh":"","en":""},{"letter":"C","zh":"","en":""},{"letter":"D","zh":"","en":""}],"correct":"A","explanation_zh":"","key_terms":""}]}`;

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
    if (start === -1 || end === -1) throw new Error('回傳格式錯誤，請重試');
    const parsed = JSON.parse(text.slice(start, end + 1));
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
