// scripts/hole-tigrinya-kanaele.js
import { getSubtitles } from 'youtube-captions-scraper';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// === DEINE AUSGEWÄHLTEN KANÄLE ===
const KANAELE = [
  { name: 'MahderPro', url: '@MahderPro' },
  { name: 'ERi-TV', url: '@EriTVOfficial' }, // Achtung: Ich habe den @-Namen geschätzt, bitte prüfen!
  { name: 'BBC Tigrinya', url: '@bbctigrinya' }
];

// === EINZELNE VIDEOS (für ERi-TV News, da Channel vielleicht anders) ===
const EINZEL_VIDEOS = [
  { id: '1ev28A4-fHQ', name: 'ERi-TV News 18.03.2026' }
];

// Warte-Funktion
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Video-IDs von einem YouTube-Kanal holen
async function getVideoIdsFromChannel(channelUrl) {
  try {
    console.log(`  📡 Suche Videos von ${channelUrl}...`);
    const url = `https://www.youtube.com/${channelUrl}/videos`;
    const { data } = await axios.get(url);
    
    const matches = [...data.matchAll(/watch\?v=([a-zA-Z0-9_-]{11})/g)];
    const ids = [...new Set(matches.map(m => m[1]))];
    
    console.log(`     ✅ ${ids.length} Videos gefunden`);
    return ids.slice(0, 5); // Erstmal 5 zum Testen
  } catch (error) {
    console.log(`     ❌ Fehler: ${error.message}`);
    return [];
  }
}

// Untertitel für ein Video holen
async function getTranscript(videoId) {
  try {
    const subs = await getSubtitles({
      videoID: videoId,
      lang: 'ti' // Tigrinya
    });
    return subs.map(s => s.text).join(' ');
  } catch (error) {
    return null;
  }
}

// Text in Sätze teilen
function splitSentences(text) {
  if (!text) return [];
  return text
    .split(/[.!?;:።፧፨]+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);
}

// In Supabase speichern
async function saveToSupabase(sentences, videoId, sourceName) {
  if (!sentences.length) return 0;
  
  const data = sentences.map(text => ({
    tigrinya: text,
    quelle: 'youtube',
    kanal: sourceName,
    video_id: videoId,
    verarbeitet: false
  }));
  
  const { error } = await supabase
    .from('training_daten')
    .insert(data);
  
  if (error) {
    console.error('     ❌ Supabase Fehler:', error);
    return 0;
  }
  return sentences.length;
}

// Hauptfunktion
async function main() {
  console.log('🎬 TIGRINYA YOUTUBE TRAINING DATA COLLECTOR\n');
  
  let gesamtSaetze = 0;
  const allData = [];
  
  // === 1. EINZELNE VIDEOS (wie ERi-TV News) ===
  if (EINZEL_VIDEOS.length > 0) {
    console.log('📌 Verarbeite einzelne Videos:');
    for (const video of EINZEL_VIDEOS) {
      console.log(`\n  🎥 ${video.name} (${video.id})`);
      const text = await getTranscript(video.id);
      
      if (text) {
        const saetze = splitSentences(text);
        console.log(`     ✅ ${saetze.length} Sätze`);
        const saved = await saveToSupabase(saetze, video.id, video.name);
        gesamtSaetze += saved;
        allData.push(...saetze);
      } else {
        console.log(`     ❌ Keine Tigrinya-Untertitel`);
      }
      await wait(2000);
    }
  }
  
  // === 2. YOUTUBE-KANÄLE (wie MahderPro) ===
  console.log('\n📺 Verarbeite YouTube-Kanäle:');
  for (const kanal of KANAELE) {
    console.log(`\n  📺 ${kanal.name} (${kanal.url}):`);
    const videoIds = await getVideoIdsFromChannel(kanal.url);
    
    for (let i = 0; i < videoIds.length; i++) {
      const videoId = videoIds[i];
      console.log(`    🎬 Video ${i+1}/${videoIds.length}: ${videoId}`);
      
      const text = await getTranscript(videoId);
      if (text) {
        const saetze = splitSentences(text);
        console.log(`       ✅ ${saetze.length} Sätze`);
        const saved = await saveToSupabase(saetze, videoId, kanal.name);
        gesamtSaetze += saved;
        allData.push(...saetze);
      } else {
        console.log(`       ❌ Keine Tigrinya-Untertitel`);
      }
      
      await wait(3000); // 3 Sekunden warten
    }
  }
  
  // === 3. BACKUP SPEICHERN ===
  if (allData.length > 0) {
    const filename = `tigrinya-training-${new Date().toISOString().slice(0,10)}.json`;
    fs.writeFileSync(filename, JSON.stringify(allData, null, 2));
    console.log(`\n💾 Backup gespeichert: ${filename} (${allData.length} Sätze)`);
  }
  
  console.log(`\n✨ FERTIG! ${gesamtSaetze} neue Tigrinya-Sätze für deine KI! 🚀`);
}

main().catch(console.error);