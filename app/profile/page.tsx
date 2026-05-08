import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import ProfileClient from './profile-client';

export default async function ProfilePage() {
  const supabase = await createClient();
  
  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Profile laden
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, preferred_language')
    .eq('id', user.id)
    .single();

  // Premium Status
  const { data: trusted } = await supabase
    .from('trusted_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  
  const isPremium = trusted?.role === 'premium' || trusted?.role === 'admin';
  
  // Chat-Verläufe laden
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  // Nutzungsstatistiken
  const today = new Date().toISOString().split('T')[0];
  const { count: todayUploads } = await supabase
    .from('document_analyses')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', today);

  const { count: totalChats } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  return (
    <ProfileClient
      user={{
        id: user.id,
        email: user.email!,
      }}
      profile={{
        full_name: profile?.full_name || '',
        preferred_language: (profile?.preferred_language as 'de'|'en'|'ti'|'am') || 'de',
      }}
      premium={{
        isPremium,
        remainingUploads: isPremium ? 'unbegrenzt' : (8 - (todayUploads || 0)),
      }}
      stats={{
        totalConversations: conversations?.length || 0,
        totalMessages: totalChats || 0,
      }}
      conversations={conversations || []}
    />
  );
}