-- CreateTable
CREATE TABLE "user" (
    "id_user" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "domaine" (
    "id_domaine" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "xp_to_next_level" INTEGER NOT NULL DEFAULT 100,
    "total_minutes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'actif',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,
    CONSTRAINT "domaine_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id_user") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "objectif" (
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
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'en_cours',
    "xp_reward" INTEGER NOT NULL DEFAULT 1000,
    "ai_refined" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" DATETIME,
    "domaine_id" INTEGER NOT NULL,
    CONSTRAINT "objectif_domaine_id_fkey" FOREIGN KEY ("domaine_id") REFERENCES "domaine" ("id_domaine") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tache" (
    "id_tache" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "est_duration_min" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'a_faire',
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT true,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "objectif_id" INTEGER NOT NULL,
    CONSTRAINT "tache_objectif_id_fkey" FOREIGN KEY ("objectif_id") REFERENCES "objectif" ("id_objectif") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "session" (
    "id_session" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "focus_point" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'moyen',
    "self_rating" INTEGER,
    "xp_earned" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "objectif_id" INTEGER NOT NULL,
    "tache_id" INTEGER,
    CONSTRAINT "session_objectif_id_fkey" FOREIGN KEY ("objectif_id") REFERENCES "objectif" ("id_objectif") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "session_tache_id_fkey" FOREIGN KEY ("tache_id") REFERENCES "tache" ("id_tache") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "feedback" (
    "id_feedback" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "notes" TEXT,
    "media_url" TEXT,
    "correction" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" INTEGER NOT NULL,
    CONSTRAINT "feedback_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session" ("id_session") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_session_id_key" ON "feedback"("session_id");
