-- Converge l'ancien moteur running vers le contrat Running Club actuel sans perdre l'historique.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_objectif" (
    "id_objectif" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "raw_input" TEXT,
    "metric_label" TEXT NOT NULL,
    "unit" TEXT,
    "start_value" DECIMAL,
    "target_value" DECIMAL NOT NULL,
    "current_value" DECIMAL,
    "difficulty" TEXT NOT NULL DEFAULT 'moyen',
    "niveau" TEXT,
    "objective_type" TEXT,
    "training_frequency" INTEGER NOT NULL DEFAULT 3,
    "plan_weeks" INTEGER NOT NULL DEFAULT 8,
    "vma_kmh" DECIMAL,
    "target_distance_km" DECIMAL,
    "target_time_seconds" INTEGER,
    "prediction_seconds" INTEGER,
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'en_cours',
    "xp_reward" INTEGER NOT NULL DEFAULT 1000,
    "ai_refined" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" DATETIME,
    "domaine_id" INTEGER NOT NULL,
    CONSTRAINT "objectif_domaine_id_fkey" FOREIGN KEY ("domaine_id") REFERENCES "domaine" ("id_domaine") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_objectif" (
    "id_objectif", "title", "description", "raw_input", "metric_label", "unit",
    "start_value", "target_value", "current_value", "difficulty", "niveau",
    "objective_type", "training_frequency", "target_distance_km", "target_time_seconds",
    "prediction_seconds", "deadline", "status", "xp_reward", "ai_refined", "created_at",
    "validated_at", "domaine_id"
)
SELECT
    "id_objectif", "title", "description", "raw_input", "metric_label", "unit",
    "start_value", "target_value", "current_value", "difficulty", "niveau",
    CASE WHEN "archetype" = 'completion' THEN 'distance' ELSE "archetype" END,
    "frequency", "target_distance_km",
    CASE WHEN "archetype" = 'chrono' THEN CAST("target_value" AS INTEGER) ELSE NULL END,
    CASE WHEN "archetype" = 'chrono' THEN CAST("current_value" AS INTEGER) ELSE NULL END,
    "deadline", "status", "xp_reward", "ai_refined", "created_at", "validated_at", "domaine_id"
FROM "objectif";
DROP TABLE "objectif";
ALTER TABLE "new_objectif" RENAME TO "objectif";

CREATE TABLE "new_tache" (
    "id_tache" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "week_index" INTEGER NOT NULL DEFAULT 1,
    "est_duration_min" INTEGER,
    "intensity_percent" INTEGER,
    "distance_km" DECIMAL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'a_faire',
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "objectif_id" INTEGER NOT NULL,
    CONSTRAINT "tache_objectif_id_fkey" FOREIGN KEY ("objectif_id") REFERENCES "objectif" ("id_objectif") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_tache" (
    "id_tache", "title", "description", "order_index", "week_index", "est_duration_min",
    "category", "status", "is_ai_generated", "completed_at", "created_at", "objectif_id"
)
SELECT
    "id_tache", "title", "description", "order_index", "week_index", "est_duration_min",
    "template_key", "status", false, "completed_at", "created_at", "objectif_id"
FROM "tache";
DROP TABLE "tache";
ALTER TABLE "new_tache" RENAME TO "tache";

CREATE TABLE "new_session" (
    "id_session" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "focus_point" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "distance_km" DECIMAL,
    "time_seconds" INTEGER,
    "difficulty" TEXT NOT NULL DEFAULT 'moyen',
    "self_rating" INTEGER,
    "xp_earned" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "objectif_id" INTEGER NOT NULL,
    "tache_id" INTEGER,
    CONSTRAINT "session_objectif_id_fkey" FOREIGN KEY ("objectif_id") REFERENCES "objectif" ("id_objectif") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "session_tache_id_fkey" FOREIGN KEY ("tache_id") REFERENCES "tache" ("id_tache") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_session" (
    "id_session", "focus_point", "duration_minutes", "distance_km", "time_seconds",
    "difficulty", "self_rating", "xp_earned", "created_at", "objectif_id", "tache_id"
)
SELECT
    "id_session", "focus_point", "duration_minutes", "perf_distance_km", "perf_duration_sec",
    "difficulty", "self_rating", "xp_earned", "created_at", "objectif_id", "tache_id"
FROM "session";
DROP TABLE "session";
ALTER TABLE "new_session" RENAME TO "session";

CREATE UNIQUE INDEX "domaine_user_id_key" ON "domaine"("user_id");
CREATE UNIQUE INDEX "tache_objectif_id_order_index_key" ON "tache"("objectif_id", "order_index");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
