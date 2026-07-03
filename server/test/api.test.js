// Tests d'intégration HTTP (supertest) — exécutés sur la base dédiée test.db
// (voir scripts npm : DATABASE_URL=file:./test.db + NODE_ENV=test).
// Couvrent : auth, isolation entre utilisateurs, limite de domaines,
// anti-triche XP et idempotence de la complétion/validation.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/prisma");

// -- Helpers ---------------------------------------------------------------

async function register(email, username) {
  const res = await request(app)
    .post("/auth/register")
    .send({ username, email, password: "secret123" })
    .expect(201);
  return res.body.token;
}

async function createDomaine(token, name = "Course à pied") {
  const res = await request(app)
    .post("/domaines")
    .set("Authorization", `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return res.body;
}

async function createObjectif(token, domaineId) {
  const res = await request(app)
    .post(`/domaines/${domaineId}/objectifs`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "Courir 5 km sans pause",
      metricLabel: "distance",
      unit: "km",
      targetValue: 5,
      difficulty: "moyen",
    })
    .expect(201);
  return res.body;
}

// Crée une tâche directement en base (le plan est normalement généré par l'IA,
// qu'on ne veut pas appeler dans les tests).
function createTache(objectifId, { category = "fractionne", estDurationMin = 30 } = {}) {
  return prisma.tache.create({
    data: { title: "Séance test", orderIndex: 1, category, estDurationMin, objectifId },
  });
}

// Base propre avant la suite (User cascade → domaines/objectifs/tâches/sessions).
test.before(async () => {
  await prisma.user.deleteMany();
});
test.after(async () => {
  await prisma.$disconnect();
});

// -- Auth --------------------------------------------------------------------

test("GET /health répond ok", async () => {
  const res = await request(app).get("/health").expect(200);
  assert.deepEqual(res.body, { ok: true });
});

test("routes protégées → 401 sans token, 401 avec token invalide", async () => {
  await request(app).get("/domaines").expect(401);
  await request(app).get("/domaines").set("Authorization", "Bearer n-importe-quoi").expect(401);
});

test("register puis login renvoient un token, mauvais mot de passe → 401", async () => {
  await register("auth@test.fr", "auth-user");
  const login = await request(app)
    .post("/auth/login")
    .send({ email: "auth@test.fr", password: "secret123" })
    .expect(200);
  assert.ok(login.body.token);
  assert.equal(login.body.user.passwordHash, undefined); // jamais de hash exposé

  await request(app)
    .post("/auth/login")
    .send({ email: "auth@test.fr", password: "mauvais" })
    .expect(401);
});

// -- Isolation entre utilisateurs ---------------------------------------------

test("un utilisateur ne voit pas les ressources d'un autre (404)", async () => {
  const tokenA = await register("alice@test.fr", "alice");
  const tokenB = await register("bob@test.fr", "bob");
  const domaine = await createDomaine(tokenA);
  const objectif = await createObjectif(tokenA, domaine.id);

  await request(app).get(`/domaines/${domaine.id}`).set("Authorization", `Bearer ${tokenB}`).expect(404);
  await request(app).get(`/objectifs/${objectif.id}`).set("Authorization", `Bearer ${tokenB}`).expect(404);
  await request(app)
    .patch(`/objectifs/${objectif.id}/validate`)
    .set("Authorization", `Bearer ${tokenB}`)
    .expect(404);
});

// -- Limite de domaines --------------------------------------------------------

test("la limite de 3 domaines est imposée côté serveur", async () => {
  const token = await register("limite@test.fr", "limite");
  await createDomaine(token, "Un");
  await createDomaine(token, "Deux");
  await createDomaine(token, "Trois");
  const res = await request(app)
    .post("/domaines")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Quatre" })
    .expect(400);
  assert.match(res.body.error, /3 domaines/);
});

// -- Anti-triche XP -------------------------------------------------------------

test("session libre : durée > 240 min refusée (400)", async () => {
  const token = await register("farm@test.fr", "farmeur");
  const domaine = await createDomaine(token);
  const objectif = await createObjectif(token, domaine.id);

  await request(app)
    .post(`/objectifs/${objectif.id}/sessions`)
    .set("Authorization", `Bearer ${token}`)
    .send({ durationMinutes: 999, difficulty: "difficile" })
    .expect(400);
});

test("session liée à une tâche : la difficulté vient de la catégorie, pas du client", async () => {
  const token = await register("derive@test.fr", "derive");
  const domaine = await createDomaine(token);
  const objectif = await createObjectif(token, domaine.id);
  const tache = await createTache(objectif.id, { category: "fractionne" }); // → difficile ×1.5

  // Le client prétend "facile" (×1.0) : le serveur doit ignorer et appliquer ×1.5.
  const res = await request(app)
    .post(`/objectifs/${objectif.id}/sessions`)
    .set("Authorization", `Bearer ${token}`)
    .send({ durationMinutes: 30, difficulty: "facile", tacheId: tache.id })
    .expect(201);
  assert.equal(res.body.xpEarned, 90); // 30 min × 2 XP × 1.5 — pas 60
  assert.equal(res.body.session.difficulty, "difficile");
});

// -- Complétion de tâche (flux principal) ---------------------------------------

test("compléter une tâche crée la session + XP ; la 2e complétion → 400", async () => {
  const token = await register("complete@test.fr", "completeur");
  const domaine = await createDomaine(token);
  const objectif = await createObjectif(token, domaine.id);
  const tache = await createTache(objectif.id, { category: "footing", estDurationMin: 30 }); // facile ×1.0

  const res = await request(app)
    .post(`/taches/${tache.id}/complete`)
    .set("Authorization", `Bearer ${token}`)
    .expect(201);
  assert.equal(res.body.xpEarned, 60); // 30 × 2 × 1.0
  assert.equal(res.body.tache.status, "fait");
  assert.equal(res.body.domaine.totalMinutes, 30);

  // Rejouer la même complétion ne doit PAS redonner d'XP.
  await request(app).post(`/taches/${tache.id}/complete`).set("Authorization", `Bearer ${token}`).expect(400);

  // L'XP du domaine n'a pas bougé après la tentative rejouée.
  const prog = await request(app)
    .get(`/domaines/${domaine.id}/progression`)
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  assert.equal(prog.body.domaine.totalXp, 60);
});

// -- Validation d'objectif --------------------------------------------------------

test("valider un objectif donne l'XP une seule fois (2e validation → 400)", async () => {
  const token = await register("valide@test.fr", "valideur");
  const domaine = await createDomaine(token);
  const objectif = await createObjectif(token, domaine.id); // difficulty moyen → 1000 XP

  const res = await request(app)
    .patch(`/objectifs/${objectif.id}/validate`)
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  assert.equal(res.body.xpEarned, 1000);
  assert.equal(res.body.objectif.status, "valide");
  assert.equal(res.body.leveledUp, true); // 1000 XP → plusieurs niveaux depuis le niveau 1

  await request(app)
    .patch(`/objectifs/${objectif.id}/validate`)
    .set("Authorization", `Bearer ${token}`)
    .expect(400);
});
