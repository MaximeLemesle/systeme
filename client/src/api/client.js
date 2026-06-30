// Wrapper fetch unique : ajoute le JWT, parse le JSON, propage les erreurs API.
import { getToken, clearSession } from "../lib/auth";

const API_BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 15000;
// Appels IA via le modèle local (Ollama) : peuvent durer ~1–2 min, on laisse de la marge.
export const AI_TIMEOUT_MS = 180000;

export async function api(path, { method = "GET", body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // Les appels IA (modèle local) sont lents : on autorise un timeout plus long via timeoutMs.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(
        `L'API ne répond pas (${API_BASE}). Vérifie que le backend est lancé avec "cd server && npm run dev".`
      );
    }
    throw new Error(
      `Impossible de joindre l'API (${API_BASE}). Lance le backend avec "cd server && npm run dev", puis réessaie.`
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    // 401 → session expirée/invalide : on nettoie et on renvoie sur le login.
    if (res.status === 401) {
      clearSession();
      if (!location.pathname.startsWith("/login")) location.href = "/login";
    }
    throw new Error(data.error || `Erreur API ${res.status}. Réessaie dans quelques instants.`);
  }
  return data;
}
