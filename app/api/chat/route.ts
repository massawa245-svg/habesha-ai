import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { checkPremium, incrementUsage } from '@/lib/premium';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

// ============================================
// 🌍 SPRACHERKENNUNG (VERBESSERT)
// ============================================
function wantsTigrinya(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /[\u1200-\u137F]/.test(text) ||
    lower.includes('tigrinya') ||
    lower.includes('auf tigrinya') ||
    lower.includes('übersetze') ||
    lower.includes('translate')
  );
}

function detectLanguage(text: string): 'de' | 'ti' | 'en' {
  if (!text) return 'de';
  if (wantsTigrinya(text)) return 'ti';
  if (/\b(the|and|hello|how|what|please|thanks)\b/i.test(text)) return 'en';
  return 'de';
}

// ============================================
// 🔧 QUALITÄTSFILTER (SANFT)
// ============================================
function isGoodTigrinya(text: string): boolean {
  if (!text) return false;
  if (text.length < 3) return false;
  // Zu viele Wiederholungen vermeiden
  if (/(.)\1{4,}/.test(text)) return false;
  return true;
}

// ============================================
// 📚 DATABASE HILFE (SEPARAT, NICHT IM SYSTEM PROMPT)
// ============================================
async function getDictionaryHint(supabase: any, message: string): Promise<string> {
  const clean = message.toLowerCase().replace(/[.,!?;:()]/g, '');
  const words = clean.split(/\s+/).filter(w => w.length > 2);
  
  if (words.length === 0) return '';
  
  const hints: string[] = [];
  
  for (const word of words.slice(0, 3)) {
    const { data } = await supabase
      .from('dictionary')
      .select('tigrinya_word, german')
      .ilike('german', `%${word}%`)
      .limit(1);
    
    if (data && data.length > 0) {
      hints.push(`- ${word} = ${data[0].tigrinya_word}`);
    }
  }
  
  if (hints.length > 0) {
    return `\n📚 Wörterbuch-Hinweise (verwende diese Wörter natürlich in deiner Antwort):\n${hints.join('\n')}\n`;
  }
  
  return '';
}

// ============================================
// 🎯 EINFACHE PATTERNS (NUR ALS LETZTER FALLBACK)
// ============================================
function getSimpleFallback(message: string): string | null {
  const lower = message.toLowerCase();
  
  const patterns: { match: string[]; response: string }[] = [
    { match: ['hallo', 'hi', 'hey', 'selam'], response: 'ሰላም' },
    { match: ['guten morgen', 'good morning'], response: 'ከመይ ሓዲርካ? ከመይ ክሕግዘካ ይኽእል?' },
    { match: ['guten abend', 'good evening'], response: 'ከመይ ኣምሲኻ?' },
    { match: ['gute nacht', 'good night'], response: 'ጽቡቕ ለይቲ!' },
    { match: ['wie geht', 'how are'], response: 'ከመይ ኣለካ?' },
    { match: ['danke', 'thank'], response: 'የቐንየለይ' },
    { match: ['tschüss', 'bye'], response: 'ደሓን ኩን' },
  ];
  
  const nameMatch = lower.match(/ich heiße (\w+)/);
  if (nameMatch) {
    return `ስመይ ${nameMatch[1]} እዩ። ከመይ ክሕግዘካ ይኽእል?`;
  }
  
  for (const p of patterns) {
    if (p.match.some(m => lower.includes(m))) {
      return p.response;
    }
  }
  
  return null;
}

// ============================================
// 🤖 KI
// ============================================
async function askAI(messages: any[], temperature: number = 0.5) {
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 200,
      temperature,
    });
    const text = res.choices?.[0]?.message?.content?.trim() ?? '';
    if (text) return text;
  } catch (e) {
    console.log('Groq Fehler → DeepSeek');
  }
  
  try {
    const res = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      max_tokens: 200,
      temperature,
    });
    return res.choices?.[0]?.message?.content?.trim() ?? '';
  } catch (e) {
    console.log('DeepSeek Fehler');
  }
  
  return '';
}

// ============================================
// 🚀 MAIN ROUTE
// ============================================
export async function POST(req: Request) {
  try {
    const { message, history = [], userId } = await req.json();
    const supabase = await createClient();
    
    console.log('📝 User:', message);
    
    const isTi = wantsTigrinya(message);
    const targetLang = isTi ? 'ti' : detectLanguage(message);
    
    // 💎 Premium Check
    if (userId) {
      const { isPremium, remaining } = await checkPremium(userId);
      if (!isPremium && remaining <= 0) {
        return NextResponse.json({
          response: `💎 Limit erreicht. Upgrade für unbegrenzt.`,
        });
      }
    }
    
    // ============================================
    // 1. 🔥 KI ZUERST
    // ============================================
    
    // System Prompt (ELITE LEVEL mit Beispielen)
    const systemPrompt = isTi
      ? `Du bist ein Muttersprachler für Tigrinya.

Regeln:
- Antworte NUR auf Tigrinya
- Schreibe natürliche, grammatikalisch korrekte Sätze
- KEINE erfundenen Wörter
- KEIN Amharisch
- Antworte wie ein Mensch, nicht wie ein Übersetzer

Wenn der User Deutsch schreibt:
→ Übersetze sinnvoll ins Tigrinya (nicht Wort für Wort)

Beispiele:
Deutsch: Guten Morgen
Tigrinya: ከመይ ሓዲርካ? ከመይ ክሕግዘካ ይኽእል?

Deutsch: Ich bin eine Frau
Tigrinya: ኣነ ሰበይቲ እየ።

Deutsch: Danke
Tigrinya: የቐንየለይ

Deutsch: Tschüss
Tigrinya: ደሓን ኩን`
      : targetLang === 'en'
      ? `You are a helpful assistant. Answer in English. Be concise and helpful.`
      : `Du bist ein hilfsbereiter Assistent. Antworte auf Deutsch. Sei kurz und präzise.`;
    
    // Hole Dictionary-Hinweise (SEPARAT, nicht im System Prompt)
    const dictionaryHint = await getDictionaryHint(supabase, message);
    
    const messages = [
      { role: 'system', content: systemPrompt },
    ];
    
    // Dictionary-Hinweise als separate System-Nachricht (nur für Tigrinya)
    if (isTi && dictionaryHint) {
      messages.push({ role: 'system', content: dictionaryHint });
    }
    
    messages.push(
      ...history.slice(-4),
      { role: 'user', content: message }
    );
    
    let response = await askAI(messages, 0.5);
    let source = 'ai';
    
    // ============================================
    // 2. 🔧 QUALITÄTSFILTER + FALLBACK
    // ============================================
    
    // Für Tigrinya: Qualitätscheck
    if (isTi && !isGoodTigrinya(response)) {
      console.log('⚠️ Qualitätsfilter schlug an, verwende Fallback');
      response = '';
    }
    
    // Fallback, wenn KI nichts lieferte oder Filter anschlug
    if (!response || response.length < 2) {
      const fallback = getSimpleFallback(message);
      
      if (fallback) {
        response = fallback;
        source = 'fallback';
      } else {
        response = isTi
          ? 'ኣይፈልጥን — ገና እማሃር ኣለኹ።'
          : targetLang === 'en'
          ? "I don't know that yet — still learning."
          : "Das weiß ich noch nicht — ich lerne dazu.";
        source = 'default';
      }
    }
    
    // ============================================
    // 3. 📊 LIMIT erhöhen
    // ============================================
    if (userId) {
      const { isPremium } = await checkPremium(userId);
      if (!isPremium) await incrementUsage(userId, false);
    }
    
    console.log('✅ Antwort:', response);
    
    return NextResponse.json({ 
      response, 
      source,
      detectedLang: isTi ? 'ti' : targetLang
    });
    
  } catch (error) {
    console.error('API Fehler:', error);
    return NextResponse.json({
      response: 'Fehler, bitte später versuchen.',
    });
  }
}