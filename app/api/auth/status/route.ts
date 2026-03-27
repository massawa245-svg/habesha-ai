import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // Wichtig: Session aus dem Cookie lesen
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