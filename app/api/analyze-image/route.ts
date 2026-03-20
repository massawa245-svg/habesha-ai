// app/api/analyze-image/route.ts – mit aktuellen Modellen
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

export async function POST(req: Request) {
  try {
    const { image, question } = await req.json();

    if (!image) {
      return NextResponse.json({ 
        response: 'Kein Bild gefunden.' 
      });
    }

    console.log('📸 Bild empfangen, analysiere mit Vision-Modell...');

    // Vision-Modell: llama-3.2-90b-vision-preview (aktuell)
    const completion = await groq.chat.completions.create({
      model: "llama-3.2-90b-vision-preview", // ✅ aktuelles Vision-Modell
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: question || "Was siehst du auf diesem Bild? Beschreibe es genau, lies Text vor, falls vorhanden." 
            },
            { 
              type: "image_url", 
              image_url: { url: image } 
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.5,
    });

    console.log('✅ Vision-Analyse erfolgreich');
    
    return NextResponse.json({ 
      response: completion.choices[0].message.content 
    });
    
  } catch (error: any) {
    console.error('❌ Bildanalyse Fehler:', error);
    
    let errorMsg = 'Fehler bei der Bildanalyse. ';
    if (error.message) errorMsg += error.message;
    
    return NextResponse.json({ 
      response: errorMsg,
      error: true
    });
  }
}