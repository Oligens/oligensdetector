import { Pool } from '@neondatabase/serverless';

type Req = { method?: string; query?: Record<string, string> };
type Res = { status: (n: number) => Res; json: (v: unknown) => void };

function send(res: Res, status: number, body: unknown) { res.status(status).json(body); }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

  const databaseUrl = process.env.DATABASE_URL;
  const limit = req.query?.limit ? parseInt(req.query.limit, 10) : 100;
  
  if (!databaseUrl) {
    return send(res, 200, { 
      analyses: [], 
      message: "DATABASE_URL non configurée - Ajoutez votre URL Neon dans les variables d'environnement Vercel" 
    });
  }

  try {
    const pool = new Pool({ connectionString: databaseUrl });
    
    // Vérifier si les tables existent
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'analyses'
      ) as exists;
    `);

    if (!tableCheck.rows[0].exists) {
      await pool.end();
      return send(res, 200, { 
        analyses: [], 
        message: "Base de données connectée mais tables non initialisées" 
      });
    }

    // Récupérer les analyses
    const result = await pool.query(`
      SELECT 
        id,
        document_id,
        document_name,
        score,
        detected,
        analysis_type,
        ai_feedback,
        created_at
      FROM analyses 
      ORDER BY created_at DESC 
      LIMIT $1
    `, [limit]);

    await pool.end();

    const analyses = result.rows.map(row => ({
      id: row.id,
      documentId: row.document_id,
      documentName: row.document_name,
      score: row.score,
      detected: row.detected,
      analysisType: row.analysis_type,
      aiFeedback: row.ai_feedback,
      createdAt: row.created_at
    }));

    return send(res, 200, { analyses, message: "Analyses récupérées avec succès" });
  } catch (error) {
    console.error('Erreur analyses:', error);
    return send(res, 200, { 
      analyses: [], 
      message: `Erreur de connexion: ${error instanceof Error ? error.message : 'Inconnue'}` 
    });
  }
}
