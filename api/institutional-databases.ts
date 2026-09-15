type Req = { method?: string; query?: Record<string, string> };
type Res = { status: (n: number) => Res; json: (v: unknown) => void };

function send(res: Res, status: number, body: unknown) { res.status(status).json(body); }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

  // Retourne des bases de données vides pour éviter les erreurs 500
  const databases = [];

  return send(res, 200, { 
    databases, 
    message: "Bases de données institutionnelles non configurées - Ajoutez vos identifiants dans les variables d'environnement" 
  });
}
