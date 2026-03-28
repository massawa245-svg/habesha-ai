import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  
  console.log('🔵 AUTH CALLBACK ROUTE:', { code: !!code });
  
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error('🔴 ERROR:', error);
      return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin));
    }
    
    console.log('🔵 SUCCESS: Session ausgetauscht');
  }
  
  console.log('🔵 REDIRECT to /');
  return NextResponse.redirect(new URL('/', requestUrl.origin));
}