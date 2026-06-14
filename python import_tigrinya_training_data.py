"""
HABESHA AI — Tigrinya Trainingsdaten Import
============================================
Lädt 1000–5000 Tigrinya-Einträge von HuggingFace
und importiert sie in die Supabase training_data Tabelle.

VORBEREITUNG (einmalig):
  pip install datasets supabase

AUSFÜHREN:
  python import_tigrinya_training_data.py
"""

import os
import json
import time
import re
from datasets import load_dataset
from supabase import create_client

# ============================================
# KONFIGURATION — hier anpassen!
# ============================================
SUPABASE_URL = "https://kkhrdxfdwjttplynzfqx.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtraHJkeGZkd2p0dHBseW56ZnF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDIxNDc0OSwiZXhwIjoyMDg5NzkwNzQ5fQ.6i_4ze4xb_kbVBfbVZvXsIhNaBdBmZ35l3Ix_fjMmAY"  # Service Role Key (nicht anon!)

MAX_EINTRAEGE = 2000   # Wie viele Einträge importieren? (500–5000)
MIN_TEXT_LAENGE = 30   # Mindestlänge Tigrinya-Text (Zeichen)
MAX_TEXT_LAENGE = 400  # Maximallänge für training_data

# ============================================
# SUPABASE CLIENT
# ============================================
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ============================================
# HILFSFUNKTIONEN
# ============================================
def ist_tigrinya(text: str) -> bool:
    """Prüft ob Text wirklich Tigrinya/Ethiopic Schrift enthält."""
    ethiopic = len(re.findall(r'[\u1200-\u137F]', text))
    return ethiopic > 5

def bereinige_text(text: str) -> str:
    """Text bereinigen — unnötige Leerzeichen, HTML etc. entfernen."""
    text = re.sub(r'<[^>]+>', '', text)       # HTML entfernen
    text = re.sub(r'\s+', ' ', text).strip()  # Mehrfach-Leerzeichen
    text = text[:MAX_TEXT_LAENGE]             # Kürzen
    return text

def erstelle_frage_antwort(eintrag: dict, quelle: str) -> tuple[str, str] | None:
    """
    Aus verschiedenen Dataset-Formaten Frage+Antwort extrahieren.
    Gibt (frage, antwort) zurück oder None wenn unbrauchbar.
    """
    if quelle == "xlsum":
        # XL-Sum: title + text (News-Artikel)
        titel = eintrag.get("title", "").strip()
        zusammenfassung = eintrag.get("summary", "").strip()
        text = eintrag.get("text", "").strip()

        if not titel or not zusammenfassung:
            return None
        if not ist_tigrinya(titel) and not ist_tigrinya(zusammenfassung):
            return None

        frage = bereinige_text(titel)
        antwort = bereinige_text(zusammenfassung or text[:300])
        return frage, antwort

    elif quelle == "squad":
        # Tigrinya-SQuAD: question + answers
        frage = eintrag.get("question", "").strip()
        antworten = eintrag.get("answers", {})
        if isinstance(antworten, dict):
            texte = antworten.get("text", [])
        else:
            texte = []

        if not frage or not texte:
            return None
        if not ist_tigrinya(frage):
            return None

        antwort = bereinige_text(texte[0])
        return frage, antwort

    elif quelle == "masakhane":
        # Masakhane MT: Übersetzungspaare (de/en → ti)
        ti_text = eintrag.get("ti", "").strip()
        de_text = eintrag.get("de", eintrag.get("en", "")).strip()

        if not ti_text or not de_text:
            return None
        if not ist_tigrinya(ti_text):
            return None

        frage = bereinige_text(de_text)
        antwort = bereinige_text(ti_text)
        return frage, antwort

    return None

# ============================================
# DATENSÄTZE LADEN
# ============================================
def lade_datensaetze() -> list[dict]:
    """Alle verfügbaren Tigrinya-Datensätze laden und kombinieren."""
    alle_eintraege = []

    # DATENSATZ 1: XL-Sum Tigrinya (News-Zusammenfassungen)
    print("\n📥 Lade XL-Sum Tigrinya...")
    try:
        ds = load_dataset("csebuetnlp/xlsum", "tigrinya", split="train")
        print(f"   ✅ {len(ds)} Einträge gefunden")
        for eintrag in ds:
            result = erstelle_frage_antwort(eintrag, "xlsum")
            if result:
                frage, antwort = result
                if len(frage) >= MIN_TEXT_LAENGE and len(antwort) >= MIN_TEXT_LAENGE:
                    alle_eintraege.append({
                        "input_text": frage,
                        "response_text": antwort,
                        "quelle": "xlsum_tigrinya"
                    })
            if len(alle_eintraege) >= MAX_EINTRAEGE:
                break
    except Exception as e:
        print(f"   ⚠️ XL-Sum nicht verfügbar: {e}")

    # DATENSATZ 2: Tigrinya-SQuAD (Frage-Antwort)
    if len(alle_eintraege) < MAX_EINTRAEGE:
        print("\n📥 Lade Tigrinya-SQuAD...")
        try:
            ds2 = load_dataset("fgaim/tigrinya-squad", split="train")
            print(f"   ✅ {len(ds2)} Einträge gefunden")
            for eintrag in ds2:
                result = erstelle_frage_antwort(eintrag, "squad")
                if result:
                    frage, antwort = result
                    if len(frage) >= MIN_TEXT_LAENGE and len(antwort) >= 5:
                        alle_eintraege.append({
                            "input_text": frage,
                            "response_text": antwort,
                            "quelle": "tigrinya_squad"
                        })
                if len(alle_eintraege) >= MAX_EINTRAEGE:
                    break
        except Exception as e:
            print(f"   ⚠️ Tigrinya-SQuAD nicht verfügbar: {e}")

    # DATENSATZ 3: Masakhane MAFAND (Übersetzungen DE/EN → Tigrinya)
    if len(alle_eintraege) < MAX_EINTRAEGE:
        print("\n📥 Lade Masakhane MAFAND (Tigrinya)...")
        try:
            # Versuche verschiedene Konfigurationen
            for config in ["en-ti", "ti-en"]:
                try:
                    ds3 = load_dataset("masakhane/mafand-mt", config, split="train")
                    print(f"   ✅ {len(ds3)} Einträge ({config})")
                    for eintrag in ds3:
                        trans = eintrag.get("translation", eintrag)
                        result = erstelle_frage_antwort(trans, "masakhane")
                        if result:
                            frage, antwort = result
                            if len(frage) >= 10 and len(antwort) >= MIN_TEXT_LAENGE:
                                alle_eintraege.append({
                                    "input_text": frage,
                                    "response_text": antwort,
                                    "quelle": "masakhane_mafand"
                                })
                    break
                except Exception:
                    continue
        except Exception as e:
            print(f"   ⚠️ Masakhane nicht verfügbar: {e}")

    print(f"\n📊 Gesamt gesammelt: {len(alle_eintraege)} Einträge")
    return alle_eintraege[:MAX_EINTRAEGE]

# ============================================
# IN SUPABASE IMPORTIEREN
# ============================================
def importiere_in_supabase(eintraege: list[dict]):
    """Einträge in batches in training_data importieren."""

    if not eintraege:
        print("❌ Keine Einträge zum Importieren!")
        return

    print(f"\n🚀 Importiere {len(eintraege)} Einträge in Supabase...")

    # Duplikat-Check: bereits vorhandene input_texts laden
    print("   🔍 Prüfe auf Duplikate...")
    try:
        existing = supabase.from_("training_data")\
            .select("input_text")\
            .eq("language", "tigrinya")\
            .limit(5000)\
            .execute()
        existing_texts = {r["input_text"][:50] for r in (existing.data or [])}
        print(f"   ℹ️ {len(existing_texts)} bereits vorhanden")
    except Exception as e:
        print(f"   ⚠️ Duplikat-Check fehlgeschlagen: {e}")
        existing_texts = set()

    # Neue Einträge filtern
    neu = [e for e in eintraege if e["input_text"][:50] not in existing_texts]
    print(f"   ✅ {len(neu)} neue Einträge (ohne Duplikate)")

    if not neu:
        print("ℹ️ Alle Einträge bereits vorhanden!")
        return

    # In 50er-Batches importieren
    BATCH = 50
    erfolgreich = 0
    fehler = 0

    for i in range(0, len(neu), BATCH):
        batch = neu[i:i+BATCH]

        rows = []
        for e in batch:
            rows.append({
                "input_text": e["input_text"],
                "response_text": e["response_text"],
                "language": "tigrinya",
                "source": e["quelle"],
                "quality_score": 6,      # Neutral — noch nicht manuell geprüft
                "usage_count": 0,
                "status": "pending",     # Wird nicht direkt genutzt bis geprüft
            })

        try:
            supabase.from_("training_data").insert(rows).execute()
            erfolgreich += len(rows)
            print(f"   📦 Batch {i//BATCH + 1}: {len(rows)} Einträge ✅")
        except Exception as e:
            fehler += len(rows)
            print(f"   ❌ Batch {i//BATCH + 1} Fehler: {e}")

        time.sleep(0.3)  # Rate-Limit respektieren

    print(f"\n✅ FERTIG!")
    print(f"   Erfolgreich: {erfolgreich}")
    print(f"   Fehler:      {fehler}")
    print(f"\n💡 Nächster Schritt: In Supabase unter 'training_data'")
    print(f"   status='pending' Einträge prüfen und auf 'approved' setzen.")

# ============================================
# STATISTIK AUSGEBEN
# ============================================
def zeige_statistik(eintraege: list[dict]):
    from collections import Counter
    quellen = Counter(e["quelle"] for e in eintraege)
    print("\n📊 STATISTIK:")
    print(f"   Gesamt:  {len(eintraege)}")
    for q, n in quellen.items():
        print(f"   {q}: {n}")
    laengen = [len(e["input_text"]) for e in eintraege]
    print(f"   Ø Länge input:  {sum(laengen)//len(laengen)} Zeichen")
    print("\n🔍 BEISPIELE:")
    for e in eintraege[:3]:
        print(f"   Q: {e['input_text'][:80]}...")
        print(f"   A: {e['response_text'][:80]}...")
        print()

# ============================================
# MAIN
# ============================================
if __name__ == "__main__":
    print("=" * 50)
    print("HABESHA AI — Tigrinya Daten Import")
    print("=" * 50)

    if SUPABASE_KEY == "DEIN_SUPABASE_SERVICE_ROLE_KEY":
        print("\n❌ Bitte SUPABASE_KEY in der Datei eintragen!")
        print("   Supabase → Project Settings → API → service_role key")
        exit(1)

    # 1. Daten laden
    eintraege = lade_datensaetze()

    if not eintraege:
        print("\n❌ Keine Daten geladen. Prüfe deine Internetverbindung.")
        exit(1)

    # 2. Statistik
    zeige_statistik(eintraege)

    # 3. Bestätigung
    antwort = input(f"\n➡️ {len(eintraege)} Einträge in Supabase importieren? (j/n): ")
    if antwort.lower() != "j":
        print("Abgebrochen.")
        exit(0)

    # 4. Importieren
    importiere_in_supabase(eintraege)
