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

// 🔥 WORD EXTRACTION (einfach, schnell, stabil)
function extractRelevantWords(message: string): string[] {
  const stopWords = ['der', 'die', 'das', 'und', 'oder', 'aber', 'nicht', 'ein', 'eine', 'einer', 'für', 'auf', 'bei'];
  return message
    .toLowerCase()
    .replace(/[.,!?;:()]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.includes(w));
}

// 🔥 INTENT DETECTION
function detectIntent(message: string): 'translation' | 'definition' | 'conversation' {
  const msg = message.toLowerCase();
  if (msg.includes('wie sagt man') || msg.includes('bedeutet') || msg.includes('was heißt') || 
      msg.includes('übersetze') || msg.includes('was ist') || msg.includes('was bedeutet')) {
    return 'translation';
  }
  if (msg.includes('erkläre') || msg.includes('was ist') || msg.includes('hilf mir')) {
    return 'definition';
  }
  return 'conversation';
}

export async function POST(req: Request) {
  try {
    const { message, history = [], userId } = await req.json();

    // 🔥 FREE LIMIT CHECK
    if (userId) {
      const { isPremium, remaining } = await checkPremium(userId);
      if (!isPremium && remaining <= 0) {
        return NextResponse.json({
          response: `💎 **Kostenloses Limit erreicht (5/Tag)**\n\n🚀 Upgrade auf Premium für unbegrenzte Chats, Brief-Analysen und mehr!\n\n👉 Klick auf den "💎 Premium" Button oben rechts.`
        });
      }
    }

    // 🔥 WÖRTERBUCH-SUCHE (schnell, stabil)
    const searchWords = extractRelevantWords(message);
    let woerterbuchContext = '';
    let relevanteWoerter: any[] = [];

    if (searchWords.length > 0) {
      const filters = searchWords.map(w => 
        `german.ilike.%${w}%,tigrinya_word.ilike.%${w}%`
      ).join(',');

      const { data } = await supabase
        .from('dictionary')
        .select('tigrinya_word, german, example_sentence')
        .or(filters)
        .limit(6);

      relevanteWoerter = data || [];

      if (relevanteWoerter.length > 0) {
        woerterbuchContext = `
📚 **WÖRTERBUCH – VERWENDE DIESE WÖRTER:**

${relevanteWoerter.map(w => `- ${w.tigrinya_word} = ${w.german}`).join('\n')}

⚠️ Wenn ein Wort im Wörterbuch passt, benutze es!`;
      }
    }

    // 🔥 FALLBACK: 3 zufällige Wörter (nie leerer Kontext)
    if (relevanteWoerter.length === 0) {
      const { data: random } = await supabase
        .from('dictionary')
        .select('tigrinya_word, german')
        .limit(3);
      
      if (random && random.length > 0) {
        woerterbuchContext = `
📚 **WÖRTER ZUM LERNEN:**
${random.map(w => `- ${w.tigrinya_word} = ${w.german}`).join('\n')}`;
      }
    }

    // 🔥 INTENT-INSTRUKTIONEN
    const intent = detectIntent(message);
    let intentInstruction = '';
    switch (intent) {
      case 'translation':
        intentInstruction = `⚠️ Übersetzungs-Modus: Gib NUR die Übersetzung, KEINE Erklärung, maximal 1 Satz.`;
        break;
      case 'definition':
        intentInstruction = `⚠️ Erklärungs-Modus: Erkläre kurz (1-2 Sätze), klar und hilfreich.`;
        break;
      default:
        intentInstruction = `⚠️ Konversations-Modus: Antworte kurz (maximal 2 Sätze), freundlich und hilfsbereit.`;
    }

    // 🔥 SYSTEM PROMPT
    const systemPrompt = `Du bist eine Tigrinya-KI-Assistentin für Eritreer und Äthiopier.

${woerterbuchContext}

${intentInstruction}

REGELN:
- Wenn der Nutzer DEUTSCH spricht → antworte auf DEUTSCH
- Wenn der Nutzer TIGRINYA spricht → antworte auf TIGRINYA
- Kurze, klare Sätze
- Freundlich und hilfsbereit

BEISPIELE:
- "Hallo" → "ሰላም"
- "Wie geht es dir?" → "ከመይ ኣለኻ?"
- "Mir geht es gut" → "ጽቡቕ ኣለኹ"
- "Danke" → "የቐንየለይ"`;

    // Nur letzte 6 Nachrichten (spart Tokens)
    const lastMessages = history.slice(-6);
    const messages = [
      { role: "system", content: systemPrompt },
      ...lastMessages,
      { role: "user", content: message }
    ];

    // 🔥 KI-ANTWORT
    let responseText = '';

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        max_tokens: 300,
        temperature: 0.3,
      });
      responseText = completion.choices?.[0]?.message?.content || 'Entschuldigung, keine Antwort erhalten.';
    } catch (groqError) {
      console.log('Groq Fehler, Fallback zu DeepSeek:', groqError);
      try {
        const completion = await deepseek.chat.completions.create({
          model: "deepseek-chat",
          messages,
          max_tokens: 300,
          temperature: 0.3,
        });
        responseText = completion.choices?.[0]?.message?.content || 'Entschuldigung, keine Antwort erhalten.';
      } catch (deepseekError) {
        console.error('DeepSeek auch fehlgeschlagen:', deepseekError);
        responseText = 'Entschuldigung, gerade technische Probleme. Bitte versuch es später nochmal.';
      }
    }

    // 🔥 LIMIT ERHÖHEN
    if (userId) {
      const { isPremium } = await checkPremium(userId);
      if (!isPremium) {
        await incrementUsage(userId, false);
      }
    }

    return NextResponse.json({ response: responseText });

  } catch (error) {
    console.error('API Fehler:', error);
    return NextResponse.json({
      response: 'Entschuldigung, gerade technische Probleme. Bitte versuch es später nochmal.'
    });
  }
}