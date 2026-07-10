/*
  Warnings:

  - You are about to drop the column `objective_type` on the `objectif` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `tache` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "session" ADD COLUMN "perf_distance_km" REAL;
ALTER TABLE "session" ADD COLUMN "perf_duration_sec" INTEGER;

-- RedefineTables
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
    "archetype" TEXT NOT NULL DEFAULT 'completion',
    "frequency" INTEGER NOT NULL DEFAULT 3,
    "target_distance_km" REAL,
    "estimate_updated_at" DATETIME,
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'en_cours',
    "xp_reward" INTEGER NOT NULL DEFAULT 1000,
    "ai_refined" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" DATETIME,
    "domaine_id" INTEGER NOT NULL,
    CONSTRAINT "objectif_domaine_id_fkey" FOREIGN KEY ("domaine_id") REFERENCES "domaine" ("id_domaine") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_objectif" ("ai_refined", "created_at", "current_value", "deadline", "description", "difficulty", "domaine_id", "id_objectif", "metric_label", "niveau", "raw_input", "start_value", "status", "target_value", "title", "unit", "validated_at", "xp_reward") SELECT "ai_refined", "created_at", "current_value", "deadline", "description", "difficulty", "domaine_id", "id_objectif", "metric_label", "niveau", "raw_input", "start_value", "status", "target_value", "title", "unit", "validated_at", "xp_reward" FROM "objectif";
DROP TABLE "objectif";
ALTER TABLE "new_objectif" RENAME TO "objectif";
CREATE TABLE "new_tache" (
    "id_tache" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "week_index" INTEGER NOT NULL DEFAULT 1,
    "est_duration_min" INTEGER,
    "template_key" TEXT,
    "spec" TEXT,
    "target_label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'a_faire',
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT true,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "objectif_id" INTEGER NOT NULL,
    CONSTRAINT "tache_objectif_id_fkey" FOREIGN KEY ("objectif_id") REFERENCES "objectif" ("id_objectif") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_tache" ("completed_at", "created_at", "description", "est_duration_min", "id_tache", "is_ai_generated", "objectif_id", "order_index", "status", "title") SELECT "completed_at", "created_at", "description", "est_duration_min", "id_tache", "is_ai_generated", "objectif_id", "order_index", "status", "title" FROM "tache";
DROP TABLE "tache";
ALTER TABLE "new_tache" RENAME TO "tache";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
