import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// BBC Tigrinya Hauptseite
const BBC_URL = 'https://www.bbc.com/tigrinya';

async function fetchBBCTigrinya() {
  console.log('📡 Lade BBC Tigrinya...');
  
  try {
    const { data } = await axios.get(BBC_URL);
    const $ = cheerio.load(data);
    
    const articles = [];
    
    // Extrahiere Artikel-Texte
    $('p').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 30 && text.length < 500) {
        articles.push(text);
      }
    });
    
    console.log(`✅ ${articles.length} Sätze gefunden`);
    return articles;
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
        response_text: '', // Leer, weil wir die Übersetzung später brauchen
        language: 'tigrinya',
        source: 'bbc_news',
        quality_score: 3,
        tags: ['news', 'auto-imported']
      }]);
    
    if (!error) saved++;
  }
  
  console.log(`💾 ${saved} Sätze gespeichert!`);
  return saved;
}

async function main() {
  console.log('🎬 BBC Tigrinya Scraper\n');
  
  const sentences = await fetchBBCTigrinya();
  
  if (sentences.length > 0) {
    await saveToDatabase(sentences);
  }
  
  console.log('\n✨ Fertig!');
}

main();