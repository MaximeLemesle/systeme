require("./config/env");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

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
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? "Erreur serveur" : err.message });
});

module.exports = app;
