import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // Prüfe ob Google Provider aktiviert ist
    const { data: { providers } } = await supabase.auth.getProviders();
    
    // Prüfe aktuelle Session
    const { data: { session } } = await supabase.auth.getSession();
    
    // Prüfe User
    const { data: { user } } = await supabase.auth.getUser();
    
    return NextResponse.json({
      status: 'ok',
      providers: providers || [],
      isAuthenticated: !!user,
      hasSession: !!session,
      userEmail: user?.email || null,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      googleEnabled: providers?.includes('google') || false,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}