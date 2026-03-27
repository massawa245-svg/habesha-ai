import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data: feedback } = await supabase
    .from('user_feedback_temp')
    .select('*')
    .order('created_at', { ascending: false });
  
  return NextResponse.json(feedback || []);
}