import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';
import { checkPremium, incrementUsage } from '@/lib/premium';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// Simulierter OCR (für Test – später durch echten Google Vision ersetzen)
async function extractTextFromImage(base64Image: string): Promise<string> {
  let imageData = base64Image;
  if (base64Image.startsWith('data:image')) {
    imageData = base64Image.split(',')[1];
  }
  
  return `AOK Baden-Württemberg
Ihr monatlicher Beitrag ändert sich ab 01.04.2026.
Neuer Beitrag: 214,50 € monatlich.
Bitte überweisen Sie den neuen Betrag bis zum 15.04.2026.
Bei verspäteter Zahlung können Mahngebühren anfallen.
Telefon: 0800 123456`;
}

export async function POST(request: Request) {
  try {
    const { image, userId } = await request.json();
    
    if (!image) {
      return NextResponse.json({ 
        response: 'Kein Bild gefunden. Bitte lade ein Bild hoch.' 
      });
    }
    
    // 🔥 FREE LIMIT CHECK
    if (userId) {
      const { isPremium, remaining } = await checkPremium(userId);
      
      if (!isPremium && remaining <= 0) {
        return NextResponse.json({ 
          response: `📸 Du hast dein kostenloses Limit von 5 Anfragen pro Tag erreicht.

💎 Mit Premium (9,99€/Monat) kannst du unbegrenzt Briefe analysieren lassen.

👉 Klick auf den "💎 Premium" Button oben rechts in der App!` 
        });
      }
    }
    
    // 1. OCR: Text aus Bild lesen
    console.log('📸 OCR starten...');
    const ocrText = await extractTextFromImage(image);
    console.log('📝 OCR Text:', ocrText.substring(0, 200));
    
    if (!ocrText || ocrText.trim().length < 10) {
      return NextResponse.json({ 
        response: '❌ Konnte keinen Text auf dem Bild erkennen. Bitte mach ein klareres Foto.'
      });
    }
    
    // 2. Prompt für KI
    const userPrompt = `Du bist ein Experte für Behördenbriefe in Deutschland.
Ein Eritreer hat diesen deutschen Brief erhalten und versteht ihn nicht.

Erkläre den Brief auf TIGRINYA so, dass er GENAU versteht, was zu tun ist.

WICHTIGE REGELN:
- NICHT Wort-für-Wort übersetzen
- KLAR sagen: WAS muss die Person TUN?
- FRISTEN hervorheben (bis wann?)
- KONSEQUENZEN erklären (was passiert wenn nicht?)
- Einfache, kurze Sätze

STRUKTUR:
📌 Worum geht es? (Ein Satz)
⚡ Was musst du tun? (Schritt für Schritt)
⏰ Bis wann?
⚠️ Was passiert wenn nicht?
📞 Hilfe bekommen (wenn nötig)

Brief-Text:
${ocrText}`;

    // 3. KI antworten lassen
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { 
          role: "system", 
          content: "Du erklärst Behördenbriefe einfach auf Tigrinya. Sei freundlich, klar und hilfreich." 
        },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 800,
      temperature: 0.3,
    });

    const explanation = completion.choices[0].message.content;
    
    // 4. Speichern in Supabase
    if (userId) {
      try {
        await supabase.from('document_analyses').insert({
          user_id: userId,
          ocr_text: ocrText,
          analysis: explanation,
          created_at: new Date()
        });
        
        // 🔥 Limit erhöhen (nur wenn nicht Premium)
        const { isPremium } = await checkPremium(userId);
        if (!isPremium) {
          await incrementUsage(userId, false);
        }
      } catch (e) {
        console.log('Speichern fehlgeschlagen:', e);
      }
    }
    
    return NextResponse.json({ response: explanation });
    
  } catch (error: any) {
    console.error('❌ Bildanalyse Fehler:', error);
    return NextResponse.json({ 
      response: 'Fehler bei der Bildanalyse. Bitte versuch es später nochmal.' 
    });
  }
}