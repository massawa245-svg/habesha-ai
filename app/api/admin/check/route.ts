import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ isAdmin: false });
  }
  
  const { data: trusted } = await supabase
    .from('trusted_users')
    .select('*')
    .eq('email', user.email)
    .eq('role', 'admin')
    .maybeSingle();
  
  return NextResponse.json({ isAdmin: !!trusted });
}