import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { checkPremium, incrementUsage } from '@/lib/premium';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

// ============================================
// 🌍 AUTO SPRACHERKENNUNG
// ============================================
export type Lang = 'de' | 'ti' | 'am' | 'en' | 'code';

function detectLanguage(text: string): Lang {
  if (!text) return 'de';
  
  const lowerText = text.toLowerCase();
  
  // 🔥 NEU: Programmier-Erkennung (Code-Fragen)
  const codeKeywords = [
    'function', 'const', 'let', 'var', 'import', 'export', 'return',
    'if', 'else', 'for', 'while', 'map', 'filter', 'reduce',
    'react', 'next.js', 'typescript', 'javascript', 'python',
    'api', 'fetch', 'async', 'await', 'useState', 'useEffect',
    'tailwind', 'css', 'html', 'div', 'className', 'onClick'
  ];
  
  if (codeKeywords.some(keyword => lowerText.includes(keyword))) {
    return 'code';
  }
  
  // 1. Ethiopic Script (Tigrinya + Amharic)
  if (/[\u1200-\u137F]/.test(text)) {
    if (text.includes('እ') || text.includes('ነ') || text.includes('አ')) {
      return 'am';
    }
    return 'ti';
  }
  
  // 2. Tigrinya in lateinischer Umschrift
  const tigrinyaLatin = [
    'kemey', 'aleka', 'dehan', 'dehando', 'salam', 'selam',
    'xubok', 'niska', 'emo', 'hawy', 'hawye', 'tigrinya', 'tigrigna',
    'eritrean', 'eritrea', 'habesha', 'abey', 'tsibuk', 'aykonen'
  ];
  
  if (tigrinyaLatin.some(word => lowerText.includes(word))) {
    return 'ti';
  }
  
  // 3. Englisch
  if (/\b(the|and|what|how|why|hello|please|thanks|translate|what is|how are you)\b/i.test(text)) {
    return 'en';
  }
  
  // 4. Deutsch
  if (/\b(wie|was|warum|hallo|bitte|danke|übersetze|was heißt|erkläre|wie geht es dir)\b/i.test(text)) {
    return 'de';
  }
  
  return 'de';
}

// ============================================
// 🔍 INTENT ERKENNUNG
// ============================================
function detectIntent(message: string): 'translation' | 'definition' | 'conversation' | 'code' {
  const msg = message.toLowerCase();

  // Code-Fragen
  if (msg.includes('code') || msg.includes('programm') || msg.includes('function') || 
      msg.includes('react') || msg.includes('javascript') || msg.includes('python')) {
    return 'code';
  }

  // Deutsch
  if (msg.includes('wie sagt man') || msg.includes('übersetze') || msg.includes('was heißt')) {
    return 'translation';
  }
  // Englisch
  if (msg.includes('translate') || msg.includes('what is') || msg.includes('how do you say')) {
    return 'translation';
  }
  // Tigrinya
  if (msg.includes('kemey') || msg.includes('xubok') || msg.includes('dehan')) {
    return 'translation';
  }
  if (msg.includes('ከመይ') || msg.includes('ምን') || msg.includes('እንታይ')) {
    return 'translation';
  }

  if (msg.includes('erkläre') || msg.includes('was bedeutet') || 
      msg.includes('explain') || msg.includes('what means')) {
    return 'definition';
  }

  return 'conversation';
}

// ============================================
// 🔎 SUPABASE SUCHE (VERBESSERT)
// ============================================
async function searchSupabase(supabase: any, message: string) {
  const clean = message.toLowerCase().replace(/[.,!?;:()]/g, '');
  const words = clean.split(/\s+/).filter(w => w.length > 2);

  let woerterbuch: any[] = [];
  let saetze: any[] = [];

  if (words.length > 0) {
    const filters = words.map(w => `german.ilike.%${w}%,tigrinya_word.ilike.%${w}%`).join(',');

    const { data: woerter } = await supabase
      .from('dictionary')
      .select('tigrinya_word, german')
      .or(filters)
      .limit(10);

    woerterbuch = woerter || [];
  }

  const { data: training } = await supabase
    .from('training_data')
    .select('input_text, response_text')
    .or(`input_text.ilike.%${message}%,response_text.ilike.%${message}%`)
    .limit(5);

  saetze = training || [];

  return { woerterbuch, saetze };
}

// ============================================
// 🧠 SICHERES AUTO-LEARNING
// ============================================
async function autoLearnSafe(supabase: any, question: string, answer: string) {
  try {
    const forbiddenPatterns = [
      'manday', 'mondai', 'monday',
      'ኣይፈልጥን', 'weiß ich nicht', 'ich weiß nicht',
      'I don\'t know', 'no idea', 'not sure'
    ];
    
    const lowerAnswer = answer.toLowerCase();
    const hasForbidden = forbiddenPatterns.some(pattern => lowerAnswer.includes(pattern));
    
    if (!answer || hasForbidden || answer.length > 200 || answer.length < 3) {
      return;
    }

    const { data: existing } = await supabase
      .from('training_data')
      .select('id')
      .eq('input_text', question)
      .maybeSingle();

    if (!existing) {
      await supabase.from('training_data').insert({
        input_text: question,
        response_text: answer,
        source: 'ai_safe',
        created_at: new Date(),
      });
      console.log('✅ Sicher gelernt:', question);
    }
  } catch (e) {
    console.log('Auto-Learn Fehler:', e);
  }
}

// ============================================
// 🤖 KI MIT FALLBACK (Hybrid-Intelligenz)
// ============================================
async function askAI(messages: any[], userLang: Lang, woerterbuch: any[], temperature = 0.3): Promise<string> {
  // 🔥 HYBRID: Bei Programmierung oder Deutsch/Englisch: Freie KI
  if (userLang === 'code' || userLang === 'de' || userLang === 'en') {
    console.log('🚀 FREIER MODUS für:', userLang);
    try {
      const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 500,
        temperature: 0.7,
      });
      const text = res.choices?.[0]?.message?.content ?? '';
      if (text.trim()) return text;
    } catch (e) {
      console.log('Groq Fehler → DeepSeek');
    }
    
    try {
      const res = await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        messages,
        max_tokens: 500,
        temperature: 0.7,
      });
      return res.choices?.[0]?.message?.content ?? '';
    } catch (e) {
      console.log('DeepSeek Fehler');
    }
    return '';
  }
  
  // 🔥 STRENGER MODUS für Tigrinya/Amharic (nur Wörterbuch)
  console.log('🔒 STRENGER MODUS für:', userLang);
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 200,
      temperature: 0.2, // Sehr niedrig für präzise Antworten
    });
    const text = res.choices?.[0]?.message?.content ?? '';
    if (text.trim()) return text;
  } catch (e) {
    console.log('Groq Fehler → DeepSeek');
  }
  
  try {
    const res = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      max_tokens: 200,
      temperature: 0.2,
    });
    return res.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    console.log('DeepSeek Fehler');
  }
  
  return '';
}

// ============================================
// 🚀 MAIN ROUTE
// ============================================
export async function POST(req: Request) {
  try {
    const { message, history = [], userId, forcedLang } = await req.json();

    const supabase = await createClient();

    if (userId) {
      const { isPremium, remaining } = await checkPremium(userId);
      if (!isPremium && remaining <= 0) {
        return NextResponse.json({
          response: `💎 Limit erreicht. Upgrade für unbegrenzt.`,
        });
      }
    }

    let responseText = '';
    let usedSupabase = false;

    const { woerterbuch, saetze } = await searchSupabase(supabase, message);

    // ============================================
    // 🌍 AUTO SPRACHE ERKENNEN
    // ============================================
    const validLangs: Lang[] = ['de', 'ti', 'am', 'en', 'code'];
    const userLang: Lang = validLangs.includes(forcedLang) ? (forcedLang as Lang) : detectLanguage(message);
    
    const langMap: Record<Lang, string> = {
      de: 'German',
      en: 'English',
      ti: 'Tigrinya',
      am: 'Amharic',
      code: 'Programming',
    };

    const intent = detectIntent(message);

    // ============================================
    // 🧠 DYNAMISCHER SYSTEM PROMPT
    // ============================================
    let systemPrompt = '';

    if (userLang === 'code') {
      // 🔥 FREIER MODUS: KI kann ihr volles Potenzial zeigen
      systemPrompt = `
You are a world-class programming assistant. Help with code, debugging, and technical questions.

⚠️ RULES:
- Answer in ${langMap[userLang]}
- Provide clear, working code examples
- Explain complex concepts simply
- Be concise and helpful

Intent: ${intent}
`;
    } else if (userLang === 'ti' || userLang === 'am') {
      // 🔒 STRENGER MODUS: Nur Wörterbuch, keine Erfindungen
      systemPrompt = `
You are a professional Tigrinya translator. 

⚠️ CRITICAL RULES:
- Use ONLY authentic Tigrinya words from the Dictionary below.
- NEVER invent words or use English-sounding inventions like "Manday" for Monday.
- Monday is ALWAYS "ሰኑይ".
- If the word is not in the Dictionary, say "Das weiß ich noch nicht."
- Keep answers short (max 2 sentences).

User language: ${langMap[userLang]}

📚 Dictionary (MUST USE):
${woerterbuch.map(w => `- ${w.tigrinya_word} = ${w.german}`).join('\n')}

📖 Training examples:
${saetze.map(s => `- "${s.input_text}" → "${s.response_text}"`).join('\n')}
`;
    } else {
      // 🔥 FREIER MODUS für Deutsch/Englisch
      systemPrompt = `
You are a helpful multilingual AI assistant.

⚠️ RULES:
- Answer in ${langMap[userLang]}
- Be helpful and accurate
- Keep answers concise
- No language mixing

Intent: ${intent}
`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6),
      { role: 'user', content: message },
    ];

    responseText = await askAI(messages, userLang, woerterbuch, userLang === 'ti' ? 0.2 : 0.7);

    if (woerterbuch.length > 0 || saetze.length > 0) {
      usedSupabase = true;
    }

    if (!responseText) {
      if (userLang === 'ti') {
        responseText = 'ኣይፈልጥን — Das weiß ich noch nicht.';
      } else if (userLang === 'am') {
        responseText = 'አላውቅም — እስካሁን አልማርኩም።';
      } else if (userLang === 'code') {
        responseText = 'I need more details to help with your code question.';
      } else {
        responseText = 'I don\'t know that yet — still learning.';
      }
    }

    await autoLearnSafe(supabase, message, responseText);

    if (userId) {
      const { isPremium } = await checkPremium(userId);
      if (!isPremium) await incrementUsage(userId, false);
    }

    return NextResponse.json({
      response: responseText,
      detectedLang: userLang,
      source: usedSupabase ? 'supabase+ai' : 'ai',
    });

  } catch (error) {
    console.error('API Fehler:', error);

    return NextResponse.json({
      response: 'Fehler, bitte später versuchen.',
    });
  }
}