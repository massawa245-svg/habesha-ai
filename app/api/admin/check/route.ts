import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ isAdmin: false });
    }
    
    const { data: trusted, error } = await supabase
      .from('trusted_users')
      .select('*')
      .eq('user_id', user.id) // ✅ FIX
      .eq('role', 'admin')
      .maybeSingle();

    console.log('USER:', user);
    console.log('TRUSTED:', trusted);
    console.log('ERROR:', error);
    
    return NextResponse.json({ isAdmin: !!trusted });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ isAdmin: false });
  }
}