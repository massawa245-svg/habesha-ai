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
// 🌍 AUTO SPRACHERKENNUNG (mit Umschrift)
// ============================================
export type Lang = 'de' | 'ti' | 'am' | 'en';

function detectLanguage(text: string): Lang {
  if (!text) return 'de';
  
  const lowerText = text.toLowerCase();
  
  // 1. Ethiopic Script (Tigrinya + Amharic)
  if (/[\u1200-\u137F]/.test(text)) {
    if (text.includes('እ') || text.includes('ነ') || text.includes('አ')) {
      return 'am';
    }
    return 'ti';
  }
  
  // 2. 🔥 Tigrinya in lateinischer Umschrift
  const tigrinyaLatin = [
    'kemey', 'aleka', 'dehan', 'dehando', 'salam', 'selam',
    'xubok', 'niska', 'emo', 'hawy', 'hawye', 'tigrinya', 'tigrigna',
    'eritrean', 'eritrea', 'habesha', 'abey', 'tsibuk', 'aykonen',
    'kemey aleka', 'kemey alaka', 'dehan do', 'selamun alekum'
  ];
  
  if (tigrinyaLatin.some(word => lowerText.includes(word))) {
    return 'ti';
  }
  
  // 3. Amharic in lateinischer Umschrift
  const amharicLatin = [
    'selam', 'salam', 'amharic', 'amharigna', 'ethiopian',
    'ande', 'hode', 'wede', 'yene', 'ante', 'anchi',
    'tadiyas', 'endet', 'ne', 'nesh', 'betam', 'aydelm'
  ];
  
  if (amharicLatin.some(word => lowerText.includes(word))) {
    return 'am';
  }
  
  // 4. Englisch
  if (/\b(the|and|what|how|why|hello|please|thanks|translate|what is|how are you)\b/i.test(text)) {
    return 'en';
  }
  
  // 5. Deutsch
  if (/\b(wie|was|warum|hallo|bitte|danke|übersetze|was heißt|erkläre|wie geht es dir)\b/i.test(text)) {
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
  // Tigrinya (lateinisch)
  if (msg.includes('kemey') || msg.includes('xubok') || msg.includes('dehan')) {
    return 'translation';
  }
  // Tigrinya/Amharic Schrift
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
// 🔎 SUPABASE SUCHE (VERBESSERT - sucht in beiden Sprachen)
// ============================================
async function searchSupabase(supabase: any, message: string) {
  const clean = message.toLowerCase().replace(/[.,!?;:()]/g, '');
  const words = clean.split(/\s+/).filter(w => w.length > 2);

  let woerterbuch: any[] = [];
  let saetze: any[] = [];

  if (words.length > 0) {
    // 🔥 SUCHT JETZT IN BEIDEN SPALTEN (Tigrinya und Deutsch)
    const filters = words.map(w => `german.ilike.%${w}%,tigrinya_word.ilike.%${w}%`).join(',');

    const { data: woerter } = await supabase
      .from('dictionary')
      .select('tigrinya_word, german')
      .or(filters)
      .limit(10); // Mehr Ergebnisse für die KI

    woerterbuch = woerter || [];
  }

  // 🔥 Suche in training_data wurde verbessert (flexibler)
  const { data: training } = await supabase
    .from('training_data')
    .select('input_text, response_text')
    .or(`input_text.ilike.%${message}%,response_text.ilike.%${message}%`)
    .limit(5);

  saetze = training || [];

  return { woerterbuch, saetze };
}

// ============================================
// 🧠 SICHERES AUTO-LEARNING (verbessert - verhindert Müll)
// ============================================
async function autoLearnSafe(supabase: any, question: string, answer: string) {
  try {
    // 🔥 VERBOTENE Muster (keine erfundenen Wörter)
    const forbiddenPatterns = [
      'manday', 'manday', 'mondai', 'montag', 'monday',
      'ኣይፈልጥን', 'weiß ich nicht', 'ich weiß nicht',
      'I don\'t know', 'no idea', 'not sure'
    ];
    
    // Prüfe ob Antwort verbotene Muster enthält
    const lowerAnswer = answer.toLowerCase();
    const hasForbidden = forbiddenPatterns.some(pattern => lowerAnswer.includes(pattern));
    
    if (
      !answer ||
      hasForbidden ||
      answer.length > 200 ||
      answer.length < 3
    ) {
      console.log('🚫 Auto-Learn verhindert:', answer.substring(0, 50));
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
    const validLangs: Lang[] = ['de', 'ti', 'am', 'en'];
    const userLang: Lang = validLangs.includes(forcedLang) ? (forcedLang as Lang) : detectLanguage(message);
    
    const langMap: Record<Lang, string> = {
      de: 'German',
      en: 'English',
      ti: 'Tigrinya',
      am: 'Amharic',
    };

    const intent = detectIntent(message);

    // ============================================
    // 🧠 DYNAMISCHER SYSTEM PROMPT (MIT ANTI-MANDAY REGEL)
    // ============================================
    const systemPrompt = `
You are a professional Tigrinya translator. 

⚠️ CRITICAL RULES:
- Use ONLY authentic Tigrinya words.
- NEVER use English-sounding inventions like "Manday" for Monday. 
- Monday is ALWAYS "ሰኑይ".
- If the Dictionary or Training examples below contain a word, you MUST use it.
- Keep answers short (max 2 sentences).

User language: ${langMap[userLang]}

📚 Dictionary (Priority):
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