// components/LanguageFlag.tsx
'use client';

export type Lang = 'de' | 'ti' | 'am' | 'en';

const flags: Record<Lang, string> = {
  de: '🇩🇪',
  ti: '🇪🇷',
  am: '🇪🇹',
  en: '🇺🇸',
};

const langNames: Record<Lang, string> = {
  de: 'Deutsch',
  ti: 'ትግርኛ',
  am: 'አማርኛ',
  en: 'English',
};

interface LanguageFlagProps {
  lang: Lang;
  showLabel?: boolean;
}

export function LanguageFlag({ lang, showLabel = false }: LanguageFlagProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xl">{flags[lang]}</span>
      {showLabel && (
        <span className="text-xs text-gray-400">{langNames[lang]}</span>
      )}
    </div>
  );
}