import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  
  const { data: testers } = await supabase
    .from('trusted_users')
    .select('*')
    .eq('active', true);

  return NextResponse.json(testers || []);
}