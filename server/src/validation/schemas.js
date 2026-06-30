const { z } = require("zod");

const Difficulty = z.enum(["facile", "moyen", "difficile"]);
const RequiredString = (field) =>
  z.string({
    required_error: `${field} est requis`,
    invalid_type_error: `${field} doit être du texte`,
  });
const RequiredNumber = (field) =>
  z.number({
    required_error: `${field} est requis`,
    invalid_type_error: `${field} doit être un nombre`,
  });

// ---------- Schémas de sortie IA (sorties LLM en mode JSON) ----------

// NB : on utilise z.coerce.number() car les LLM renvoient parfois les nombres
// sous forme de chaînes ("1" au lieu de 1) — la coercition évite un retry inutile.
const SuggestionsOut = z.object({
  objectifs: z
    .array(
      z.object({
        title: z.string().min(3),
        metric_label: z.string(),
        unit: z.string().nullable().optional(),
        target_value: z.coerce.number(),
        difficulty: Difficulty,
        deadline_suggeree: z.string(), // ISO "YYYY-MM-DD"
      })
    )
    .min(3)
    .max(6),
});

const RefineOut = z.object({
  title: z.string().min(3),
  metric_label: z.string(),
  unit: z.string().nullable().optional(),
  start_value: z.coerce.number().nullable().optional(),
  target_value: z.coerce.number(),
  difficulty: Difficulty,
  deadline: z.string(), // ISO
  faisabilite: z.string(), // courte note réaliste
});

// Plan d'action : étapes ordonnées avec une catégorie optionnelle.
// Les catégories running restent supportées pour le domaine "Course à pied".
const TrainingCategory = z
  .enum(["general", "footing", "fractionne", "sortie_longue", "recuperation", "objectif"])
  .catch("general");

const TrainingPlanOut = z.object({
  seances: z
    .array(
      z.object({
        order_index: z.coerce.number().int(),
        title: z.string().min(2),
        description: z.string().optional().default(""),
        category: TrainingCategory,
        est_duration_min: z.coerce.number().int().nullable().optional(),
      })
    )
    .min(3)
    .max(12),
});

const TasksOut = z.object({
  taches: z
    .array(
      z.object({
        order_index: z.coerce.number().int(),
        title: z.string().min(2),
        description: z.string().optional().default(""),
        category: TrainingCategory.optional().default("general"),
        est_duration_min: z.coerce.number().int().nullable().optional(),
      })
    )
    .min(3)
    .max(20),
});

// ---------- Schémas d'entrée des endpoints qui écrivent ----------

const RegisterIn = z.object({
  username: RequiredString("Le nom d'utilisateur")
    .trim()
    .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères")
    .max(50, "Le nom d'utilisateur ne peut pas dépasser 50 caractères"),
  email: RequiredString("L'email").trim().email("L'adresse email est invalide"),
  password: RequiredString("Le mot de passe").min(
    6,
    "Le mot de passe doit contenir au moins 6 caractères"
  ),
});

const LoginIn = z.object({
  email: RequiredString("L'email").trim().email("L'adresse email est invalide"),
  password: RequiredString("Le mot de passe").min(1, "Le mot de passe est requis"),
});

const DomaineIn = z.object({
  name: RequiredString("Le nom du domaine")
    .trim()
    .min(1, "Le nom du domaine est requis")
    .max(100, "Le nom du domaine ne peut pas dépasser 100 caractères"),
  description: z
    .string()
    .max(1000, "La description ne peut pas dépasser 1000 caractères")
    .optional()
    .nullable(),
});

const ObjectifIn = z.object({
  title: RequiredString("Le titre")
    .trim()
    .min(3, "Le titre doit contenir au moins 3 caractères")
    .max(150, "Le titre ne peut pas dépasser 150 caractères"),
  description: z.string().optional().nullable(),
  rawInput: z.string().optional().nullable(),
  metricLabel: RequiredString("La métrique")
    .trim()
    .min(1, "La métrique est requise")
    .max(100, "La métrique ne peut pas dépasser 100 caractères"),
  unit: z.string().max(30, "L'unité ne peut pas dépasser 30 caractères").optional().nullable(),
  startValue: z.number().optional().nullable(),
  targetValue: RequiredNumber("La valeur cible"),
  currentValue: z.number().optional().nullable(),
  difficulty: Difficulty.default("moyen"),
  niveau: z.string().optional().nullable(),
  objectiveType: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(), // "YYYY-MM-DD"
  aiRefined: z.boolean().optional().default(false),
});

const ObjectifUpdateIn = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Le titre doit contenir au moins 3 caractères")
    .max(150, "Le titre ne peut pas dépasser 150 caractères")
    .optional(),
  description: z.string().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  difficulty: Difficulty.optional(),
  status: z.enum(["en_cours", "valide", "abandonne"]).optional(),
});

const TacheUpdateIn = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Le titre de la tâche doit contenir au moins 2 caractères")
    .max(150, "Le titre de la tâche ne peut pas dépasser 150 caractères")
    .optional(),
  description: z.string().optional().nullable(),
  status: z.enum(["a_faire", "en_cours", "fait"]).optional(),
});

const SessionIn = z.object({
  durationMinutes: RequiredNumber("La durée")
    .int("La durée doit être un nombre entier de minutes")
    .positive("La durée doit être supérieure à 0")
    .max(1440, "La durée ne peut pas dépasser 1440 minutes"),
  difficulty: Difficulty.default("moyen"),
  selfRating: z
    .number()
    .int("L'auto-évaluation doit être un entier")
    .min(1, "L'auto-évaluation doit être entre 1 et 5")
    .max(5, "L'auto-évaluation doit être entre 1 et 5")
    .optional()
    .nullable(),
  focusPoint: z
    .string()
    .max(255, "Le point travaillé ne peut pas dépasser 255 caractères")
    .optional()
    .nullable(),
  tacheId: z.number().int().optional().nullable(),
});

const FeedbackIn = z.object({
  notes: z.string().optional().nullable(),
  mediaUrl: z.string().max(255, "L'URL média ne peut pas dépasser 255 caractères").optional().nullable(),
  correction: z.string().optional().nullable(),
});

const RefineIn = z.object({
  objectifBrut: RequiredString("L'objectif").min(1, "Décris ton objectif avant de le raffiner"),
  domaineId: z.number().int().optional().nullable(),
  domaine: z.string().optional().nullable(),
  niveau: z.string().optional().nullable(),
  objectiveType: z.string().optional().nullable(),
});

const ObjectiveSuggestIn = z.object({
  niveau: z.string().optional().nullable(),
  objectiveType: z.string().optional().nullable(),
});

const CompleteTacheIn = z.object({
  durationMinutes: z
    .number()
    .int("La durée doit être un nombre entier de minutes")
    .positive("La durée doit être supérieure à 0")
    .max(1440, "La durée ne peut pas dépasser 1440 minutes")
    .optional()
    .nullable(),
  selfRating: z
    .number()
    .int("L'auto-évaluation doit être un entier")
    .min(1, "L'auto-évaluation doit être entre 1 et 5")
    .max(5, "L'auto-évaluation doit être entre 1 et 5")
    .optional()
    .nullable(),
  focusPoint: z
    .string()
    .max(255, "Le point travaillé ne peut pas dépasser 255 caractères")
    .optional()
    .nullable(),
});

module.exports = {
  Difficulty,
  SuggestionsOut,
  RefineOut,
  TrainingPlanOut,
  TasksOut,
  RegisterIn,
  LoginIn,
  DomaineIn,
  ObjectifIn,
  ObjectifUpdateIn,
  TacheUpdateIn,
  CompleteTacheIn,
  SessionIn,
  FeedbackIn,
  RefineIn,
  ObjectiveSuggestIn,
};
