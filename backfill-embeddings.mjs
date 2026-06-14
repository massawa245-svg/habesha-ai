// backfill-embeddings.js
// EINMALIGES Script: fuellt alle bestehenden training_data Eintraege mit Gemini-Embeddings
// Ausfuehren mit: node backfill-embeddings.js
//
// Modell: gemini-embedding-001 mit 768 Dimensionen (passt zur DB-Spalte vector(768))

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GEMINI_API_KEY) {
  console.error('FEHLER: Keys fehlen in der .env.local Datei!');
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? 'OK' : 'FEHLT');
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_KEY ? 'OK' : 'FEHLT');
  console.error('  GOOGLE_GEMINI_API_KEY:', GEMINI_API_KEY ? 'OK' : 'FEHLT');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const gemini = new GoogleGenerativeAI(GEMINI_API_KEY);

// NEU: gemini-embedding-001 mit 768 Dimensionen
const embeddingModel = gemini.getGenerativeModel({ model: 'gemini-embedding-001' });

async function getEmbedding(text) {
  const result = await embeddingModel.embedContent({
    content: { parts: [{ text }] },
    outputDimensionality: 768,   // wichtig: 768 passt zur DB-Spalte
  });
  return result.embedding.values;
}

async function main() {
  console.log('Lade Eintraege ohne Embedding...');

  const { data, error } = await supabase
    .from('training_data')
    .select('id, input_text')
    .is('embedding', null);

  if (error) {
    console.error('Fehler beim Laden:', error);
    return;
  }

  console.log(`Gefunden: ${data.length} Eintraege ohne Embedding`);

  let done = 0;
  let failed = 0;

  for (const row of data) {
    try {
      if (!row.input_text || row.input_text.trim().length === 0) {
        console.log(`Skip leer: ${row.id}`);
        continue;
      }

      const embedding = await getEmbedding(row.input_text);

      const { error: updateError } = await supabase
        .from('training_data')
        .update({ embedding })
        .eq('id', row.id);

      if (updateError) {
        console.error(`Fehler bei ${row.id}:`, updateError.message);
        failed++;
      } else {
        done++;
        if (done % 50 === 0) console.log(`Fortschritt: ${done}/${data.length}`);
      }

      await new Promise(r => setTimeout(r, 150));

    } catch (e) {
      console.error(`Fehler bei ${row.id}:`, e.message);
      failed++;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\nFertig! Erfolgreich: ${done}, Fehlgeschlagen: ${failed}`);
}

main();