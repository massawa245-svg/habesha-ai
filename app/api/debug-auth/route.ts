import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const debug = {
    // 1. Supabase Config
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKeyExists: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    
    // 2. Auth Status
    session: null as any,
    user: null as any,
    
    // 3. Providers (versuche zu erkennen)
    providers: [] as string[],
    
    // 4. Fehler
    errors: [] as string[],
    warnings: [] as string[]
  };
  
  // Session prüfen
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) debug.errors.push(`Session Fehler: ${error.message}`);
    debug.session = data?.session ? 'vorhanden' : 'nicht vorhanden';
  } catch (e: any) {
    debug.errors.push(`Session Exception: ${e.message}`);
  }
  
  // User prüfen
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) debug.errors.push(`User Fehler: ${error.message}`);
    debug.user = data?.user?.email || 'nicht eingeloggt';
  } catch (e: any) {
    debug.errors.push(`User Exception: ${e.message}`);
  }
  
  // Versuche Google Login zu simulieren (ohne Weiterleitung)
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'http://localhost:3000/auth/callback' }
    });
    
    if (error) {
      debug.errors.push(`Google OAuth Fehler: ${error.message}`);
      debug.warnings.push(`Google Provider scheint NICHT aktiviert zu sein`);
    } else {
      debug.providers.push('google');
      debug.warnings.push(`Google Provider IST aktiviert (URL wird generiert)`);
    }
  } catch (e: any) {
    debug.errors.push(`Google Exception: ${e.message}`);
  }
  
  // Versuche Magic Link (Email) – das sollte immer funktionieren
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: 'test@example.com'
    });
    
    if (error) {
      debug.errors.push(`Magic Link Fehler: ${error.message}`);
    } else {
      debug.providers.push('email');
    }
  } catch (e: any) {
    debug.errors.push(`Magic Link Exception: ${e.message}`);
  }
  
  return NextResponse.json(debug);
}