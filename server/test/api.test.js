// Tests d'intégration HTTP (supertest) — exécutés sur la base dédiée test.db
// (voir scripts npm : DATABASE_URL=file:./test.db + NODE_ENV=test).
// Couvrent : auth, isolation entre utilisateurs, anti-triche XP, prédiction/recalibrage
// et idempotence de la complétion/validation. Mono-domaine : "Course à pied" auto-créé.
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

// Le domaine "Course à pied" est auto-créé à l'inscription.
async function getDomaine(token) {
  const res = await request(app)
    .get("/domaines")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  return res.body[0];
}

async function createObjectif(token, domaineId, overrides = {}) {
  const res = await request(app)
    .post(`/domaines/${domaineId}/objectifs`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "Courir 5 km sans pause",
      metricLabel: "distance",
      unit: "km",
      targetValue: 5,
      targetDistanceKm: 5,
      difficulty: "moyen",
      ...overrides,
    })
    .expect(201);
  return res.body;
}

// Crée une tâche directement en base (le plan est normalement généré par planGenerator,
// qu'on ne veut pas invoquer dans ces tests d'API pures).
function createTache(objectifId, { templateKey = "vo2_court", estDurationMin = 30 } = {}) {
  return prisma.tache.create({
    data: { title: "Séance test", orderIndex: 1, weekIndex: 1, templateKey, estDurationMin, objectifId },
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

test("register auto-crée le domaine unique 'Course à pied'", async () => {
  const token = await register("mono@test.fr", "mono");
  const res = await request(app).get("/domaines").set("Authorization", `Bearer ${token}`).expect(200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].name, "Course à pied");
});

// -- Isolation entre utilisateurs ---------------------------------------------

test("un utilisateur ne voit pas les ressources d'un autre (404)", async () => {
  const tokenA = await register("alice@test.fr", "alice");
  const tokenB = await register("bob@test.fr", "bob");
  const domaine = await getDomaine(tokenA);
  const objectif = await createObjectif(tokenA, domaine.id);

  await request(app).get(`/domaines/${domaine.id}`).set("Authorization", `Bearer ${tokenB}`).expect(404);
  await request(app).get(`/objectifs/${objectif.id}`).set("Authorization", `Bearer ${tokenB}`).expect(404);
  await request(app)
    .patch(`/objectifs/${objectif.id}/validate`)
    .set("Authorization", `Bearer ${tokenB}`)
    .expect(404);
});

// -- Validation des objectifs de course --------------------------------------

test("créer un objectif sans distance de référence → 400", async () => {
  const token = await register("nodist@test.fr", "nodist");
  const domaine = await getDomaine(token);
  await request(app)
    .post(`/domaines/${domaine.id}/objectifs`)
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Objectif flou", metricLabel: "distance", targetValue: 5 })
    .expect(400);
});

// -- Anti-triche XP -------------------------------------------------------------

test("session libre : durée > 240 min refusée (400)", async () => {
  const token = await register("farm@test.fr", "farmeur");
  const domaine = await getDomaine(token);
  const objectif = await createObjectif(token, domaine.id);

  await request(app)
    .post(`/objectifs/${objectif.id}/sessions`)
    .set("Authorization", `Bearer ${token}`)
    .send({ durationMinutes: 999, difficulty: "difficile" })
    .expect(400);
});

test("session liée à une tâche : la difficulté vient du template, pas du client", async () => {
  const token = await register("derive@test.fr", "derive");
  const domaine = await getDomaine(token);
  const objectif = await createObjectif(token, domaine.id);
  const tache = await createTache(objectif.id, { templateKey: "vo2_court" }); // → difficile ×1.5

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
  const domaine = await getDomaine(token);
  const objectif = await createObjectif(token, domaine.id);
  const tache = await createTache(objectif.id, { templateKey: "ef", estDurationMin: 30 }); // facile ×1.0

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

// -- Prédiction + recalibrage (archétype chrono) --------------------------------

test("logger une perf recalcule la prédiction (Riegel) et recalibre les séances restantes", async () => {
  const token = await register("chrono@test.fr", "chrono");
  const domaine = await getDomaine(token);
  const objectif = await createObjectif(token, domaine.id, {
    title: "Descendre sous les 24 min au 5 km",
    metricLabel: "temps",
    unit: "s",
    targetValue: 24 * 60,
    targetDistanceKm: 5,
    archetype: "chrono",
  });

  // Séance restante avec un spec dont l'allure dépend de la VMA (recalibrable).
  const spec = JSON.stringify({ template: "ef", f: 0.5, durationMin: 30, paceSecPerKm: 360 });
  const remaining = await prisma.tache.create({
    data: {
      title: "EF à venir", orderIndex: 2, weekIndex: 2, templateKey: "ef",
      spec, targetLabel: "30 min à 6:00/km", status: "a_faire", objectifId: objectif.id,
    },
  });

  const res = await request(app)
    .post(`/objectifs/${objectif.id}/sessions`)
    .set("Authorization", `Bearer ${token}`)
    .send({ durationMinutes: 25, difficulty: "difficile", perfDistanceKm: 5, perfDurationSec: 23 * 60 })
    .expect(201);

  assert.equal(res.body.prediction.archetype, "chrono");
  assert.equal(res.body.prediction.currentValue, 23 * 60); // meilleur temps équivalent

  const updated = await prisma.tache.findUnique({ where: { id: remaining.id } });
  assert.notEqual(updated.targetLabel, "30 min à 6:00/km"); // recalibrée
});

// -- Validation d'objectif --------------------------------------------------------

test("valider un objectif donne l'XP une seule fois (2e validation → 400)", async () => {
  const token = await register("valide@test.fr", "valideur");
  const domaine = await getDomaine(token);
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
