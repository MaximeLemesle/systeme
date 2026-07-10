// Tests du contrôle d'accès par rôle sur /admin.
// L'admin est créé directement en base (comme le ferait le seed) : register force role=user.
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const prisma = require("../src/prisma");

test.after(async () => {
  await prisma.$disconnect();
});

test("GET /admin/users : 401 sans token, 403 pour un user, 200 pour l'admin", async () => {
  // Sans token → 401 (non authentifié).
  await request(app).get("/admin/users").expect(401);

  // User classique via register → 403 (authentifié mais pas autorisé).
  const reg = await request(app)
    .post("/auth/register")
    .send({ username: "coureur-admin-test", email: "coureur@admin.test", password: "secret123" })
    .expect(201);
  assert.equal(reg.body.user.role, "user"); // register ne crée jamais d'admin
  await request(app).get("/admin/users").set("Authorization", `Bearer ${reg.body.token}`).expect(403);

  // Admin seedé en base → login → 200 avec la liste des coureurs.
  await prisma.user.upsert({
    where: { email: "admin@admin.test" },
    update: { role: "admin" },
    create: {
      username: "admin-test",
      email: "admin@admin.test",
      passwordHash: await bcrypt.hash("admin123!", 10),
      role: "admin",
      domaines: { create: { name: "Course à pied" } },
    },
  });
  const login = await request(app)
    .post("/auth/login")
    .send({ email: "admin@admin.test", password: "admin123!" })
    .expect(200);
  assert.equal(login.body.user.role, "admin");

  const res = await request(app)
    .get("/admin/users")
    .set("Authorization", `Bearer ${login.body.token}`)
    .expect(200);
  assert.ok(Array.isArray(res.body));
  const seenUser = res.body.find((u) => u.email === "coureur@admin.test");
  assert.ok(seenUser, "l'admin voit les autres comptes");
  assert.equal(seenUser.role, "user");
  assert.equal(typeof seenUser.level, "number"); // stats de progression agrégées

  // Un admin peut aussi lire les stats globales.
  const stats = await request(app)
    .get("/admin/stats")
    .set("Authorization", `Bearer ${login.body.token}`)
    .expect(200);
  assert.equal(typeof stats.body.users, "number");
});
