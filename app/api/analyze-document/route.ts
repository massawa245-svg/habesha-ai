import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { checkPremium, incrementUsage } from '@/lib/premium';
import crypto from 'crypto';

// ============================================
// API CLIENTS INITIALISIERUNG
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

const IDENTITY = `Du bist HABESHA AI – entwickelt von Massawa Software Technology (Deutschland).
Du bist KEIN ChatGPT, KEIN Meta, KEIN Gemini, KEIN Claude.`;

const PROMPT_LANG_MAP = {
  de: 'DEUTSCH',
  ti: 'TIGRINYA (ትግርኛ) - Schreibe hauptsächlich in Ge\'ez Schrift. Wichtige deutsche Eigennamen (z.B. Jobcenter, AOK, Finanzamt, IBAN, Fristen) bitte UNBEDINGT in lateinischen Buchstaben in Klammern dahinter setzen!',
  am: 'AMHARISCH (አማርኛ) - Schreibe hauptsächlich in Ge\'ez Schrift. Wichtige deutsche Eigennamen oder Fristen bitte in lateinischen Buchstaben in Klammern dahinter setzen!',
  en: 'ENGLISH',
};

// ============================================
// HELPER FUNCTIONS
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

async function saveToChatHistory(
  supabase: any,
  userId: string | null,
  conversationId: string | null,
  question: string,
  answer: string,
  language: string,
  source: string
) {
  try {
    await supabase.from('chat_history').insert({
      user_id: userId || null,
      user_question: question.substring(0, 500),
      ai_answer: answer.substring(0, 2000),
      language: language,
      source: source,
      reviewed: false,
      approved_for_training: false,
      created_at: new Date().toISOString(),
    });

    if (conversationId) {
      await supabase.from('messages').insert([
        { conversation_id: conversationId, role: 'user', content: question.substring(0, 500) },
        { conversation_id: conversationId, role: 'assistant', content: answer }
      ]);
    }
    console.log(`💾 Erfolgreich in Chat-History & Messages gesichert. Source: ${source}`);
  } catch (err) {
    console.error('Fehler beim Sichern der Chat-Daten:', err);
  }
}

// ============================================
// CORE AI PIPELINES
// ============================================
async function analyzeImageWithGemini(
  base64Image: string,
  mimeType: string,
  userLang: 'de' | 'ti' | 'am' | 'en',
  userMessage: string
): Promise<string> {
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `${IDENTITY}
Du bist ein Experte für deutsche Behördenbriefe und hilfst der Habesha Community in Deutschland.

⚠️ WICHTIG: Antworte NUR in dieser Sprache: ${PROMPT_LANG_MAP[userLang]}

SCHRITT 1: Prüfe ob das Bild einen offiziellen Brief, ein Dokument oder ein Schreiben zeigt.
- Wenn KEIN Dokument erkennbar ist (z.B. Essen, Gesichter, Uhren, Landschaften): Antworte höflich, dass du nur Dokumente analysieren kannst.
- Wenn JA: Erkläre den Inhalt strukturiert.

STRUKTUR FÜR DIE ANTWORT:
📌 Worum geht es? (1-2 Sätze, klar und einfach)
⚡ Was musst du tun? (Konkrete Handlungsschritte für den User)
⏰ Bis wann? (Exaktes Datum/Frist fettgedruckt hervorheben, falls vorhanden)
⚠️ Was passiert wenn nicht? (Konsequenzen verständlich erklären)
📞 Kontakt (Name der Behörde, Telefon oder Aktenzeichen falls ersichtlich)

ZUSATZ-NUTZERFRAGE: ${userMessage}`;

  try {
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: mimeType as any, data: base64Image } },
    ]);
    return result.response.text().trim();
  } catch (error) {
    console.error('Gemini Vision Core Error:', error);
    return '';
  }
}

async function analyzeExtractedText(
  extractedText: string,
  userLang: 'de' | 'ti' | 'am' | 'en',
  userMessage: string
): Promise<string> {
  const behoerde = detectBehoerde(extractedText);
  const prompt = `${IDENTITY}
Du bist ein Experte für deutsche Behördenbriefe.

Identifizierte Behörde: ${behoerde}
⚠️ WICHTIG: Antworte AUSSCHLIESSLICH in dieser Sprache: ${PROMPT_LANG_MAP[userLang]}

Erkläre den folgenden Dokumenten-Text strukturiert und einfach:
📌 Worum geht es? (Einfache Erklärung)
⚡ Was musst du tun? (Konkrete Schritte)
⏰ Bis wann? (Fristen fett markieren)
⚠️ Was passiert wenn nicht?
📞 Kontakt

Zusatzfrage des Nutzers: ${userMessage}

Hier ist der zu analysierende Text:
${extractedText.substring(0, 4000)}`;

  try {
    const res = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.3,
    });
    return res.choices?.[0]?.message?.content?.trim() ?? '';
  } catch {
    console.log('DeepSeek PDF-Analyse fehlgeschlagen → Fallback auf Groq Llama 3.3');
    try {
      const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
        temperature: 0.3,
      });
      return res.choices?.[0]?.message?.content?.trim() ?? '';
    } catch (err) {
      console.error('Groq Fallback-Pipeline ebenfalls fehlgeschlagen:', err);
      return '';
    }
  }
}

// ============================================
// MAIN POST ROUTE CONTROLLER
// ============================================
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { image, message = '', conversationId, language } = await req.json();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    if (!image) {
      return NextResponse.json({
        response: '📸📄 Bitte lade ein Bild oder eine PDF-Datei hoch.\n\nIch erkläre dir den Brief auf Tigrinya, Amharisch, Deutsch oder Englisch.'
      });
    }

    let premium = null;
    if (userId) {
      premium = await checkPremium(userId);
      if (!premium.isPremium && premium.remaining <= 0) {
        return NextResponse.json({
          response: '💎 Kostenloses Limit erreicht.\n\nPremium (9,99€/Monat): Unbegrenzte Brief-Analysen.\n\n👉 Klick auf den "💎 Premium" Button!'
        });
      }
    }

    const userLang = language || detectUserLanguage(message);

    let base64Data = image;
    let mimeType = 'image/jpeg';

    if (image.startsWith('data:')) {
      const matches = image.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        base64Data = matches[2];
      }
    }

    const fileHash = crypto.createHash('md5').update(base64Data).digest('hex');

    const { data: cached } = await supabase
      .from('document_analyses')
      .select('analysis')
      .eq('ocr_text', fileHash)
      .maybeSingle();

    if (cached?.analysis) {
      console.log('⚡ Cache-Hit! Schnelle Antwort wird ausgeliefert.');
      await saveToChatHistory(supabase, userId, conversationId, message || 'Dokumenten-Analyse (Cache)', cached.analysis, userLang, 'cache');
      return NextResponse.json({ response: cached.analysis });
    }

    let explanation = '';
    let logSource = 'gemini_vision';

    // ============================================
    // DISTRIBUTION PIPELINE (PDF vs. BILD)
    // ============================================
    if (mimeType === 'application/pdf' || image.slice(0, 30).includes('pdf')) {
      console.log('📄 PDF erkannt! Starte Parser via geschütztem Inline-Require...');
      logSource = 'pdf_text_pipeline';

      try {
        // 🔥 Schützt vor ESM/Kompilierungs-Fehlern im Next.js Buildprozess
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParser = require('pdf-parse');
        const pdfBuffer = Buffer.from(base64Data, 'base64');
        const pdfData = await pdfParser(pdfBuffer);
        const extractedText = pdfData.text?.trim();

        if (!extractedText || extractedText.length < 10) {
          return NextResponse.json({
            response: '⚠️ Diese PDF enthält keinen auslesbaren Text (reiner Foto-Scan in einer PDF).\n\nBitte mache stattdessen ein scharfes Foto direkt mit deiner Handy-Kamera und lade es hoch!'
          });
        }

        explanation = await analyzeExtractedText(extractedText, userLang, message);

      } catch (pdfErr) {
        console.error('Parser-Fehler bei PDF:', pdfErr);
        return NextResponse.json({
          response: '❌ Die PDF-Datei konnte nicht gelesen werden. Bitte schicke das Dokument stattdessen als Foto.'
        });
      }

    } else {
      console.log('🤖 Bild erkannt. Starte Vision-Analyse...');
      explanation = await analyzeImageWithGemini(base64Data, mimeType, userLang, message);
    }

    if (!explanation || explanation.length < 20) {
      return NextResponse.json({
        response: '📸 Kein Text erkannt.\n\nTipps für ein gutes Ergebnis:\n- Gute Beleuchtung wählen\n- Brief flach und gerade hinlegen\n- Nah genug herangehen\n- Kamera ruhig halten!'
      });
    }

    try {
      await supabase.from('document_analyses').insert({
        user_id: userId || null,
        ocr_text: fileHash,
        analysis: explanation,
        language: userLang,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.log('Cache-Insert Fehler (wird ignoriert):', e);
    }

    await saveToChatHistory(
      supabase,
      userId,
      conversationId,
      message || `📄 Brief: ${detectBehoerde(explanation)}`,
      explanation,
      userLang,
      logSource
    );

    if (userId && premium && !premium.isPremium) {
      await incrementUsage(userId, false);
    }

    return NextResponse.json({ response: explanation });

  } catch (error) {
    console.error('Globaler API Fehler in Document-Route:', error);
    return NextResponse.json({
      response: '❌ Ein Fehler ist aufgetreten. Bitte versuche es gleich noch einmal oder wende dich an massawa245@gmail.com.'
    });
  }
}