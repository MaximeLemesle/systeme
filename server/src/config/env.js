const { z } = require("zod");

require("dotenv").config();

const EnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),
    JWT_SECRET: z.string().min(1, "JWT_SECRET est requis"),
    AI_PROVIDER: z.enum(["ollama", "mistral"]).default("ollama"),
    OLLAMA_URL: z.string().url("OLLAMA_URL doit être une URL valide").default("http://localhost:11434"),
    OLLAMA_MODEL: z.string().min(1).default("mistral"),
    MISTRAL_API_KEY: z.string().optional().default(""),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().min(1).default("127.0.0.1"),
    NODE_ENV: z.string().optional().default("development"),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === "mistral" && !env.MISTRAL_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MISTRAL_API_KEY"],
        message: "MISTRAL_API_KEY est requis quand AI_PROVIDER=mistral",
      });
    }
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
