// scripts/fetch-mestyat-betna-v2.js
import { getSubtitles } from 'youtube-captions-scraper';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

// Supabase Verbindung
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// YouTube Kanal - Mestyat Betna
const VIDEO_IDS = [
  // Hier die Video-IDs von Mestyat Betna manuell eintragen
  // Gehe auf den Kanal, öffne ein Video, kopiere die ID aus der URL
  // Beispiel: https://www.youtube.com/watch?v=VIDEO_ID_HIER
  'VIDEO_ID_1', // Ersetzen!
  'VIDEO_ID_2', // Ersetzen!
  'VIDEO_ID_3', // Ersetzen!
];

async function getVideoIdsFromChannel() {
  console.log('⚠️  Bitte Video-IDs manuell eingeben:');
  console.log('1. Gehe zu: https://www.youtube.com/@mestyatbetna/videos');
  console.log('2. Öffne ein Video');
  console.log('3. Kopiere die ID aus der URL (nach watch?v=)');
  console.log('4. Füge sie in das VIDEO_IDS Array ein\n');
  
  return VIDEO_IDS;
}

async function fetchTranscript(videoId) {
  try {
    const subtitles = await getSubtitles({
      videoID: videoId,
      lang: 'ti' // Tigrinya
    });
    
    return subtitles.map(sub => sub.text).join(' ');
  } catch (error) {
    console.log(`   ❌ Keine Tigrinya-Untertitel für Video ${videoId}`);
    return null;
  }
}

function splitIntoSentences(text) {
  if (!text) return [];
  
  // Aufteilen an Satzzeichen
  const sentences = text
    .split(/[.!?;:።፧፨]+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 500); // Nur sinnvolle Sätze
  
  return sentences;
}

async function saveToSupabase(sentences, videoId) {
  if (!sentences.length) return;
  
  const data = sentences.map(text => ({
    tigrinya: text,
    quelle: 'youtube',
    kanal: 'Mestyat Betna',
    video_id: videoId,
    verarbeitet: false
  }));
  
  const { error } = await supabase
    .from('training_daten')
    .insert(data);
  
  if (error) {
    console.error('❌ Supabase Fehler:', error);
    return false;
  }
  
  return true;
}

async function main() {
  console.log('🎬 Mestyat Betna Scraper (v2)\n');
  
  // Lokale Speicherung als Backup
  const allData = [];
  
  const videoIds = await getVideoIdsFromChannel();
  
  for (let i = 0; i < videoIds.length; i++) {
    const videoId = videoIds[i];
    if (videoId.startsWith('VIDEO_ID')) continue; // Platzhalter überspringen
    
    console.log(`📹 Video ${i + 1}/${videoIds.length}: ${videoId}`);
    
    const transcript = await fetchTranscript(videoId);
    
    if (transcript) {
      const sentences = splitIntoSentences(transcript);
      console.log(`   ✅ ${sentences.length} Sätze gefunden`);
      
      // In Supabase speichern
      const saved = await saveToSupabase(sentences, videoId);
      if (saved) {
        console.log(`   💾 In Supabase gespeichert`);
      }
      
      // Auch lokal speichern
      allData.push(...sentences.map(text => ({
        text,
        videoId,
        kanal: 'Mestyat Betna'
      })));
      
    } else {
      console.log(`   ⏭️  Überspringe Video ${videoId}`);
    }
    
    // Warten zwischen Requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Lokales Backup
  if (allData.length > 0) {
    fs.writeFileSync(
      'training-data.json', 
      JSON.stringify(allData, null, 2)
    );
    console.log(`\n💾 ${allData.length} Sätze lokal gespeichert in training-data.json`);
  }
  
  console.log('\n✨ Fertig!');
}

main().catch(console.error);