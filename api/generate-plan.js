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

  const { day } = req.body || {};
  const dayNum = parseInt(day) || 1;
  const today = new Date().toISOString().split('T')[0];

  // 根據天數決定難度和主題
  const level = dayNum <= 7 ? '初學者入門' : dayNum <= 14 ? '基礎鞏固' : dayNum <= 30 ? '中級進階' : dayNum <= 60 ? '高級深化' : '專業精通';
  const amlPhase = dayNum <= 7 ? 'AML基礎概念（洗錢定義、三階段、KYC）'
    : dayNum <= 14 ? 'CDD/EDD/PEP/STR申報'
    : dayNum <= 21 ? '制裁法規（OFAC/SDN）、風險評估'
    : dayNum <= 30 ? 'FATF建議40條、各國法規比較'
    : dayNum <= 45 ? '金融犯罪偵測、可疑行為模式'
    : dayNum <= 60 ? 'AML專業認證考題（CAMS）'
    : 'Web3 AML整合應用';
  const web3Phase = dayNum <= 7 ? '區塊鏈基礎、交易結構'
    : dayNum <= 14 ? 'DeFi協議、Mixer、跨鏈橋風險'
    : dayNum <= 21 ? 'VASP法規、FATF Travel Rule'
    : dayNum <= 30 ? '鏈上分析工具（Chainalysis/Elliptic）'
    : dayNum <= 45 ? 'NFT洗錢、DEX風險、OFAC制裁案例'
    : dayNum <= 60 ? 'MiCA法規、各國VASP合規要求'
    : '進階鏈上調查技術';
  const jpPhase = dayNum <= 7 ? 'N4文法基礎（て形、た形、ない形）'
    : dayNum <= 14 ? 'N4重要句型（〜てから、〜ながら、〜たら）'
    : dayNum <= 21 ? 'N4語法（〜てもいい、〜なければならない、〜はずだ）'
    : dayNum <= 30 ? 'N4詞彙（金融商業相關）'
    : dayNum <= 45 ? 'N4聽解＋讀解練習'
    : dayNum <= 60 ? 'N4模擬試題'
    : 'N3入門準備';

  const prompt = `你是一位專業的學習規劃師。今天是第 ${dayNum} 天（${today}），難度等級：${level}。

請為以下三個模組各生成今日學習任務（3個任務/模組），並生成詳細學習內容：

AML模組主題：${amlPhase}
Web3模組主題：${web3Phase}
日文模組主題：${jpPhase}

要求：
- 每個任務有標題、說明、預計時間（分鐘）
- 每個模組提供詳細學習內容（400字以內），格式清楚，含重點概念、例子、關鍵術語
- AML和Web3學習內容要有中英對照術語
- 日文學習內容要有例句和解析
- 學習內容每天都要不同，今天日期 ${today} 作為種子

只回傳JSON：
{
  "theme": {"aml":"AML今日主題","web3":"Web3今日主題","jp":"日文今日主題"},
  "modules": [
    {
      "subject": "aml",
      "title": "AML 模組",
      "duration": 55,
      "level": "中級",
      "tasks": [
        {"title":"任務標題","meta":"說明","time":15}
      ],
      "content": {
        "title": "學習主題標題",
        "body": "詳細學習內容（HTML格式，可用<strong>、<br>、<ul><li>）"
      }
    }
  ]
}`;

  try {
    const result = await httpsPost(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-haiku-4-5-20251001', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] },
      { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
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
