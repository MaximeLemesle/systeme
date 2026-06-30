// Bootstrap Express — monte toutes les routes et expose /health.
require("dotenv").config();
const express = require("express");
const cors = require("cors");

// Filet de sécurité : une erreur asynchrone non gérée ne doit jamais tuer le serveur.
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

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
  res.status(500).json({ error: "Erreur serveur" });
});

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "127.0.0.1";
const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;

const server = app.listen(PORT, HOST, () => {
  console.log(`API démarrée sur http://${displayHost}:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Impossible de démarrer l'API : le port ${PORT} est déjà utilisé. Arrête l'autre serveur ou change PORT dans server/.env.`
    );
    process.exit(1);
  }
  if (err.code === "EACCES" || err.code === "EPERM") {
    console.error(
      `Impossible de démarrer l'API sur ${HOST}:${PORT}. Vérifie les permissions réseau ou change HOST/PORT dans server/.env.`
    );
    process.exit(1);
  }
  throw err;
});
