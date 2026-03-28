import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  
  const { data: { session }, error } = await supabase.auth.getSession();
  
  const debug = {
    hasSession: !!session,
    userEmail: session?.user?.email || null,
    userId: session?.user?.id || null,
    error: error?.message || null,
    timestamp: new Date().toISOString(),
  };
  
  return NextResponse.json(debug);
}