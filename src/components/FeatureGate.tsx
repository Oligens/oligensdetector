import { Link } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

export default function FeatureGate({ children, feature }: { children: React.ReactNode; feature: string }) {
  const { subscription } = useAuth();
  const premium = subscription.plan === "pro" || subscription.plan === "gold" || subscription.plan === "flash";
  if (premium) return <>{children}</>;
  return <section className="glass mx-auto mt-10 max-w-xl rounded-2xl p-8 text-center"><p className="label-caps text-gold-400">FONCTION PREMIUM</p><h2 className="mt-2 font-display text-xl font-bold text-ink-100">{feature} est disponible avec Pro</h2><p className="mt-2 text-sm leading-relaxed text-ink-400">Le plan Free affiche les résultats directement à l'écran. Les rapports PDF, statistiques et historique avancé nécessitent un abonnement.</p><Link to="/subscriptions" className="btn-gold mt-5 inline-flex px-5 py-2.5">Voir les abonnements</Link></section>;
}
