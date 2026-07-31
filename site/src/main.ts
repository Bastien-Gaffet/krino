import { renderChart, renderTable, type JourStats } from "./chart";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

function formaterCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

async function chargerEtoilesGitHub() {
  try {
    const rep = await fetch("https://api.github.com/repos/Bastien-Gaffet/krino");
    if (!rep.ok) return;
    const data = await rep.json();
    if (typeof data.stargazers_count === "number") {
      $("#nb-etoiles").textContent = formaterCompact(data.stargazers_count);
    }
  } catch {
    // Pas grave : le lien vers GitHub reste fonctionnel sans le compteur.
  }
}

interface StatsPubliques {
  installations: number;
  photos_revues: number;
  photos_supprimees: number;
}

async function appelerRpc<T>(fonction: string, params: Record<string, unknown> = {}): Promise<T | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const rep = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(params),
    });
    if (!rep.ok) return null;
    return (await rep.json()) as T;
  } catch {
    return null;
  }
}

async function chargerStats() {
  const [totaux, serie] = await Promise.all([
    appelerRpc<StatsPubliques[]>("krino_stats_publiques"),
    appelerRpc<JourStats[]>("krino_serie_quotidienne", { p_jours: 90 }),
  ]);

  if (!totaux || !totaux[0] || !serie) {
    $("#stats-contenu").hidden = true;
    $("#stats-indisponibles").hidden = false;
    return;
  }

  const t = totaux[0];
  $("#kpi-installations").textContent = formaterCompact(t.installations);
  $("#kpi-revues").textContent = formaterCompact(t.photos_revues);
  $("#kpi-supprimees").textContent = formaterCompact(t.photos_supprimees);

  renderChart($("#chart-root"), serie);
  renderTable($("#table-stats"), serie);

  const btnTable = $<HTMLButtonElement>("#btn-table-toggle");
  btnTable.addEventListener("click", () => {
    const tableEl = $("#table-stats");
    const ouvert = !tableEl.hidden;
    tableEl.hidden = ouvert;
    btnTable.setAttribute("aria-expanded", String(!ouvert));
    btnTable.textContent = ouvert ? "Voir les données en tableau" : "Masquer le tableau";
  });
}

void chargerEtoilesGitHub();
void chargerStats();
