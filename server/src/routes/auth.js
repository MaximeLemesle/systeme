// Routes d'authentification : register & login (bcrypt + JWT). Pas de middleware auth ici.
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../prisma");
const { RegisterIn, LoginIn } = require("../validation/schemas");

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

// Ne jamais renvoyer le hash du mot de passe au client.
function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, createdAt: u.createdAt };
}

// POST /auth/register
router.post("/register", async (req, res) => {
  const parsed = RegisterIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { username, email, password } = parsed.data;

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (exists) {
    return res.status(400).json({ error: "Email ou nom d'utilisateur déjà pris" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, email, passwordHash },
  });

  // Domaine unique "Course à pied" auto-provisionné pour démarrer simplement.
  await prisma.domaine.create({
    data: {
      name: "Course à pied",
      description: "Ta progression en course",
      userId: user.id,
    },
  });

  return res.status(201).json({ user: publicUser(user), token: signToken(user.id) });
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const parsed = LoginIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Identifiants invalides" });
  }

  return res.json({ user: publicUser(user), token: signToken(user.id) });
});

module.exports = router;
