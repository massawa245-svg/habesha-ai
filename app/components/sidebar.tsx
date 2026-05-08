'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Lang = 'de' | 'ti' | 'am' | 'en';

interface SidebarProps {
  user: {
    id: string;
    email: string;
    full_name?: string;
  };
  profile: {
    preferred_language: Lang;
  };
  premium: {
    isPremium: boolean;
    remaining: number;
  };
  chatHistory: Array<{ id: string; title: string; created_at: string }>;
}

export default function Sidebar({ user, profile, premium, chatHistory }: SidebarProps) {
  const router = useRouter();
  const supabase = createClient();
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function updateLanguage(lang: Lang) {
    await supabase.auth.updateUser({
      data: { preferred_language: lang }
    });
    router.refresh();
  }

  const getLanguageLabel = (lang: Lang): string => {
    const labels: Record<Lang, string> = {
      de: '🇩🇪 Deutsch',
      en: '🇬🇧 English',
      ti: '🇪🇷 ትግርኛ',
      am: '🇪🇹 አማርኛ'
    };
    return labels[lang];
  };

  return (
    <div className="w-80 bg-gray-800 flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-white font-semibold text-lg">Meine Chats</h2>
      </div>

      {/* New Chat Button */}
      <div className="p-4">
        <button
          onClick={() => router.push('/')}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl transition-colors text-sm font-medium"
        >
          + Neuer Chat
        </button>
      </div>

      {/* Chat History List */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1">
        {chatHistory.length === 0 && (
          <p className="text-gray-500 text-xs text-center mt-4">Noch keine Chats</p>
        )}
        {chatHistory.map((conv) => (
          <div
            key={conv.id}
            className={`p-3 rounded-xl cursor-pointer hover:bg-gray-700/50 transition-all`}
            onClick={() => router.push(`/chat/${conv.id}`)}
          >
            <span className="text-sm font-medium text-white block truncate">
              {conv.title}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(conv.created_at).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>

      {/* PROFIL BEREICH - UNTEN */}
      <div className="border-t border-gray-700 mt-auto">
        <button
          onClick={() => setShowLanguageMenu(!showLanguageMenu)}
          className="w-full p-4 flex items-center gap-3 hover:bg-gray-700/50 transition-colors"
        >
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-full flex items-center justify-center text-white font-semibold">
            {user.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 text-left">
            <p className="text-white text-sm font-medium truncate">
              {user.full_name || user.email?.split('@')[0] || 'User'}
            </p>
            <p className="text-gray-400 text-xs truncate">{user.email}</p>
          </div>
          <span className="text-gray-400 text-xs">▼</span>
        </button>

        {showLanguageMenu && (
          <div className="px-3 pb-3 space-y-2">
            {/* Premium Status */}
            <div className="p-3 rounded-xl bg-gray-700/50">
              {premium.isPremium ? (
                <div className="flex items-center gap-2 text-emerald-400">
                  <span>💎</span>
                  <div>
                    <p className="text-sm font-medium">Premium Aktiv</p>
                    <p className="text-xs text-gray-400">Unbegrenzte Nutzung</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Verbleibend: {premium.remaining}/10</span>
                  </div>
                  <button
                    onClick={() => router.push('/pricing')}
                    className="w-full py-2 bg-gradient-to-r from-yellow-600 to-yellow-500 rounded-lg text-sm font-semibold"
                  >
                    💎 Premium Upgrade
                  </button>
                </div>
              )}
            </div>

            {/* Language Selection */}
            <div className="p-2">
              <p className="text-xs text-gray-400 mb-2 px-2">🌍 Sprache</p>
              {(['de', 'en', 'ti', 'am'] as Lang[]).map((code) => (
                <button
                  key={code}
                  onClick={() => updateLanguage(code)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                    profile.preferred_language === code 
                      ? 'bg-emerald-600 text-white' 
                      : 'hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  {getLanguageLabel(code)}
                  {profile.preferred_language === code && <span className="float-right">✓</span>}
                </button>
              ))}
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors text-sm"
            >
              <span>🚪</span> Abmelden
            </button>
          </div>
        )}
      </div>
    </div>
  );
}