const { z } = require("zod");

require("dotenv").config();

const EnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),
    JWT_SECRET: z.string().min(1, "JWT_SECRET est requis"),
    OLLAMA_URL: z.string().url("OLLAMA_URL doit être une URL valide").default("http://localhost:11434"),
    OLLAMA_MODEL: z.string().min(1).default("llama3.2:3b"),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().min(1).default("127.0.0.1"),
    NODE_ENV: z.string().optional().default("development"),
    // Origines autorisées pour CORS, séparées par des virgules.
    CORS_ORIGIN: z
      .string()
      .default("http://localhost:5173,http://127.0.0.1:5173")
      .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.JWT_SECRET === "change-me") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET doit être changé en production",
      });
    }
  });

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Configuration invalide: ${message}`);
  }
  return parsed.data;
}

const env = loadEnv();

module.exports = { env };
