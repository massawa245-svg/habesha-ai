// app/admin/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// Definiere die Typen für die Daten
type Feedback = {
  id: string;
  question: string;
  ai_response: string;
  user_feedback: string;
  corrected_response: string | null;
  language: string;
  user_id: string | null;
  session_id: string | null;
  created_at: string;
};

type TrustedUser = {
  id: string;
  email: string;
  role: string;
  active: boolean;
  created_at: string;
};

export default function AdminDashboard() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [trustedUsers, setTrustedUsers] = useState<TrustedUser[]>([]);
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    loadTempFeedback();
    loadTrustedUsers();
  }, []);

  async function loadTempFeedback() {
    const { data } = await supabase
      .from('user_feedback_temp')
      .select('*')
      .order('created_at', { ascending: false });
    setFeedbacks(data || []);
  }

  async function loadTrustedUsers() {
    const { data } = await supabase
      .from('trusted_users')
      .select('*')
      .eq('active', true);
    setTrustedUsers(data || []);
  }

  async function approveFeedback(id: string) {
    await supabase.rpc('approve_feedback', { feedback_id: id });
    loadTempFeedback();
    alert('✅ Feedback freigegeben und ins Training übernommen!');
  }

  async function addTester() {
    if (!newEmail) return;
    await supabase.rpc('add_beta_tester', { tester_email: newEmail });
    setNewEmail('');
    loadTrustedUsers();
    alert('✅ Beta-Tester hinzugefügt!');
  }

  async function removeTester(email: string) {
    await supabase.rpc('remove_beta_tester', { tester_email: email });
    loadTrustedUsers();
    alert('✅ Beta-Tester entfernt');
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">🇪🇷 Admin Dashboard</h1>
      
      {/* Beta-Tester verwalten */}
      <div className="bg-gray-800 p-6 rounded-xl mb-8">
        <h2 className="text-xl font-bold mb-4">👥 Beta-Tester verwalten</h2>
        
        <div className="flex gap-2 mb-4">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email eingeben..."
            className="flex-1 bg-gray-700 p-2 rounded text-white"
          />
          <button
            onClick={addTester}
            className="bg-emerald-600 px-4 py-2 rounded hover:bg-emerald-700"
          >
            Hinzufügen
          </button>
        </div>
        
        <div className="space-y-2">
          {trustedUsers.map((user) => (
            <div key={user.id} className="flex justify-between items-center bg-gray-700 p-2 rounded">
              <span>{user.email} ({user.role})</span>
              <button
                onClick={() => removeTester(user.email)}
                className="text-red-400 hover:text-red-300"
              >
                Entfernen
              </button>
            </div>
          ))}
        </div>
      </div>
      
      {/* Ungeprüftes Feedback */}
      <div className="bg-gray-800 p-6 rounded-xl">
        <h2 className="text-xl font-bold mb-4">📝 Ungeprüftes Feedback ({feedbacks.length})</h2>
        
        <div className="space-y-4">
          {feedbacks.map((fb) => (
            <div key={fb.id} className="bg-gray-700 p-4 rounded border border-gray-600">
              <p className="text-sm text-gray-400">
                {new Date(fb.created_at).toLocaleString()}
              </p>
              <p className="mt-2"><span className="text-emerald-400">Frage:</span> {fb.question}</p>
              <p><span className="text-blue-400">KI:</span> {fb.ai_response}</p>
              {fb.corrected_response && (
                <p><span className="text-yellow-400">Korrektur:</span> {fb.corrected_response}</p>
              )}
              <p><span className="text-purple-400">Bewertung:</span> {fb.user_feedback}</p>
              
              <button
                onClick={() => approveFeedback(fb.id)}
                className="mt-3 bg-emerald-600 px-4 py-2 rounded hover:bg-emerald-700"
              >
                ✅ Freigeben & ins Training übernehmen
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}