"""
HABESHA AI — Tigrinya Import v3 (Erweitert)
============================================
Neue Quellen zusätzlich zu XL-Sum:
- OPUS Tigrinya-Deutsch (Übersetzungspaare)
- OPUS Tigrinya-Englisch
- Tigrinya Wikipedia

AUSFÜHREN:
  python import_tigrinya_v3.py
"""

import time
import re
import urllib.request
import io
import pyarrow.parquet as pq
from supabase import create_client

# ============================================
# KONFIGURATION
# ============================================
SUPABASE_URL = "https://kkhrdxfdwjttplynzfqx.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtraHJkeGZkd2p0dHBseW56ZnF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDIxNDc0OSwiZXhwIjoyMDg5NzkwNzQ5fQ.6i_4ze4xb_kbVBfbVZvXsIhNaBdBmZ35l3Ix_fjMmAY"  # Service Role Key (nicht anon!)

MAX_PRO_QUELLE = 3000
MIN_LAENGE = 15

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ============================================
# HILFSFUNKTIONEN
# ============================================
def ist_tigrinya(text: str) -> bool:
    return len(re.findall(r'[\u1200-\u137F]', str(text))) > 3

def bereinige(text: str, max_len: int = 400) -> str:
    text = re.sub(r'<[^>]+>', '', str(text))
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:max_len]

def lade_parquet(url: str) -> dict | None:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        table = pq.read_table(io.BytesIO(data))
        return table.to_pydict()
    except Exception as e:
        print(f"   ⚠️ {e}")
        return None

# ============================================
# QUELLE 1: OPUS Tigrinya-Deutsch
# ============================================
def lade_opus_tigrinya_deutsch() -> list:
    print("\n📥 Lade OPUS Tigrinya-Deutsch...")
    eintraege = []

    urls = [
        "https://huggingface.co/datasets/Helsinki-NLP/opus-100/resolve/refs%2Fconvert%2Fparquet/ti-de/train/0000.parquet",
        "https://huggingface.co/datasets/opus100/resolve/refs%2Fconvert%2Fparquet/ti-de/train/0000.parquet",
        "https://huggingface.co/datasets/Helsinki-NLP/opus_paracrawl/resolve/refs%2Fconvert%2Fparquet/de-ti/train/0000.parquet",
    ]

    for url in urls:
        print(f"   Versuche: {url[:70]}...")
        df = lade_parquet(url)
        if not df:
            continue

        print(f"   ✅ Geladen! Spalten: {list(df.keys())}")
        cols = list(df.keys())
        n = len(df[cols[0]])
        print(f"   Einträge: {n}")

        # Übersetzungspaare verarbeiten
        for i in range(n):
            # Format kann variieren
            if 'translation' in cols:
                trans = df['translation'][i]
                if isinstance(trans, dict):
                    ti = str(trans.get('ti', '') or '')
                    de = str(trans.get('de', '') or '')
                else:
                    continue
            else:
                # Direkte Spalten
                ti_col = next((c for c in cols if c in ['ti', 'tigrinya']), None)
                de_col = next((c for c in cols if c in ['de', 'deutsch', 'german']), None)
                if not ti_col or not de_col:
                    break
                ti = str(df[ti_col][i] or '')
                de = str(df[de_col][i] or '')

            if not ti or not de:
                continue
            if not ist_tigrinya(ti):
                continue
            if len(ti) < MIN_LAENGE or len(de) < MIN_LAENGE:
                continue

            eintraege.append({
                "input_text": bereinige(de),      # Deutsch = Frage
                "response_text": bereinige(ti),   # Tigrinya = Antwort
                "quelle": "opus_ti_de"
            })

            if len(eintraege) >= MAX_PRO_QUELLE:
                break

        if eintraege:
            print(f"   ✅ {len(eintraege)} Paare gesammelt")
            break

    return eintraege

# ============================================
# QUELLE 2: OPUS Tigrinya-Englisch
# ============================================
def lade_opus_tigrinya_englisch() -> list:
    print("\n📥 Lade OPUS Tigrinya-Englisch...")
    eintraege = []

    urls = [
        "https://huggingface.co/datasets/Helsinki-NLP/opus-100/resolve/refs%2Fconvert%2Fparquet/en-ti/train/0000.parquet",
        "https://huggingface.co/datasets/Helsinki-NLP/opus-100/resolve/refs%2Fconvert%2Fparquet/ti-en/train/0000.parquet",
    ]

    for url in urls:
        print(f"   Versuche: {url[:70]}...")
        df = lade_parquet(url)
        if not df:
            continue

        print(f"   ✅ Geladen! Spalten: {list(df.keys())}")
        cols = list(df.keys())
        n = len(df[cols[0]])
        print(f"   Einträge: {n}")

        for i in range(n):
            if 'translation' in cols:
                trans = df['translation'][i]
                if isinstance(trans, dict):
                    ti = str(trans.get('ti', '') or '')
                    en = str(trans.get('en', '') or '')
                else:
                    continue
            else:
                ti_col = next((c for c in cols if c in ['ti', 'tigrinya']), None)
                en_col = next((c for c in cols if c in ['en', 'english']), None)
                if not ti_col or not en_col:
                    break
                ti = str(df[ti_col][i] or '')
                en = str(df[en_col][i] or '')

            if not ti or not en:
                continue
            if not ist_tigrinya(ti):
                continue
            if len(ti) < MIN_LAENGE or len(en) < MIN_LAENGE:
                continue

            eintraege.append({
                "input_text": bereinige(en),
                "response_text": bereinige(ti),
                "quelle": "opus_ti_en"
            })

            if len(eintraege) >= MAX_PRO_QUELLE:
                break

        if eintraege:
            print(f"   ✅ {len(eintraege)} Paare gesammelt")
            break

    return eintraege

# ============================================
# QUELLE 3: XL-Sum Test + Validation (noch nicht importiert!)
# ============================================
def lade_xlsum_rest() -> list:
    print("\n📥 Lade XL-Sum Tigrinya (Test + Validation)...")
    eintraege = []

    urls = [
        "https://huggingface.co/datasets/csebuetnlp/xlsum/resolve/refs%2Fconvert%2Fparquet/tigrinya/test/0000.parquet",
        "https://huggingface.co/datasets/csebuetnlp/xlsum/resolve/refs%2Fconvert%2Fparquet/tigrinya/validation/0000.parquet",
    ]

    for url in urls:
        print(f"   Versuche: {url[:70]}...")
        df = lade_parquet(url)
        if not df:
            continue

        cols = list(df.keys())
        n = len(df[cols[0]])
        print(f"   ✅ {n} Einträge")

        title_col = next((c for c in cols if 'title' in c.lower()), cols[0])
        summary_col = next((c for c in cols if 'summary' in c.lower()), None)

        for i in range(n):
            titel = str(df[title_col][i] or '')
            antwort = str(df[summary_col][i] or '') if summary_col else ''

            if not titel or not antwort:
                continue
            if not ist_tigrinya(titel) and not ist_tigrinya(antwort):
                continue
            if len(titel) < MIN_LAENGE or len(antwort) < MIN_LAENGE:
                continue

            eintraege.append({
                "input_text": bereinige(titel),
                "response_text": bereinige(antwort),
                "quelle": "xlsum_tigrinya_extra"
            })

    print(f"   ✅ {len(eintraege)} zusätzliche XL-Sum Einträge")
    return eintraege

# ============================================
# IN SUPABASE IMPORTIEREN
# ============================================
def importiere(eintraege: list, label: str = ""):
    if not eintraege:
        print(f"   ℹ️ Keine neuen Einträge für {label}")
        return 0

    # Duplikat-Check
    try:
        existing = supabase.from_("training_data").select("input_text").eq("language", "tigrinya").limit(10000).execute()
        existing_texts = {r["input_text"][:50] for r in (existing.data or [])}
    except:
        existing_texts = set()

    neu = [e for e in eintraege if e["input_text"][:50] not in existing_texts]
    print(f"   ✅ {len(neu)} neue Einträge (ohne Duplikate)")

    if not neu:
        return 0

    BATCH = 50
    erfolgreich = 0

    for i in range(0, len(neu), BATCH):
        batch = neu[i:i+BATCH]
        rows = [{
            "input_text": e["input_text"],
            "response_text": e["response_text"],
            "language": "tigrinya",
            "source": e["quelle"],
            "quality_score": 7 if "opus" in e["quelle"] else 6,
            "usage_count": 0,
            "status": "pending",
        } for e in batch]

        try:
            supabase.from_("training_data").insert(rows).execute()
            erfolgreich += len(rows)
            print(f"   📦 Batch {i//BATCH + 1}: {len(rows)} ✅")
        except Exception as e:
            print(f"   ❌ Batch Fehler: {e}")

        time.sleep(0.2)

    return erfolgreich

# ============================================
# MAIN
# ============================================
if __name__ == "__main__":
    print("=" * 50)
    print("HABESHA AI — Tigrinya Import v3")
    print("=" * 50)

    if SUPABASE_KEY == "DEIN_SUPABASE_SERVICE_ROLE_KEY":
        print("\n❌ Bitte SUPABASE_KEY eintragen!")
        exit(1)

    gesamt = 0

    # 1. OPUS Tigrinya-Deutsch
    eintraege_de = lade_opus_tigrinya_deutsch()
    if eintraege_de:
        print(f"\n➡️ {len(eintraege_de)} OPUS DE-TI Einträge gefunden")
        antwort = input("Importieren? (j/n): ")
        if antwort.lower() == 'j':
            gesamt += importiere(eintraege_de, "OPUS DE-TI")

    # 2. OPUS Tigrinya-Englisch
    eintraege_en = lade_opus_tigrinya_englisch()
    if eintraege_en:
        print(f"\n➡️ {len(eintraege_en)} OPUS EN-TI Einträge gefunden")
        antwort = input("Importieren? (j/n): ")
        if antwort.lower() == 'j':
            gesamt += importiere(eintraege_en, "OPUS EN-TI")

    # 3. XL-Sum Rest (Test + Validation)
    eintraege_rest = lade_xlsum_rest()
    if eintraege_rest:
        print(f"\n➡️ {len(eintraege_rest)} XL-Sum Extra Einträge gefunden")
        antwort = input("Importieren? (j/n): ")
        if antwort.lower() == 'j':
            gesamt += importiere(eintraege_rest, "XL-Sum Extra")

    print(f"\n🎉 GESAMT IMPORTIERT: {gesamt} neue Einträge!")
    print(f"\n💡 Alle freischalten:")
    print(f"   UPDATE training_data SET status='approved'")
    print(f"   WHERE language='tigrinya' AND quality_score >= 6;")
