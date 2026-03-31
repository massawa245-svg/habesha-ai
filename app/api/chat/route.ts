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
// 🌍 SPRACHERKENNUNG (VEREINFACHT)
// ============================================
type Lang = 'de' | 'ti' | 'en';

function detectLanguage(text: string): Lang {
  if (!text) return 'de';
  
  // Tigrinya Schrift
  if (/[\u1200-\u137F]/.test(text)) {
    return 'ti';
  }
  
  // Englische Keywords
  if (/\b(the|and|hello|how|what|please|thanks|translate)\b/i.test(text)) {
    return 'en';
  }
  
  // Deutsch (Fallback)
  return 'de';
}

// ============================================
// 🔎 DATABASE FIRST (MIT SMART MATCHING)
// ============================================
async function searchDatabase(supabase: any, message: string) {
  const clean = message.toLowerCase().replace(/[.,!?;:()]/g, '');
  
  // 🔥 SMART MATCHING LIGHT: Nach einzelnen Wörtern suchen
  const words = clean.split(/\s+/).filter(w => w.length > 3);
  
  let bestMatch: { input_text: string; response_text: string; score: number } | null = null;
  
  // 1. Suche in training_data mit Word-Matching
  if (words.length > 0) {
    const filters = words.map(w => `input_text.ilike.%${w}%`).join(',');
    
    const { data: training } = await supabase
      .from('training_data')
      .select('input_text, response_text')
      .or(filters)
      .limit(10);
    
    if (training && training.length > 0) {
      // 🔥 Bewerte Treffer: Längste input_text = beste Übereinstimmung
      for (const item of training) {
        const score = item.input_text.length;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { ...item, score };
        }
      }
      
      if (bestMatch) {
        console.log('✅ DB Treffer (training_data):', bestMatch.input_text);
        return bestMatch.response_text;
      }
    }
  }
  
  // 2. Suche im Wörterbuch (auch mit Word-Matching)
  if (words.length > 0) {
    const filters = words.map(w => `german.ilike.%${w}%`).join(',');
    
    const { data: dictionary } = await supabase
      .from('dictionary')
      .select('tigrinya_word, german')
      .or(filters)
      .limit(5);
    
    if (dictionary && dictionary.length > 0) {
      // 🔥 Längste deutsche Übersetzung = bester Treffer
      let bestDict = dictionary[0];
      for (const item of dictionary) {
        if (item.german.length > bestDict.german.length) {
          bestDict = item;
        }
      }
      console.log('✅ DB Treffer (dictionary):', bestDict.german);
      return bestDict.tigrinya_word;
    }
  }
  
  return null;
}

// ============================================
// 🤖 KI FALLBACK (STRIKT)
// ============================================
async function askAI(messages: any[]) {
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 100,
      temperature: 0.1,
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
      max_tokens: 100,
      temperature: 0.1,
    });
    return res.choices?.[0]?.message?.content?.trim() ?? '';
  } catch (e) {
    console.log('DeepSeek Fehler');
  }
  
  return '';
}

// ============================================
// 🔧 SICHERHEITSFILTER
// ============================================
function isValidResponse(response: string): boolean {
  if (!response) return false;
  if (response.length < 2) return false;
  if (response.length > 200) return false;
  
  // Verbotene Muster
  const forbidden = [
    'manday', 'mondai', 'monday', 'tuesday', 'wednesday',
    'ኣይፈልጥን', 'weiß nicht', 'I don\'t know'
  ];
  
  const lower = response.toLowerCase();
  if (forbidden.some(pattern => lower.includes(pattern))) {
    return false;
  }
  
  return true;
}

// ============================================
// 🚀 MAIN ROUTE
// ============================================
export async function POST(req: Request) {
  try {
    const { message, history = [], userId, forcedLang } = await req.json();
    
    const supabase = await createClient();
    
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
    // 1. 🔥 DATABASE FIRST (Smart Matching)
    // ============================================
    const dbAnswer = await searchDatabase(supabase, message);
    
    if (dbAnswer && isValidResponse(dbAnswer)) {
      console.log('✅ DB Antwort gegeben');
      return NextResponse.json({ 
        response: dbAnswer, 
        source: 'database' 
      });
    }
    
    // ============================================
    // 2. 🤖 KI FALLBACK
    // ============================================
    const lang = detectLanguage(message);
    
    const systemPrompt = `
Du bist eine Tigrinya-Übersetzungs-KI.

REGELN:
- Verwende NUR bekannte, korrekte Tigrinya-Wörter
- KEINE erfundenen Wörter
- Wenn du unsicher bist: "ኣይፈልጥን"
- Maximal 1-2 Sätze
`;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-4),
      { role: 'user', content: message },
    ];
    
    let response = await askAI(messages);
    
    // ============================================
    // 3. 🔧 SICHERHEITSFILTER
    // ============================================
    if (!isValidResponse(response)) {
      response = 'ኣይፈልጥን — Das weiß ich noch nicht.';
    }
    
    // ============================================
    // 4. 📊 LIMIT erhöhen
    // ============================================
    if (userId) {
      const { isPremium } = await checkPremium(userId);
      if (!isPremium) await incrementUsage(userId, false);
    }
    
    return NextResponse.json({ 
      response, 
      source: 'ai',
      detectedLang: lang 
    });
    
  } catch (error) {
    console.error('API Fehler:', error);
    
    return NextResponse.json({
      response: 'Fehler, bitte später versuchen.',
    });
  }
}