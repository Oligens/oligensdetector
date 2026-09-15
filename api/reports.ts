import { Pool } from '@neondatabase/serverless';

type Req = { method?: string; query?: Record<string, string> };
type Res = { status: (n: number) => Res; json: (v: unknown) => void };

function send(res: Res, status: number, body: unknown) { res.status(status).json(body); }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    return send(res, 200, { 
      reports: [], 
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
        reports: [], 
        message: "Base de données connectée mais tables non initialisées" 
      });
    }

    // Récupérer les rapports (analyses avec détails)
    const result = await pool.query(`
      SELECT 
        id,
        document_id,
        document_name,
        score,
        detected,
        analysis_type,
        created_at
      FROM analyses 
      ORDER BY created_at DESC 
      LIMIT 50
    `);

    await pool.end();

    const reports = result.rows.map(row => ({
      id: row.id,
      documentId: row.document_id,
      documentName: row.document_name,
      score: row.score,
      detected: row.detected,
      analysisType: row.analysis_type,
      createdAt: row.created_at
    }));

    return send(res, 200, { reports, message: "Rapports récupérés avec succès" });
  } catch (error) {
    console.error('Erreur reports:', error);
    return send(res, 200, { 
      reports: [], 
      message: `Erreur de connexion: ${error instanceof Error ? error.message : 'Inconnue'}` 
    });
  }
}
