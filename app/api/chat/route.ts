// app/api/chat/route.ts
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
// 🔥 SMARTE SPRACHERKENNUNG
// ============================================
function detectLanguage(text: string): 'de' | 'ti' | 'am' | 'en' | 'code' | 'unknown' {
  if (!text || !text.trim()) return 'de';

  if (/```|function |const |let |var |import |class |def |SELECT |FROM |WHERE /i.test(text)) {
    return 'code';
  }

  if (/[\u1200-\u137F]/.test(text)) {
    const tigrinyaMarkers = /ኢኻ|ኢኺ|ኣለኻ|ኣለኺ|ኣለኹ|እየ|ኢየ|ድኣ|ከመይ|ጽቡቕ|ጹቡቕ|ኣይኮንኩን|ይኽእል|እንታይ|ናብ|ካብ|ምስ|ሰበይቲ|ደኣ|ኒስኪ|ኣሎ|ሃብ|ዘለኹ|ክዛረብ|ብትግርኛ|የቐንየለይ|ኣይፋል/;
    const amharicMarkers = /ነኝ|ናት|ነው|ሰው|እኔ|አንተ|እንዴት|ምንድን|ይህ|ናችሁ|ሁሉ|የለም|እባክህ|እባክሽ|አማርኛ|ግን|ስለ|ነበር|ይችላል|እሺ|አይደለሁም|ጎግል/;

    const tiCount = (text.match(tigrinyaMarkers) || []).length;
    const amCount = (text.match(amharicMarkers) || []).length;

    if (tiCount > amCount) return 'ti';
    if (amCount > tiCount) return 'am';
    return 'ti';
  }

  const lower = text.toLowerCase().trim();

  if (lower.includes('tigrinya') || lower.includes('auf tigrinya') || lower.includes('ትግርኛ')) return 'ti';
  if (lower.includes('amharisch') || lower.includes('amharic') || lower.includes('አማርኛ')) return 'am';

  const deutscheWoerter = /\b(ich|du|der|die|das|und|ist|nicht|ein|eine|mit|für|auf|von|zu|was|wie|wer|warum|wann|wo|bitte|danke|hallo|brauche|möchte|kann|habe|bin|sind|wird|haben|machen|gut|sehr|auch|aber|oder|wenn|weil|noch|schon|mehr|hier|dort|jetzt|heute|morgen)\b/i;
  const deutscheTreffer = (lower.match(deutscheWoerter) || []).length;

  const englischeWoerter = /\b(the|and|is|are|not|with|for|on|of|to|what|how|who|why|when|where|please|thanks|hello|hi|need|want|can|have|am|will|make|good|very|also|but|or|if|because|still|more|here|there|now|today|tomorrow|yes|no)\b/i;
  const englischeTreffer = (lower.match(englischeWoerter) || []).length;

  if (deutscheTreffer > englischeTreffer && deutscheTreffer >= 1) return 'de';
  if (englischeTreffer > deutscheTreffer && englischeTreffer >= 1) return 'en';
  if (deutscheTreffer >= 1) return 'de';

  return 'unknown';
}

// ============================================
// 🔥 OPTIMIERT: EIGENNAMEN SCHÜTZEN, GOOGLE-RESTE ENTFERNEN
// ============================================
function removeGermanFromEthiopic(text: string, lang: string): string {
  if (lang !== 'ti' && lang !== 'am') return text;

  // 1. Schützt wichtige Fachbegriffe, damit sie NICHT gelöscht werden
  const protectedWords = /(LinkedIn|GitHub|Anabin|Indeed|StepStone|Honeypot|Xing|Visa|Blue\sCard|AI|Software|Developer|App|PDF)/gi;
  
  // Temporärer Platzhalter-AUSTAUSCH
  const matches: string[] = [];
  let tokenized = text.replace(protectedWords, (match) => {
    matches.push(match);
    return `__PROTECTED_${matches.length - 1}__`;
  });

  // 2. Jetzt löschen wir harten deutschen Fließtext (z.B. "Ich helfe dir") aus der Ge'ez Antwort
  // Erlaubt typische deutsche Wörter von A-Z nicht, ignoriert aber unsere geschützten Tokens
  tokenized = tokenized.replace(/\b(ich|du|er|sie|es|wir|ihr|und|oder|aber|ein|eine|ist|sind|der|die|das|nicht|zu|von|auf|mit|in|den|dem|am)\b/gi, '');

  // 3. Tokens wieder zurückdrehen
  let cleaned = tokenized.replace(/__PROTECTED_(\d+)__/g, (_, id) => matches[parseInt(id)]);

  // 4. White-Space Cleanup (Behält Zeilenumbrüche!)
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.trim();

  // Sicherheits-Check: Hat die Antwort überhaupt Ge'ez Zeichen?
  const ethiopicChars = (cleaned.match(/[\u1200-\u137F]/g) || []).length;
  if (ethiopicChars < 3) {
    return getFallback(lang);
  }

  return cleaned;
}

// ============================================
// ÜBERSETZUNGS-REQUEST ERKENNEN
// ============================================
function isTranslationRequest(message: string): boolean {
  const patterns = [
    /wie heißt (\w+) auf tigrinya/i,
    /was heißt (\w+) auf tigrinya/i,
    /übersetze (\w+) ins tigrinya/i,
    /tigrinya wort für (\w+)/i,
    /translate (\w+) to tigrinya/i,
  ];
  return patterns.some(p => p.test(message));
}

function extractWordForTranslation(message: string): string | null {
  const patterns = [
    /wie heißt (\w+) auf tigrinya/i,
    /was heißt (\w+) auf tigrinya/i,
    /übersetze (\w+) ins tigrinya/i,
    /tigrinya wort für (\w+)/i,
    /translate (\w+) to tigrinya/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

async function translateWithGemini(word: string): Promise<string> {
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = `Übersetze das deutsche Wort "${word}" ins Tigrinya.
REGELN:
1. NUR das Tigrinya Wort + Aussprache in Klammern
2. KEINE Erklärung

Beispiele:
- Kind → ቈልዓ (qol'a)
- Frau → ሰበይቲ (sebeyti)

Übersetze: ${word}`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Gemini Translation Error:', error);
    return '';
  }
}

// ============================================
// CHAT HISTORY SPEICHERN
// ============================================
async function saveToChatHistory(
  supabase: any,
  userId: string | null,
  question: string,
  answer: string,
  language: string,
  source: string,
  confidence: number | null,
  similarityScore: number | null = null
) {
  try {
    const { error } = await supabase.from('chat_history').insert({
      user_id: userId,
      user_question: question.substring(0, 500),
      ai_answer: answer.substring(0, 2000),
      language: language,
      source: source,
      similarity_score: similarityScore,
      quality_score: confidence !== null ? Math.round(confidence * 10) : null,
      reviewed: false,
      approved_for_training: false,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    console.log(`💾 Chat gespeichert | Source: ${source}`);
    return true;
  } catch (err) {
    console.error('Chat History save error:', err);
    return false;
  }
}

// ============================================
// TRAINING DATA ALS STIL-BEISPIELE
// ============================================
async function getTrainingExamples(supabase: any, lang: string): Promise<string> {
  const langMap: Record<string, string> = { ti: 'tigrinya', am: 'amharic' };
  const dbLang = langMap[lang];
  if (!dbLang) return '';

  try {
    const { data } = await supabase
      .from('training_data')
      .select('response_text')
      .eq('language', dbLang)
      .eq('status', 'approved')
      .gte('quality_score', 6)
      .limit(3);

    if (data && data.length > 0) {
      return data.map((d: any) => d.response_text.substring(0, 150)).join('\n');
    }
  } catch { /* ignore */ }
  return '';
}

// ============================================
// 🔥 GEMINI — Starkes Prompting gegen Schleifen & falsches AI-Tigrinya
// ============================================
async function askGemini(
  message: string,
  history: any[],
  lang: 'ti' | 'am' | 'unknown',
  styleExamples: string
): Promise<string> {
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Stabiler, loop-resistenter SystemPrompt
  let systemPrompt = `Du bist HABESHA AI, eine professionelle und hilfreiche KI für Menschen aus Eritrea und Äthiopien in Deutschland. Entwickelt von Massawa Software Technology.

WICHTIGE IDENTITÄTS-REGELN:
1. Wenn du nach deinem Namen gefragt wirst, antworte exakt:
   - Auf Tigrinya: "ኣነ ሃበሻ ኤኣይ (Habesha AI) እየ፣ ብ Massawa Software Technology ዝማዕበልኩ።"
   - Auf Amharisch: "እኔ ሃበሻ ኤአይ (Habesha AI) ነኝ፣ በ Massawa Software Technology የበለጸግኩ።"
2. Du bist NICHT Google, NICHT Gemini, NICHT ChatGPT.

PROMPTING- & FORMATIERUNGS-REGELN:
- Antworte NIEMALS in einer Dauerschleife. Wiederhole Sätze nicht mehrfach!
- Wenn du deutsche Fachbegriffe oder Webseiten nennst (z.B. LinkedIn, GitHub, Anabin, Lebenslauf, Job, Visa, Blue Card), schreibe sie in lateinischen Buchstaben in Klammern hinter das Ge'ez-Wort! Beispiel: "ናይ ስራሕ መርበብ (LinkedIn)" ወይም "ናይ ስራሕ ፍቓድ (Arbeitserlaubnis)".
- Halte deine Antworten klar strukturiert (nutze nummerierte Listen falls nötig).`;

  if (lang === 'unknown') {
    systemPrompt += `\n\nSPRACHERKENNUNGUNGSMATERIAL:
Der Nutzer schreibt aktuell in LATEINISCHER SCHRIFT (z.B. "kemey aleka", "ane srah dele").
1. Analysiere, ob es Tigrinya oder Amharisch ist.
2. Antworte IMMER im Ge'ez-Skript (ግዕዝ) der erkannten Sprache. Schreib keinen lateinischen Fließtext!`;
  } else {
    const langInstruction = lang === 'ti'
      ? `\n\nSchreibe ausschließlich in klarem Standard-Tigrinya (ትግርኛ). Beantworte die Frage direkt.`
      : `\n\nSchreibe ausschließlich in klarem Standard-Amharisch (አማርኛ). Beantworte die Frage direkt.`;
    
    const styleHint = styleExamples
      ? `\nVerwende diesen natürlichen Schreibstil als Orientierung:\n${styleExamples}`
      : '';
    
    systemPrompt += langInstruction + styleHint;
  }

  const chatHistory = history.slice(-6).map((msg: any) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  let validHistory = chatHistory;
  while (validHistory.length > 0 && validHistory[0].role !== 'user') {
    validHistory = validHistory.slice(1);
  }

  try {
    let result;
    if (validHistory.length > 0) {
      const chat = model.startChat({
        history: validHistory,
        systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 1200, temperature: 0.4 }, // Leicht erhöhte Temp verhindert Loops!
      });
      result = await chat.sendMessage(message);
    } else {
      const fullPrompt = `${systemPrompt}\n\nUser: ${message}`;
      result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: 1200, temperature: 0.4 },
      });
    }

    let response = result.response.text().trim();
    const cleanLang = lang === 'unknown' ? 'ti' : lang;
    response = removeGermanFromEthiopic(response, cleanLang);
    return response;
  } catch (error) {
    console.error('Gemini Fehler:', error);
    return getFallback(lang === 'unknown' ? 'ti' : lang);
  }
}

// ============================================
// GROQ + DEEPSEEK FÜR DE/EN/CODE
// ============================================
async function askGroqOrDeepSeek(messages: any[], lang: string): Promise<string> {
  const systemPrompts: Record<string, string> = {
    de: `${IDENTITY}\n\nAntworte NUR auf Deutsch. Sei hilfreich und präzise.`,
    en: `${IDENTITY}\n\nAnswer ONLY in English. Be helpful and concise.`,
    code: `${IDENTITY}\n\nYou are an expert programmer. Use markdown code blocks. Be precise.`,
  };

  const systemPrompt = systemPrompts[lang] || systemPrompts['de'];

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
// QUALITÄTSCHECK (Entschärft, damit Fachbegriffe erlaubt sind!)
// ============================================
function isGoodResponse(text: string, lang: string): boolean {
  if (!text || text.length < 2) return false;
  if (/(.)\1{5,}/.test(text)) return false; // Blockiert Zeichen-Wiederholungen (Loops)

  // Modifiziert: Blockiert nur, wenn reiner deutscher Text generiert wird, erlaubt aber Klammern mit Fachbegriffen
  if (lang === 'ti' || lang === 'am' || lang === 'unknown') {
    const longGermanTextPattern = /[a-zA-ZÄäÖöÜüß]{15,}/; // Erkennt lange deutsche Satzstrukturen
    if (longGermanTextPattern.test(text)) return false;
  }
  return true;
}

function getFallback(lang: string): string {
  const fallbacks: Record<string, string> = {
    ti: 'ይቕሬታ፣ ሕቶኻ ብንጹር ኣይተረዳእኩን። ብኻልእ መገዲ ክትሓተኒ ትኽእል ዶ?',
    am: 'ይቅርታ፣ ጥያቄህን በትክክል አልተረዳሁትም። በሌላ መንገድ ልትጠይቀኝ ትችላለህ?',
    de: 'Das weiß ich nicht. Bitte anders formulieren.',
    en: "I don't know. Please try rephrasing.",
    code: 'Could not generate code. Please be more specific.',
    unknown: 'ይቕሬታ፣ ሕቶኻ ብንጹር ኣይተረዳእኩን። ብኻልእ መገዲ ክትሓተኒ ትኽእል ዶ?',
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

    let response = '';
    let source = 'ai';
    let confidence: number | null = null;
    const similarityScore: number | null = null;

    // SPEZIALFALL: EINZELWORT-ÜBERSETZUNG
    if (isTranslationRequest(message) && (lang === 'de' || lang === 'en')) {
      console.log('📖 Übersetzungsrequest erkannt!');
      const word = extractWordForTranslation(message);
      if (word) {
        response = await translateWithGemini(word);
        source = 'gemini_translation';
        confidence = 0.7;
        response = removeGermanFromEthiopic(response, 'ti');
      }
    }

    // NORMALE PIPELINE
    if (!response) {
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
            unknown: '💎 ወሰን በጺሕካ። Premium ንምግዛእ ኣብ ላዕሊ ጠውቕ!',
          };
          await saveToChatHistory(supabase, userId, message, limitMsg[lang], lang, 'limit', null);
          return NextResponse.json({ response: limitMsg[lang] });
        }
      }

      // 🔥 GEMINI für ti/am/unknown
      if (lang === 'ti' || lang === 'am' || lang === 'unknown') {
        console.log('🤖 Gemini für', lang, lang === 'unknown' ? '(erkennt Sprache selbst!)' : '(DB nur Stil)');

        const styleLang = lang === 'unknown' ? 'ti' : lang;
        const styleExamples = await getTrainingExamples(supabase, styleLang);

        response = await askGemini(message, history, lang, styleExamples);
        source = lang === 'unknown' ? 'gemini_auto' : 'gemini';
        confidence = 0.65;

      } else {
        // DE/EN/CODE → Groq/DeepSeek
        console.log('🤖 Groq/DeepSeek für', lang);
        const aiMessages = [
          ...history.slice(-8).map((m: any) => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ];
        response = await askGroqOrDeepSeek(aiMessages, lang);
        source = lang === 'code' ? 'ai_code' : 'ai';
        confidence = 0.85;
      }

      // QUALITÄTSCHECK
      if (!isGoodResponse(response, lang)) {
        response = getFallback(lang);
        source = 'fallback';
        confidence = 0.3;
      }

      if (userId && premium && !premium.isPremium) {
        await incrementUsage(userId, false);
      }
    }

    // SPEICHERN
    const saveLang = (lang === 'ti' || lang === 'am') ? lang : (lang === 'unknown' ? 'ti' : 'de');
    await saveToChatHistory(supabase, userId, message, response, saveLang, source, confidence, similarityScore);

    console.log(`✅ [${source}][${lang}][conf:${confidence}]`, response.substring(0, 80));
    return NextResponse.json({ response, source, detectedLang: lang });

  } catch (error) {
    console.error('API Fehler:', error);
    return NextResponse.json({ response: 'Fehler – bitte später erneut versuchen.' });
  }
}