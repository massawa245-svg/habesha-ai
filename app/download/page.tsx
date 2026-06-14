'use client';

import { useEffect, useState } from 'react';

export default function DownloadPage() {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) setPlatform('ios');
    else if (/Android/i.test(ua)) setPlatform('android');
  }, []);

  const IOS_URL = 'https://apps.apple.com/app/wolfcall/id6767867882';
  const ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.massawa.wolfcall';

  const handleDownload = () => {
    if (platform === 'ios') window.location.href = IOS_URL;
    else if (platform === 'android') window.location.href = ANDROID_URL;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0D1B2A] to-[#1a3a5c] flex flex-col items-center justify-center px-6 py-12">
      
      {/* Logo */}
      <div className="flex items-center gap-3 mb-12">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <path d="M8 28C8 28 6 20 10 14C14 8 22 6 28 8" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M10 22C10 22 12 16 16 13C20 10 26 11 28 14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.7"/>
            <circle cx="24" cy="22" r="6" fill="white"/>
            <path d="M22 22L24 24L27 20" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">WolfCall</h1>
          <p className="text-blue-300 text-sm">Günstig nach Hause telefonieren</p>
        </div>
      </div>

      {/* Hauptkarte */}
      <div className="w-full max-w-sm bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20 shadow-2xl text-center">
        
        {/* Headline */}
        <div className="mb-8">
          <p className="text-blue-300 text-sm font-medium uppercase tracking-widest mb-2">
            Jetzt kostenlos
          </p>
          <h2 className="text-white text-2xl font-bold leading-tight">
            Ruf deine Familie an.<br/>
            <span className="text-blue-400">Kein Internet nötig.</span>
          </h2>
        </div>

        {/* Smart Button — erkennt Gerät automatisch */}
        {platform !== 'other' && (
          <button
            onClick={handleDownload}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-bold text-lg mb-4 transition shadow-lg shadow-blue-600/40"
          >
            {platform === 'ios' ? '📱 Im App Store laden' : '🤖 Bei Google Play laden'}
          </button>
        )}

        {/* iOS Button */}
        <a
          href={IOS_URL}
          className={`flex items-center justify-center gap-3 w-full py-4 rounded-2xl mb-3 font-semibold transition border ${
            platform === 'ios'
              ? 'bg-white text-gray-900 border-white shadow-lg'
              : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
          }`}
        >
          {/* Apple Logo SVG */}
          <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
            <path d="M15.5 2c-.7.9-1.9 1.6-3 1.5-.2-1.1.4-2.3 1-3C14.2.5 15.4-.1 16.4 0c.2 1.1-.3 2.2-1 3zM11.8 4.2c1.3 0 3.6 1.3 3.6 1.3s1.8-.8 3.2-.4c1 .3 2.7 1.3 3.2 4-.3.1-3 1.7-3 5 0 4 3.5 5.4 3.5 5.4S21 21.7 19 22c-1 .1-2.4-.8-3.6-.8-1.4 0-2.6.8-3.6.8-1.8.1-4.5-3.5-5.3-6.9-.8-3.4.5-7 2.7-9.1.8-.7 1.7-1.8 2.6-1.8z"/>
          </svg>
          <span>App Store — iPhone & iPad</span>
        </a>

        {/* Android Button */}
        <a
          href={ANDROID_URL}
          className={`flex items-center justify-center gap-3 w-full py-4 rounded-2xl font-semibold transition border ${
            platform === 'android'
              ? 'bg-white text-gray-900 border-white shadow-lg'
              : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
          }`}
        >
          {/* Google Play SVG */}
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M1.5 1L12 11L1.5 21" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M1.5 1L18 8.5L12 11" stroke="#2196F3" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M1.5 21L18 13.5L12 11" stroke="#F44336" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M18 8.5L20.5 10C21.2 10.4 21.2 11.6 20.5 12L18 13.5" stroke="#FFC107" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span>Google Play — Android</span>
        </a>

        {/* Stats */}
        <div className="flex justify-around mt-8 pt-6 border-t border-white/10">
          <div className="text-center">
            <p className="text-white font-bold text-xl">0.25€</p>
            <p className="text-blue-300 text-xs mt-1">pro Minute</p>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <p className="text-white font-bold text-xl">100+</p>
            <p className="text-blue-300 text-xs mt-1">Länder</p>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <p className="text-white font-bold text-xl">Gratis</p>
            <p className="text-blue-300 text-xs mt-1">Download</p>
          </div>
        </div>
      </div>

      {/* Unten */}
      <p className="text-blue-300/50 text-xs mt-8 text-center">
        Massawa Software Technology · wolfcalling.com
      </p>
    </div>
  );
}
