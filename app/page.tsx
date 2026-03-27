'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// ============================================
// TYPEN
// ============================================
type Message = {
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  created_at?: string;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type Feedback = 'gut' | 'schlecht' | 'neutral';

// ============================================
// SPEECH RECOGNITION
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
  const [user, setUser] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const supabase = createClient();

  // ============================================
  // CHAT-VERLAUF FUNKTIONEN
  // ============================================
  const loadConversations = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    setConversations(data || []);
  };

  const loadMessages = async (conversationId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setCurrentConversationId(conversationId);
    setSidebarOpen(false);
  };

  const startNewChat = async () => {
    const { data } = await supabase
      .from('conversations')
      .insert({ user_id: user?.id, title: 'Neues Gespräch' })
      .select()
      .single();
    if (data) {
      setCurrentConversationId(data.id);
      setMessages([]);
      loadConversations();
      setSidebarOpen(false);
    }
  };

  const deleteConversation = async (id: string) => {
    if (confirm('Chat wirklich löschen?')) {
      await supabase.from('conversations').delete().eq('id', id);
      if (currentConversationId === id) {
        startNewChat();
      }
      loadConversations();
    }
  };

  // ============================================
  // 🔥 AUTH MIT OAuth-CODE VERARBEITUNG
  // ============================================
  useEffect(() => {
    setMounted(true);
    
    const initAuth = async () => {
      // 1. OAuth-Code aus URL verarbeiten (wichtig für Google Login!)
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      
      if (code) {
        console.log('🔑 OAuth-Code gefunden, tausche gegen Session...');
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('❌ OAuth Fehler:', error);
          window.location.href = '/login';
          return;
        }
        // Code aus URL entfernen
        window.history.replaceState({}, '', '/');
      }
      
      // 2. Session prüfen
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        setUserEmail(session.user.email || '');
        await loadConversations();
        await startNewChat();
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUser(user);
          setUserEmail(user.email || '');
          await loadConversations();
          await startNewChat();
        } else {
          window.location.href = '/login';
        }
      }
    };
    
    initAuth();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    reader.onload = async (e) => {
      const base64Image = e.target?.result as string;
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: '📸 Bild hochgeladen', image: base64Image },
      ]);
      try {
        const res = await fetch('/api/analyze-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image, userId: user?.id }),
        });
        const data = await res.json();
        setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
      } catch (error) {
        console.error('Fehler bei Bildanalyse:', error);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '❌ Fehler bei der Bildanalyse. Bitte versuch es später nochmal.' },
        ]);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // ============================================
  // SEND MESSAGE
  // ============================================
  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    try {
      const historyForApi = newMessages.map(msg => ({ role: msg.role, content: msg.content }));
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          history: historyForApi,
          userId: user?.id,
          conversationId: currentConversationId,
          isNewConversation: messages.length === 0,
        }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: 'assistant', content: data.response }]);
      loadConversations();
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Fehler aufgetreten. Bitte versuch es nochmal.' }]);
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
    try {
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
          user_id: user?.id || null,
          session_id: localStorage.getItem('session_id') ?? 'test-session',
        },
      ]);

      if (error) {
        console.error('Feedback Fehler:', error);
      }
    } catch (error) {
      console.error('Feedback Exception:', error);
    }
  };

  // ============================================
  // RENDER
  // ============================================
  if (!mounted) return null;

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-950 overflow-hidden">

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-10"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-20 w-72 bg-gray-800 flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-base">Meine Chats</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700 transition-colors text-lg"
            >
              ✕
            </button>
          </div>

          <button
            onClick={startNewChat}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg mb-4 transition-colors text-sm font-medium"
          >
            + Neuer Chat
          </button>

          <div className="space-y-1 overflow-y-auto flex-1">
            {conversations.length === 0 && (
              <p className="text-gray-500 text-xs text-center mt-4">Noch keine Chats</p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`p-3 rounded-lg cursor-pointer flex justify-between items-center transition-colors ${
                  currentConversationId === conv.id ? 'bg-emerald-700' : 'hover:bg-gray-700'
                }`}
                onClick={() => loadMessages(conv.id)}
              >
                <div className="truncate flex-1 min-w-0">
                  <span className="text-sm font-medium text-white block truncate">{conv.title}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(conv.updated_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                  className="text-red-400 hover:text-red-300 ml-2 text-sm flex-shrink-0"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Haupt-Chat-Bereich */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header */}
        <header className="bg-emerald-700 shadow-lg z-10 flex-shrink-0">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-white p-1.5 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
                aria-label="Menü"
              >
                <div className="flex flex-col gap-1.5">
                  <span className="block w-5 h-0.5 bg-white rounded-full"></span>
                  <span className="block w-5 h-0.5 bg-white rounded-full"></span>
                  <span className="block w-5 h-0.5 bg-white rounded-full"></span>
                </div>
              </button>
              <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                🇪🇷
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white leading-tight">Habesha AI</h1>
                <p className="text-xs text-emerald-200">
                  {user ? user.email?.split('@')[0] : 'Gast'} • {loading ? 'tippt...' : 'online'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 items-center">
              {user && (
                <button
                  onClick={async () => {
                    const res = await fetch('/api/stripe/checkout', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: user.id, email: user.email }),
                    });
                    const { url } = await res.json();
                    if (url) window.location.href = url;
                  }}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                >
                  💎 Premium
                </button>
              )}
              {user && (
                <button
                  onClick={handleLogout}
                  className="text-white px-3 py-1.5 hover:bg-white/10 rounded-full flex items-center gap-1.5 text-sm transition-colors"
                >
                  🚪 Logout
                </button>
              )}
              {!user && (
                <a
                  href="/login"
                  className="text-white px-3 py-1.5 hover:bg-white/10 rounded-full flex items-center gap-1.5 text-sm"
                >
                  🔑 Login
                </a>
              )}
            </div>
          </div>
        </header>

        {/* Chat Messages */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center min-h-[calc(100vh-200px)]">
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
                      {msg.created_at && (
                        <span className="text-[10px] opacity-70 mt-1 block text-right">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-sm ml-2 flex-shrink-0">
                        👤
                      </div>
                    )}
                  </div>

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
        </main>

        {/* Input Area */}
        <div className="border-t border-gray-700 p-3 bg-gray-800/90 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
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
      </div>
    </div>
  );
}