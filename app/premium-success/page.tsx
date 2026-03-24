'use client';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function PremiumSuccess() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  
  useEffect(() => {
    // Hier könntest du die Session bestätigen
    setTimeout(() => {
      window.location.href = '/';
    }, 3000);
  }, []);
  
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