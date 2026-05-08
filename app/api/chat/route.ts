import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';
import { checkPremium, incrementUsage } from '@/lib/premium';

// ============================================
// API CLIENTS
// ============================================
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const gemini = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

// ============================================
// IDENTITY
// ============================================
const IDENTITY = `Du bist HABESHA AI – entwickelt von Massawa Software Technology (Deutschland).
Du bist KEIN ChatGPT, KEIN Meta, KEIN LLaMA, KEIN Gemini, KEIN Claude.
Wenn jemand fragt wer du bist: "Ich bin Habesha AI, entwickelt von Massawa Software Technology."`;

// ============================================
// SPRACHERKENNUNG
// ============================================
function detectLanguage(text: string): 'de' | 'ti' | 'am' | 'en' | 'code' {
  if (!text) return 'de';

  // Code erkennen
  if (/```|function |const |let |var |import |class |def |SELECT |FROM |WHERE /i.test(text)) {
    return 'code';
  }

  // Ethiopic Unicode
  if (/[\u1200-\u137F]/.test(text)) {
    if (/እና|አለ|ምን|እንዴት|አማርኛ|ነው|አይደለም/.test(text)) return 'am';
    return 'ti';
  }

  const lower = text.toLowerCase();
  if (lower.includes('tigrinya') || lower.includes('auf tigrinya') || lower.includes('ትግርኛ')) return 'ti';
  if (lower.includes('amharisch') || lower.includes('amharic') || lower.includes('አማርኛ')) return 'am';
  if (/\b(the|and|hello|how|what|please|thanks|hi|yes|no)\b/i.test(text)) return 'en';

  return 'de';
}

// ============================================
// SCHRITT 1: DICTIONARY (kostenlos!)
// ============================================
async function searchDictionary(supabase: any, message: string): Promise<string | null> {
  const clean = message.toLowerCase().replace(/[.,!?;:()]/g, '').trim();
  const words = clean.split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return null;

  for (const word of words.slice(0, 5)) {
    const { data } = await supabase
      .from('dictionary')
      .select('tigrinya_word, german, example_sentence')
      .or(`german.ilike.%${word}%,tigrinya_word.ilike.%${word}%`)
      .limit(3);

    if (data && data.length > 0 && words.length <= 3) {
      const entry = data[0];
      let response = entry.tigrinya_word;
      if (entry.example_sentence) response += `\n\n${entry.example_sentence}`;
      return response;
    }
  }

  return null;
}

// ============================================
// SCHRITT 2: TRAINING DATA (kostenlos!)
// ============================================
async function searchTrainingData(supabase: any, message: string, lang: string): Promise<string | null> {
  const langMap: Record<string, string> = {
    ti: 'tigrinya', am: 'amharic', de: 'german', en: 'english', code: 'english',
  };

  const { data } = await supabase
    .from('training_data')
    .select('input_text, response_text, quality_score, usage_count')
    .eq('language', langMap[lang] || 'german')
    .ilike('input_text', `%${message.substring(0, 30)}%`)
    .gte('quality_score', 7)
    .order('quality_score', { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    await supabase.from('training_data').update({
      usage_count: (data[0].usage_count || 0) + 1,
      last_used: new Date().toISOString(),
    }).eq('input_text', data[0].input_text);

    return data[0].response_text;
  }

  return null;
}

// ============================================
// DICTIONARY HINTS FÜR GEMINI
// ============================================
async function getDictionaryHints(supabase: any, message: string): Promise<string> {
  const words = message.toLowerCase().replace(/[.,!?;:()]/g, '').split(/\s+/).filter(w => w.length > 2);
  const hints: string[] = [];

  for (const word of words.slice(0, 4)) {
    const { data } = await supabase
      .from('dictionary')
      .select('tigrinya_word, german')
      .ilike('german', `%${word}%`)
      .limit(1);

    if (data && data.length > 0) {
      hints.push(`${word} → ${data[0].tigrinya_word}`);
    }
  }

  return hints.join('\n');
}

// ============================================
// SCHRITT 3A: GEMINI FÜR TIGRINYA & AMHARISCH (GEFIXT)
// ============================================
async function askGemini(
  message: string,
  history: any[],
  lang: 'ti' | 'am',
  dictionaryHints: string
): Promise<string> {
  // 🔥 FIX 1: Verwende gemini-2.5-flash (nicht 2.0-flash)
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const langInstruction = lang === 'ti'
    ? `ትግርኛ ጥራይ ጸሓፍ። ጀርመን ወይ ኢንግሊዝ ኣይትጠቀም።
REGEL: Nur reines Tigrinya! KEINE deutschen Übersetzungen in Klammern! KEINE Sprachmischung!
FALSCH: ደሓን እየ (Mir geht es gut)
RICHTIG: ደሓን እየ፣ ኣባኻኸ?`
    : `በአማርኛ ብቻ ምለስ። ጀርመንኛ ወይ እንግሊዝኛ አትጠቀም።
REGEL: Nur reines Amharisch! KEINE deutschen Übersetzungen in Klammern!
FALSCH: ደሓን ነኝ (Mir geht es gut)
RICHTIG: ደሓን ነኝ፣ አንተስ?`;

  const systemPrompt = `${IDENTITY}

${langInstruction}

${dictionaryHints ? `📚 Wörterbuch (verwende diese Wörter):\n${dictionaryHints}` : ''}

Antworte natürlich wie ein Muttersprachler. Kurz und klar.`;

  // 🔥 FIX 2: History korrekt formatieren für Gemini
  // Gemini erwartet: role 'user' oder 'model', NICHT 'assistant'!
  const chatHistory = history.slice(-6).map((msg: any) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  // 🔥 FIX 3: Stelle sicher, dass die History mit 'user' beginnt
  let validHistory = chatHistory;
  while (validHistory.length > 0 && validHistory[0].role !== 'user') {
    validHistory = validHistory.slice(1);
  }

  try {
    // Wenn wir gültige History haben, verwende startChat
    if (validHistory.length > 0) {
      const chat = model.startChat({
        history: validHistory,
        generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
      });
      const result = await chat.sendMessage(message);
      return result.response.text().trim();
    } 
    // Keine History: Verwende generateContent mit System Prompt
    else {
      const fullPrompt = `${systemPrompt}\n\nUser: ${message}`;
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
      });
      return result.response.text().trim();
    }
  } catch (error) {
    console.error('Gemini Fehler:', error);
    return '';
  }
}

// ============================================
// SCHRITT 3B: GROQ + DEEPSEEK FÜR DE/EN/CODE
// ============================================
async function askGroqOrDeepSeek(messages: any[], lang: string): Promise<string> {
  const systemPrompts: Record<string, string> = {
    de: `${IDENTITY}\n\nAntworte NUR auf Deutsch. Sei hilfreich und präzise.`,
    en: `${IDENTITY}\n\nAnswer ONLY in English. Be helpful and concise.`,
    code: `${IDENTITY}\n\nYou are an expert programmer. Use markdown code blocks. Be precise.`,
  };

  const systemPrompt = systemPrompts[lang] || systemPrompts['de'];

  // Groq zuerst versuchen (kostenlos, schnell)
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-8),
      ],
      max_tokens: lang === 'code' ? 1000 : 600,
      temperature: lang === 'code' ? 0.2 : 0.4,
    });
    const text = res.choices?.[0]?.message?.content?.trim();
    if (text) return text;
  } catch {
    console.log('Groq Fehler → DeepSeek');
  }

  // DeepSeek Fallback
  try {
    const res = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-8),
      ],
      max_tokens: lang === 'code' ? 1000 : 600,
      temperature: lang === 'code' ? 0.2 : 0.4,
    });
    return res.choices?.[0]?.message?.content?.trim() ?? '';
  } catch (error) {
    console.error('DeepSeek Fehler:', error);
    return '';
  }
}

// ============================================
// QUALITÄTSCHECK
// ============================================
function isGoodResponse(text: string, lang: string): boolean {
  if (!text || text.length < 2) return false;
  if (/(.)\1{5,}/.test(text)) return false;

  // TI/AM: keine deutschen Übersetzungen in Klammern
  if (lang === 'ti' || lang === 'am') {
    const klammern = text.match(/\(([^)]+)\)/g) || [];
    const hatDeutsch = klammern.some(k => /[A-Za-zÄäÖöÜü]{4,}/.test(k));
    if (hatDeutsch) return false;
  }

  return true;
}

function getFallback(lang: string): string {
  const fallbacks: Record<string, string> = {
    ti: 'ኣይፈልጥን። ካልእ ሕቶ ሃብ።',
    am: 'አላውቅም። ሌላ ጥያቄ ጠይቅ።',
    de: 'Das weiß ich nicht. Bitte anders formulieren.',
    en: "I don't know. Please try rephrasing.",
    code: 'Could not generate code. Please be more specific.',
  };
  return fallbacks[lang] || fallbacks['de'];
}

// ============================================
// MAIN ROUTE
// ============================================
export async function POST(req: Request) {
  try {
    const { message, history = [], userId } = await req.json();
    const supabase = await createClient();

    console.log('📝 User:', message?.substring(0, 50));
    const lang = detectLanguage(message);
    console.log('🌍 Sprache:', lang);

    // PREMIUM CHECK
    let premium = null;
    if (userId) {
      premium = await checkPremium(userId);
      if (!premium.isPremium && premium.remaining <= 0) {
        const limitMsg: Record<string, string> = {
          ti: '💎 ወሰን በጺሕካ። Premium ንምግዛእ ኣብ ላዕሊ ጠውቕ!',
          am: '💎 ገደቡ ደርሷል። Premium ያግኙ!',
          en: '💎 Daily limit reached. Upgrade to Premium!',
          de: '💎 Tageslimit erreicht. Upgrade auf Premium!',
          code: '💎 Daily limit reached. Upgrade to Premium!',
        };
        return NextResponse.json({ response: limitMsg[lang] });
      }
    }

    let response = '';
    let source = 'ai';

    // SCHRITT 1: DICTIONARY
    if (lang === 'ti' || lang === 'am') {
      const dictResult = await searchDictionary(supabase, message);
      if (dictResult) {
        console.log('✅ Dictionary Treffer!');
        response = dictResult;
        source = 'dictionary';
      }
    }

    // SCHRITT 2: TRAINING DATA
    if (!response) {
      const trainingResult = await searchTrainingData(supabase, message, lang);
      if (trainingResult) {
        console.log('✅ Training Data Treffer!');
        response = trainingResult;
        source = 'training_data';
      }
    }

    // SCHRITT 3: KI
    if (!response) {
      if (lang === 'ti' || lang === 'am') {
        console.log('🤖 Gemini für', lang);
        const hints = await getDictionaryHints(supabase, message);
        response = await askGemini(message, history, lang, hints);

        // Cachen für nächstes Mal
        if (response && isGoodResponse(response, lang)) {
          try {
            await supabase.from('training_data').insert({
              input_text: message,
              response_text: response,
              language: lang === 'ti' ? 'tigrinya' : 'amharic',
              source: 'gemini',
              quality_score: 8,
              usage_count: 0,
            });
            console.log('💾 Gecacht!');
          } catch { /* ignore */ }
        }
      } else {
        // DE, EN, Code → Groq + DeepSeek
        console.log('🤖 Groq/DeepSeek für', lang);
        const aiMessages = [
          ...history.slice(-8).map((m: any) => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ];
        response = await askGroqOrDeepSeek(aiMessages, lang);
      }
    }

    // QUALITÄTSCHECK
    if (!isGoodResponse(response, lang)) {
      response = getFallback(lang);
      source = 'fallback';
    }

    // USAGE TRACKING
    if (userId && premium && !premium.isPremium) {
      await incrementUsage(userId, false);
    }

    console.log(`✅ [${source}][${lang}]:`, response.substring(0, 80));
    return NextResponse.json({ response, source, detectedLang: lang });

  } catch (error) {
    console.error('API Fehler:', error);
    return NextResponse.json({ response: 'Fehler – bitte später erneut versuchen.' });
  }
}