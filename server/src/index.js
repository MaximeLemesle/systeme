// Bootstrap Express — démarre l'API.
const app = require("./app");
const { env } = require("./config/env");

// Filet de sécurité : une erreur asynchrone non gérée ne doit jamais tuer le serveur.
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

const PORT = env.PORT;
const HOST = env.HOST;
const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;

const server = app.listen(PORT, HOST, () => {
  console.log(`API démarrée sur http://${displayHost}:${PORT}`);
  // Précharge le modèle IA en arrière-plan (non bloquant).
  require("./services/ai").warmupLlm();
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
