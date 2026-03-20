// app/api/analyze-image/route.ts - DEBUG VERSION
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
        response: 'Kein Bild gefunden. Bitte lade ein Bild hoch.' 
      });
    }

    console.log('📸 Bild empfangen, Länge:', image.length);
    
    // Bild-URL für Groq vorbereiten
    const imageUrl = image.startsWith('data:image') ? image : `data:image/jpeg;base64,${image}`;
    
    const systemPrompt = `Du bist ein hilfreicher Assistent, der Bilder analysiert und erklärt.
    Erkläre WAS auf dem Bild zu sehen ist. Wenn Text im Bild ist, lies ihn vor. Sei präzise.`;

    console.log('📡 Sende Anfrage an Groq LLaVA...');
    
    const response = await groq.chat.completions.create({
      model: "llava-v1.5-7b-4096-preview",
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: systemPrompt + "\n\n" + (question || "Was siehst du auf diesem Bild? Beschreibe es genau.") 
            },
            { 
              type: "image_url", 
              image_url: { url: imageUrl } 
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.5,
    });

    console.log('✅ Groq Antwort erhalten');
    
    return NextResponse.json({ 
      response: response.choices[0].message.content 
    });
    
  } catch (error: any) {
    console.error('❌ Bildanalyse Fehler DETAILS:', error);
    
    // Detaillierte Fehlermeldung zurückgeben
    let errorMessage = 'Fehler bei der Bildanalyse. ';
    
    if (error.message) {
      errorMessage += error.message;
    }
    
    if (error.status) {
      errorMessage += ` (Status: ${error.status})`;
    }
    
    return NextResponse.json({ 
      response: errorMessage,
      error: true,
      details: error.message
    });
  }
}