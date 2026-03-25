'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function PremiumSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  
  // Nach 3 Sekunden zur Startseite weiterleiten
  setTimeout(() => {
    window.location.href = '/';
  }, 3000);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-white mb-2">Premium aktiviert!</h1>
        <p className="text-gray-400">Vielen Dank für deine Unterstützung.</p>
        <p className="text-gray-500 mt-4">Du wirst in 3 Sekunden weitergeleitet...</p>
      </div>
    </div>
  );
}

export default function PremiumSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Lade...</div>}>
      <PremiumSuccessContent />
    </Suspense>
  );
}