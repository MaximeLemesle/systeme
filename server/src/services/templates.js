// Catalogue FERMÉ des templates de séances de course à pied (voir CONTEXT.md).
// Les templates sont du CODE (constantes versionnées), pas de la donnée : ajouter un
// template = ajouter une entrée ici + sa règle d'instanciation dans planGenerator.js.
// Toutes les allures s'expriment en % de VMA ; le générateur fixe les chiffres.

// VMA par défaut (km/h) quand aucun temps de référence — amorce prudente par niveau
// déclaré à l'intake. Corrigée par le recalibrage dès la première perf loggée.
const DEFAULT_VMA = { debutant: 9, intermediaire: 11.5, avance: 14 };

const TEMPLATES = {
  test_reference: {
    label: "Test de référence",
    difficulty: "difficile",
    advice: "Échauffe-toi 10 min en footing très lent, puis cours la distance à allure régulière, au maximum de ce que tu peux TENIR sans t'effondrer.",
  },
  ef: {
    label: "Endurance fondamentale",
    difficulty: "facile",
    vmaPct: 0.7,
    advice: "Allure très confortable : tu dois pouvoir tenir une conversation. C'est la séance qui construit ton moteur, ne cours pas plus vite.",
  },
  marche_course: {
    label: "Marche / course",
    difficulty: "facile",
    advice: "Alterne course lente et marche active sans t'arrêter. L'objectif est de finir toutes les répétitions, pas d'aller vite.",
  },
  vo2_court: {
    label: "VO2 max — 30/30",
    difficulty: "difficile",
    vmaPct: 1.0,
    advice: "30 s vite / 30 s footing très lent, sans pause. Garde la même allure du premier au dernier 30/30 — si tu exploses à la fin, pars moins vite.",
  },
  seuil: {
    label: "Seuil",
    difficulty: "difficile",
    vmaPct: 0.87,
    advice: "Allure « confortablement dure » : respiration marquée mais contrôlée. Récupère en footing lent entre les blocs.",
  },
  allure_specifique: {
    label: "Allure spécifique",
    difficulty: "difficile",
    advice: "C'est l'allure exacte de ton objectif : apprends à la mémoriser. Vérifie ton allure à chaque kilomètre.",
  },
  sortie_longue: {
    label: "Sortie longue",
    difficulty: "moyen",
    vmaPct: 0.65,
    advice: "Pars lentement et reste lent : la sortie longue se court à l'aise. Emporte de quoi boire au-delà d'une heure.",
  },
  objectif: {
    label: "Objectif — jour J",
    difficulty: "difficile",
    advice: "Jour J : pars exactement à l'allure prévue, jamais plus vite. Le négatif split (2e moitié plus rapide) est ton meilleur allié.",
  },
};

// % de VMA tenable en course selon la distance (barème classique, interpolation grossière).
function racePctVma(distanceKm) {
  if (distanceKm <= 1.5) return 1.0;
  if (distanceKm <= 3) return 0.95;
  if (distanceKm <= 5) return 0.92;
  if (distanceKm <= 10) return 0.88;
  if (distanceKm <= 15) return 0.85;
  if (distanceKm <= 21.1) return 0.82;
  return 0.78; // marathon et plus
}

// VMA (km/h) estimée depuis une perf réelle : vitesse moyenne / % VMA tenable sur la distance.
function vmaFromPerf(distanceKm, durationSec) {
  if (!(distanceKm > 0) || !(durationSec > 0)) return null;
  const speedKmH = distanceKm / (durationSec / 3600);
  return speedKmH / racePctVma(distanceKm);
}

// VMA d'amorce par niveau déclaré (accents/casse tolérés).
function defaultVma(niveau) {
  const key = String(niveau || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return DEFAULT_VMA[key] ?? DEFAULT_VMA.debutant;
}

// Allure (s/km) à un % de VMA donné.
function paceAtVma(vmaKmH, pct) {
  return Math.round(3600 / (vmaKmH * pct));
}

// Allure de course cible (s/km) sur une distance, pour une VMA donnée.
function racePace(vmaKmH, distanceKm) {
  return paceAtVma(vmaKmH, racePctVma(distanceKm));
}

// ---------- Formatage ----------

function fmtPace(secPerKm) {
  const s = Math.max(1, Math.round(secPerKm));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}/km`;
}

function fmtDuration(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function fmtKm(km) {
  return `${Math.round(km * 10) / 10} km`;
}

// Rendu lisible d'un spec → targetLabel affiché au coureur.
function renderLabel(spec) {
  switch (spec.template) {
    case "test_reference":
      return `${fmtKm(spec.distanceKm)} chrono — à fond, allure régulière`;
    case "ef":
      return `${spec.durationMin} min à ${fmtPace(spec.paceSecPerKm)}`;
    case "marche_course":
      return `${spec.reps}×(${Math.round(spec.runSec / 60)} min course / ${Math.round(spec.walkSec / 60)} min marche)`;
    case "vo2_court":
      return `${spec.sets}×(${spec.reps}×30s/30s) à ${fmtPace(spec.paceSecPerKm)}`;
    case "seuil":
      return `${spec.reps}×${spec.effortMin} min à ${fmtPace(spec.paceSecPerKm)}, récup ${spec.recoveryMin} min`;
    case "allure_specifique":
      return `${spec.reps}×${fmtKm(spec.repDistanceKm)} à ${fmtPace(spec.paceSecPerKm)}, récup ${spec.recoveryMin} min`;
    case "sortie_longue":
      return `${fmtKm(spec.distanceKm)} à ${fmtPace(spec.paceSecPerKm)}`;
    case "objectif":
      return spec.targetTimeSec
        ? `${fmtKm(spec.distanceKm)} en ${fmtDuration(spec.targetTimeSec)} (${fmtPace(spec.paceSecPerKm)})`
        : `${fmtKm(spec.distanceKm)} en continu, à ton rythme`;
    default:
      return "";
  }
}

// Durée totale estimée d'une séance (minutes), échauffement/retour au calme compris.
function estimateDurationMin(spec) {
  const WARMUP = 15;
  const COOLDOWN = 10;
  switch (spec.template) {
    case "test_reference":
      return Math.round(WARMUP + (spec.distanceKm * (spec.paceSecPerKm || 360)) / 60 + 5);
    case "ef":
      return spec.durationMin;
    case "marche_course":
      return Math.round(5 + (spec.reps * (spec.runSec + spec.walkSec)) / 60 + 5);
    case "vo2_court":
      return Math.round(WARMUP + spec.sets * spec.reps + (spec.sets - 1) * 3 + COOLDOWN);
    case "seuil":
      return Math.round(WARMUP + spec.reps * (spec.effortMin + spec.recoveryMin) + COOLDOWN);
    case "allure_specifique":
      return Math.round(
        WARMUP + spec.reps * ((spec.repDistanceKm * spec.paceSecPerKm) / 60 + spec.recoveryMin) + COOLDOWN
      );
    case "sortie_longue":
      return Math.round((spec.distanceKm * spec.paceSecPerKm) / 60);
    case "objectif":
      return Math.round(WARMUP + (spec.distanceKm * (spec.paceSecPerKm || 360)) / 60);
    default:
      return 30;
  }
}

module.exports = {
  TEMPLATES,
  DEFAULT_VMA,
  racePctVma,
  vmaFromPerf,
  defaultVma,
  paceAtVma,
  racePace,
  fmtPace,
  fmtDuration,
  fmtKm,
  renderLabel,
  estimateDurationMin,
};
