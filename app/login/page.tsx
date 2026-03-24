'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) setError(error.message);
    else window.location.href = '/';
    
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    const { error } = await supabase.auth.signUp({ email, password });
    
    if (error) setError(error.message);
    else alert('✅ Registrierung erfolgreich! Bitte bestätige deine Email.');
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="bg-gray-800 p-8 rounded-2xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-white text-center mb-6">Habesha AI</h1>
        
        {error && (
          <div className="bg-red-600/20 border border-red-600 text-red-400 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}
        
        {/* Google Login Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full bg-white text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mb-6"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Mit Google anmelden
        </button>
        
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-800 text-gray-400">oder mit Email</span>
          </div>
        </div>
        
        {/* Email/Passwort Login */}
        <form onSubmit={handleEmailLogin} className="space-y-4 mb-4">
          <input
            type="email"
            name="email"
            placeholder="Email"
            className="w-full p-3 bg-gray-700 rounded-lg text-white"
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Passwort"
            className="w-full p-3 bg-gray-700 rounded-lg text-white"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            Anmelden
          </button>
        </form>
        
        {/* Registrierung */}
        <form onSubmit={handleSignUp} className="space-y-4">
          <input
            type="email"
            name="email"
            placeholder="Email für Registrierung"
            className="w-full p-3 bg-gray-700 rounded-lg text-white"
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Passwort"
            className="w-full p-3 bg-gray-700 rounded-lg text-white"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-600 py-3 rounded-lg font-semibold hover:bg-gray-500 disabled:opacity-50"
          >
            Neues Konto erstellen
          </button>
        </form>
      </div>
    </div>
  );
}