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

  const { subject, day, count, topicHint, todayTopic } = req.body || {};
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const today = new Date().toISOString().split('T')[0];
  const numQ = count || 5;
  const dayNum = day || 1;

  // Progressive difficulty based on day
  const level = dayNum <= 7 ? '完全初學者（第一週）' :
                dayNum <= 14 ? '初學者（第二週）' :
                dayNum <= 21 ? '初中級（第三週）' :
                dayNum <= 45 ? '中級（第四〜六週）' : '中高級（七週以上）';

  const configs = {
    aml:  { name: 'AML反洗錢',  topics: 'KYC,CDD,EDD,STR,PEP,Structuring,FATF,Sanctions,TBML,Beneficial Owner,Shell Company', bilingual: true },
    web3: { name: 'Web3 AML',   topics: 'VASP,Travel Rule,Mixer,DeFi,On-chain,OFAC,NFT洗錢,Cross-chain Bridge,Chainalysis,Address Clustering', bilingual: true },
    jp:   { name: '日文N4',     topics: 'N4文法,助詞,動詞活用,て形,た形,條件句,敬語,重要句型,N4詞彙', bilingual: false }
  };

  const cfg = configs[subject] || configs.aml;
  const bi = cfg.bilingual;
  const topicNote = todayTopic ? `今日學習主題是：${todayTopic}。請出與此主題相關的題目。` : '';
  const avoidNote = topicHint && topicHint.length > 0 ? `請避免重複這些已出過的主題：${topicHint}。` : '';

  const prompt = `你是${cfg.name}出題老師。日期${today}，學習第${dayNum}天，程度：${level}。
${topicNote}
${avoidNote}
生成${numQ}題選擇題，主題範圍：${cfg.topics}。
難度要求：
- 第1-7天：基本定義和概念，題目簡單直接
- 第8-21天：概念應用，加入情境
- 第22天以上：複雜情境題，考驗綜合判斷
${bi ? '題目和選項中英雙語，格式「中文/English」。解析附key terms。' : '題目全中文。'}
每題解析限30字，選項限10字。
只回傳JSON不加任何說明：
{"questions":[{"id":1,"subject":"${subject}","question_zh":"","question_en":"","options":[{"letter":"A","zh":"","en":""},{"letter":"B","zh":"","en":""},{"letter":"C","zh":"","en":""},{"letter":"D","zh":"","en":""}],"correct":"A","explanation_zh":"","key_terms":""}]}`;

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
    if (start === -1 || end === -1) throw new Error('回傳格式錯誤，請重試');
    const parsed = JSON.parse(text.slice(start, end + 1));
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
