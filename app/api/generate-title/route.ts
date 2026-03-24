import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

export async function POST(req: Request) {
  const { message } = await req.json();
  
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: "Erstelle einen kurzen Titel (maximal 5 Wörter) für dieses Gespräch. Kategorien: AOK, Finanzamt, Jobcenter, Liebe, Familie, Freunde, Gesundheit, Schule, Arbeit." },
      { role: "user", content: message }
    ],
    max_tokens: 20,
  });
  
  return NextResponse.json({ 
    title: (completion.choices[0].message.content ?? '').replace(/["']/g, '').trim()
  });
}