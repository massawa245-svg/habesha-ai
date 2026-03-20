// scripts/fetch-mestyat-betna.js
const axios = require('axios');
const cheerio = require('cheerio');
const { YoutubeTranscript } = require('youtube-transcript');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Supabase Verbindung
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Kanal-URL
const KANAL_URL = 'https://www.youtube.com/@mestyatbetna/videos';

// Warte-Funktion (um YouTube nicht zu überlasten)
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Video-URLs von der Kanalseite holen
async function getVideoUrls() {
  try {
    console.log('📡 Lade Kanal-Seite...');
    const { data } = await axios.get(KANAL_URL);
    const $ = cheerio.load(data);
    
    // Extrahiere Video-IDs aus dem HTML
    const videoIds = [];
    
    // YouTube speichert Video-IDs in verschiedenen Formaten
    const matches = data.match(/watch\?v=([a-zA-Z0-9_-]{11})/g);
    
    if (matches) {
      matches.forEach(match => {
        const id = match.replace('watch?v=', '');
        if (!videoIds.includes(id)) {
          videoIds.push(id);
        }
      });
    }
    
    console.log(`✅ ${videoIds.length} Videos gefunden!`);
    return videoIds.slice(0, 10); // Erstmal nur die ersten 10
  } catch (error) {
    console.error('❌ Fehler beim Laden:', error.message);
    return [];
  }
}

// Transkript für ein Video holen
async function getTranscript(videoId) {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    return transcript.map(item => item.text).join(' ');
  } catch (error) {
    // Nicht alle Videos haben Transkript
    return null;
  }
}

// Text in Sätze aufteilen
function splitIntoSentences(text) {
  if (!text) return [];
  
  // Tigrinya Satzzeichen: ። (Punkt), ፧ (Fragezeichen), ፨ (Doppelpunkt)
  const sentences = text
    .split(/[።፧፨!?]/)
    .map(s => s.trim())
    .filter(s => s.length > 10); // Nur längere Sätze
  
  return sentences;
}

// Hauptfunktion
async function main() {
  console.log('🎬 Starte Mestyat Betna Scraper...\n');
  
  // 1. Video-URLs holen
  const videoIds = await getVideoUrls();
  
  let alleSaetze = [];
  
  // 2. Für jedes Video Transkript holen
  for (let i = 0; i < videoIds.length; i++) {
    const videoId = videoIds[i];
    console.log(`\n📹 Video ${i + 1}/${videoIds.length}: ${videoId}`);
    
    const transkript = await getTranscript(videoId);
    
    if (transkript) {
      const saetze = splitIntoSentences(transkript);
      console.log(`   ✅ ${saetze.length} Sätze gefunden`);
      
      // 3. Sätze speichern
      for (const satz of saetze) {
        alleSaetze.push({
          tigrinya: satz,
          quelle: 'youtube',
          kanal: 'Mestyat Betna',
          video_id: videoId,
          verarbeitet: false
        });
      }
    } else {
      console.log(`   ❌ Kein Transkript verfügbar`);
    }
    
    // Kurz warten, um YouTube nicht zu überlasten
    await wait(2000);
  }
  
  // 4. In Supabase speichern
  console.log(`\n💾 Speichere ${alleSaetze.length} Sätze in Supabase...`);
  
  if (alleSaetze.length > 0) {
    const { error } = await supabase
      .from('training_daten')
      .insert(alleSaetze);
    
    if (error) {
      console.error('❌ Supabase Fehler:', error);
    } else {
      console.log('✅ Erfolgreich gespeichert!');
    }
  }
  
  console.log('\n✨ Fertig! Deine KI hat neue Trainingsdaten!');
}

// Starten
main();