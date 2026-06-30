// Métadonnées des types d'étapes (génériques + entraînement course).
export const CATEGORIES = {
  general: { label: "Étape", emoji: "✓", node: "bg-emerald-500", badge: "green", difficulty: "moyen" },
  footing: { label: "Footing", emoji: "🏃", node: "bg-sky-500", badge: "sky", difficulty: "facile" },
  fractionne: { label: "Fractionné", emoji: "⚡", node: "bg-amber-500", badge: "amber", difficulty: "difficile" },
  sortie_longue: { label: "Sortie longue", emoji: "🛣️", node: "bg-violet-500", badge: "violet", difficulty: "moyen" },
  recuperation: { label: "Récupération", emoji: "🧘", node: "bg-teal-500", badge: "teal", difficulty: "facile" },
  objectif: { label: "Objectif", emoji: "🏆", node: "bg-amber-400", badge: "amber", difficulty: "difficile" },
};

export function categoryMeta(category) {
  return CATEGORIES[category] || CATEGORIES.general;
}
