// app/admin/page.tsx
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

type ChatEntry = {
  id: number;
  user_question: string;
  ai_answer: string;
  language: string;
  source: string;
  quality_score: number | null;
  similarity_score: number | null;
  reviewed: boolean;
  approved_for_training: boolean;
  corrected_answer: string | null;
  created_at: string;
};

export default function AdminDashboard() {
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'unreviewed' | 'all'>('unreviewed');
  // Korrektur-Texte pro Chat-Eintrag
  const [corrections, setCorrections] = useState<Record<number, string>>({});

  const supabase = useRef(createClient()).current;
  const authChecked = useRef(false);

  // ============================================
  // CHATS LADEN
  // ============================================
  const loadChats = useCallback(async () => {
    let query = supabase
      .from('chat_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter === 'unreviewed') {
      query = query.eq('reviewed', false);
    }

    const { data } = await query;
    setChats(data || []);

    // Korrektur-Felder vorbefuellen mit der KI-Antwort (zum Bearbeiten)
    const initialCorrections: Record<number, string> = {};
    (data || []).forEach((c: ChatEntry) => {
      initialCorrections[c.id] = c.corrected_answer || c.ai_answer;
    });
    setCorrections(initialCorrections);
  }, [supabase, filter]);

  // ============================================
  // AUTH CHECK
  // ============================================
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = '/login'; return; }

        const { data: trusted } = await supabase
          .from('trusted_users')
          .select('*')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (!trusted) { window.location.href = '/'; return; }

        setIsAuthorized(true);
        await loadChats();
      } catch (err) {
        console.error('Auth Error:', err);
        window.location.href = '/login';
      } finally {
        setLoading(false);
      }
    };

    if (!authChecked.current) {
      authChecked.current = true;
      checkAuth();
    }
  }, [supabase, loadChats]);

  useEffect(() => {
    if (isAuthorized) loadChats();
  }, [filter, isAuthorized, loadChats]);

  // ============================================
  // FREIGEBEN (mit Korrektur) -> training_data
  // ============================================
  const approveChat = useCallback(async (chat: ChatEntry) => {
    const finalAnswer = corrections[chat.id]?.trim();
    if (!finalAnswer) {
      alert('Die Antwort darf nicht leer sein.');
      return;
    }

    setProcessingId(chat.id);
    try {
      const res = await fetch('/api/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatHistoryId: chat.id,
          question: chat.user_question,
          finalAnswer: finalAnswer,
          language: chat.language === 'ti' ? 'tigrinya' : chat.language === 'am' ? 'amharic' : chat.language,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler');

      const wasCorrected = finalAnswer !== chat.ai_answer;
      alert(
        wasCorrected
          ? `✅ Korrigiert & freigegeben!\n\nDeine Version wird ab jetzt genutzt.${data.hadEmbedding ? '' : '\n(Embedding folgt spaeter)'}`
          : `✅ Freigegeben!${data.hadEmbedding ? '' : '\n(Embedding folgt spaeter)'}`
      );
      loadChats();
    } catch (error) {
      console.error('Freigeben-Fehler:', error);
      alert('❌ Fehler beim Freigeben: ' + (error instanceof Error ? error.message : ''));
    } finally {
      setProcessingId(null);
    }
  }, [corrections, loadChats]);

  // ============================================
  // ABLEHNEN / LOESCHEN (nicht ins Training)
  // ============================================
  const rejectChat = useCallback(async (chatId: number) => {
    if (!confirm('Diese Antwort ablehnen? Sie wird NICHT fuers Training verwendet.')) return;

    setProcessingId(chatId);
    try {
      const res = await fetch('/api/admin/approve', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatHistoryId: chatId }),
      });
      if (!res.ok) throw new Error('Fehler');
      loadChats();
    } catch (error) {
      alert('❌ Fehler beim Ablehnen');
    } finally {
      setProcessingId(null);
    }
  }, [loadChats]);

  // ============================================
  // RENDER
  // ============================================
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p>Lade Admin Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">🇪🇷 Habesha AI - Korrektur</h1>
        <button
          onClick={() => supabase.auth.signOut().then(() => (window.location.href = '/'))}
          className="bg-red-600 px-4 py-2 rounded hover:bg-red-700"
        >
          Logout
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('unreviewed')}
          className={`px-4 py-2 rounded ${filter === 'unreviewed' ? 'bg-emerald-600' : 'bg-gray-700'}`}
        >
          Ungeprüft
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded ${filter === 'all' ? 'bg-emerald-600' : 'bg-gray-700'}`}
        >
          Alle
        </button>
      </div>

      <div className="bg-gray-800 p-4 sm:p-6 rounded-xl">
        <h2 className="text-xl font-bold mb-4">
          📝 Chats ({chats.length})
        </h2>

        {chats.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Keine Einträge</p>
        ) : (
          <div className="space-y-4">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={`bg-gray-700 p-4 rounded border ${
                  chat.approved_for_training
                    ? 'border-green-500/50'
                    : chat.reviewed
                    ? 'border-gray-500/50'
                    : 'border-yellow-500/50'
                }`}
              >
                {/* Meta */}
                <div className="flex flex-wrap justify-between items-center gap-2 mb-2 text-xs">
                  <span className="text-gray-400">{new Date(chat.created_at).toLocaleString()}</span>
                  <div className="flex gap-2">
                    <span className="bg-blue-600 px-2 py-0.5 rounded-full">{chat.language}</span>
                    <span className="bg-purple-600 px-2 py-0.5 rounded-full">{chat.source}</span>
                    {chat.approved_for_training && (
                      <span className="bg-green-600 px-2 py-0.5 rounded-full">✅ Im Training</span>
                    )}
                  </div>
                </div>

                {/* User-Frage */}
                <div className="mt-2">
                  <span className="text-emerald-400 font-medium text-sm">Frage (User):</span>
                  <p className="break-words bg-gray-800 p-2 rounded mt-1">{chat.user_question}</p>
                </div>

                {/* KI-Antwort (original) */}
                <div className="mt-2">
                  <span className="text-blue-400 font-medium text-sm">KI-Antwort (original):</span>
                  <p className="break-words bg-gray-800 p-2 rounded mt-1 text-gray-300">{chat.ai_answer}</p>
                </div>

                {/* Korrektur-Feld */}
                <div className="mt-3">
                  <span className="text-yellow-400 font-medium text-sm">
                    ✏️ Deine Korrektur (das wird gespeichert):
                  </span>
                  <textarea
                    value={corrections[chat.id] ?? ''}
                    onChange={(e) =>
                      setCorrections((prev) => ({ ...prev, [chat.id]: e.target.value }))
                    }
                    className="w-full bg-gray-900 p-2 rounded mt-1 text-white border border-gray-600 focus:border-emerald-500 focus:outline-none"
                    rows={3}
                    dir="auto"
                  />
                </div>

                {/* Buttons */}
                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                  <button
                    onClick={() => approveChat(chat)}
                    disabled={processingId === chat.id}
                    className="bg-emerald-600 px-4 py-2 rounded hover:bg-emerald-700 text-sm disabled:opacity-50 flex-1"
                  >
                    {processingId === chat.id ? '...' : '✅ Freigeben & Speichern'}
                  </button>
                  <button
                    onClick={() => rejectChat(chat.id)}
                    disabled={processingId === chat.id}
                    className="bg-red-600 px-4 py-2 rounded hover:bg-red-700 text-sm disabled:opacity-50"
                  >
                    🗑️ Ablehnen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}