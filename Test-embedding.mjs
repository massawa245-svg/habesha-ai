// test-embedding.js - testet gemini-embedding-001 mit 768 Dimensionen
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { GoogleGenerativeAI } from '@google/generative-ai';

const gemini = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);

async function test() {
  console.log('--- TEST: gemini-embedding-001 mit 768 Dim ---');
  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-embedding-001' });
    const result = await model.embedContent({
      content: { parts: [{ text: 'Hallo wie geht es dir' }] },
      outputDimensionality: 768,
    });
    console.log('ERFOLG! Anzahl Dimensionen:', result.embedding.values.length);
    console.log('Erste 3 Werte:', result.embedding.values.slice(0, 3));
  } catch (e) {
    console.error('FEHLER:', e.message);
  }
}

test();