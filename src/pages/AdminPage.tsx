import { FormEvent, useEffect, useState } from "react";
import { IconCheck, IconClose, IconLock, IconShield } from "../components/icons";
import { PageHead, Pill } from "../ui";

type Service = "gemini" | "humanizer" | "plagiarism" | "hallucination" | "references";
type AdminKey = {
  id: string; service: Service; name: string; masked: string; active: boolean;
  priority: number; usageCount: number; failureCount: number; lastUsedAt: string | null;
};

const SERVICES: Array<{ id: Service; label: string }> = [
  { id: "gemini", label: "Gemini" },
  { id: "humanizer", label: "Humanizer" },
  { id: "plagiarism", label: "Plagiat" },
  { id: "hallucination", label: "Hallucinations" },
  { id: "references", label: "Références" },
];

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Erreur serveur.");
  return data as T;
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [email, setEmail] = useState("cleefolig@gmail.com");
  const [password, setPassword] = useState("");
  const [service, setService] = useState<Service>("gemini");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("100");
  const [keys, setKeys] = useState<AdminKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadKeys(target = service) {
    const data = await api<{ keys: AdminKey[] }>(`/api/admin/keys?service=${target}`);
    setKeys(Array.isArray(data.keys) ? data.keys : []);
  }

  useEffect(() => {
    let alive = true;
    void api<{ authenticated: boolean }>("/api/admin/session")
      .then(async data => {
        if (!alive) return;
        setAuthenticated(Boolean(data.authenticated));
        if (data.authenticated) await loadKeys();
      })
      .catch(() => { if (alive) setAuthenticated(false); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (authenticated) void loadKeys().catch(e => setError(e instanceof Error ? e.message : "Chargement impossible."));
  }, [service, authenticated]);

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setPassword(""); setAuthenticated(true); await loadKeys();
      setMessage("Session administrateur ouverte.");
    } catch (e) { setError(e instanceof Error ? e.message : "Connexion impossible."); }
    finally { setBusy(false); }
  }

  async function addKey(event: FormEvent) {
    event.preventDefault();
    const value = key.trim();
    if (!value) return setError("Saisissez une clé API.");
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/admin/keys", {
        method: "POST",
        body: JSON.stringify({
          service, key: value,
          name: name.trim() || `${service}-${Date.now()}`,
          priority: Number(priority),
        }),
      });
      setKey(""); setName(""); await loadKeys();
      setMessage(`Clé ${service} ajoutée dans Neon. Elle est chiffrée avant stockage.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Ajout impossible."); }
    finally { setBusy(false); }
  }

  async function toggleKey(item: AdminKey) {
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/admin/keys", {
        method: "PATCH",
        body: JSON.stringify({ service, id: item.id, active: !item.active }),
      });
      await loadKeys(); setMessage(item.active ? "Clé désactivée." : "Clé activée.");
    } catch (e) { setError(e instanceof Error ? e.message : "Modification impossible."); }
    finally { setBusy(false); }
  }

  async function removeKey(id: string) {
    if (!window.confirm("Supprimer définitivement cette clé ?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api(`/api/admin/keys?service=${service}`, { method: "DELETE", body: JSON.stringify({ id }) });
      await loadKeys(); setMessage("Clé supprimée.");
    } catch (e) { setError(e instanceof Error ? e.message : "Suppression impossible."); }
    finally { setBusy(false); }
  }

  async function logout() {
    try { await api("/api/admin/logout", { method: "POST" }); }
    finally { setAuthenticated(false); setKeys([]); setMessage(""); }
  }

  if (loading) return <div className="grid min-h-[55vh] place-items-center text-sm text-ink-400">Initialisation du coffre administrateur…</div>;

  if (!authenticated) return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
      <form onSubmit={submitLogin} className="glass w-full rounded-2xl border border-gold-400/25 p-6 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300"><IconShield className="h-6 w-6" /></span>
          <div><p className="label-caps text-gold-300">COJ · ADMIN CORE</p><h1 className="mt-1 font-display text-xl font-bold text-ink-100">Accès administrateur</h1></div>
        </div>
        <label className="label-caps text-ink-500">E-mail</label>
        <input value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" type="email" required className="mt-2 w-full rounded-xl border border-white/10 bg-night-950/70 px-4 py-3 text-sm text-ink-100 outline-none focus:border-cyan-400/50" />
        <label className="label-caps mt-4 block text-ink-500">Mot de passe</label>
        <input value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" type="password" required className="mt-2 w-full rounded-xl border border-white/10 bg-night-950/70 px-4 py-3 text-sm text-ink-100 outline-none focus:border-cyan-400/50" />
        {error && <p role="alert" className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
        <button disabled={busy} className="btn-gold mt-5 w-full justify-center py-3">{busy ? "Vérification…" : "Ouvrir la console sécurisée"}</button>
        <p className="mt-4 flex items-center justify-center gap-2 text-[10.5px] text-ink-500"><IconLock className="h-3.5 w-3.5" /> Session HttpOnly · JWT 8 h · verrouillage après 5 échecs</p>
      </form>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHead kicker="COJ · ADMIN CORE · NEON" title="Coffre des clés API" actions={<button onClick={logout} className="btn-ghost px-4 py-2 text-xs">Déconnexion</button>} />
      {(error || message) && <div className={`rounded-xl border px-4 py-3 text-xs ${error ? "border-rose-400/20 bg-rose-400/10 text-rose-300" : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"}`}>{error || message}</div>}

      <section className="glass rounded-2xl border border-gold-400/20 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><p className="label-caps text-gold-300">Gestion dynamique</p><h2 className="mt-1 font-display text-lg font-bold text-ink-100">Clés tierces par service</h2></div>
          <Pill tone="info">{keys.length} clé{keys.length > 1 ? "s" : ""}</Pill>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {SERVICES.map(item => <button key={item.id} type="button" onClick={() => setService(item.id)} className={`rounded-xl border px-3 py-2 text-xs ${service === item.id ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-ink-400 hover:bg-white/5"}`}>{item.label}</button>)}
        </div>
        <form onSubmit={addKey} className="grid gap-2 md:grid-cols-[1fr_1fr_120px_auto]">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom (ex. Gemini principal)" className="rounded-xl border border-white/10 bg-night-950/70 px-4 py-3 text-xs text-ink-100 outline-none focus:border-cyan-400/50" />
          <input value={key} onChange={e => setKey(e.target.value)} type="password" autoComplete="off" placeholder="Clé API secrète" className="rounded-xl border border-white/10 bg-night-950/70 px-4 py-3 font-mono text-xs text-ink-100 outline-none focus:border-cyan-400/50" />
          <input value={priority} onChange={e => setPriority(e.target.value)} type="number" min="0" placeholder="Priorité" className="rounded-xl border border-white/10 bg-night-950/70 px-4 py-3 text-xs text-ink-100 outline-none focus:border-cyan-400/50" />
          <button disabled={busy} className="btn-gold px-5 py-3 text-xs">{busy ? "…" : "Ajouter"}</button>
        </form>
        <p className="mt-3 text-[10.5px] leading-relaxed text-ink-500">Les clés ne sont jamais renvoyées au navigateur en clair. Elles sont chiffrées côté serveur avec AES-256-GCM avant leur insertion dans Neon.</p>
      </section>

      <section className="glass rounded-2xl border border-cyan-400/10 p-5">
        <div className="mb-3 flex items-center gap-2 text-cyan-300"><IconCheck className="h-4 w-4" /><span className="label-caps">Clés {SERVICES.find(item => item.id === service)?.label}</span></div>
        {keys.length === 0 ? <p className="rounded-xl border border-white/5 bg-night-950/40 px-4 py-8 text-center text-xs text-ink-500">Aucune clé configurée pour ce service.</p> :
          <div className="space-y-2">{keys.map(item => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-night-950/35 px-4 py-3">
              <span className={`h-2.5 w-2.5 rounded-full ${item.active ? "bg-jade-400" : "bg-ink-600"}`} />
              <span className="min-w-[120px] text-xs font-semibold text-ink-200">{item.name}</span>
              <code className="min-w-0 flex-1 truncate text-xs text-ink-400">{item.masked}</code>
              <span className="text-[10px] text-ink-500">P{item.priority} · {item.usageCount} utilis.</span>
              <button disabled={busy} onClick={() => void toggleKey(item)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-ink-300 hover:bg-white/5">{item.active ? "Désactiver" : "Activer"}</button>
              <button disabled={busy} onClick={() => void removeKey(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-rose-300 hover:bg-rose-400/10" aria-label={`Supprimer ${item.name}`}><IconClose className="h-4 w-4" /></button>
            </div>
          ))}</div>}
      </section>

      <section className="rounded-xl border border-amber-400/15 bg-amber-400/5 p-4 text-[11px] leading-relaxed text-amber-200/70">
        <strong className="text-amber-200">Infrastructure :</strong> DATABASE_URL et AUTH_SECRET restent des variables système Vercel. Seul le secret technique API_KEY_ENCRYPTION_SECRET doit être conservé côté serveur pour pouvoir chiffrer/déchiffrer les clés tierces. Ajouter, désactiver ou supprimer une clé métier ne nécessite aucun redéploiement.
      </section>
    </div>
  );
}
