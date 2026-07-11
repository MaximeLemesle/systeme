// Coquille de l'app authentifiée : HUD de progression + contenu (Outlet).
import { Link, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../lib/auth";

// Dossard déterministe (1000-9999) dérivé du nom pour la touche « course ».
function bibNumber(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return 1000 + (hash % 9000);
}

export default function Layout() {
  const navigate = useNavigate();
  const user = getUser();

  function logout() {
    clearSession();
    navigate("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 overflow-hidden bg-[#1c1410]">
        {/* Bandes diagonales terracotta + voile sombre (motif dossard) */}
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg,#c8532f 0 26px, transparent 26px 52px)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(90deg,#1c1410 38%, rgba(28,20,16,0.85) 62%, rgba(28,20,16,0.3))",
          }}
        />
        <div className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link to="/" className="group flex items-center gap-3.5">
            {/* Badge XP incliné avec ombre portée dorée */}
            <span
              className="flex h-[46px] w-[46px] items-center justify-center bg-[#c8532f] transition group-hover:-translate-y-0.5"
              style={{ transform: "skewX(-8deg)", boxShadow: "3px 3px 0 #ffd98a" }}
            >
              <span
                className="font-display text-[22px] tracking-wide text-white"
                style={{ transform: "skewX(8deg)" }}
              >
                XP
              </span>
            </span>
            <span className="leading-tight">
              <span className="font-display block text-[22px] uppercase tracking-[0.06em] text-white">
                Running Club
              </span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ffb27a]">
                Coach running <span className="hidden sm:inline">·&nbsp; Saison 04</span>
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {user && (
              <span className="flex items-center gap-2.5 rounded-[3px] border border-white/[0.18] bg-white/[0.08] py-[7px] pl-[7px] pr-4">
                <span
                  className="flex h-[30px] w-[30px] items-center justify-center bg-[#ffd98a] font-display text-[15px] text-[#3a2600]"
                  style={{ transform: "rotate(-4deg)" }}
                >
                  {user.username?.slice(0, 1)?.toUpperCase() || "J"}
                </span>
                <span className="text-[13px] font-bold text-white">
                  <span className="hidden uppercase sm:inline">{user.username}</span>
                  <span className="hidden font-semibold text-[#ffb27a] md:inline">
                    {" — Dossard Nº "}{bibNumber(user.username)}
                  </span>
                </span>
              </span>
            )}
            <button
              onClick={logout}
              className="rounded-[3px] border border-white/25 px-4 py-2 text-xs font-bold uppercase tracking-[0.04em] text-white/65 transition hover:border-white/50 hover:text-white"
            >
              Déconnexion
            </button>
          </div>
        </div>
        {/* Bande dorée pointillée façon ligne de course */}
        <div
          className="relative h-[5px]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg,#ffd98a 0 22px, transparent 22px 44px)",
          }}
        />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
