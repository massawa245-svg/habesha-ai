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
// 🌍 USER SPRACHE ERKENNEN
// ============================================
function detectUserLanguage(text: string): 'de' | 'ti' | 'en' {
  if (!text) return 'de';
  if (text.match(/wie sagt man|übersetze|was heißt/i)) return 'de';
  if (/[\u1200-\u137F]/.test(text)) return 'ti';
  if (text.match(/\b(the|and|what|how|why|please|hello|thanks)\b/i)) return 'en';
  return 'de';
}

// ============================================
// 🧠 KI ANTWORT VALIDIEREN
// ============================================
function validateAIResponse(text: string): boolean {
  if (!text) return false;
  if (text.length < 20) return false;
  if (text.includes('???') || text.includes('###')) return false;
  if (text.split('\n').length > 15) return false;
  return true;
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
// 🤖 KI MIT FALLBACK
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
// 🔍 BEHÖRDEN-TYP ERKENNEN
// ============================================
function detectBehoerde(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('jobcenter')) return 'Jobcenter';
  if (lower.includes('aok') || lower.includes('krankenkasse')) return 'AOK / Krankenkasse';
  if (lower.includes('finanzamt') || lower.includes('steuer')) return 'Finanzamt';
  if (lower.includes('ausländerbehörde') || lower.includes('aufenthalt')) return 'Ausländerbehörde';
  if (lower.includes('bafög') || lower.includes('studentenwerk')) return 'BAföG / Studium';
  return 'Behörde';
}

// ============================================
// 🤖 SMART DOCUMENT EXPLAINER
// ============================================
async function explainDocument(ocrText: string, userLang: 'de' | 'ti' | 'en', userMessage: string) {
  const langMap = { de: 'DEUTSCH', ti: 'TIGRINYA', en: 'ENGLISH' };
  const behoerde = detectBehoerde(ocrText);

  const prompt = `
Du bist ein Experte für deutsche Behördenbriefe.

📌 ERKANNTE BEHÖRDE: ${behoerde}

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
- Maximal 6–8 Zeilen (kurz!)

STRUKTUR (MUSS genau so sein):
📌 Worum geht es? (1 Satz)
⚡ Was musst du tun? (Schritt für Schritt)
⏰ Bis wann?
⚠️ Was passiert wenn nicht?
📞 Hilfe (falls vorhanden)

USER FRAGE: ${userMessage}

Brief-Text:
${ocrText}

WENN die Struktur fehlt → korrigiere dich selbst und schreibe neu.`;

  return await askAI([
    { role: "system", content: "Du erklärst klar, einfach und ohne Fehler. Halte dich genau an die Struktur." },
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
        response: '📸 **Bitte lade ein Bild hoch**\n\nMach ein Foto von deinem Brief – die KI erklärt ihn dir auf Tigrinya.'
      });
    }

    // 🔒 SIZE LIMIT
    if (image.length > 5_500_000) {
      return NextResponse.json({
        response: '📸 **Bild zu groß**\n\nDas Bild ist größer als 5 MB. Bitte mach ein kleineres Foto oder komprimier es.'
      });
    }

    // 💎 PREMIUM
    let premium = null;
    if (userId) {
      premium = await checkPremium(userId);
      if (!premium.isPremium && premium.remaining <= 0) {
        return NextResponse.json({
          response: `💎 **Kostenloses Limit erreicht (5/Tag)**\n\n🚀 **Premium** (9,99€/Monat): Unbegrenzte Brief-Analysen.\n\n👉 Klick auf den "💎 Premium" Button oben rechts!`
        });
      }
    }

    // 🔥 CACHING: Prüfe ob gleicher Brief schon analysiert wurde
    const ocrText = await extractTextFromImage(image);
    
    if (!ocrText || ocrText.length < 20) {
      return NextResponse.json({
        response: `📸 **Kein Text erkannt**\n\nTipps: Kamera ruhig halten, gute Beleuchtung, gerade halten, nah genug ran.`
      });
    }

    // CACHE CHECK
    const { data: cached } = await supabase
      .from('document_analyses')
      .select('analysis')
      .eq('ocr_text', ocrText)
      .maybeSingle();

    if (cached?.analysis) {
      console.log('✅ Cache Treffer!');
      return NextResponse.json({ response: cached.analysis });
    }

    console.log('📝 OCR erkannt:', ocrText.substring(0, 200));

    // 🌍 USER LANGUAGE (NICHT OCR!)
    const userLang = detectUserLanguage(message);
    console.log('🌍 Sprache:', userLang);

    // 🤖 SMART EXPLAIN
    const explanation = await explainDocument(ocrText, userLang, message);

    // ✅ VALIDIERUNG
    if (!validateAIResponse(explanation)) {
      console.log('⚠️ KI Antwort ungültig, Fallback...');
      return NextResponse.json({
        response: '❌ **Antwort war unklar**\n\nBitte versuche es nochmal mit einem besseren Foto.'
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
      response: '❌ **Fehler bei der Analyse**\n\nBitte später erneut versuchen.\n\nFalls Problem bleibt: massawa245@gmail.com'
    });
  }
}