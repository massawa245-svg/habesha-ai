import { createClient } from '@/lib/supabase/server';
import ChatClient from './chat-client';

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('preferred_language')
    .eq('id', user.id)
    .single();

  return (
    <ChatClient 
      userId={user.id}
      userLanguage={profile?.preferred_language || 'de'}
    />
  );
}