type Req = { method?: string; query?: Record<string, string> };
type Res = { status: (n: number) => Res; json: (v: unknown) => void };

function send(res: Res, status: number, body: unknown) { res.status(status).json(body); }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

  // Retourne des statistiques factices pour éviter les erreurs 500
  const stats = {
    totalAnalyses: 0,
    totalDocuments: 0,
    averageScore: 0,
    lastAnalysis: null,
    message: "Statistiques non disponibles - Configurez votre base de données"
  };

  return send(res, 200, stats);
}
