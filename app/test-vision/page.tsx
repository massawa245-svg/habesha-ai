// app/test-vision/page.tsx
'use client';
import { useState } from 'react';

export default function TestVision() {
  const [image, setImage] = useState(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target.result);
        setResult('');
        setError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!image) return;
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          image: image,
          question: 'Beschreibe was du auf diesem Bild siehst. Wenn Text da ist, lies ihn vor.'
        })
      });
      
      const data = await res.json();
      setResult(data.response);
    } catch (err) {
      setError('Fehler bei der Bildanalyse: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">🖼️ Habesha AI Vision</h1>
        <p className="text-gray-400 mb-6">Teste die Bildanalyse – KI erklärt dir, was auf dem Bild ist</p>
        
        {/* Upload Bereich */}
        <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center mb-6">
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleImageUpload}
            className="mb-4 text-sm text-gray-400 file:bg-emerald-600 file:text-white file:px-4 file:py-2 file:rounded file:border-0 file:cursor-pointer hover:file:bg-emerald-700"
          />
          <p className="text-xs text-gray-500">Unterstützt JPG, PNG, GIF – bis 5 MB</p>
        </div>
        
        {/* Bild Vorschau */}
        {image && (
          <div className="mb-6">
            <h2 className="font-semibold mb-2">📸 Dein Bild:</h2>
            <img src={image} alt="Upload" className="max-h-64 rounded-lg border border-emerald-500 shadow-lg" />
          </div>
        )}
        
        {/* Analyse Button */}
        {image && (
          <button
            onClick={analyzeImage}
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-6 py-3 rounded-xl hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 font-medium transition-all"
          >
            {loading ? '🔍 Analysiere Bild...' : '🔍 Bild analysieren'}
          </button>
        )}
        
        {/* Fehler */}
        {error && (
          <div className="mt-6 p-4 bg-red-900/50 border border-red-700 rounded-lg">
            <p className="text-red-300">❌ {error}</p>
          </div>
        )}
        
        {/* Ergebnis */}
        {result && (
          <div className="mt-6 p-6 bg-gray-800 rounded-xl border border-emerald-800">
            <h2 className="font-bold text-emerald-400 mb-3 flex items-center gap-2">
              <span>🤖</span> KI Analyse:
            </h2>
            <p className="text-gray-200 whitespace-pre-wrap leading-relaxed">{result}</p>
          </div>
        )}
        
        {/* Info */}
        <div className="mt-8 p-4 bg-gray-800/50 rounded-lg text-sm text-gray-400">
          <p className="flex items-center gap-2 mb-2">
            <span>📸</span> <strong>Tipp:</strong> Lade einen Brief, ein Dokument oder ein Foto hoch.
          </p>
          <p className="flex items-center gap-2">
            <span>🇪🇷</span> Die KI erklärt auf Deutsch – frag einfach auf Tigrinya!
          </p>
        </div>
      </div>
    </div>
  );
}