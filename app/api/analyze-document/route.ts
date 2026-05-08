import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { checkPremium, incrementUsage } from '@/lib/premium';

// ============================================
// API CLIENTS
// ============================================
const gemini = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// ============================================
// IDENTITY
// ============================================
const IDENTITY = `Du bist HABESHA AI – entwickelt von Massawa Software Technology (Deutschland).
Du bist KEIN ChatGPT, KEIN Meta, KEIN Gemini, KEIN Claude.`;

// ============================================
// SPRACHERKENNUNG
// ============================================
function detectUserLanguage(text: string): 'de' | 'ti' | 'am' | 'en' {
  if (!text) return 'de';
  if (/[\u1200-\u137F]/.test(text)) {
    if (/እና|አለ|ምን|እንዴት|አማርኛ|ነው/.test(text)) return 'am';
    return 'ti';
  }
  const lower = text.toLowerCase();
  if (lower.includes('tigrinya') || lower.includes('auf tigrinya')) return 'ti';
  if (lower.includes('amharisch') || lower.includes('amharic')) return 'am';
  if (/\b(the|and|what|how|why|please|hello|thanks)\b/i.test(text)) return 'en';
  return 'de';
}

// ============================================
// BEHÖRDEN-TYP ERKENNEN
// ============================================
function detectBehoerde(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('jobcenter')) return 'Jobcenter';
  if (lower.includes('aok') || lower.includes('krankenkasse')) return 'AOK / Krankenkasse';
  if (lower.includes('finanzamt') || lower.includes('steuer')) return 'Finanzamt';
  if (lower.includes('ausländerbehörde') || lower.includes('aufenthalt')) return 'Ausländerbehörde';
  if (lower.includes('bafög') || lower.includes('studentenwerk')) return 'BAföG / Studium';
  if (lower.includes('sozialamt')) return 'Sozialamt';
  if (lower.includes('standesamt')) return 'Standesamt';
  if (lower.includes('kindergeld')) return 'Familienkasse / Kindergeld';
  return 'Behörde';
}

// ============================================
// GEMINI VISION – OCR + ERKLÄRUNG IN EINEM!
// 🔥 FIXED: Verwende gemini-2.5-flash statt 2.0-flash
// ============================================
async function analyzeImageWithGemini(
  base64Image: string,
  mimeType: string,
  userLang: 'de' | 'ti' | 'am' | 'en',
  userMessage: string
): Promise<string> {
  // 🔥 DAS IST DER FIX 🔥
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const langMap = {
    de: 'DEUTSCH',
    ti: 'TIGRINYA (ትግርኛ) – nur Ethiopic Schrift, KEINE deutschen Übersetzungen in Klammern!',
    am: 'AMHARISCH (አማርኛ) – nur Ethiopic Schrift, KEINE deutschen Übersetzungen in Klammern!',
    en: 'ENGLISH',
  };

  const prompt = `${IDENTITY}

Du bist ein Experte für deutsche Behördenbriefe und hilfst der Habesha Community.

⚠️ WICHTIG: Antworte NUR in dieser Sprache: ${langMap[userLang]}

AUFGABE:
1. Lies den Text im Bild (OCR)
2. Erkenne um welche Behörde es geht
3. Erkläre den Brief einfach und klar

STRUKTUR (genau so):
📌 Worum geht es? (1 Satz)
⚡ Was musst du tun? (Schritte)
⏰ Bis wann?
⚠️ Was passiert wenn nicht?
📞 Kontakt (falls im Brief vorhanden)

REGELN:
- Nicht Wort für Wort übersetzen
- Klar sagen was die Person tun muss
- Fristen deutlich nennen
- Maximal 8 Zeilen
- Für Tigrinya/Amharisch: NUR Ethiopic Schrift, keine Klammer-Übersetzungen!

USER FRAGE: ${userMessage || 'Erkläre diesen Brief'}`;

  try {
    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: mimeType as any,
          data: base64Image,
        },
      },
    ]);

    return result.response.text().trim();
  } catch (error) {
    console.error('Gemini Vision Fehler:', error);
    return '';
  }
}

// ============================================
// FALLBACK: TEXT ERKLÄREN MIT GROQ/DEEPSEEK
// ============================================
async function explainWithAI(
  ocrText: string,
  userLang: 'de' | 'ti' | 'am' | 'en',
  userMessage: string
): Promise<string> {
  const langMap = {
    de: 'DEUTSCH',
    ti: 'TIGRINYA (nur Ethiopic Schrift!)',
    am: 'AMHARISCH (nur Ethiopic Schrift!)',
    en: 'ENGLISH',
  };

  const behoerde = detectBehoerde(ocrText);

  const prompt = `${IDENTITY}

Behörde: ${behoerde}
Antworte NUR auf: ${langMap[userLang]}

Brief erklärt einfach:
📌 Worum geht es?
⚡ Was tun?
⏰ Bis wann?
⚠️ Konsequenzen?

Brief: ${ocrText.substring(0, 2000)}
Frage: ${userMessage}`;

  // Groq zuerst
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.3,
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
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.3,
    });
    return res.choices?.[0]?.message?.content?.trim() ?? '';
  } catch (error) {
    console.error('DeepSeek Fehler:', error);
    return '';
  }
}

// ============================================
// MAIN ROUTE
// ============================================
export async function POST(req: Request) {
  try {
    const { image, message = '', userId } = await req.json();
    const supabase = await createClient();

    if (!image) {
      return NextResponse.json({
        response: '📸 **Bitte lade ein Bild hoch**\n\nMach ein Foto von deinem Brief – die KI erklärt ihn dir auf Tigrinya, Amharisch, Deutsch oder Englisch.'
      });
    }

    // SIZE LIMIT
    if (image.length > 5_500_000) {
      return NextResponse.json({
        response: '📸 **Bild zu groß**\n\nMaximal 5 MB. Bitte mach ein kleineres Foto.'
      });
    }

    // PREMIUM CHECK
    let premium = null;
    if (userId) {
      premium = await checkPremium(userId);
      if (!premium.isPremium && premium.remaining <= 0) {
        return NextResponse.json({
          response: '💎 **Kostenloses Limit erreicht**\n\n🚀 **Premium** (9,99€/Monat): Unbegrenzte Brief-Analysen.\n\n👉 Klick auf den "💎 Premium" Button!'
        });
      }
    }

    // SPRACHE
    const userLang = detectUserLanguage(message);
    console.log('🌍 Sprache:', userLang);

    // Base64 extrahieren
    let base64Data = image;
    let mimeType = 'image/jpeg';

    if (image.startsWith('data:')) {
      const matches = image.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        base64Data = matches[2];
      }
    }

    // CACHE CHECK
    const { data: cached } = await supabase
      .from('document_analyses')
      .select('analysis')
      .eq('ocr_text', base64Data.substring(0, 100))
      .maybeSingle();

    if (cached?.analysis) {
      console.log('✅ Cache Treffer!');
      return NextResponse.json({ response: cached.analysis });
    }

    // GEMINI VISION – OCR + Erklärung in einem Schritt!
    console.log('🤖 Gemini Vision analysiert Bild...');
    let explanation = await analyzeImageWithGemini(base64Data, mimeType, userLang, message);

    // Fallback wenn Gemini fehlschlägt
    if (!explanation || explanation.length < 20) {
      console.log('⚠️ Gemini Vision fehlgeschlagen → Fallback');
      return NextResponse.json({
        response: '📸 **Kein Text erkannt**\n\nTipps:\n- Gute Beleuchtung\n- Brief gerade halten\n- Nah genug ran\n- Kamera ruhig halten'
      });
    }

    // CACHE SPEICHERN
    try {
      await supabase.from('document_analyses').insert({
        user_id: userId || null,
        ocr_text: base64Data.substring(0, 100),
        analysis: explanation,
        language: userLang,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.log('Cache Fehler (ignoriert):', e);
    }

    // USAGE TRACKING
    if (userId && premium && !premium.isPremium) {
      await incrementUsage(userId, false);
    }

    console.log('✅ Analyse fertig:', explanation.substring(0, 80));
    return NextResponse.json({ response: explanation });

  } catch (error) {
    console.error('API Fehler:', error);
    return NextResponse.json({
      response: '❌ **Fehler bei der Analyse**\n\nBitte später erneut versuchen.\n\nFalls Problem bleibt: massawa245@gmail.com'
    });
  }
}