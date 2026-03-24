import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { checkPremium, incrementUsage } from '@/lib/premium';
import { supabase } from '@/lib/supabase';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

export async function POST(req: Request) {
  try {
    const { message, history = [], userId, conversationId, isNewConversation } = await req.json();
    
    // 🔥 FREE LIMIT CHECK (für Chats)
    if (userId) {
      const { isPremium, remaining } = await checkPremium(userId);
      
      if (!isPremium && remaining <= 0) {
        return NextResponse.json({ 
          response: `💬 Du hast dein kostenloses Limit von 5 Anfragen pro Tag erreicht.

💎 Mit Premium (9,99€/Monat) kannst du unbegrenzt chatten und Briefe analysieren lassen.

👉 Klick auf den "💎 Premium" Button oben rechts in der App!` 
        });
      }
    }

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

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message }
    ];

    let responseText = '';

    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: messages,
        max_tokens: 250,
        temperature: 0.7,
      });

      responseText = completion.choices[0].message.content;

      // 🔥 Limit erhöhen (nur wenn nicht Premium)
      if (userId) {
        const { isPremium } = await checkPremium(userId);
        if (!isPremium) {
          await incrementUsage(userId, false);
        }
      }
    } catch (groqError) {
      console.log('Groq Fehler, Fallback zu DeepSeek:', groqError);
      
      const completion = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: messages,
        max_tokens: 250,
        temperature: 0.7,
      });

      responseText = completion.choices[0].message.content;

      if (userId) {
        const { isPremium } = await checkPremium(userId);
        if (!isPremium) {
          await incrementUsage(userId, false);
        }
      }
    }
    
    // 🔥 CHAT-VERLAUF IN DATENBANK SPEICHERN
    if (userId && conversationId) {
      try {
        // 1. User-Nachricht speichern
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          role: 'user',
          content: message,
          created_at: new Date()
        });
        
        // 2. KI-Antwort speichern
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: responseText,
          created_at: new Date()
        });
        
        // 3. Konversation aktualisieren (updated_at)
        await supabase
          .from('conversations')
          .update({ updated_at: new Date() })
          .eq('id', conversationId);
        
        // 4. Automatischen Titel generieren (nur bei neuer Konversation)
        if (isNewConversation) {
          const titlePrompt = `Erstelle einen kurzen Titel (maximal 5 Wörter) für dieses Gespräch auf Deutsch.
          
Kategorien: AOK, Finanzamt, Jobcenter, Liebe, Familie, Freunde, Gesundheit, Schule, Arbeit, Steuer, Versicherung.

Beispiele:
- "AOK Beitragserhöhung"
- "Steuererklärung Hilfe"
- "Liebesgeständnis"
- "Jobcenter Termin"
- "Krankenkasse Frage"

User-Nachricht: "${message}"

Antworte NUR mit dem Titel, ohne Anführungszeichen.`;
          
          const titleCompletion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: titlePrompt }],
            max_tokens: 20,
            temperature: 0.5,
          });
          
          let title = titleCompletion.choices[0].message.content.replace(/["']/g, '').trim();
          
          // Begrenze Titel auf 50 Zeichen
          if (title.length > 50) title = title.substring(0, 47) + '...';
          
          await supabase
            .from('conversations')
            .update({ title })
            .eq('id', conversationId);
        }
        
      } catch (dbError) {
        console.error('Fehler beim Speichern in DB:', dbError);
      }
    }

    return NextResponse.json({ 
      response: responseText,
      provider: 'groq'
    });
    
  } catch (error) {
    console.error('API Fehler:', error);
    return NextResponse.json({ 
      response: 'Entschuldigung, gerade technische Probleme. Bitte versuch es später nochmal.' 
    });
  }
}