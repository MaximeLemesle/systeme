const { env } = require("./config/env");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(helmet()); // en-têtes de sécurité HTTP
app.use(cors({ origin: env.CORS_ORIGIN })); // origines autorisées uniquement
app.use(express.json());

// Anti brute-force sur l'authentification (désactivé pendant les tests).
if (env.NODE_ENV !== "test") {
  app.use(
    "/auth",
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20, // 20 essais par IP
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Trop de tentatives, réessaie dans 15 minutes." },
    })
  );
}

// Healthcheck
app.get("/health", (req, res) => res.json({ ok: true }));

// Routes
app.use("/auth", require("./routes/auth"));
app.use("/me", require("./routes/stats"));
app.use("/ai", require("./routes/ai"));
app.use("/domaines", require("./routes/domaines"));
app.use("/objectifs", require("./routes/objectifs"));
app.use("/taches", require("./routes/taches"));
app.use("/sessions", require("./routes/feedback"));

// 404 JSON pour toute route inconnue
app.use((req, res) => res.status(404).json({ error: "Route introuvable" }));

// Gestion d'erreurs centralisée → toujours du JSON
app.use((err, req, res, _next) => {
  console.error(err);
  let status = err.status || 500;
  let message = err.message;
  // Erreurs Prisma courantes → statut HTTP parlant plutôt qu'un 500 générique.
  if (err.code === "P2002") { status = 409; message = "Cette valeur existe déjà."; }
  if (err.code === "P2025") { status = 404; message = "Ressource introuvable."; }
  res.status(status).json({ error: status === 500 ? "Erreur serveur" : message });
});

module.exports = app;
