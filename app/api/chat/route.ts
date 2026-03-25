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

function extractRelevantWords(message: string): string[] {
  const stopWords = ['der', 'die', 'das', 'und', 'oder', 'aber', 'nicht', 'ein', 'eine'];
  return message
    .toLowerCase()
    .replace(/[.,!?;:()]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.includes(w));
}

function detectIntent(message: string): 'translation' | 'definition' | 'conversation' | 'love' | 'greeting' {
  const msg = message.toLowerCase();
  if (msg.includes('liebe dich') || msg.includes('love you') || msg.includes('i love you')) return 'love';
  if (msg.includes('wie sagt man') || msg.includes('bedeutet') || msg.includes('was heißt') || msg.includes('übersetze')) return 'translation';
  if (msg.includes('erkläre') || msg.includes('was bedeutet') || msg.includes('hilf mir')) return 'definition';
  if (msg.includes('hallo') || msg.includes('hi') || msg.includes('selam') || msg.includes('guten morgen')) return 'greeting';
  return 'conversation';
}

export async function POST(req: Request) {
  try {
    const { message, history = [], userId } = await req.json();

    if (userId) {
      const { isPremium, remaining } = await checkPremium(userId);
      if (!isPremium && remaining <= 0) {
        return NextResponse.json({
          response: `💎 **Kostenloses Limit erreicht (5/Tag)**\n\n🚀 Upgrade auf Premium für unbegrenzte Chats!`
        });
      }
    }

    const searchWords = extractRelevantWords(message);
    let woerterbuchContext = '';
    let relevanteWoerter: any[] = [];

    if (searchWords.length > 0) {
      const filters = searchWords.map(w => `german.ilike.%${w}%,tigrinya_word.ilike.%${w}%`).join(',');
      const { data } = await supabase.from('dictionary').select('tigrinya_word, german').or(filters).limit(6);
      relevanteWoerter = data || [];
      if (relevanteWoerter.length > 0) {
        woerterbuchContext = `📚 **WÖRTERBUCH (MUSSST DU VERWENDEN):**\n${relevanteWoerter.map(w => `- ${w.tigrinya_word} = ${w.german}`).join('\n')}\n⚠️ Wenn ein Wort im Wörterbuch steht, MUSST du es benutzen. KEINE eigenen Übersetzungen!`;
      }
    }

    if (relevanteWoerter.length === 0) {
      const { data: random } = await supabase.from('dictionary').select('tigrinya_word, german').limit(3);
      if (random?.length) {
        woerterbuchContext = `📚 **WÖRTER ZUM LERNEN:**\n${random.map(w => `- ${w.tigrinya_word} = ${w.german}`).join('\n')}`;
      }
    }

    const intent = detectIntent(message);
    let intentInstruction = '';
    switch (intent) {
      case 'love':
        intentInstruction = `⚠️ **LIEBES-PHRASE MODUS:** Erkläre kurz auf Deutsch, wie man "Ich liebe dich" auf Tigrinya sagt. Gib die Übersetzung: "ኣነ የፍቅረካ" (zu einem Mann) / "ኣነ የፍቅረኪ" (zu einer Frau). Maximal 2-3 Sätze. Freundlich und herzlich.`;
        break;
      case 'translation':
        intentInstruction = `⚠️ **ÜBERSETZUNGS-MODUS:** Gib NUR die Übersetzung, KEINE Erklärung, MAXIMAL 1 Satz.`;
        break;
      case 'definition':
        intentInstruction = `⚠️ **ERKLÄRUNGS-MODUS:** Erkläre kurz (1-2 Sätze), klar und hilfreich.`;
        break;
      case 'greeting':
        intentInstruction = `⚠️ **BEGRÜSSUNGS-MODUS:** Antworte kurz und freundlich.`;
        break;
      default:
        intentInstruction = `⚠️ **KONVERSATIONS-MODUS:** Antworte kurz (maximal 2 Sätze), freundlich.`;
    }

    const systemPrompt = `Du bist eine Tigrinya-KI-Assistentin.

⚠️ **HARTE REGELN:**
1. **SPRACHE:** Wenn Nutzer DEUTSCH fragt → antworte NUR auf DEUTSCH. Wenn TIGRINYA fragt → antworte NUR auf TIGRINYA. MISCHEN VERBOTEN!
2. **WÖRTERBUCH:** ${woerterbuchContext}
3. **ANTWORTEN:** Maximal 2-3 Sätze, kurz, klar, hilfreich.
4. **WENN DU ETWAS NICHT WEISST:** Sage "ኣይፈልጥን" (Tigrinya) oder "Das weiß ich nicht" (Deutsch).

${intentInstruction}

BEISPIELE:
- "Hallo" → "ሰላም"
- "Wie geht es dir?" → "ከመይ ኣለኻ? (m) / ከመይ ኣለኺ? (f)"
- "Ich liebe dich" → "ኣነ የፍቅረካ (m) / ኣነ የፍቅረኪ (f)"`;

    const lastMessages = history.slice(-6);
    const messages = [{ role: "system", content: systemPrompt }, ...lastMessages, { role: "user", content: message }];

    let responseText = '';
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        max_tokens: 300,
        temperature: 0.3,
      });
      responseText = completion.choices?.[0]?.message?.content || 'Entschuldigung, keine Antwort.';
    } catch (groqError) {
      const completion = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages,
        max_tokens: 300,
        temperature: 0.3,
      });
      responseText = completion.choices?.[0]?.message?.content || 'Entschuldigung, technische Probleme.';
    }

    if (userId) {
      const { isPremium } = await checkPremium(userId);
      if (!isPremium) await incrementUsage(userId, false);
    }

    return NextResponse.json({ response: responseText });

  } catch (error) {
    console.error('API Fehler:', error);
    return NextResponse.json({ response: 'Entschuldigung, technische Probleme. Bitte später nochmal.' });
  }
}