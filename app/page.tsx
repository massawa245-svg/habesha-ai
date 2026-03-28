'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  // ============================================
  // STATES
  // ============================================
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
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  // ============================================
  // PREMIUM LIMITS
  // ============================================
  const [pdfCount, setPdfCount] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(30 * 60);
  const [limitReached, setLimitReached] = useState<boolean>(false);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  
  const MAX_PDF = 8;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const initCalled = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const supabase = createClient();

  // ============================================
  // SYSTEM NACHRICHT
  // ============================================
  const addSystemMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, { role: 'assistant', content }]);
  }, []);

  // ============================================
  // TIMER FÜR 30 MINUTEN CHAT-LIMIT
  // ============================================
  const startChatTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (isPremium || limitReached) return;
      
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setLimitReached(true);
          addSystemMessage('⏰ Deine 30 Minuten kostenlose Chat-Zeit sind abgelaufen. Bitte Premium buchen um weiterzumachen.');
          return 0;
        }
        if (prev === 300) {
          addSystemMessage('⏳ Hinweis: In 5 Minuten endet deine kostenlose Chat-Zeit. Buche Premium für unbegrenzte Nutzung.');
        }
        return prev - 1;
      });
    }, 1000);
  }, [isPremium, limitReached, addSystemMessage]);

  // ============================================
  // CHAT-VERLAUF FUNKTIONEN (mit userId Parameter)
  // ============================================
  const loadConversations = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    setConversations(data || []);
  }, [supabase]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setCurrentConversationId(conversationId);
    setSidebarOpen(false);
  }, [supabase]);

  const startNewChat = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('conversations')
      .insert({ user_id: userId, title: 'Neues Gespräch' })
      .select()
      .single();
    if (data) {
      setCurrentConversationId(data.id);
      setMessages([]);
      loadConversations(userId);
      setSidebarOpen(false);
    }
  }, [supabase, loadConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    if (confirm('Chat wirklich löschen?')) {
      await supabase.from('conversations').delete().eq('id', id);
      if (currentConversationId === id && user) {
        startNewChat(user.id);
      }
      if (user) loadConversations(user.id);
    }
  }, [supabase, currentConversationId, user, startNewChat, loadConversations]);

  // ============================================
  // PREMIUM
  // ============================================
  const handlePremium = useCallback(async () => {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user?.id, email: user?.email }),
    });
    const { url } = await res.json();
    if (url) window.location.href = url;
  }, [user]);

  // ============================================
  // AUTH INITIALISIERUNG
  // ============================================
  useEffect(() => {
    setMounted(true);
    
    if (initCalled.current) return;
    initCalled.current = true;

    const initAuth = async () => {
      console.log('🔍 Home: Initialisiere Auth...');
      
      try {
        // 1. Code aus URL verarbeiten
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
          window.history.replaceState({}, '', '/');
        }
        
        // 2. User mit getUser() holen (zuverlässiger auf Vercel)
        const { data: { user: authenticatedUser }, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          console.error('❌ User Error:', userError);
          window.location.href = '/login';
          return;
        }
        
        if (authenticatedUser) {
          console.log('✅ User gefunden:', authenticatedUser.email);
          setUser(authenticatedUser);
          setUserEmail(authenticatedUser.email || '');
          
          // 3. Daten laden (mit userId direkt)
          await loadConversations(authenticatedUser.id);
          await startNewChat(authenticatedUser.id);
          
          // 4. Premium-Status prüfen
          const { data: trusted } = await supabase
            .from('trusted_users')
            .select('role')
            .eq('user_id', authenticatedUser.id)
            .maybeSingle();
          
          setIsPremium(trusted?.role === 'premium' || trusted?.role === 'admin');
          startChatTimer();
          setAuthChecked(true);
          
        } else {
          console.log('⚠️ Kein User, redirect zu /login');
          window.location.href = '/login';
          return;
        }
        
      } catch (err) {
        console.error('❌ Init Error:', err);
        window.location.href = '/login';
      }
    };
    
    initAuth();
    
    // 5. Auth State Change Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔐 Auth State Change:', event, session?.user?.email);
      
      if (event === 'SIGNED_IN' && session) {
        setUser(session.user);
        setUserEmail(session.user.email || '');
        loadConversations(session.user.id);
        startNewChat(session.user.id);
      }
      
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserEmail('');
        window.location.href = '/login';
      }
      
      if (event === 'TOKEN_REFRESHED') {
        console.log('✅ Token refreshed');
      }
    });
    
    return () => {
      subscription.unsubscribe();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [supabase, loadConversations, startNewChat, startChatTimer]);

  // ============================================
  // LOGOUT
  // ============================================
  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }, [supabase]);

  // ============================================
  // SCROLL
  // ============================================
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ============================================
  // TEXTAREA AUTO-RESIZE
  // ============================================
  const autoResize = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }, []);

  // ============================================
  // 🎤 VOICE INPUT
  // ============================================
  const startListening = useCallback(async () => {
    if (limitReached && !isPremium) {
      alert('Limit erreicht! Bitte Premium buchen.');
      return;
    }
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
  }, [limitReached, isPremium]);

  // ============================================
  // 📸 BILD-UPLOAD
  // ============================================
  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!isPremium && pdfCount >= MAX_PDF) {
      alert(`⚠️ Du hast das Limit von ${MAX_PDF} Uploads erreicht. Bitte Premium buchen für unbegrenzte Uploads.`);
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      alert('📸 Bild ist zu groß. Maximal 5 MB erlaubt.');
      return;
    }
    
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Image = e.target?.result as string;
      
      if (!isPremium) {
        const newCount = pdfCount + 1;
        setPdfCount(newCount);
        if (newCount >= MAX_PDF) {
          setLimitReached(true);
          addSystemMessage(`⚠️ Du hast das Limit von ${MAX_PDF} Uploads erreicht. Buche Premium für unbegrenzte Nutzung.`);
        }
      }
      
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
  }, [isPremium, pdfCount, MAX_PDF, user, addSystemMessage]);

  // ============================================
  // SEND MESSAGE
  // ============================================
  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    
    if (limitReached && !isPremium) {
      alert('⛔ Limit erreicht! Bitte Premium buchen um weiter zu chatten.');
      return;
    }
    
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
      if (user) loadConversations(user.id);
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Fehler aufgetreten. Bitte versuch es nochmal.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, limitReached, isPremium, messages, user, currentConversationId, loadConversations]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  // ============================================
  // FEEDBACK
  // ============================================
  const saveFeedback = useCallback(async (feedback: Feedback, korrektur?: string) => {
    try {
      const letzteNachricht = messages[messages.length - 1];
      const vorherigeNachricht = messages[messages.length - 2];
      if (letzteNachricht?.role !== 'assistant' || vorherigeNachricht?.role !== 'user') return;

      if (!user?.id) {
        console.warn('⚠️ Keine user_id vorhanden, Feedback wird nicht gespeichert');
        return;
      }

      let isTrusted = false;
      if (userEmail) {
        try {
          const { data: trusted } = await supabase
            .from('trusted_users')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          isTrusted = !!trusted && (trusted.role === 'beta' || trusted.role === 'admin');
        } catch (e) {
          console.log('Fehler bei Trusted-Check:', e);
        }
      }

      const table = isTrusted ? 'user_feedback' : 'user_feedback_temp';

      const { error } = await supabase.from(table).insert([
        {
          user_id: user.id,
          question: vorherigeNachricht.content,
          ai_response: letzteNachricht.content,
          user_feedback: feedback,
          corrected_response: korrektur ?? null,
          language: 'tigrinya',
          session_id: localStorage.getItem('session_id') ?? 'unknown',
        },
      ]);

      if (error) {
        console.error('Feedback Fehler:', error);
      } else {
        console.log(`✅ Feedback gespeichert in: ${table}`);
      }
    } catch (error) {
      console.error('Feedback Exception:', error);
    }
  }, [messages, user, userEmail, supabase]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // ============================================
  // RENDER
  // ============================================
  if (!mounted || !authChecked) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p>Lade Habesha AI...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

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
            onClick={() => user && startNewChat(user.id)}
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
              <div>
                <h1 className="text-lg font-semibold text-white leading-tight">Habesha AI</h1>
              </div>
            </div>

            <div className="flex gap-2 items-center">
              {!isPremium && (
                <button
                  onClick={handlePremium}
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
            </div>
          </div>
        </header>

        {/* Premium-Limit Banner */}
        {limitReached && !isPremium && (
          <div className="bg-amber-900/80 border-l-4 border-amber-500 p-3 m-3 rounded-lg">
            <p className="text-amber-200 text-sm">
              ⚠️ <strong>Limit erreicht</strong><br />
              {pdfCount >= MAX_PDF 
                ? `Du hast ${pdfCount}/${MAX_PDF} Uploads genutzt.` 
                : `Deine 30 Minuten kostenlose Chat-Zeit ist abgelaufen.`}
              <br />Buche Premium für unbegrenzte Nutzung.
            </p>
            <button
              onClick={handlePremium}
              className="mt-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-1.5 rounded-full text-sm font-medium"
            >
              🚀 Jetzt Premium buchen
            </button>
          </div>
        )}

        {/* Limit-Status-Anzeige */}
        {!isPremium && !limitReached && (
          <div className="bg-gray-800/50 px-4 py-2 text-xs text-gray-400 flex justify-between items-center border-b border-gray-700">
            <span>📄 Uploads: {pdfCount}/{MAX_PDF}</span>
            <span>⏱️ Verbleibende Zeit: {formatTime(remainingSeconds)}</span>
          </div>
        )}

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
                <p className="text-gray-600 text-xs mt-4">
                  ⏱️ Kostenlos: 30 Minuten Chat · {MAX_PDF} Uploads
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className="mb-4">
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                  </div>

                  {msg.role === 'assistant' && (
                    <div className="flex gap-2 mt-1 ml-4">
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
              <div className="flex justify-start mb-4">
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
              <div className="flex justify-end mb-4">
                <div className="bg-gray-700 rounded-2xl px-4 py-2 text-gray-300 text-sm">
                  📸 Bild wird hochgeladen...
                </div>
              </div>
            )}

            {isListening && (
              <div className="flex justify-start mb-4">
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
            <label className={`cursor-pointer p-2 transition-colors ${limitReached && !isPremium ? 'opacity-50 cursor-not-allowed' : 'text-gray-400 hover:text-emerald-400'}`}>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
                disabled={uploading || loading || (limitReached && !isPremium)}
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </label>

            <button
              onClick={startListening}
              disabled={loading || uploading || isListening || (limitReached && !isPremium)}
              className={`p-2 transition-colors ${
                isListening ? 'text-red-400 animate-pulse' : 'text-gray-400 hover:text-emerald-400'
              } ${(limitReached && !isPremium) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                placeholder={limitReached && !isPremium ? "Limit erreicht - Premium buchen" : "Nachricht"}
                className="w-full bg-transparent text-white text-sm placeholder-gray-400 focus:outline-none resize-none overflow-hidden"
                rows={1}
                style={{ minHeight: '40px', maxHeight: '120px' }}
                disabled={loading || uploading || isListening || (limitReached && !isPremium)}
              />
            </div>

            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading || uploading || isListening || (limitReached && !isPremium)}
              className={`p-2 rounded-full transition-colors ${
                input.trim() && !loading && !(limitReached && !isPremium)
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