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
export type Lang = 'de' | 'ti' | 'am' | 'en';

function detectLanguage(text: string): Lang {
  if (!text) return 'de';

  // Ethiopic Script (Tigrinya + Amharic)
  if (/[\u1200-\u137F]/.test(text)) {
    // Heuristische Unterscheidung
    if (text.includes('እ') || text.includes('ነ') || text.includes('አ')) {
      return 'am'; // Amharic
    }
    return 'ti'; // Tigrinya
  }

  // Englisch
  if (/\b(the|and|what|how|why|hello|please|thanks|translate|what is)\b/i.test(text)) {
    return 'en';
  }

  // Deutsch
  if (/\b(wie|was|warum|hallo|bitte|danke|übersetze|was heißt|erkläre)\b/i.test(text)) {
    return 'de';
  }

  return 'de';
}

// ============================================
// 🔍 INTENT ERKENNUNG (MEHRSPRACHIG)
// ============================================
function detectIntent(message: string): 'translation' | 'definition' | 'conversation' {
  const msg = message.toLowerCase();

  // Deutsch
  if (msg.includes('wie sagt man') || msg.includes('übersetze') || msg.includes('was heißt')) {
    return 'translation';
  }
  // Englisch
  if (msg.includes('translate') || msg.includes('what is') || msg.includes('how do you say')) {
    return 'translation';
  }
  // Tigrinya/Amharic
  if (msg.includes('ከመይ') || msg.includes('ምን') || msg.includes('እንታይ')) {
    return 'translation';
  }

  if (msg.includes('erkläre') || msg.includes('was bedeutet') || msg.includes('explain') || msg.includes('what means')) {
    return 'definition';
  }

  return 'conversation';
}

// ============================================
// 🔎 SUPABASE SUCHE
// ============================================
async function searchSupabase(supabase: any, message: string) {
  const clean = message.toLowerCase().replace(/[.,!?;:()]/g, '');
  const words = clean.split(/\s+/).filter(w => w.length > 2);

  let woerterbuch: any[] = [];
  let saetze: any[] = [];

  if (words.length > 0) {
    const filters = words.map(w => `german.ilike.%${w}%`).join(',');

    const { data: woerter } = await supabase
      .from('dictionary')
      .select('tigrinya_word, german')
      .or(filters)
      .limit(6);

    woerterbuch = woerter || [];
  }

  const { data: training } = await supabase
    .from('training_data')
    .select('input_text, response_text')
    .ilike('input_text', `%${message}%`)
    .limit(3);

  saetze = training || [];

  return { woerterbuch, saetze };
}

// ============================================
// 🧠 SICHERES AUTO-LEARNING
// ============================================
async function autoLearnSafe(supabase: any, question: string, answer: string) {
  try {
    if (
      !answer ||
      answer.includes('ኣይፈልጥን') ||
      answer.toLowerCase().includes('weiß ich nicht') ||
      answer.length > 200
    ) {
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
// 🤖 AI REQUEST (MIT FALLBACK)
// ============================================
async function askAI(messages: any[], temperature = 0.3): Promise<string> {
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 200,
      temperature,
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
      temperature,
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

    // 🔥 SUPABASE CLIENT ERSTELLEN
    const supabase = await createClient();

    // 💎 Premium Check
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

    // 🔥 SUPABASE SUCHE MIT CLIENT
    const { woerterbuch, saetze } = await searchSupabase(supabase, message);

    // ============================================
    // 🌍 AUTO SPRACHE ERKENNEN (oder forced)
    // ============================================
    const userLang = forcedLang || detectLanguage(message);
    
    const langMap: Record<Lang, string> = {
      de: 'German',
      en: 'English',
      ti: 'Tigrinya',
      am: 'Amharic',
    };

    const intent = detectIntent(message);

    // ============================================
    // 🧠 DYNAMISCHER SYSTEM PROMPT (MULTILINGUAL)
    // ============================================
    const systemPrompt = `
You are a multilingual AI assistant.

⚠️ RULES:
- Respond ONLY in ${langMap[userLang]}
- NO language mixing
- Keep answers short (max 2 sentences)
- Do NOT invent words

User language: ${langMap[userLang]}

Intent: ${intent}

📚 Dictionary:
${woerterbuch.map(w => `- ${w.tigrinya_word} = ${w.german}`).join('\n')}

📖 Training examples:
${saetze.map(s => `- "${s.input_text}" → "${s.response_text}"`).join('\n')}
`;

    // ============================================
    // 🤖 AI MIT KONTEXT
    // ============================================
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6),
      { role: 'user', content: message },
    ];

    responseText = await askAI(messages, 0.3);

    if (woerterbuch.length > 0 || saetze.length > 0) {
      usedSupabase = true;
    }

    // ============================================
    // ❗ FALLBACK
    // ============================================
    if (!responseText) {
      responseText = userLang === 'ti' 
        ? 'ኣይፈልጥን — Das weiß ich noch nicht.'
        : userLang === 'am'
        ? 'አላውቅም — እስካሁን አልማርኩም።'
        : 'I don\'t know that yet — still learning.';
    }

    // ============================================
    // 🧠 SICHER LERNEN
    // ============================================
    await autoLearnSafe(supabase, message, responseText);

    // Limit erhöhen
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