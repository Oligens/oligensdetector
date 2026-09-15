import { Pool } from '@neondatabase/serverless';

type Req = { method?: string; query?: Record<string, string> };
type Res = { status: (n: number) => Res; json: (v: unknown) => void };

function send(res: Res, status: number, body: unknown) { res.status(status).json(body); }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    return send(res, 200, { 
      databases: [], 
      message: "DATABASE_URL non configurée - Ajoutez votre URL Neon dans les variables d'environnement Vercel" 
    });
  }

  try {
    const pool = new Pool({ connectionString: databaseUrl });
    
    // Vérifier si la table des bases de données institutionnelles existe
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'institutional_databases'
      ) as exists;
    `);

    if (!tableCheck.rows[0].exists) {
      await pool.end();
      // Retourner une liste par défaut de bases connues
      const defaultDatabases = [
        { id: 1, name: 'Base académique générale', type: 'academic', status: 'active' },
        { id: 2, name: 'Publications scientifiques', type: 'research', status: 'active' },
        { id: 3, name: 'Archives institutionnelles', type: 'archive', status: 'pending' }
      ];
      return send(res, 200, { 
        databases: defaultDatabases, 
        message: "Table non initialisée - Bases de données par défaut retournées" 
      });
    }

    // Récupérer les bases de données institutionnelles
    const result = await pool.query(`
      SELECT 
        id,
        name,
        type,
        url,
        status,
        last_sync,
        created_at
      FROM institutional_databases 
      ORDER BY created_at DESC
    `);

    await pool.end();

    const databases = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      url: row.url,
      status: row.status,
      lastSync: row.last_sync,
      createdAt: row.created_at
    }));

    return send(res, 200, { databases, message: "Bases de données récupérées avec succès" });
  } catch (error) {
    console.error('Erreur institutional-databases:', error);
    return send(res, 200, { 
      databases: [], 
      message: `Erreur de connexion: ${error instanceof Error ? error.message : 'Inconnue'}` 
    });
  }
}
