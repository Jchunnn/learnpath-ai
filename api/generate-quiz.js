export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subject, day, count } = req.body || {};
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const subjectPrompts = {
    aml: {
      zh: 'AML（反洗錢）',
      topics: 'KYC, CDD, EDD, STR, CTR, FATF, PEP, Structuring, Layering, Placement, Integration, Sanctions, Risk-based approach, Beneficial ownership, Shell companies',
      count: count || 10
    },
    web3: {
      zh: 'Web3 AML（虛擬資產反洗錢）',
      topics: 'VASP, FATF Travel Rule, Mixer, Tornado Cash, DeFi, On-chain analysis, Address clustering, Chainalysis, Elliptic, OFAC sanctions, NFT money laundering, Cross-chain bridge, DEX, Smart contract risks',
      count: count || 8
    },
    jp: {
      zh: '日文 JLPT N4',
      topics: '假名（ひらがな・カタカナ）, 基礎文法（て形・た形・ない形）, N4 重要文法（〜てから・〜たあとで・〜ながら・〜てもいい・〜なければならない）, N4 詞彙, 助詞用法, 動詞活用, 敬語基礎',
      count: count || 7
    }
  };

  const s = subjectPrompts[subject] || subjectPrompts.aml;
  const today = new Date().toISOString().split('T')[0];

  const prompt = `你是一位專業的 ${s.zh} 出題老師。
今天日期：${today}，學習第 ${day || 1} 天。
請生成 ${s.count} 道練習題，涵蓋主題：${s.topics}

要求：
${subject !== 'jp' ? `- 題目用中文提問，同時附上英文翻譯（中英雙語）
- 選項也要中英對照，格式：「中文 / English」
- 解析最後附 Key terms（英文術語列表）` : '- 題目全中文，日文字用括號標注讀音'}
- 題型混合：選擇題、情境題
- 難度符合第 ${day || 1} 天學習者（${day <= 7 ? '初學者基礎' : day <= 30 ? '初中級' : '中級進階'}）
- 每天題目不重複，今天日期 ${today} 作為隨機種子
- 解析文字控制在 60 字以內，key_terms 最多 4 個
- 選項的 zh 和 en 各控制在 15 字以內，保持簡潔

請嚴格只回傳 JSON，不要有任何其他文字、不要加 markdown 符號，格式如下：
{
  "questions": [
    {
      "id": 1,
      "subject": "${subject}",
      "type": "mcq",
      "question_zh": "中文題目",
      "question_en": "English question（${subject === 'jp' ? '留空字串' : '英文翻譯'}）",
      "options": [
        { "letter": "A", "zh": "選項A中文", "en": "Option A English" },
        { "letter": "B", "zh": "選項B中文", "en": "Option B English" },
        { "letter": "C", "zh": "選項C中文", "en": "Option C English" },
        { "letter": "D", "zh": "選項D中文", "en": "Option D English" }
      ],
      "correct": "B",
      "explanation_zh": "中文解析",
      "key_terms": "term1 · term2 · term3"
    }
  ]
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 16000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
