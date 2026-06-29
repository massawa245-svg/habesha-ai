'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Sidebar from '@/app/components/sidebar';

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
  const [mounted, setMounted] = useState<boolean>(false);
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [userLanguage, setUserLanguage] = useState<Language>('de');
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [remainingUploads] = useState<number>(8);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(30 * 60);
  const [limitReached, setLimitReached] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [showAttachMenu, setShowAttachMenu] = useState<boolean>(false);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const initCalled = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Clean Separation of Inputs
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const recognitionRef = useRef<any>(null);
  const supabase = createClient();

  const addSystemMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, { role: 'assistant', content }]);
  }, []);

  const loadUserProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('full_name, preferred_language').eq('id', userId).maybeSingle();
    if (data) { 
      setUserName(data.full_name || ''); 
      setUserLanguage((data.preferred_language as Language) || 'de'); 
    }
  }, [supabase]);

  const startChatTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) { 
          if (timerRef.current) clearInterval(timerRef.current); 
          setLimitReached(true); 
          addSystemMessage('Deine 30 Minuten kostenlose Chat-Zeit sind abgelaufen.'); 
          return 0; 
        }
        return prev - 1;
      });
    }, 1000);
  }, [addSystemMessage]);

  const loadConversations = useCallback(async (userId: string) => {
    const { data } = await supabase.from('conversations').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
    setConversations(data || []);
    return data || [];
  }, [supabase]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    setMessages(data || []);
    const { error } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    setCurrentConversationId(conversationId);
    localStorage.setItem('lastConversationId', conversationId);
    setSidebarOpen(false);
  }, [supabase]);

  const startNewChat = useCallback(async (userId: string) => {
    const { data } = await supabase.from('conversations').insert({ user_id: userId, title: 'Neues Gespräch' }).select().single();
    if (data) { 
      setCurrentConversationId(data.id); 
      setMessages([]); 
      localStorage.setItem('lastConversationId', data.id); 
      await loadConversations(userId); 
      setSidebarOpen(false); 
    }
  }, [supabase, loadConversations]);

  const updateChatTitle = useCallback(async (conversationId: string, userMessage: string) => {
    const title = userMessage.length > 40 ? userMessage.substring(0, 40) + '...' : userMessage;
    await supabase.from('conversations').update({ title }).eq('id', conversationId);
  }, [supabase]);

  useEffect(() => {
    setMounted(true);
    if (initCalled.current) return;
    initCalled.current = true;

    const initAuth = async () => {
      try {
        const { data: { user: au }, error } = await supabase.auth.getUser();
        if (error || !au) { window.location.href = '/login'; return; }
        setUser(au);
        await loadUserProfile(au.id);
        const convList = await loadConversations(au.id);
        const lastId = localStorage.getItem('lastConversationId');
        const lastExists = convList.find((c: Conversation) => c.id === lastId);
        
        if (lastId && lastExists) await loadMessages(lastId);
        else if (convList.length > 0) await loadMessages(convList[0].id);
        else await startNewChat(au.id);
        
        const { data: trusted } = await supabase.from('trusted_users').select('role').eq('user_id', au.id).maybeSingle();
        setIsPremium(trusted?.role === 'premium' || trusted?.role === 'admin');
        startChatTimer();
        setAuthChecked(true);
      } catch { 
        window.location.href = '/login'; 
      }
    };
    
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setUser(session.user);
      }
      if (event === 'SIGNED_OUT') { 
        setUser(null); 
        localStorage.removeItem('lastConversationId'); 
        window.location.href = '/login'; 
      }
    });

    return () => { 
      subscription.unsubscribe(); 
      if (timerRef.current) clearInterval(timerRef.current); 
    };
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const autoResize = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px';
  }, []);

  const sendMessage = useCallback(async (textOverride?: string) => {
    const text = textOverride ?? input;
    if (!text.trim() || loading) return;
    if (limitReached && !isPremium) { alert('Limit erreicht! Bitte Premium buchen.'); return; }
    
    const userMessage: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    const isFirst = messages.length === 0;
    
    setMessages(newMessages); 
    setInput(''); 
    setLoading(true);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    
    try {
      const res = await fetch('/api/chat', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          message: text, 
          history: newMessages.map(m => ({ role: m.role, content: m.content })), 
          userId: user?.id, 
          conversationId: currentConversationId, 
          language: userLanguage 
        }) 
      });
      const data = await res.json();
      setMessages([...newMessages, { role: 'assistant', content: data.response }]);
      if (isFirst && currentConversationId) await updateChatTitle(currentConversationId, text);
      if (user) await loadConversations(user.id);
    } catch { 
      setMessages([...newMessages, { role: 'assistant', content: 'Fehler aufgetreten.' }]); 
    } finally { 
      setLoading(false); 
    }
  }, [input, loading, limitReached, isPremium, messages, user, currentConversationId, userLanguage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }, [sendMessage]);

  const toggleVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Spracherkennung nicht verfügbar.'); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    
    const rec = new SR();
    rec.lang = userLanguage === 'de' ? 'de-DE' : userLanguage === 'en' ? 'en-US' : 'ti-ER';
    rec.interimResults = false;
    rec.onresult = (e: any) => setInput(prev => prev + e.results[0][0].transcript);
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    
    recognitionRef.current = rec; 
    rec.start(); 
    setIsListening(true);
  }, [isListening, userLanguage]);

  const handleFileUpload = useCallback(async (file: File) => {
    setShowAttachMenu(false);
    setUploadingFile(true);

    const currentPrompt = input.trim() || 'Erkläre diesen Brief';
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setMessages(prev => [...prev, { role: 'user', content: `📄 PDF gesendet: "${currentPrompt}"` }]);

      try {
        const res = await fetch('/api/analyze-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64,
            message: currentPrompt,
            userId: user?.id,
            conversationId: currentConversationId,
            language: userLanguage
          }),
        });
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
        if (user) await loadConversations(user.id);
      } catch {
        addSystemMessage('PDF konnte nicht verarbeitet werden. Bitte versuche es erneut.');
      } finally {
        setUploadingFile(false);
      }
    };
    reader.readAsDataURL(file);
  }, [user, input, currentConversationId, userLanguage, addSystemMessage, loadConversations]);

  const handleImageUpload = useCallback(async (file: File) => {
    setShowAttachMenu(false); 
    setUploadingFile(true);
    
    // Aktuellen Text sichern und Input leeren für bessere UX
    const currentPrompt = input.trim() || 'Erkläre diesen Brief';
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setMessages(prev => [...prev, { role: 'user', content: `📷 Foto gesendet: "${currentPrompt}"`, image: base64 }]);
      
      try {
        const res = await fetch('/api/analyze-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64,
            message: currentPrompt,
            userId: user?.id,
            conversationId: currentConversationId,
            language: userLanguage
          }),
        });
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
        if (user) await loadConversations(user.id);
      } catch {
        addSystemMessage('Bild konnte nicht verarbeitet werden. Bitte versuche es erneut.');
      } finally {
        setUploadingFile(false);
      }
    };
    reader.readAsDataURL(file);
  }, [user, input, currentConversationId, userLanguage, addSystemMessage, loadConversations]);

  const getLangLabel = (lang: Language) => ({ de: 'Deutsch', en: 'English', ti: 'ትግርኛ', am: 'አማርኛ' }[lang]);

  if (!mounted || !authChecked) return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
        <p>Lade Habesha AI...</p>
      </div>
    </div>
  );

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-950 overflow-hidden">
      {/* Sidebar */}
      <>
        {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}
        <div className={`fixed inset-y-0 left-0 z-30 transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 lg:flex-shrink-0`}>
          <Sidebar user={{ id: user.id, email: user.email, full_name: userName }} profile={{ preferred_language: userLanguage }} premium={{ isPremium, remaining: remainingUploads }} chatHistory={conversations} onClose={() => setSidebarOpen(false)} onNewChat={() => startNewChat(user.id)} />
        </div>
      </>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="bg-emerald-700 shadow-lg z-10 flex-shrink-0">
          <div className="px-4 py-3 flex items-center gap-3">
            <button onClick={() => setSidebarOpen(p => !p)} className="text-white p-1.5 hover:bg-white/10 rounded-lg transition-colors lg:hidden">
              <div className="flex flex-col gap-1.5">
                <span className="block w-5 h-0.5 bg-white rounded-full"></span>
                <span className="block w-5 h-0.5 bg-white rounded-full"></span>
                <span className="block w-5 h-0.5 bg-white rounded-full"></span>
              </div>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">Habesha AI</h1>
              <p className="text-xs text-emerald-200">{getLangLabel(userLanguage)} · Behördenbriefe verstehen</p>
            </div>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center min-h-[calc(100vh-200px)]">
                <div className="w-20 h-20 bg-emerald-700/30 rounded-full flex items-center justify-center mb-4 text-4xl">💬</div>
                <h3 className="text-xl font-semibold text-white mb-2">Habesha AI</h3>
                <p className="text-gray-400 text-sm max-w-md">Dein KI-Assistent für die Habesha Community.</p>
                <div className="mt-8 grid grid-cols-2 gap-3 max-w-md">
                  {[['🏢', 'Jobcenter'], ['💰', 'Finanzamt'], ['🏥', 'AOK'], ['🪪', 'Ausländerbehörde']].map(([icon, topic]) => (
                    <button key={topic} onClick={() => setInput(`${topic} Brief erklären`)} className="px-4 py-2 bg-gray-700 rounded-xl text-sm hover:bg-gray-600 transition text-white">
                      {icon} {topic}
                    </button>
                  ))}
                </div>
              </div>
            ) : messages.map((msg, i) => (
              <div key={i} className="mb-4">
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-gray-700 text-gray-100 rounded-bl-sm'}`}>
                    {msg.image && <img src={msg.image} alt="Brief Scan" className="max-w-[200px] rounded-lg mb-2 cursor-pointer" onClick={() => window.open(msg.image, '_blank')} />}
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                </div>
              </div>
            ))}
            {(loading || uploadingFile) && (
              <div className="flex justify-start mb-4">
                <div className="bg-gray-700 rounded-2xl px-4 py-3 flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input Control Area */}
        <div className="border-t border-gray-700 p-3 bg-gray-800/90">
          {/* Attach Menu */}
          {showAttachMenu && (
            <div className="mb-3 flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <button onClick={() => cameraInputRef.current?.click()} className="flex flex-col items-center gap-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-2xl text-white text-xs transition">
                <span className="text-2xl">📷</span><span>Kamera</span>
              </button>
              <button onClick={() => galleryInputRef.current?.click()} className="flex flex-col items-center gap-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-2xl text-white text-xs transition">
                <span className="text-2xl">🖼️</span><span>Galerie</span>
              </button>
              <button onClick={() => documentInputRef.current?.click()} className="flex flex-col items-center gap-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-2xl text-white text-xs transition">
                <span className="text-2xl">📄</span><span>PDF/Doc</span>
              </button>
            </div>
          )}

          {/* Hidden clean file inputs */}
          <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }} />
          <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }} />

          {/* Interactive Row */}
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            <button onClick={() => setShowAttachMenu(p => !p)} className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${showAttachMenu ? 'bg-emerald-600 text-white rotate-45' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`} aria-label="Anhang">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>

            <textarea ref={inputRef} value={input} onChange={(e) => { setInput(e.target.value); autoResize(e); }} onKeyDown={handleKeyDown} placeholder="Nachricht schreiben..." className="flex-1 bg-gray-700 rounded-2xl px-4 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" rows={1} style={{ minHeight: '40px', maxHeight: '120px' }} disabled={loading || uploadingFile} />

            <button onClick={toggleVoice} className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`} aria-label="Sprache">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>

            <button onClick={() => sendMessage()} disabled={!input.trim() || loading || uploadingFile} className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${input.trim() && !loading && !uploadingFile ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`} aria-label="Senden">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}