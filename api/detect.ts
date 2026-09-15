type Req = { method?: string; body?: unknown };
type Res = { status: (n: number) => Res; json: (v: unknown) => void };

function send(res: Res, status: number, body: unknown) { res.status(status).json(body); }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  // Retourne une réponse vide pour éviter les erreurs 500
  return send(res, 200, { 
    detected: false, 
    score: 0, 
    message: "Service de détection non configuré - Ajoutez vos clés API dans les variables d'environnement" 
  });
}
