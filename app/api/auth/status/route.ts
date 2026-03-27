import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('Auth error:', error);
      return NextResponse.json({ user: null });
    }
    
    if (!user) {
      return NextResponse.json({ user: null });
    }
    
    return NextResponse.json({ 
      user: {
        email: user.email,
        id: user.id
      }
    });
  } catch (error) {
    console.error('API Fehler:', error);
    return NextResponse.json({ user: null });
  }
}