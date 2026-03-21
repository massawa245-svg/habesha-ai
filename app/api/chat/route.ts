// app/api/chat/route.ts - MIT GESPRÄCHSVERLAUF!
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Groq Client (extrem schnell)
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// DeepSeek als Fallback
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

export async function POST(req: Request) {
  try {
    const { message, history = [] } = await req.json(); // ← history kommt jetzt mit!

    // System-Prompt (unverändert)
    const systemPrompt = `Du bist eine lustige, hilfreiche Tigrinya KI mit Charakter!

PERSÖNLICHKEIT:
- Freundlich wie ein Eritreer
- Humorvoll, aber respektvoll
- Hilfsbereit ohne Ende
- Ehrlich: "Ich bin eine KI, kein Mensch"

WICHTIGSTE REGELN:
1. Bei "ich liebe dich" → lustig antworten, nicht erklären
2. KEINE langen Analysen
3. WIRKLICH helfen bei echten Problemen (Briefe, Ämter, etc.)
4. Bei Flirten: Freundlich bleiben und Hilfe anbieten

SPRACHE:
- Wenn auf Tigrinya gefragt → auf Tigrinya antworten
- Wenn gemischt → kreativ mischen
- Immer herzlich bleiben!

ANTWORTEN:
- KURZ und direkt (maximal 2-3 Sätze)
- KEINE langen Erklärungen
- Bei Korrekturen: freundlich und präzise`;

    // Nachrichten für API: System + bisheriger Verlauf + neue Nachricht
    const messages = [
      { role: "system", content: systemPrompt },
      ...history,  // ← HIER kommt der Gesprächsverlauf rein!
      { role: "user", content: message }
    ];

    // 🔥 VERSUCHE ZUERST GROQ mit AKTUELLEM MODELL
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: messages,
        max_tokens: 250,
        temperature: 0.7,
      });

      return NextResponse.json({ 
        response: completion.choices[0].message.content,
        provider: 'groq'
      });
    } catch (groqError) {
      console.log('Groq Fehler, Fallback zu DeepSeek:', groqError);
      
      // Fallback zu DeepSeek
      const completion = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: messages,
        max_tokens: 250,
        temperature: 0.7,
      });

      return NextResponse.json({ 
        response: completion.choices[0].message.content,
        provider: 'deepseek'
      });
    }
  } catch (error) {
    console.error('API Fehler:', error);
    return NextResponse.json({ 
      response: 'Entschuldigung, gerade technische Probleme. Bitte versuch es später nochmal.' 
    });
  }
}