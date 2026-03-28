import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  
  const { data: feedback } = await supabase
    .from('user_feedback_temp')
    .select('*')
    .order('created_at', { ascending: false });

  return NextResponse.json(feedback || []);
}