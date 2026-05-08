'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isOpen, setIsOpen] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

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

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow"
      >
        {isOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 h-full w-80 bg-gray-900 text-white flex flex-col
        transition-transform duration-300 z-40
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold">HABESHA AI</h1>
          <p className="text-xs text-gray-400">von Massawa Software</p>
        </div>

        {/* New Chat Button */}
        <button
          onClick={() => router.push('/')}
          className="mx-4 mt-4 p-3 bg-blue-600 rounded-lg hover:bg-blue-700 transition"
        >
          + Neuer Chat
        </button>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto mt-4 px-2 space-y-1">
          <p className="text-xs text-gray-400 px-2 mb-2">RECENT CHATS</p>
          {chatHistory.map((chat) => (
            <Link
              key={chat.id}
              href={`/chat/${chat.id}`}
              className={`
                block p-2 rounded-lg text-sm transition truncate
                ${pathname === `/chat/${chat.id}` 
                  ? 'bg-gray-800' 
                  : 'hover:bg-gray-800'
                }
              `}
            >
              {chat.title || 'Neues Gespräch'}
              <span className="text-xs text-gray-500 block">
                {new Date(chat.created_at).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>

        {/* ============================================ */}
        {/* PROFIL SECTION (UNTEN) - Wie ChatGPT/DeepSeek */}
        {/* ============================================ */}
        <div className="border-t border-gray-700 p-4 space-y-3">
          {/* User Email & Name */}
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition"
          >
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              👤
            </div>
            <div className="flex-1 text-left truncate">
              <p className="text-sm font-medium truncate">
                {user.full_name || user.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
            <span className="text-gray-400">▼</span>
          </button>

          {/* Dropdown Menu */}
          {showProfileMenu && (
            <div className="space-y-2 pl-3 border-l-2 border-gray-700">
              {/* Abo Status */}
              <div className="p-2 rounded-lg bg-gray-800">
                {premium.isPremium ? (
                  <div className="flex items-center gap-2 text-green-400">
                    <span>💎</span>
                    <span className="text-sm">Premium Aktiv</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>📊 Free</span>
                      <span className="text-yellow-400">{premium.remaining}/10 heute</span>
                    </div>
                    <button
                      onClick={() => router.push('/pricing')}
                      className="w-full p-2 bg-gradient-to-r from-yellow-600 to-yellow-500 rounded-lg text-sm font-semibold"
                    >
                      💎 Upgrade auf Premium
                    </button>
                  </div>
                )}
              </div>

              {/* Sprache (Hard Lock) */}
              <div className="p-2">
                <p className="text-xs text-gray-400 mb-2">🌍 Sprache</p>
                <div className="space-y-1">
                  {([
                    ['de', '🇩🇪 Deutsch'],
                    ['en', '🇬🇧 English'],
                    ['ti', '🇪🇷 ትግርኛ'],
                    ['am', '🇪🇹 አማርኛ'],
                  ] as [Lang, string][]).map(([code, label]) => (
                    <button
                      key={code}
                      onClick={() => updateLanguage(code)}
                      className={`
                        w-full text-left p-2 rounded-lg text-sm transition
                        ${profile.preferred_language === code 
                          ? 'bg-blue-600' 
                          : 'hover:bg-gray-800'
                        }
                      `}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 p-2 rounded-lg text-red-400 hover:bg-gray-800 transition"
              >
                <span>🚪</span>
                <span>Abmelden</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Overlay für Mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}