// app/api/test-groq/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

export async function GET() {
  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile", // ✅ aktuelles Modell
      messages: [
        { role: "user", content: "Sag: 'Groq funktioniert mit dem neuen Modell!'" }
      ],
      max_tokens: 20,
    });

    return NextResponse.json({ 
      status: '✅ Groq API funktioniert',
      model: 'llama-3.3-70b-versatile',
      response: response.choices[0].message.content
    });
  } catch (error: any) {
    return NextResponse.json({ 
      status: '❌ Groq API Fehler',
      error: error.message
    });
  }
}