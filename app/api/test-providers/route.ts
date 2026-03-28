import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  
  // Test Supabase Connection
  const { data: testData, error: supabaseError } = await supabase
    .from('trusted_users')
    .select('count')
    .limit(1);
  
  // Test Groq (optional)
  let groqStatus = 'not tested';
  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
    });
    groqStatus = groqResponse.ok ? 'connected' : 'error';
  } catch {
    groqStatus = 'error';
  }
  
  // Test DeepSeek (optional)
  let deepseekStatus = 'not tested';
  try {
    const deepseekResponse = await fetch('https://api.deepseek.com/models', {
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
    });
    deepseekStatus = deepseekResponse.ok ? 'connected' : 'error';
  } catch {
    deepseekStatus = 'error';
  }
  
  return NextResponse.json({
    supabase: supabaseError ? 'error' : 'connected',
    groq: groqStatus,
    deepseek: deepseekStatus,
    timestamp: new Date().toISOString(),
  });
}