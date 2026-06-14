// list-models.js
// Zeigt ALLE Modelle die dein Gemini-Key nutzen kann + welche embedContent koennen
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.models) {
    console.error('Fehler:', JSON.stringify(data, null, 2));
    return;
  }

  console.log('\n=== MODELLE DIE EMBEDDING KOENNEN (embedContent) ===\n');
  for (const m of data.models) {
    if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('embedContent')) {
      console.log('  ', m.name);
    }
  }

  console.log('\n=== ALLE MODELLE ===\n');
  for (const m of data.models) {
    console.log('  ', m.name, '->', (m.supportedGenerationMethods || []).join(', '));
  }
}

listModels();