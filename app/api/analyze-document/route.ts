import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import OpenAI from 'openai';
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

const visionClient = new ImageAnnotatorClient({
  apiKey: process.env.GOOGLE_VISION_API_KEY,
});

// ============================================
// 🌍 USER SPRACHE ERKENNEN (WICHTIG!)
// ============================================
function detectUserLanguage(text: string): 'de' | 'ti' | 'en' {
  if (!text) return 'de';

  if (/[\u1200-\u137F]/.test(text)) return 'ti';

  if (text.match(/\b(the|and|what|how|why|please|hello|thanks)\b/i)) {
    return 'en';
  }

  return 'de';
}

// ============================================
// 🧹 OCR CLEAN
// ============================================
function cleanOCR(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\x00-\x7F\u1200-\u137F\s.,!?;:()/-]/g, '')
    .trim()
    .slice(0, 3500);
}

// ============================================
// 📸 OCR
// ============================================
async function extractTextFromImage(base64Image: string): Promise<string> {
  let imageData = base64Image;
  if (base64Image.startsWith('data:image')) {
    imageData = base64Image.split(',')[1];
  }

  try {
    const [result] = await visionClient.textDetection({
      image: { content: imageData }
    });

    const detections = result.textAnnotations;

    if (detections && detections.length > 0) {
      return cleanOCR(detections[0].description || '');
    }

    return '';
  } catch (error) {
    console.error('OCR Fehler:', error);
    return '';
  }
}

// ============================================
// 🤖 KI MIT FALLBACK + SAFE RESPONSE
// ============================================
async function askAI(messages: any[]): Promise<string> {
  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 800,
      temperature: 0.3,
    });

    const text = res.choices?.[0]?.message?.content?.trim();
    if (text) return text;

    throw new Error('Empty response');
  } catch (e) {
    console.log('Groq fail → DeepSeek');

    try {
      const res = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages,
        max_tokens: 800,
        temperature: 0.3,
      });

      const text = res.choices?.[0]?.message?.content?.trim();
      if (text) return text;

      throw new Error('Empty fallback');
    } catch (err) {
      console.error('Beide KI fail:', err);
      return '';
    }
  }
}

// ============================================
// 🤖 DOCUMENT EXPLAINER (10/10 PROMPT)
// ============================================
async function explainDocument(ocrText: string, userLang: 'de' | 'ti' | 'en') {

  const langMap = {
    de: 'DEUTSCH',
    ti: 'TIGRINYA',
    en: 'ENGLISH'
  };

  const prompt = `
Du bist ein Experte für deutsche Behördenbriefe.

⚠️ WICHTIGE REGEL:
- Antworte NUR in dieser Sprache: ${langMap[userLang]}
- MISCHEN VERBOTEN

AUFGABE:
Erkläre den Brief so einfach wie möglich.

REGELN:
- NICHT Wort für Wort übersetzen
- KLAR sagen: WAS muss die Person tun
- FRISTEN deutlich nennen
- KONSEQUENZEN erklären

STRUKTUR:
📌 Worum geht es?
⚡ Was musst du tun?
⏰ Bis wann?
⚠️ Was passiert wenn nicht?
📞 Hilfe (falls vorhanden)

TEXT:
${ocrText}
`;

  return await askAI([
    { role: "system", content: "Du erklärst klar, einfach und ohne Fehler." },
    { role: "user", content: prompt }
  ]);
}

// ============================================
// 🚀 MAIN
// ============================================
export async function POST(req: Request) {
  try {
    const { image, message = '', userId } = await req.json();

    if (!image) {
      return NextResponse.json({
        response: '📸 Bitte Bild hochladen.'
      });
    }

    // 🔒 SIZE LIMIT
    if (image.length > 5_500_000) {
      return NextResponse.json({
        response: '📸 Bild zu groß (max 5MB).'
      });
    }

    // 💎 PREMIUM
    let premium = null;
    if (userId) {
      premium = await checkPremium(userId);
      if (!premium.isPremium && premium.remaining <= 0) {
        return NextResponse.json({
          response: '💎 Limit erreicht. Upgrade nötig.'
        });
      }
    }

    // 📸 OCR
    const ocrText = await extractTextFromImage(image);

    if (!ocrText || ocrText.length < 30) {
      return NextResponse.json({
        response: '❌ Kein klarer Text erkannt. Bitte besseres Foto.'
      });
    }

    // 🌍 USER LANGUAGE (NICHT OCR!)
    const userLang = detectUserLanguage(message);

    // 🤖 EXPLAIN
    const explanation = await explainDocument(ocrText, userLang);

    if (!explanation) {
      return NextResponse.json({
        response: '❌ KI Fehler. Bitte nochmal versuchen.'
      });
    }

    // 💾 SAVE
    if (userId) {
      try {
        await supabase.from('document_analyses').insert({
          user_id: userId,
          ocr_text: ocrText,
          analysis: explanation,
          language: userLang,
          created_at: new Date()
        });
      } catch {}
    }

    // 📊 LIMIT COUNT
    if (userId && premium && !premium.isPremium) {
      await incrementUsage(userId, false);
    }

    return NextResponse.json({ response: explanation });

  } catch (error) {
    console.error('API Fehler:', error);

    return NextResponse.json({
      response: '❌ Fehler. Bitte später erneut versuchen.'
    });
  }
}