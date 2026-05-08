'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

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
type Language = 'de' | 'ti' | 'am' | 'en';

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
  const [userName, setUserName] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [userLanguage, setUserLanguage] = useState<Language>('de');
  const [showLanguageMenu, setShowLanguageMenu] = useState<boolean>(false);

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
  // 🔥 FIX: addSystemMessage zuerst definieren!
  // ============================================
  const addSystemMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, { role: 'assistant', content }]);
  }, []);

  // ============================================
  // PROFILE & LANGUAGE FUNCTIONS
  // ============================================
  const loadUserProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, preferred_language')
      .eq('id', userId)
      .single();
    
    if (data) {
      setUserName(data.full_name || '');
      setUserLanguage((data.preferred_language as Language) || 'de');
    }
  }, [supabase]);

  const updateUserLanguage = useCallback(async (lang: Language) => {
    if (!user?.id) return;
    
    setUserLanguage(lang);
    setShowLanguageMenu(false);
    
    // In Supabase speichern
    await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        preferred_language: lang,
        updated_at: new Date().toISOString(),
      });
    
    // JWT Metadata updaten
    await supabase.auth.updateUser({
      data: { preferred_language: lang }
    });
    
    // Systemnachricht über Sprachwechsel
    const langMsg: Record<Language, string> = {
      de: '🌍 Sprache wurde auf Deutsch umgestellt.',
      en: '🌍 Language switched to English.',
      ti: '🌍 ቋንቋ ናብ ትግርኛ ተቐይሩ።',
      am: '🌍 ቋንቋ ወደ አማርኛ ተቀይሯል።'
    };
    addSystemMessage(langMsg[lang]);
  }, [user, supabase, addSystemMessage]);

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
  // CHAT-VERLAUF
  // ============================================
  const loadConversations = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    setConversations(data || []);
    return data || [];
  }, [supabase]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setCurrentConversationId(conversationId);
    localStorage.setItem('lastConversationId', conversationId);
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
      localStorage.setItem('lastConversationId', data.id);
      loadConversations(userId);
      setSidebarOpen(false);
    }
  }, [supabase, loadConversations]);

  const updateChatTitle = useCallback(async (conversationId: string, userMessage: string) => {
    const title = userMessage.length > 40
      ? userMessage.substring(0, 40) + '...'
      : userMessage;
    await supabase
      .from('conversations')
      .update({ title })
      .eq('id', conversationId);
  }, [supabase]);

  const deleteConversation = useCallback(async (id: string, userId: string) => {
    if (confirm('Chat wirklich löschen?')) {
      await supabase.from('conversations').delete().eq('id', id);
      if (currentConversationId === id) {
        localStorage.removeItem('lastConversationId');
        await startNewChat(userId);
      }
      await loadConversations(userId);
    }
  }, [supabase, currentConversationId, startNewChat, loadConversations]);

  // ============================================
  // PREMIUM & LOGOUT
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

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('lastConversationId');
    window.location.href = '/login';
  }, [supabase]);

  // ============================================
  // AUTH INITIALISIERUNG
  // ============================================
  useEffect(() => {
    setMounted(true);

    if (initCalled.current) return;
    initCalled.current = true;

    const initAuth = async () => {
      try {
        const { data: { user: authenticatedUser }, error: userError } = await supabase.auth.getUser();

        if (userError || !authenticatedUser) {
          window.location.href = '/login';
          return;
        }

        setUser(authenticatedUser);
        setUserEmail(authenticatedUser.email || '');
        
        await loadUserProfile(authenticatedUser.id);

        const convList = await loadConversations(authenticatedUser.id);

        const lastId = localStorage.getItem('lastConversationId');
        const lastExists = convList.find((c: Conversation) => c.id === lastId);

        if (lastId && lastExists) {
          await loadMessages(lastId);
        } else if (convList.length > 0) {
          await loadMessages(convList[0].id);
        } else {
          await startNewChat(authenticatedUser.id);
        }

        const { data: trusted } = await supabase
          .from('trusted_users')
          .select('role')
          .eq('user_id', authenticatedUser.id)
          .maybeSingle();

        setIsPremium(trusted?.role === 'premium' || trusted?.role === 'admin');
        startChatTimer();
        setAuthChecked(true);

      } catch (err) {
        console.error('Init Error:', err);
        window.location.href = '/login';
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setUser(session.user);
        setUserEmail(session.user.email || '');
        loadUserProfile(session.user.id);
        loadConversations(session.user.id);
      }
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserEmail('');
        localStorage.removeItem('lastConversationId');
        window.location.href = '/login';
      }
    });

    return () => {
      subscription.unsubscribe();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // VOICE INPUT
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
      alert('❌ Mikrofon-Zugriff verweigert.');
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
  // BILD-UPLOAD
  // ============================================
  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isPremium && pdfCount >= MAX_PDF) {
      alert(`⚠️ Du hast das Limit von ${MAX_PDF} Uploads erreicht.`);
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
          addSystemMessage(`⚠️ Du hast das Limit von ${MAX_PDF} Uploads erreicht.`);
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
          body: JSON.stringify({ 
            image: base64Image, 
            userId: user?.id,
            language: userLanguage 
          }),
        });
        const data = await res.json();
        setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '❌ Fehler bei der Bildanalyse.' },
        ]);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }, [isPremium, pdfCount, MAX_PDF, user, addSystemMessage, userLanguage]);

  // ============================================
  // SEND MESSAGE
  // ============================================
  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    if (limitReached && !isPremium) {
      alert('⛔ Limit erreicht! Bitte Premium buchen.');
      return;
    }

    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    const isFirstMessage = messages.length === 0;

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
          isNewConversation: isFirstMessage,
          language: userLanguage,
        }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: 'assistant', content: data.response }]);

      if (isFirstMessage && currentConversationId) {
        await updateChatTitle(currentConversationId, input);
      }

      if (user) await loadConversations(user.id);

    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Fehler aufgetreten. Bitte versuch es nochmal.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, limitReached, isPremium, messages, user, currentConversationId, loadConversations, updateChatTitle, userLanguage]);

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
      if (!user?.id) return;

      let isTrusted = false;
      if (userEmail) {
        const { data: trusted } = await supabase
          .from('trusted_users')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        isTrusted = !!trusted && (trusted.role === 'beta' || trusted.role === 'admin');
      }

      const table = isTrusted ? 'user_feedback' : 'user_feedback_temp';

      const sessionId = typeof window !== 'undefined'
        ? localStorage.getItem('session_id') ?? 'unknown'
        : 'unknown';

      await supabase.from(table).insert([{
        user_id: user.id,
        question: vorherigeNachricht.content,
        ai_response: letzteNachricht.content,
        user_feedback: feedback,
        corrected_response: korrektur ?? null,
        language: 'tigrinya',
        session_id: sessionId,
      }]);
    } catch (error) {
      console.error('Feedback Exception:', error);
    }
  }, [messages, user, userEmail, supabase]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Sprach-Label Mapping
  const getLanguageLabel = (lang: Language): string => {
    const labels: Record<Language, string> = {
      de: '🇩🇪 Deutsch',
      en: '🇬🇧 English',
      ti: '🇪🇷 ትግርኛ',
      am: '🇪🇹 አማርኛ'
    };
    return labels[lang];
  };

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

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-950 overflow-hidden">

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-10" onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR - MIT PROFIL UNTEN */}
      <div className={`
        fixed inset-y-0 left-0 z-20 w-80 bg-gray-800 flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-lg">Meine Chats</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700"
            >✕</button>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="p-4">
          <button
            onClick={() => user && startNewChat(user.id)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            <span>+</span> Neuer Chat
          </button>
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          {conversations.length === 0 && (
            <p className="text-gray-500 text-xs text-center mt-4">Noch keine Chats</p>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`p-3 rounded-xl cursor-pointer flex justify-between items-center transition-all ${
                currentConversationId === conv.id 
                  ? 'bg-emerald-700/50 border-l-4 border-emerald-500' 
                  : 'hover:bg-gray-700/50'
              }`}
              onClick={() => loadMessages(conv.id)}
            >
              <div className="truncate flex-1 min-w-0">
                <span className="text-sm font-medium text-white block truncate">
                  {conv.title}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(conv.updated_at).toLocaleDateString()}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); user && deleteConversation(conv.id, user.id); }}
                className="text-red-400 hover:text-red-300 ml-2 text-sm opacity-50 hover:opacity-100 transition"
              >🗑️</button>
            </div>
          ))}
        </div>

        {/* PROFIL BEREICH - UNTEN */}
        <div className="border-t border-gray-700 mt-auto">
          {/* User Info - Klickbar für Menu */}
          <button
            onClick={() => setShowLanguageMenu(!showLanguageMenu)}
            className="w-full p-4 flex items-center gap-3 hover:bg-gray-700/50 transition-colors"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-full flex items-center justify-center text-white font-semibold">
              {userEmail?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 text-left">
              <p className="text-white text-sm font-medium truncate">
                {userName || userEmail?.split('@')[0] || 'User'}
              </p>
              <p className="text-gray-400 text-xs truncate">{userEmail}</p>
            </div>
            <span className="text-gray-400 text-xs">▼</span>
          </button>

          {/* Dropdown Menu für Profil */}
          {showLanguageMenu && (
            <div className="px-3 pb-3 space-y-2">
              {/* Premium Status */}
              <div className="p-3 rounded-xl bg-gray-700/50">
                {isPremium ? (
                  <div className="flex items-center gap-2 text-emerald-400">
                    <span className="text-lg">💎</span>
                    <div>
                      <p className="text-sm font-medium">Premium Aktiv</p>
                      <p className="text-xs text-gray-400">Unbegrenzte Nutzung</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📊</span>
                        <div>
                          <p className="text-sm font-medium">Free Plan</p>
                          <p className="text-xs text-gray-400">{pdfCount}/{MAX_PDF} Uploads · {formatTime(remainingSeconds)}</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handlePremium}
                      className="w-full py-2 bg-gradient-to-r from-yellow-600 to-yellow-500 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                    >
                      <span>💎</span> Premium Upgrade
                    </button>
                  </div>
                )}
              </div>

              {/* Language Selection */}
              <div className="p-2">
                <p className="text-xs text-gray-400 mb-2 px-2">🌍 Sprache / Language</p>
                <div className="space-y-1">
                  {(['de', 'en', 'ti', 'am'] as Language[]).map((code) => (
                    <button
                      key={code}
                      onClick={() => updateUserLanguage(code)}
                      className={`
                        w-full text-left px-3 py-2 rounded-lg text-sm transition-all
                        ${userLanguage === code 
                          ? 'bg-emerald-600 text-white' 
                          : 'hover:bg-gray-700 text-gray-300'
                        }
                      `}
                    >
                      {getLanguageLabel(code)}
                      {userLanguage === code && <span className="float-right">✓</span>}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500 mt-2 px-2">
                  Diese Sprache wird für alle Antworten verwendet
                </p>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors text-sm"
              >
                <span>🚪</span> Abmelden / Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* HAUPT-CHAT-BEREICH - OHNE PROFIL/LOGOUT IM HEADER */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header - NUR CHAT-TITLE, KEINE BUTTONS MEHR! */}
        <header className="bg-emerald-700 shadow-lg z-10 flex-shrink-0">
          <div className="px-4 py-3 flex items-center">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-white p-1.5 hover:bg-white/10 rounded-lg transition-colors mr-3"
            >
              <div className="flex flex-col gap-1.5">
                <span className="block w-5 h-0.5 bg-white rounded-full"></span>
                <span className="block w-5 h-0.5 bg-white rounded-full"></span>
                <span className="block w-5 h-0.5 bg-white rounded-full"></span>
              </div>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">Habesha AI</h1>
              <p className="text-xs text-emerald-200">
                {getLanguageLabel(userLanguage)} · Behördenbriefe verstehen
              </p>
            </div>
          </div>
        </header>

        {/* Limit Banner */}
        {limitReached && !isPremium && (
          <div className="bg-amber-900/80 border-l-4 border-amber-500 p-3 m-3 rounded-lg">
            <p className="text-amber-200 text-sm">
              ⚠️ <strong>Limit erreicht</strong><br />
              {pdfCount >= MAX_PDF
                ? `Du hast ${pdfCount}/${MAX_PDF} Uploads genutzt.`
                : `Deine 30 Minuten kostenlose Chat-Zeit ist abgelaufen.`}
            </p>
            <button
              onClick={handlePremium}
              className="mt-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-1.5 rounded-full text-sm font-medium"
            >🚀 Jetzt Premium buchen</button>
          </div>
        )}

        {!isPremium && !limitReached && (
          <div className="bg-gray-800/50 px-4 py-2 text-xs text-gray-400 flex justify-between items-center border-b border-gray-700">
            <span>📄 Uploads: {pdfCount}/{MAX_PDF}</span>
            <span>⏱️ {formatTime(remainingSeconds)}</span>
          </div>
        )}

        {/* Chat Messages */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center min-h-[calc(100vh-200px)]">
                <div className="w-20 h-20 bg-emerald-700/30 rounded-full flex items-center justify-center mb-4 text-4xl">💬</div>
                <h3 className="text-xl font-semibold text-white mb-2">Habesha AI</h3>
                <p className="text-gray-400 text-sm max-w-md">
                  Dein KI-Assistent für die Habesha Community.<br />
                  Antwortet auf {getLanguageLabel(userLanguage)}
                </p>
                <div className="mt-8 grid grid-cols-2 gap-3 max-w-md">
                  <button onClick={() => setInput('Jobcenter Brief erklären')} className="px-4 py-2 bg-gray-700 rounded-xl text-sm hover:bg-gray-600 transition">
                    🏢 Jobcenter
                  </button>
                  <button onClick={() => setInput('Finanzamt Steuerbescheid erklären')} className="px-4 py-2 bg-gray-700 rounded-xl text-sm hover:bg-gray-600 transition">
                    💰 Finanzamt
                  </button>
                  <button onClick={() => setInput('AOK Brief erklären')} className="px-4 py-2 bg-gray-700 rounded-xl text-sm hover:bg-gray-600 transition">
                    🏥 AOK
                  </button>
                  <button onClick={() => setInput('Ausländerbehörde Brief erklären')} className="px-4 py-2 bg-gray-700 rounded-xl text-sm hover:bg-gray-600 transition">
                    🪪 Ausländerbehörde
                  </button>
                </div>
                <p className="text-gray-500 text-xs mt-6">🎤 Spracheingabe | 📸 Bilder | ⚡ Blitzschnell</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className="mb-4">
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-sm'
                        : 'bg-gray-700 text-gray-100 rounded-bl-sm'
                    }`}>
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
                      >👍 Gut</button>
                      <button
                        onClick={() => {
                          const korrektur = prompt('Deine Korrektur (optional):');
                          saveFeedback('schlecht', korrektur ?? undefined);
                        }}
                        className="text-[11px] bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded-full hover:bg-red-600/30 hover:text-red-300 transition-colors"
                      >👎 Schlecht</button>
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
                  <span>🎤</span><span>Höre zu...</span>
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input */}
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
              className={`p-2 transition-colors ${isListening ? 'text-red-400 animate-pulse' : 'text-gray-400 hover:text-emerald-400'} ${(limitReached && !isPremium) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            <div className="flex-1 bg-gray-700 rounded-2xl px-4 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); autoResize(e); }}
                onKeyDown={handleKeyDown}
                placeholder={limitReached && !isPremium ? "Limit erreicht – Premium buchen" : `Nachricht auf ${getLanguageLabel(userLanguage)}...`}
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
            🛡️ Ende-zu-Ende verschlüsselt | Habesha AI
          </div>
        </div>
      </div>
    </div>
  );
}