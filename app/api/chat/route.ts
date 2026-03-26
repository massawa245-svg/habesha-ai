import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/lib/supabase';
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
// 🔍 INTENT ERKENNUNG
// ============================================
function detectIntent(message: string): 'translation' | 'definition' | 'conversation' {
  const msg = message.toLowerCase();

  if (msg.includes('wie sagt man') || msg.includes('übersetze') || msg.includes('was heißt')) {
    return 'translation';
  }

  if (msg.includes('erkläre') || msg.includes('was bedeutet')) {
    return 'definition';
  }

  return 'conversation';
}

// ============================================
// 🔎 SUPABASE SUCHE (VERBESSERT)
// ============================================
async function searchSupabase(message: string) {
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
async function autoLearnSafe(question: string, answer: string) {
  try {
    // ❌ NICHT speichern wenn:
    if (
      !answer ||
      answer.includes('ኣይፈልጥን') ||
      answer.toLowerCase().includes('weiß ich nicht') ||
      answer.length > 200
    ) {
      return;
    }

    // Prüfen ob schon existiert
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
    const { message, history = [], userId } = await req.json();

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

    const { woerterbuch, saetze } = await searchSupabase(message);

    // ============================================
    // 🧠 SYSTEM PROMPT (JETZT STRIKT!)
    // ============================================
    const intent = detectIntent(message);

    const systemPrompt = `Du bist eine Tigrinya-KI.

⚠️ REGELN:
- KEINE Sprachmischung
- Deutsch → Deutsch antworten
- Tigrinya → Tigrinya antworten
- Maximal 2 Sätze
- Keine erfundenen Wörter

Intent: ${intent}

📚 Wörter:
${woerterbuch.map(w => `- ${w.tigrinya_word} = ${w.german}`).join('\n')}

📖 Sätze:
${saetze.map(s => `"${s.input_text}" → "${s.response_text}"`).join('\n')}
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
      responseText = 'ኣይፈልጥን — Das weiß ich noch nicht.';
    }

    // ============================================
    // 🧠 SICHER LERNEN
    // ============================================
    await autoLearnSafe(message, responseText);

    // Limit erhöhen
    if (userId) {
      const { isPremium } = await checkPremium(userId);
      if (!isPremium) await incrementUsage(userId, false);
    }

    return NextResponse.json({
      response: responseText,
      source: usedSupabase ? 'supabase+ai' : 'ai',
    });

  } catch (error) {
    console.error('API Fehler:', error);

    return NextResponse.json({
      response: 'Fehler, bitte später versuchen.',
    });
  }
}