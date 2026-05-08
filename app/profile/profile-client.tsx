'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateProfile, logout } from './actions';
import { createClient } from '@/lib/supabase/client';

type Lang = 'de' | 'en' | 'ti' | 'am';

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export default function ProfileClient({
  user,
  profile,
  premium,
  stats,
  conversations,
}: {
  user: { id: string; email: string };
  profile: { full_name: string; preferred_language: Lang };
  premium: { isPremium: boolean; remainingUploads: string | number };
  stats: { totalConversations: number; totalMessages: number };
  conversations: Conversation[];
}) {
  const router = useRouter();
  const supabase = createClient();
  
  const [name, setName] = useState(profile.full_name);
  const [lang, setLang] = useState<Lang>(profile.preferred_language);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSave() {
    startTransition(async () => {
      const formData = new FormData();
      formData.append('full_name', name);
      formData.append('preferred_language', lang);
      
      const result = await updateProfile(formData);
      if (result.success) {
        setMsg({ type: 'success', text: '✅ Profil gespeichert!' });
        setTimeout(() => setMsg(null), 3000);
        router.refresh();
      } else {
        setMsg({ type: 'error', text: '❌ Fehler beim Speichern' });
      }
    });
  }

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  async function loadConversation(conversationId: string) {
    // In localStorage speichern für die Chat-Seite
    localStorage.setItem('lastConversationId', conversationId);
    router.push('/');
  }

  async function deleteConversation(conversationId: string) {
    if (confirm('Chat wirklich löschen?')) {
      await supabase.from('conversations').delete().eq('id', conversationId);
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-950">
      {/* Header wie auf der Hauptseite */}
      <header className="bg-emerald-700 shadow-lg">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-white hover:bg-white/10 p-2 rounded-lg transition-colors">
              ← Zurück
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-white">Profil</h1>
              <p className="text-xs text-emerald-200">Account verwalten</p>
            </div>
          </div>
          <div className="flex gap-2">
            {!premium.isPremium && (
              <Link
                href="/pricing"
                className="bg-yellow-500 hover:bg-yellow-600 text-black px-3 py-1.5 rounded-full text-xs font-medium"
              >
                💎 Premium
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="text-white px-3 py-1.5 hover:bg-white/10 rounded-full text-sm"
            >
              🚪 Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {/* Account Section */}
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            👤 Account
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                placeholder="Dein Name"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">E-Mail Adresse</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2 text-gray-400 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">Die E-Mail kann nicht geändert werden.</p>
            </div>
          </div>
        </div>

        {/* Sprache Section - Hard Lock */}
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            🌍 Sprache (Hard Lock)
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ['de', '🇩🇪 Deutsch'],
              ['en', '🇬🇧 English'],
              ['ti', '🇪🇷 ትግርኛ'],
              ['am', '🇪🇹 አማርኛ'],
            ] as [Lang, string][]).map(([code, label]) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={`p-4 rounded-xl border transition-all ${
                  lang === code
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          
          <p className="text-xs text-gray-500 mt-4">
            ⚠️ Diese Sprache wird für ALLE Antworten erzwungen. Keine automatische Erkennung mehr.
          </p>
        </div>

        {/* Abo Status */}
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            💎 Abo Status
          </h2>
          
          {premium.isPremium ? (
            <div className="bg-emerald-900/30 border border-emerald-600 rounded-lg p-4">
              <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <span className="text-2xl">✅</span>
                <span className="font-semibold">Premium Aktiv</span>
              </div>
              <p className="text-gray-300 text-sm">
                • Unbegrenzte Chat-Nachrichten<br />
                • Unbegrenzte Dokumenten-Uploads<br />
                • Priorität Support
              </p>
            </div>
          ) : (
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-yellow-400 mb-2">
                <span className="text-2xl">💎</span>
                <span className="font-semibold">Kostenloser Account</span>
              </div>
              <p className="text-gray-300 text-sm mb-3">
                • Verbleibende Uploads heute: {premium.remainingUploads}<br />
                • 30 Minuten Chat-Zeit pro Tag
              </p>
              <Link
                href="/pricing"
                className="inline-block bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                🚀 Upgrade auf Premium (9,99€/Monat)
              </Link>
            </div>
          )}
        </div>

        {/* Chat-Verläufe */}
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            💬 Chat-Verläufe
          </h2>
          
          {stats.totalConversations === 0 ? (
            <p className="text-gray-400 text-center py-8">Noch keine Chats</p>
          ) : (
            <>
              <div className="text-sm text-gray-400 mb-4">
                {stats.totalConversations} Chats · {stats.totalMessages} Nachrichten
              </div>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className="bg-gray-700/30 rounded-lg p-3 hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 cursor-pointer" onClick={() => loadConversation(conv.id)}>
                        <h3 className="text-white font-medium">{conv.title}</h3>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(conv.updated_at).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteConversation(conv.id)}
                        className="text-red-400 hover:text-red-300 text-sm ml-2"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Speichern Button */}
        <div className="flex justify-end gap-3">
          <Link
            href="/"
            className="px-6 py-2 rounded-xl border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Abbrechen
          </Link>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Speichert...' : 'Änderungen speichern'}
          </button>
        </div>

        {/* Feedback Message */}
        {msg && (
          <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg ${
            msg.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          } text-white text-sm`}>
            {msg.text}
          </div>
        )}
      </main>
    </div>
  );
}