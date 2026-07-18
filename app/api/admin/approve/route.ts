// app/api/admin/approve/route.ts
// Nimmt eine gepruefte/korrigierte Antwort, erstellt Embedding, speichert in training_data
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSupabaseAdmin } from '@/lib/auth';

// Nicht beim Build vorrendern/auswerten - braucht Runtime-Env-Vars
export const dynamic = 'force-dynamic';

const gemini = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const embeddingModel = gemini.getGenerativeModel({ model: 'gemini-embedding-001' });

// Embedding mit 768 Dimensionen (passt zur DB-Spalte)
async function getEmbedding(text: string): Promise<number[]> {
  const result = await embeddingModel.embedContent({
    content: { parts: [{ text }] },
    outputDimensionality: 768,
  } as any);
  return result.embedding.values;
}

export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const {
      chatHistoryId,   // id aus chat_history (bigint)
      question,        // die User-Frage (input_text)
      finalAnswer,     // die finale (ggf. korrigierte) Antwort
      language,        // 'tigrinya' | 'amharic' | ...
    } = await req.json();

    if (!question || !finalAnswer) {
      return NextResponse.json({ error: 'Frage und Antwort erforderlich' }, { status: 400 });
    }

    // 1. Embedding fuer die Frage erstellen
    let embedding: number[] | null = null;
    try {
      embedding = await getEmbedding(question);
    } catch (e) {
      console.error('Embedding-Fehler:', e);
      // Auch ohne Embedding speichern - kann spaeter nachgefuellt werden
    }

    // 2. In training_data speichern (als approved)
    const { error: insertError } = await supabaseAdmin
      .from('training_data')
      .insert({
        input_text: question,
        response_text: finalAnswer,
        language: language || 'tigrinya',
        source: 'admin_approved',
        quality_score: 10,          // von Mensch geprueft = hoechste Qualitaet
        status: 'approved',
        embedding: embedding,
        usage_count: 0,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Insert-Fehler:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 3. chat_history Eintrag als reviewed + approved markieren
    if (chatHistoryId) {
      await supabaseAdmin
        .from('chat_history')
        .update({
          reviewed: true,
          approved_for_training: true,
          corrected_answer: finalAnswer,
        })
        .eq('id', chatHistoryId);
    }

    return NextResponse.json({ success: true, hadEmbedding: !!embedding });

  } catch (error) {
    console.error('Approve-Fehler:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unbekannter Fehler' },
      { status: 500 }
    );
  }
}

// Loeschen / Ablehnen: markiert chat_history als reviewed, NICHT approved
export async function DELETE(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { chatHistoryId } = await req.json();
    if (!chatHistoryId) {
      return NextResponse.json({ error: 'ID erforderlich' }, { status: 400 });
    }

    await supabaseAdmin
      .from('chat_history')
      .update({ reviewed: true, approved_for_training: false })
      .eq('id', chatHistoryId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Fehler' },
      { status: 500 }
    );
  }
}