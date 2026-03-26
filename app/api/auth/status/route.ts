import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ user: null });
  }
  
  return NextResponse.json({ 
    user: {
      email: user.email,
      id: user.id
    }
  });
}