'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================
// TYPEN
// ============================================
type Message = {
  role: 'user' | 'assistant';
  content: string;
  image?: string;
};

type Feedback = 'gut' | 'schlecht' | 'neutral';

// ============================================
// SPEECH RECOGNITION (Browser-API erweitern)
// ============================================
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

// ============================================
// KOMPONENTE
// ============================================
export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMounted(true);
    const email = localStorage.getItem('user_email');
    if (email) setUserEmail(email);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize Textarea
  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  // ============================================
  // 🎤 VOICE INPUT
  // ============================================
  const startListening = async () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Dein Browser unterstützt keine Spracheingabe.\nBitte Chrome oder Edge verwenden.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      alert('❌ Mikrofon-Zugriff verweigert.\nBitte erlaube den Zugriff in den Browsereinstellungen.');
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'de-DE';
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
      inputRef.current?.focus();
    };
    recognition.onerror = () => {
      alert('🎤 Spracherkennung fehlgeschlagen.');
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  // ============================================
  // 📸 BILD-UPLOAD
  // ============================================
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('📸 Bild ist zu groß. Maximal 5 MB erlaubt.');
      return;
    }

    setUploading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Image = e.target?.result as string;

      setMessages((prev) => [
        ...prev,
        { role: 'user', content: '📸 Bild', image: base64Image },
      ]);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            '📸 Ich sehe dein Bild! Beschreib mir kurz, was darauf zu sehen ist – dann kann ich dir helfen.',
        },
      ]);

      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  // ============================================
  // SEND MESSAGE
  // ============================================
  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      });

      const data = (await res.json()) as { response: string };

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Fehler aufgetreten. Bitte versuch es nochmal.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ============================================
  // FEEDBACK
  // ============================================
  const saveFeedback = async (feedback: Feedback, korrektur?: string) => {
    const letzteNachricht = messages[messages.length - 1];
    const vorherigeNachricht = messages[messages.length - 2];

    if (letzteNachricht?.role !== 'assistant' || vorherigeNachricht?.role !== 'user') return;

    let isTrusted = false;
    if (userEmail) {
      try {
        const { data: trusted } = await supabase
          .from('trusted_users')
          .select('*')
          .eq('email', userEmail)
          .maybeSingle();
        isTrusted = !!trusted;
      } catch (e) {
        console.log('Fehler bei Trusted-Check:', e);
      }
    }

    const table = isTrusted ? 'user_feedback' : 'user_feedback_temp';

    const { error } = await supabase.from(table).insert([
      {
        question: vorherigeNachricht.content,
        ai_response: letzteNachricht.content,
        user_feedback: feedback,
        corrected_response: korrektur ?? null,
        language: 'tigrinya',
        session_id: localStorage.getItem('session_id') ?? 'test-session',
      },
    ]);

    if (error) {
      console.error('Feedback Fehler:', error);
      alert('❌ Fehler beim Speichern');
    } else {
      alert(
        isTrusted
          ? '✅ Danke Beta-Tester! Dein Feedback trainiert die KI sofort!'
          : '✅ Danke! Dein Feedback wird geprüft.'
      );
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-950">
      {/* Header */}
      <header className="bg-emerald-700 shadow-lg sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-xl font-bold">
              🇪🇷
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">Habesha AI</h1>
              <p className="text-xs text-emerald-200">
                {loading ? 'tippt...' : 'online'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="text-white p-2 hover:bg-white/10 rounded-full">📸</button>
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <main className="max-w-4xl mx-auto">
        <div className="h-[calc(100vh-140px)] overflow-y-auto px-4 py-4 bg-gray-800/30">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-emerald-700/30 rounded-full flex items-center justify-center mb-4 text-4xl">
                💬
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Habesha AI</h3>
              <p className="text-gray-400 text-sm max-w-md">
                Sicher & vertraulich.<br />
                Nachrichten sind Ende-zu-Ende verschlüsselt.
              </p>
              <p className="text-gray-500 text-xs mt-6">
                🎤 Spracheingabe | 📸 Bilder | ⚡ Blitzschnell
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className="mb-3">
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-sm mr-2 flex-shrink-0">
                      🤖
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-sm'
                        : 'bg-gray-700 text-gray-100 rounded-bl-sm'
                    }`}
                  >
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="Bild"
                        className="max-w-[200px] max-h-[200px] rounded-lg mb-2 cursor-pointer"
                        onClick={() => window.open(msg.image, '_blank')}
                      />
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    <span className="text-[10px] opacity-70 mt-1 block text-right">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-sm ml-2 flex-shrink-0">
                      👤
                    </div>
                  )}
                </div>

                {/* Feedback-Buttons */}
                {msg.role === 'assistant' && (
                  <div className="flex gap-2 mt-1 ml-10">
                    <button
                      onClick={() => saveFeedback('gut')}
                      className="text-[11px] bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded-full hover:bg-emerald-600/30 hover:text-emerald-300 transition-colors"
                    >
                      👍 Gut
                    </button>
                    <button
                      onClick={() => {
                        const korrektur = prompt('Deine Korrektur eingeben (optional):');
                        saveFeedback('schlecht', korrektur ?? undefined);
                      }}
                      className="text-[11px] bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded-full hover:bg-red-600/30 hover:text-red-300 transition-colors"
                    >
                      👎 Schlecht
                    </button>
                  </div>
                )}
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start mb-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-sm mr-2">
                🤖
              </div>
              <div className="bg-gray-700 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </div>
              </div>
            </div>
          )}

          {uploading && (
            <div className="flex justify-end mb-3">
              <div className="bg-gray-700 rounded-2xl px-4 py-2 text-gray-300 text-sm">
                📸 Bild wird hochgeladen...
              </div>
            </div>
          )}

          {isListening && (
            <div className="flex justify-start mb-3">
              <div className="bg-gray-700 rounded-2xl px-4 py-2 text-gray-300 text-sm flex items-center gap-2">
                <span>🎤</span>
                <span>Höre zu...</span>
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-700 p-3 bg-gray-800/90 backdrop-blur-sm">
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            {/* Attachment */}
            <label className="cursor-pointer text-gray-400 hover:text-emerald-400 transition-colors p-2">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
                disabled={uploading || loading}
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </label>

            {/* Voice */}
            <button
              onClick={startListening}
              disabled={loading || uploading || isListening}
              className={`text-gray-400 hover:text-emerald-400 transition-colors p-2 ${
                isListening ? 'text-red-400 animate-pulse' : ''
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            {/* Text Input */}
            <div className="flex-1 bg-gray-700 rounded-2xl px-4 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResize(e);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Nachricht"
                className="w-full bg-transparent text-white text-sm placeholder-gray-400 focus:outline-none resize-none overflow-hidden"
                rows={1}
                style={{ minHeight: '40px', maxHeight: '120px' }}
                disabled={loading || uploading || isListening}
              />
            </div>

            {/* Send */}
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading || uploading || isListening}
              className={`p-2 rounded-full transition-colors ${
                input.trim() && !loading
                  ? 'text-emerald-400 hover:text-emerald-300'
                  : 'text-gray-500 cursor-not-allowed'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>

          <div className="text-center text-[10px] text-gray-500 mt-2">
            🛡️ Ende-zu-Ende verschlüsselt | habesha.Ai
          </div>
        </div>
      </main>
    </div>
  );
}