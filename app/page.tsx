'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Sidebar from '@/components/sidebar';

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

type Language = 'de' | 'ti' | 'am' | 'en';

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
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [remainingUploads, setRemainingUploads] = useState<number>(8);

  const [pdfCount, setPdfCount] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(30 * 60);
  const [limitReached, setLimitReached] = useState<boolean>(false);

  const MAX_PDF = 8;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const initCalled = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const supabase = createClient();

  const addSystemMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, { role: 'assistant', content }]);
  }, []);

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

  const startChatTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (isPremium || limitReached) return;
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setLimitReached(true);
          addSystemMessage('⏰ Deine 30 Minuten kostenlose Chat-Zeit sind abgelaufen.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [isPremium, limitReached, addSystemMessage]);

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
    const title = userMessage.length > 40 ? userMessage.substring(0, 40) + '...' : userMessage;
    await supabase.from('conversations').update({ title }).eq('id', conversationId);
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

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('lastConversationId');
    window.location.href = '/login';
  }, [supabase]);

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
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const autoResize = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }, []);

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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          history: newMessages.map(msg => ({ role: msg.role, content: msg.content })),
          userId: user?.id,
          conversationId: currentConversationId,
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
      setMessages([...newMessages, { role: 'assistant', content: 'Fehler aufgetreten.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, limitReached, isPremium, messages, user, currentConversationId, userLanguage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const getLanguageLabel = (lang: Language): string => {
    const labels: Record<Language, string> = {
      de: '🇩🇪 Deutsch',
      en: '🇬🇧 English',
      ti: '🇪🇷 ትግርኛ',
      am: '🇪🇹 አማርኛ'
    };
    return labels[lang];
  };

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
      
      {/* Sidebar - Jetzt separat! */}
      <Sidebar
        user={{ id: user.id, email: user.email, full_name: userName }}
        profile={{ preferred_language: userLanguage }}
        premium={{ isPremium, remaining: remainingUploads }}
        chatHistory={conversations}
      />

      {/* Haupt-Chat-Bereich */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-emerald-700 shadow-lg z-10 flex-shrink-0">
          <div className="px-4 py-3 flex items-center">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-white p-1.5 hover:bg-white/10 rounded-lg transition-colors mr-3 lg:hidden"
            >
              <div className="flex flex-col gap-1.5">
                <span className="block w-5 h-0.5 bg-white rounded-full"></span>
                <span className="block w-5 h-0.5 bg-white rounded-full"></span>
                <span className="block w-5 h-0.5 bg-white rounded-full"></span>
              </div>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">Habesha AI</h1>
              <p className="text-xs text-emerald-200">{getLanguageLabel(userLanguage)} · Behördenbriefe verstehen</p>
            </div>
          </div>
        </header>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
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
                  {['Jobcenter', 'Finanzamt', 'AOK', 'Ausländerbehörde'].map((topic) => (
                    <button
                      key={topic}
                      onClick={() => setInput(`${topic} Brief erklären`)}
                      className="px-4 py-2 bg-gray-700 rounded-xl text-sm hover:bg-gray-600 transition"
                    >
                      {topic === 'Jobcenter' && '🏢'} {topic === 'Finanzamt' && '💰'} {topic === 'AOK' && '🏥'} {topic === 'Ausländerbehörde' && '🪪'} {topic}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className="mb-4">
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      msg.role === 'user' ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-gray-700 text-gray-100 rounded-bl-sm'
                    }`}>
                      {msg.image && <img src={msg.image} alt="Bild" className="max-w-[200px] rounded-lg mb-2" onClick={() => window.open(msg.image, '_blank')} />}
                      <p className="text-base whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start mb-4">
                <div className="bg-gray-700 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input */}
        <div className="border-t border-gray-700 p-3 bg-gray-800/90">
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(e); }}
              onKeyDown={handleKeyDown}
              placeholder={`Nachricht auf ${getLanguageLabel(userLanguage)}...`}
              className="flex-1 bg-gray-700 rounded-2xl px-4 py-2 text-white text-base placeholder-gray-400 focus:outline-none resize-none"
              rows={1}
              style={{ minHeight: '40px', maxHeight: '120px' }}
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className={`p-2 rounded-full transition-colors ${
                input.trim() && !loading ? 'text-emerald-400 hover:text-emerald-300' : 'text-gray-500 cursor-not-allowed'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}