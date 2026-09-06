// COJ console signature — Oligens Detector
// Affiche la signature artistique COJ dans les Developer Tools au chargement de l'application.
export function printCojConsoleSignature() {
  const imageUrl = "/coj-console-signature.webp";

  const imageStyle = [
    "font-size: 1px",
    "line-height: 1",
    "padding: 86px 130px",
    `background: url(${imageUrl}) center center / 260px auto no-repeat`,
    "border-radius: 12px",
  ].join(";");

  console.log("%c ", imageStyle);
  console.log(
    "%c✦ COJ ✦",
    "color:#f1c40f;font-size:20px;font-weight:900;letter-spacing:8px;text-shadow:0 0 10px rgba(241,196,15,.45);background:#07142e;padding:5px 14px;border-radius:6px;"
  );
  console.log(
    "%cApplication développée et signée par COJ (Cleef Oligens Joseph) — Tous droits réservés.",
    "color:#f1c40f;font-weight:700;font-size:13px;background:#0b132b;padding:7px 12px;border-radius:6px;"
  );
}
