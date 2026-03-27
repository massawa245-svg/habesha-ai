'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  
  const supabase = createClient();

  // ============================================
  // LOGIN
  // ============================================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      setError(error.message);
    } else {
      window.location.href = '/';
    }
    setLoading(false);
  };

  // ============================================
  // REGISTRIERUNG
  // ============================================
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      setLoading(false);
      return;
    }
    
    if (password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen lang sein');
      setLoading(false);
      return;
    }
    
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          birth_date: birthDate,
          phone: phone,
        }
      }
    });
    
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    
    if (authData.user) {
      await supabase.from('users').upsert({
        id: authData.user.id,
        email: email,
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate,
        phone: phone,
        created_at: new Date()
      });
    }
    
    alert('✅ Registrierung erfolgreich! Bitte bestätige deine Email.');
    setIsLogin(true);
    setLoading(false);
  };

 // ============================================
  // 🔥 GOOGLE LOGIN (KORRIGIERT)
  // ============================================
  
const handleGoogleLogin = async () => {
  setLoading(true);
  setError('');
  
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`, // ← HIER ÄNDERN!
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    });
    
    if (error) {
      console.error('Google Login Fehler:', error);
      setError(error.message);
      setLoading(false);
    }
    // Bei Erfolg wird die Seite weitergeleitet – kein setLoading(false)!
  } catch (err) {
    console.error('Unerwarteter Fehler:', err);
    setError('Ein unerwarteter Fehler ist aufgetreten');
    setLoading(false);
  }
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
        
        {/* Google Login */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full bg-white text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mb-4"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Mit Google anmelden
        </button>
        
        <div className="text-center text-gray-500 text-sm mb-4">oder mit Email</div>
        
        {/* Login/Registrierung Form */}
        <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
          />
          
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
          />
          
          {!isLogin && (
            <input
              type="password"
              placeholder="Password bestätigen"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-3 bg-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          )}
          
          {!isLogin && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Vorname (optional)"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full p-3 bg-gray-700 rounded-lg text-white"
                />
                <input
                  type="text"
                  placeholder="Nachname (optional)"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full p-3 bg-gray-700 rounded-lg text-white"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  placeholder="Geburtsdatum"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full p-3 bg-gray-700 rounded-lg text-white"
                />
                <input
                  type="tel"
                  placeholder="Telefon (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-3 bg-gray-700 rounded-lg text-white"
                />
              </div>
            </>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Laden...' : isLogin ? 'Anmelden' : 'Registrieren'}
          </button>
        </form>
        
        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setError('');
          }}
          className="w-full text-center text-gray-400 text-sm mt-4 hover:text-white transition-colors"
        >
          {isLogin ? 'Email für Registrierung' : 'Bereits registriert? Anmelden'}
        </button>
        
        {!isLogin && (
          <p className="text-center text-gray-500 text-xs mt-4">
            * Pflichtfelder | Vorname, Nachname, Geburtsdatum, Telefon sind optional
          </p>
        )}
      </div>
    </div>
  );
}