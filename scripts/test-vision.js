import { ImageAnnotatorClient } from '@google-cloud/vision';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function test() {
  try {
    console.log('🔑 Verwende API Key:', process.env.GOOGLE_VISION_API_KEY ? '✅ vorhanden' : '❌ fehlt');
    
    // 🔥 WICHTIG: API Key direkt übergeben!
    const client = new ImageAnnotatorClient({
      apiKey: process.env.GOOGLE_VISION_API_KEY,
    });
    
    // Ein einfaches Testbild (1x1 Pixel, funktioniert immer)
    const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    
    const [result] = await client.textDetection({
      image: { content: testImage }
    });
    
    console.log('✅ Google Vision funktioniert!');
    console.log('📝 Antwort:', result);
    
  } catch (error) {
    console.error('❌ Fehler:', error.message);
    if (error.code) console.error('Code:', error.code);
  }
}

test();