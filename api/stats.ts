import { Pool } from '@neondatabase/serverless';

type Req = { method?: string; query?: Record<string, string> };
type Res = { status: (n: number) => Res; json: (v: unknown) => void };

function send(res: Res, status: number, body: unknown) { res.status(status).json(body); }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    const stats = {
      totalAnalyses: 0,
      totalDocuments: 0,
      averageScore: 0,
      lastAnalysis: null,
      message: "DATABASE_URL non configurée - Ajoutez votre URL Neon dans les variables d'environnement Vercel"
    };
    return send(res, 200, stats);
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
        totalAnalyses: 0,
        totalDocuments: 0,
        averageScore: 0,
        lastAnalysis: null,
        message: "Base de données connectée mais tables non initialisées"
      });
    }

    // Récupérer les statistiques
    const [totalAnalysesResult, totalDocsResult, avgScoreResult, lastAnalysisResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM analyses'),
      pool.query('SELECT COUNT(DISTINCT document_id) as count FROM analyses'),
      pool.query('SELECT AVG(score) as avg FROM analyses WHERE score IS NOT NULL'),
      pool.query('SELECT created_at, score FROM analyses ORDER BY created_at DESC LIMIT 1')
    ]);

    await pool.end();

    const stats = {
      totalAnalyses: parseInt(totalAnalysesResult.rows[0]?.count || '0', 10),
      totalDocuments: parseInt(totalDocsResult.rows[0]?.count || '0', 10),
      averageScore: parseFloat(avgScoreResult.rows[0]?.avg || '0'),
      lastAnalysis: lastAnalysisResult.rows[0] || null,
      message: "Statistiques récupérées avec succès"
    };

    return send(res, 200, stats);
  } catch (error) {
    console.error('Erreur stats:', error);
    return send(res, 200, {
      totalAnalyses: 0,
      totalDocuments: 0,
      averageScore: 0,
      lastAnalysis: null,
      message: `Erreur de connexion: ${error instanceof Error ? error.message : 'Inconnue'}`
    });
  }
}
