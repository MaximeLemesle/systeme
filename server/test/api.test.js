const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/prisma");
const { TEST_PASSWORD, TEST_RUNNERS, seedTestRunners } = require("../prisma/seed");

let accountIndex = 0;

async function register(prefix = "runner", extra = {}) {
  accountIndex += 1;
  const response = await request(app)
    .post("/auth/register")
    .send({
      username: `${prefix}-${accountIndex}`,
      email: `${prefix}-${accountIndex}@test.local`,
      password: "secret123",
      ...extra,
    })
    .expect(201);
  const domaines = await request(app)
    .get("/domaines")
    .set("Authorization", `Bearer ${response.body.token}`)
    .expect(200);
  return { ...response.body, domaine: domaines.body[0] };
}

async function createObjectif(account, overrides = {}) {
  const response = await request(app)
    .post(`/domaines/${account.domaine.id}/objectifs`)
    .set("Authorization", `Bearer ${account.token}`)
    .send({
      title: "Courir 5 km en moins de 25 minutes",
      metricLabel: "distance",
      unit: "km",
      targetValue: 5,
      targetDistanceKm: 5,
      targetTimeSeconds: 1500,
      difficulty: "moyen",
      niveau: "débutant",
      objectiveType: "chrono",
      trainingFrequency: 2,
      planWeeks: 5,
      ...overrides,
    })
    .expect(201);
  return response.body;
}

async function generatePlan(account, objectifId) {
  return request(app)
    .post(`/objectifs/${objectifId}/taches/generate`)
    .set("Authorization", `Bearer ${account.token}`)
    .expect(201);
}

test.before(async () => {
  await prisma.user.deleteMany();
});

test.after(async () => {
  await prisma.$disconnect();
});

test("le healthcheck répond et les routes privées exigent un JWT", async () => {
  const health = await request(app).get("/health").expect(200);
  assert.deepEqual(health.body, { ok: true });
  await request(app).get("/domaines").expect(401);
  await request(app).get("/domaines").set("Authorization", "Bearer invalide").expect(401);
});

test("l'inscription force le rôle user et crée le domaine Course à pied", async () => {
  const account = await register("public", { role: "admin" });
  assert.equal(account.user.role, "user");
  assert.equal(account.user.passwordHash, undefined);
  assert.equal(account.domaine.name, "Course à pied");

  const login = await request(app)
    .post("/auth/login")
    .send({ email: account.user.email, password: "secret123" })
    .expect(200);
  assert.ok(login.body.token);
  await request(app)
    .post("/auth/login")
    .send({ email: account.user.email, password: "incorrect" })
    .expect(401);
});

test("les comptes de test seedés sont idempotents et immédiatement utilisables", async () => {
  await seedTestRunners();
  await seedTestRunners();

  for (const expected of TEST_RUNNERS) {
    const login = await request(app)
      .post("/auth/login")
      .send({ email: expected.email, password: TEST_PASSWORD })
      .expect(200);
    assert.equal(login.body.user.username, expected.username);
    assert.equal(login.body.user.role, "user");

    const domaines = await request(app)
      .get("/domaines")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    assert.equal(domaines.body.length, 1);

    const progression = await request(app)
      .get(`/domaines/${domaines.body[0].id}/progression`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    assert.equal(progression.body.objectifActif.title, expected.objectif.title);
    assert.equal(progression.body.objectifActif.niveau, expected.objectif.niveau);
  }
});

test("la route admin refuse un user et accepte un JWT admin", async () => {
  const account = await register("admin-check");
  await request(app)
    .get("/admin/users")
    .set("Authorization", `Bearer ${account.token}`)
    .expect(403);

  await prisma.user.update({ where: { id: account.user.id }, data: { role: "admin" } });
  const login = await request(app)
    .post("/auth/login")
    .send({ email: account.user.email, password: "secret123" })
    .expect(200);
  const users = await request(app)
    .get("/admin/users")
    .set("Authorization", `Bearer ${login.body.token}`)
    .expect(200);
  assert.ok(users.body.length >= TEST_RUNNERS.length);
  assert.equal(users.body[0].passwordHash, undefined);
});

test("les ressources d'un autre coureur restent invisibles", async () => {
  const owner = await register("owner");
  const stranger = await register("stranger");
  const objectif = await createObjectif(owner);

  await request(app)
    .get(`/domaines/${owner.domaine.id}`)
    .set("Authorization", `Bearer ${stranger.token}`)
    .expect(404);
  await request(app)
    .get(`/objectifs/${objectif.id}`)
    .set("Authorization", `Bearer ${stranger.token}`)
    .expect(404);
});

test("un seul objectif peut être actif puis il peut être abandonné", async () => {
  const account = await register("lifecycle");
  const objectif = await createObjectif(account);
  await request(app)
    .post(`/domaines/${account.domaine.id}/objectifs`)
    .set("Authorization", `Bearer ${account.token}`)
    .send({ title: "Autre objectif", metricLabel: "distance", unit: "km", targetValue: 10 })
    .expect(409);

  await request(app)
    .patch(`/objectifs/${objectif.id}/abandon`)
    .set("Authorization", `Bearer ${account.token}`)
    .expect(200);
  await createObjectif(account, { title: "Nouvel objectif après abandon" });
});

test("le plan est déterministe, borné et réutilisé sans appeler l'IA", async () => {
  const account = await register("plan");
  const objectif = await createObjectif(account);
  const generated = await generatePlan(account, objectif.id);

  assert.equal(generated.body.taches.length, 10);
  assert.deepEqual(generated.body.taches.map((tache) => tache.orderIndex), [1,2,3,4,5,6,7,8,9,10]);
  assert.ok(generated.body.taches.every((tache) => tache.weekIndex >= 1 && tache.weekIndex <= 5));
  assert.ok(generated.body.taches.every((tache) => tache.isAiGenerated === false));
  assert.ok(generated.body.taches.every((tache) => tache.intensityPercent > 0));

  const reused = await request(app)
    .post(`/objectifs/${objectif.id}/taches/generate`)
    .set("Authorization", `Bearer ${account.token}`)
    .expect(200);
  assert.equal(reused.body.reused, true);
  assert.equal(reused.body.taches.length, 10);
});

test("la complétion est ordonnée, anti-triche, prédictive et idempotente", async () => {
  const account = await register("complete");
  const objectif = await createObjectif(account);
  const generated = await generatePlan(account, objectif.id);
  const [first, second] = generated.body.taches;
  const secondDurationBefore = second.estDurationMin;

  await request(app)
    .post(`/taches/${second.id}/complete`)
    .set("Authorization", `Bearer ${account.token}`)
    .send({ durationMinutes: 25 })
    .expect(400);

  const completed = await request(app)
    .post(`/taches/${first.id}/complete`)
    .set("Authorization", `Bearer ${account.token}`)
    .send({
      durationMinutes: 25,
      distanceKm: 5,
      timeSeconds: 1500,
      selfRating: 1,
      xpEarned: 99999,
      difficulty: "difficile",
    })
    .expect(201);
  assert.equal(completed.body.xpEarned, 50);
  assert.equal(completed.body.session.difficulty, "facile");
  assert.equal(completed.body.predictionSeconds, 1500);
  assert.equal(completed.body.adjustedTasks, 9);

  await request(app)
    .post(`/taches/${first.id}/complete`)
    .set("Authorization", `Bearer ${account.token}`)
    .send({ durationMinutes: 25 })
    .expect(400);

  const detail = await request(app)
    .get(`/objectifs/${objectif.id}`)
    .set("Authorization", `Bearer ${account.token}`)
    .expect(200);
  assert.equal(detail.body.predictionSeconds, 1500);
  assert.ok(detail.body.taches[1].estDurationMin < secondDurationBefore);
  assert.equal(detail.body.domaine.totalXp, 50);

  const feedback = await request(app)
    .post(`/sessions/${completed.body.session.id}/feedback`)
    .set("Authorization", `Bearer ${account.token}`)
    .send({ notes: "Séance exigeante" })
    .expect(201);
  assert.equal(feedback.body.bonusXp, 25);
  await request(app)
    .post(`/sessions/${completed.body.session.id}/feedback`)
    .set("Authorization", `Bearer ${account.token}`)
    .send({ notes: "Doublon" })
    .expect(400);
});

test("un objectif ne peut être validé qu'après toutes les séances et ne récompense qu'une fois", async () => {
  const account = await register("validate");
  const objectif = await createObjectif(account);
  const generated = await generatePlan(account, objectif.id);

  await request(app)
    .patch(`/objectifs/${objectif.id}/validate`)
    .set("Authorization", `Bearer ${account.token}`)
    .expect(400);

  for (const tache of generated.body.taches) {
    await request(app)
      .post(`/taches/${tache.id}/complete`)
      .set("Authorization", `Bearer ${account.token}`)
      .send({})
      .expect(201);
  }

  const validated = await request(app)
    .patch(`/objectifs/${objectif.id}/validate`)
    .set("Authorization", `Bearer ${account.token}`)
    .expect(200);
  assert.equal(validated.body.objectif.status, "valide");
  assert.equal(validated.body.xpEarned, 1000);
  await request(app)
    .patch(`/objectifs/${objectif.id}/validate`)
    .set("Authorization", `Bearer ${account.token}`)
    .expect(400);
});

test("une session libre ignore la difficulté et l'XP envoyées par le client", async () => {
  const account = await register("free-session");
  const objectif = await createObjectif(account);
  const response = await request(app)
    .post(`/objectifs/${objectif.id}/sessions`)
    .set("Authorization", `Bearer ${account.token}`)
    .send({ durationMinutes: 40, difficulty: "difficile", xpEarned: 99999 })
    .expect(201);
  assert.equal(response.body.xpEarned, 100);
  assert.equal(response.body.session.difficulty, "moyen");
});

test("l'intake refuse une conversation trop longue avant tout appel Ollama", async () => {
  const account = await register("intake-limit");
  const messages = Array.from({ length: 26 }, (_, index) => ({
    role: index % 2 === 0 ? "assistant" : "user",
    content: `Message ${index + 1}`,
  }));
  await request(app)
    .post("/ai/objectifs/intake")
    .set("Authorization", `Bearer ${account.token}`)
    .send({ messages })
    .expect(400);
});
