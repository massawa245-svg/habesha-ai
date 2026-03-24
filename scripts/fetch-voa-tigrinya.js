import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// VOA Tigrinya Hauptseite (zugänglicher)
const VOA_URL = 'https://www.voatigrinya.com';

async function fetchVOATigrinya() {
  console.log('📡 Lade VOA Tigrinya...');
  
  try {
    const { data } = await axios.get(VOA_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const $ = cheerio.load(data);
    
    const sentences = [];
    
    // Extrahiere Text aus verschiedenen HTML-Elementen
    $('p, .description, .title').each((i, el) => {
      const text = $(el).text().trim();
      // Nur sinnvolle Sätze (20-500 Zeichen)
      if (text.length > 20 && text.length < 500 && !text.includes('http')) {
        sentences.push(text);
      }
    });
    
    // Entferne Duplikate
    const unique = [...new Set(sentences)];
    
    console.log(`✅ ${unique.length} Sätze gefunden`);
    return unique;
  } catch (error) {
    console.error('❌ Fehler:', error.message);
    return [];
  }
}

async function saveToDatabase(sentences) {
  let saved = 0;
  
  for (const sentence of sentences) {
    const { error } = await supabase
      .from('training_data')
      .insert([{
        input_text: sentence,
        language: 'tigrinya',
        source: 'voa_news',
        quality_score: 3,
        tags: ['news', 'auto-imported']
      }]);
    
    if (!error) {
      saved++;
      console.log(`   ✅ ${sentence.substring(0, 60)}...`);
    }
  }
  
  console.log(`\n💾 ${saved} Sätze gespeichert!`);
  return saved;
}

async function main() {
  console.log('🎬 VOA Tigrinya Scraper\n');
  
  const sentences = await fetchVOATigrinya();
  
  if (sentences.length > 0) {
    await saveToDatabase(sentences);
  }
  
  console.log('\n✨ Fertig!');
}

main();