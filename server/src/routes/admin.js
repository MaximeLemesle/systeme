const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(auth, requireRole("admin"));

router.get("/users", asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      createdAt: true,
      domaines: {
        select: { level: true, totalXp: true, totalMinutes: true },
      },
    },
  });
  res.json(users);
}));

module.exports = router;
