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
  const dayNum = parseInt(day) || 1;

  // 難度依天數遞進
  const level = dayNum <= 7  ? '完全初學者（第一週）：基本定義，題目簡單直接' :
                dayNum <= 14 ? '初學者（第二週）：概念理解，加入簡單情境' :
                dayNum <= 21 ? '初中級（第三週）：概念應用，情境判斷' :
                dayNum <= 45 ? '中級（第四至六週）：複雜情境，綜合判斷' :
                               '中高級（七週以上）：高難度情境，監管細節，跨領域整合';

  const configs = {
    aml: {
      name: 'AML 反洗錢',
      topics: dayNum <= 7  ? 'KYC基礎,洗錢三階段,CDD,STR基本概念' :
              dayNum <= 14 ? 'EDD,PEP,FATF基礎,Structuring,CTR' :
              dayNum <= 21 ? 'Beneficial Owner,Shell Company,TBML,制裁名單OFAC' :
              dayNum <= 45 ? 'STR情境分析,AML程序設計,風險評估,監控系統' :
                             'AML合規架構,跨境洗錢,複雜案例,監管趨勢',
      bilingual: true
    },
    web3: {
      name: 'Web3 AML',
      topics: dayNum <= 7  ? '區塊鏈基礎,比特幣交易,加密貨幣基本概念' :
              dayNum <= 14 ? 'DeFi基礎,DEX,Mixer混幣器基本概念' :
              dayNum <= 21 ? 'VASP定義,Tornado Cash,跨鏈橋風險,NFT洗錢' :
              dayNum <= 45 ? 'FATF Travel Rule,地址聚類,Chainalysis工具,OFAC制裁' :
                             'MiCA法規,鏈上取證,複雜DeFi案例,監管框架',
      bilingual: true
    },
    jp: {
      name: '日文 N4',
      topics: dayNum <= 7  ? '50音,基本問候,數字,簡單名詞' :
              dayNum <= 14 ? '動詞て形,〜てから,〜たあとで,時間表達' :
              dayNum <= 21 ? '〜ながら,〜まえに,〜ために,助詞は/が/を' :
              dayNum <= 45 ? '〜てもいい,〜なければならない,条件句たら/ば,敬語基礎' :
                             'N4文法綜合,複雜助詞,慣用語,閱讀理解',
      bilingual: false
    }
  };

  const cfg = configs[subject] || configs.aml;
  const bi = cfg.bilingual;
  const topicNote = todayTopic ? `今日學習主題：${todayTopic}。請優先出與此主題相關的題目。` : '';
  const avoidNote = topicHint ? `請勿重複出過的主題：${topicHint}。` : '';

  const prompt = `你是${cfg.name}專業出題老師。
日期：${today}，學習第${dayNum}天。
程度要求：${level}
主題範圍：${cfg.topics}
${topicNote}
${avoidNote}

生成${numQ}題，必須符合今天的程度，不能太簡單也不能跳級。
${bi ? '題目和選項中英雙語，格式「中文/English」。解析末尾附Key terms（英文術語）。' : '題目全中文。'}
每題解析限30字，選項限10字。

只回傳JSON，不加任何說明：
{"questions":[{"id":1,"subject":"${subject}","question_zh":"","question_en":"","options":[{"letter":"A","zh":"","en":""},{"letter":"B","zh":"","en":""},{"letter":"C","zh":"","en":""},{"letter":"D","zh":"","en":""}],"correct":"A","explanation_zh":"","key_terms":""}]}`;

  try {
    const result = await httpsPost(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      },
      {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    );

    const data = JSON.parse(result.body);
    if (result.status !== 200) {
      return res.status(result.status).json({ error: data.error?.message || 'API error' });
    }

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
