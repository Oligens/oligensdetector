import { Pool } from '@neondatabase/serverless';

type Req = { method?: string; body?: unknown };
type Res = { status: (n: number) => Res; json: (v: unknown) => void };

function send(res: Res, status: number, body: unknown) { res.status(status).json(body); }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  const databaseUrl = process.env.DATABASE_URL;
  const body = req.body as { text?: string; documentName?: string } | undefined;

  if (!body?.text) {
    return send(res, 400, { 
      extracted: null, 
      message: "Texte manquant dans la requête" 
    });
  }

  try {
    // Si une base de données est configurée, sauvegarder l'extraction
    if (databaseUrl) {
      try {
        const pool = new Pool({ connectionString: databaseUrl });
        
        // Vérifier si la table documents existe
        const tableCheck = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'documents'
          ) as exists;
        `);

        if (tableCheck.rows[0].exists) {
          const result = await pool.query(
            `INSERT INTO documents (name, content, created_at)
             VALUES ($1, $2, NOW())
             RETURNING id, name, created_at`,
            [body.documentName || 'Document sans titre', body.text]
          );
          
          await pool.end();
          
          return send(res, 200, {
            extracted: {
              id: result.rows[0].id,
              name: result.rows[0].name,
              content: body.text,
              createdAt: result.rows[0].created_at
            },
            message: "Document extrait et sauvegardé avec succès"
          });
        }
        
        await pool.end();
      } catch (dbError) {
        console.error('Erreur sauvegarde DB:', dbError);
      }
    }

    // Retourner le texte extrait sans sauvegarde
    return send(res, 200, {
      extracted: {
        id: Date.now(),
        name: body.documentName || 'Document sans titre',
        content: body.text,
        createdAt: new Date().toISOString()
      },
      message: "Document extrait (non sauvegardé - base de données non configurée)"
    });
  } catch (error) {
    console.error('Erreur extract:', error);
    return send(res, 500, {
      extracted: null,
      message: `Erreur d'extraction: ${error instanceof Error ? error.message : 'Inconnue'}`
    });
  }
}
