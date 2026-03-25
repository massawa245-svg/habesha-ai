import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // Versuche Google Login zu simulieren (ohne Weiterleitung)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'http://localhost:3000/auth/callback' }
    });
    
    if (error) {
      return NextResponse.json({
        status: 'error',
        message: error.message,
        code: error.status,
        google_enabled: false,
        suggestion: 'Google Provider ist in Supabase NICHT aktiviert'
      });
    }
    
    return NextResponse.json({
      status: 'success',
      google_enabled: true,
      message: 'Google Provider ist aktiviert!',
      url: data?.url
    });
    
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      message: error.message,
      google_enabled: false
    });
  }
}