// lib/ocr.ts
import { ImageAnnotatorClient } from '@google-cloud/vision';

// Google Vision Client (für Produktion)
let visionClient: ImageAnnotatorClient | null = null;

// Für Entwicklung: Simulierter OCR (da Google Vision API Key braucht)
export async function extractTextFromImage(base64Image: string): Promise<string> {
  // ENTWICKLUNGS-MODUS: Simulierter OCR für Test
  // Später durch echten Google Vision ersetzen
  
  // Entferne Data-URL Prefix falls vorhanden
  let imageData = base64Image;
  if (base64Image.startsWith('data:image')) {
    imageData = base64Image.split(',')[1];
  }
  
  // TODO: Hier Google Vision API einbauen
  // Für jetzt: Simuliere OCR-Ergebnis
  console.log('📸 OCR: Bild empfangen, extrahiere Text...');
  
  // Simulierter Text (für Test)
  const mockText = `AOK Baden-Württemberg
  Ihr Ansprechpartner: Herr Müller
  Versichertennummer: 123456789
  
  Änderung Ihres Beitrags
  
  Sehr geehrter Versicherter,
  
  Ihr monatlicher Beitrag zur Krankenversicherung ändert sich ab 01.04.2026.
  Neuer Beitrag: 214,50 € monatlich.
  
  Bitte überweisen Sie den neuen Betrag bis zum 15.04.2026.
  Bei verspäteter Zahlung kann es zu Mahngebühren kommen.
  
  Bei Fragen wenden Sie sich an Ihr Servicecenter.
  Telefon: 0800 123456`;
  
  return mockText;
}

// Für echte Produktion (mit Google Vision)
export async function extractTextFromImageReal(base64Image: string): Promise<string> {
  if (!visionClient) {
    visionClient = new ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  }
  
  const [result] = await visionClient.textDetection({
    image: { content: base64Image },
  });
  
  const detections = result.textAnnotations;
  if (detections && detections.length > 0) {
    return detections[0].description || '';
  }
  return '';
}