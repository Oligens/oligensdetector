import { Pool } from '@neondatabase/serverless';

type Req = { method?: string; body?: unknown };
type Res = { status: (n: number) => Res; json: (v: unknown) => void };

function send(res: Res, status: number, body: unknown) { res.status(status).json(body); }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  const databaseUrl = process.env.DATABASE_URL;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  
  // Corps de la requête
  const body = req.body as { text?: string; documentId?: string } | undefined;

  if (!body?.text) {
    return send(res, 400, { 
      detected: false, 
      score: 0, 
      message: "Texte manquant dans la requête" 
    });
  }

  // Si pas de clé API, retourner une réponse simulée
  if (!geminiApiKey) {
    return send(res, 200, { 
      detected: false, 
      score: 0, 
      message: "GEMINI_API_KEY non configurée - Détection simulée" 
    });
  }

  try {
    // Appel à l'API Gemini pour la détection
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_DETECTOR_MODEL || 'gemini-2.0-flash-exp'}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Analyse ce texte et détecte s'il a été généré par une IA. Retourne UNIQUEMENT un JSON avec {"detected": boolean, "score": number (0-100), "reasoning": string}. Texte à analyser: ${body.text.substring(0, 500)}`
            }]
          }]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Erreur API Gemini: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // Parser la réponse JSON de Gemini
    let result;
    try {
      // Extraire le JSON de la réponse (peut contenir du texte supplémentaire)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { detected: false, score: 0 };
    } catch {
      result = { detected: false, score: 0, reasoning: "Erreur de parsing de la réponse IA" };
    }

    // Sauvegarder dans la base de données si disponible
    if (databaseUrl && body.documentId) {
      try {
        const pool = new Pool({ connectionString: databaseUrl });
        await pool.query(
          `INSERT INTO analyses (document_id, score, detected, analysis_type, ai_feedback, created_at)
           VALUES ($1, $2, $3, 'ai_detection', $4, NOW())
           ON CONFLICT (document_id) DO UPDATE SET score = $2, detected = $3, ai_feedback = $4`,
          [body.documentId, result.score, result.detected, result.reasoning || '']
        );
        await pool.end();
      } catch (dbError) {
        console.error('Erreur sauvegarde DB:', dbError);
      }
    }

    return send(res, 200, {
      detected: result.detected,
      score: result.score,
      reasoning: result.reasoning,
      message: "Détection effectuée avec succès"
    });
  } catch (error) {
    console.error('Erreur detect:', error);
    return send(res, 200, {
      detected: false,
      score: 0,
      message: `Erreur de détection: ${error instanceof Error ? error.message : 'Inconnue'}`
    });
  }
}
