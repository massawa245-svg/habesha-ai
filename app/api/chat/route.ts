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
// 🌍 SPRACHERKENNUNG
// ============================================
type Lang = 'de' | 'ti' | 'en' | 'code';

function detectLanguage(text: string): Lang {
  if (!text) return 'de';
  const lower = text.toLowerCase();
  
  // Sprachwechsel-Befehle
  if (lower.includes('bitte deutsch') || lower.includes('auf deutsch')) return 'de';
  if (lower.includes('bitte tigrinya') || lower.includes('auf tigrinya')) return 'ti';
  if (lower.includes('please english') || lower.includes('in english')) return 'en';
  
  // Programmierung
  if (/function|const|let|import|react|api|fetch|code|programmieren/i.test(lower)) return 'code';
  
  // Tigrinya Schrift
  if (/[\u1200-\u137F]/.test(text)) return 'ti';
  
  // Englisch
  if (/\b(the|and|hello|how|what|please|thanks)\b/i.test(text)) return 'en';
  
  return 'de';
}

// ============================================
// 🔎 DATABASE SUCHE (NUR AUS DEINEN 5000 WÖRTERN!)
// ============================================
async function searchDatabase(supabase: any, message: string) {
  const clean = message.toLowerCase().replace(/[.,!?;:()]/g, '');
  const words = clean.split(/\s+/).filter(w => w.length > 2);
  
  if (words.length === 0) return null;
  
  // 1. SUCHEN IM WÖRTERBUCH (DEINE 5000 WÖRTER!)
  const filters = words.map(w => `german.ilike.%${w}%`).join(',');
  
  const { data: dictionary } = await supabase
    .from('dictionary')
    .select('tigrinya_word, german')
    .or(filters)
    .limit(3);
  
  if (dictionary && dictionary.length > 0) {
    // Gib das erste gefundene Wort zurück
    console.log('📚 Wörterbuch Treffer:', dictionary[0].german);
    return dictionary[0].tigrinya_word;
  }
  
  // 2. SUCHEN IN TRAINING_DATA (wenn vorhanden)
  const { data: training } = await supabase
    .from('training_data')
    .select('input_text, response_text')
    .ilike('input_text', `%${message}%`)
    .limit(1);
  
  if (training && training.length > 0) {
    console.log('✅ Training Data Treffer:', training[0].input_text);
    return training[0].response_text;
  }
  
  return null;
}

// ============================================
// 🎯 TIGRINYA PATTERN MATCHING (FALLBACK)
// ============================================
function getPatternMatch(message: string): string | null {
  const lower = message.toLowerCase().trim();
  
  const patterns: { match: string[]; response: string }[] = [
    { match: ['hallo', 'hi', 'hey', 'selam', 'ሰላም'], response: 'ሰላም' },
    { match: ['wie geht', 'how are', 'kemey', 'ከመይ'], response: 'ከመይ ኣለካ?' },
    { match: ['guten morgen', 'good morning', 'dehan', 'dehando'], response: 'ከመይ ሃዲርካ' },
    { match: ['danke', 'thank', 'yekenyeley', 'የቐንየለይ'], response: 'የቐንየለይ' },
    { match: ['tschüss', 'bye', 'dehan kun', 'ደሓን ኩን'], response: 'ደሓን ኩን' },
    { match: ['gute nacht', 'good night', 'lejti', 'ለይቲ'], response: 'ለይቲ ሆንካ' },
  ];
  
  for (const p of patterns) {
    if (p.match.some(m => lower.includes(m))) {
      console.log('🎯 Pattern Match:', p.match[0]);
      return p.response;
    }
  }
  
  return null;
}

// ============================================
// 🤖 KI NUR FÜR DEUTSCH/ENGLISCH/CODE
// ============================================
async function askAI(messages: any[], targetLang: Lang) {
  const maxTokens = targetLang === 'code' ? 500 : 150;
  const temperature = targetLang === 'code' ? 0.7 : 0.5;
  
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: maxTokens,
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
      max_tokens: maxTokens,
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
    
    console.log('📝 User Nachricht:', message);
    
    // ============================================
    // 1. 🔥 TIGRINYA: NUR DATENBANK + PATTERN MATCHING
    // ============================================
    const wantsTigrinya = 
      detectLanguage(message) === 'ti' ||
      message.toLowerCase().includes('tigrinya') ||
      message.toLowerCase().includes('übersetze');
    
    if (wantsTigrinya) {
      console.log('🔍 Suche in Wörterbuch (5000 Wörter)...');
      
      // Zuerst Wörterbuch (deine 5000 Wörter!)
      const dbWord = await searchDatabase(supabase, message);
      if (dbWord) {
        console.log('✅ Wörterbuch Treffer!');
        return NextResponse.json({ 
          response: dbWord, 
          source: 'dictionary',
          detectedLang: 'ti'
        });
      }
      
      // Dann Pattern Matching
      const pattern = getPatternMatch(message);
      if (pattern) {
        console.log('✅ Pattern Match!');
        return NextResponse.json({ 
          response: pattern, 
          source: 'pattern',
          detectedLang: 'ti'
        });
      }
      
      // Wenn nichts gefunden -> Fallback
      console.log('❌ Kein Treffer im Wörterbuch');
      return NextResponse.json({ 
        response: 'ኣይፈልጥን — Das Wort habe ich noch nicht in meinem Wörterbuch.',
        source: 'notfound',
        detectedLang: 'ti'
      });
    }
    
    // ============================================
    // 2. 🇩🇪🇬🇧 DEUTSCH/ENGLISCH/CODE: NUR KI
    // ============================================
    const targetLang = detectLanguage(message);
    const langMap = { de: 'Deutsch', en: 'Englisch', code: 'Programmierung' };
    
    const systemPrompt = targetLang === 'code'
      ? `Du bist ein Programmier-Assistent. Antworte auf Deutsch oder Englisch. Gib klaren Code.`
      : `Du bist ein hilfsbereiter Assistent. Antworte auf ${langMap[targetLang]}. Sei kurz und präzise.`;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-4),
      { role: 'user', content: message },
    ];
    
    let response = await askAI(messages, targetLang);
    
    if (!response) {
      response = targetLang === 'en' 
        ? "I don't know that yet — still learning." 
        : "Das weiß ich noch nicht — ich lerne dazu.";
    }
    
    return NextResponse.json({ 
      response, 
      source: 'ai',
      detectedLang: targetLang
    });
    
  } catch (error) {
    console.error('API Fehler:', error);
    return NextResponse.json({
      response: 'Fehler, bitte später versuchen.',
    });
  }
}