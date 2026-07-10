// Métadonnées d'affichage des templates de séance (miroir léger de server/src/services/templates.js).
export const TEMPLATES = {
  test_reference: { label: "Test de référence", emoji: "⏱️", node: "bg-rose-500", badge: "violet" },
  ef: { label: "Endurance fondamentale", emoji: "🏃", node: "bg-sky-500", badge: "sky" },
  marche_course: { label: "Marche / course", emoji: "🚶", node: "bg-teal-500", badge: "teal" },
  vo2_court: { label: "VO2 max", emoji: "⚡", node: "bg-amber-500", badge: "amber" },
  seuil: { label: "Seuil", emoji: "🔥", node: "bg-orange-500", badge: "amber" },
  allure_specifique: { label: "Allure spécifique", emoji: "🎯", node: "bg-indigo-500", badge: "violet" },
  sortie_longue: { label: "Sortie longue", emoji: "🛣️", node: "bg-violet-500", badge: "violet" },
  objectif: { label: "Objectif — jour J", emoji: "🏆", node: "bg-amber-400", badge: "amber" },
};

export function templateMeta(templateKey) {
  return TEMPLATES[templateKey] || { label: "Séance", emoji: "✓", node: "bg-emerald-500", badge: "green" };
}
