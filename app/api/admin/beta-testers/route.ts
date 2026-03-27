import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data: testers } = await supabase
    .from('trusted_users')
    .select('*')
    .eq('active', true);
  
  return NextResponse.json(testers || []);
}