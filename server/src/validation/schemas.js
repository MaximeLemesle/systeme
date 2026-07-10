const { z } = require("zod");

const Difficulty = z.enum(["facile", "moyen", "difficile"]);
const RunnerLevel = z.enum(["débutant", "intermédiaire", "avancé"]);
const ObjectiveType = z.enum(["endurance", "chrono", "distance", "regularite"]);
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

const IntakeObjectiveOut = z.object({
  title: z.string().min(3).max(150),
  description: z.string().nullable().optional(),
  metricLabel: z.string().min(1).max(100),
  unit: z.string().max(30).nullable().optional(),
  targetValue: z.coerce.number().positive(),
  difficulty: Difficulty,
  niveau: RunnerLevel,
  objectiveType: ObjectiveType,
  deadline: z.string().nullable().optional(),
  trainingFrequency: z.coerce.number().int().min(2).max(5),
  planWeeks: z.coerce.number().int().min(5).max(20),
  vmaKmh: z.coerce.number().min(8).max(25).nullable().optional(),
  targetDistanceKm: z.coerce.number().positive().max(100).nullable().optional(),
  targetTimeSeconds: z.coerce.number().int().positive().max(86400).nullable().optional(),
});

const IntakeOut = z
  .object({
    complete: z.boolean(),
    question: z.string().min(3).nullable().optional(),
    objectif: IntakeObjectiveOut.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.complete && !data.objectif) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "L'objectif final est manquant" });
    }
    if (!data.complete && !data.question) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La question suivante est manquante" });
    }
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
  niveau: RunnerLevel.optional().nullable(),
  objectiveType: ObjectiveType.optional().nullable(),
  trainingFrequency: z.number().int().min(2).max(5).optional().default(3),
  planWeeks: z.number().int().min(5).max(20).optional().default(8),
  vmaKmh: z.number().min(8).max(25).optional().nullable(),
  targetDistanceKm: z.number().positive().max(100).optional().nullable(),
  targetTimeSeconds: z.number().int().positive().max(86400).optional().nullable(),
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
});

const TacheUpdateIn = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Le titre de la tâche doit contenir au moins 2 caractères")
    .max(150, "Le titre de la tâche ne peut pas dépasser 150 caractères")
    .optional(),
  description: z.string().optional().nullable(),
});

const PerformanceFields = {
  distanceKm: z.number().positive().max(100).optional().nullable(),
  timeSeconds: z.number().int().positive().max(86400).optional().nullable(),
};

function requireCompletePerformance(data, ctx) {
  if ((data.distanceKm == null) !== (data.timeSeconds == null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La distance et le temps de course doivent être fournis ensemble",
    });
  }
}

const SessionIn = z.object({
  durationMinutes: RequiredNumber("La durée")
    .int("La durée doit être un nombre entier de minutes")
    .positive("La durée doit être supérieure à 0")
    .max(240, "La durée ne peut pas dépasser 240 minutes par session"),
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
  ...PerformanceFields,
}).superRefine(requireCompletePerformance);

const FeedbackIn = z.object({
  notes: z.string().optional().nullable(),
  mediaUrl: z.string().max(255, "L'URL média ne peut pas dépasser 255 caractères").optional().nullable(),
  correction: z.string().optional().nullable(),
});

const IntakeIn = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1000),
      })
    )
    .min(1)
    .max(9),
  niveau: RunnerLevel.optional().nullable(),
});

const CompleteTacheIn = z.object({
  durationMinutes: z
    .number()
    .int("La durée doit être un nombre entier de minutes")
    .positive("La durée doit être supérieure à 0")
    .max(240, "La durée ne peut pas dépasser 240 minutes par session")
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
  ...PerformanceFields,
}).superRefine(requireCompletePerformance);

module.exports = {
  Difficulty,
  RunnerLevel,
  IntakeOut,
  RegisterIn,
  LoginIn,
  ObjectifIn,
  ObjectifUpdateIn,
  TacheUpdateIn,
  CompleteTacheIn,
  SessionIn,
  FeedbackIn,
  IntakeIn,
};
