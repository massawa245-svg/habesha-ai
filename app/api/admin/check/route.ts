import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
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
  } catch (error) {
    return NextResponse.json({ isAdmin: false });
  }
}