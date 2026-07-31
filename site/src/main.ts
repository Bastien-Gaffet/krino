import { renderChart, type JourStats } from "./chart";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const reduireMouvement = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function formaterCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/** Anime un compteur de 0 à sa valeur finale (ease-out, ~900ms). */
function animerCompteur(el: HTMLElement, valeurFinale: number, duree = 900) {
  if (reduireMouvement || valeurFinale <= 0) {
    el.textContent = formaterCompact(valeurFinale);
    return;
  }
  const debut = performance.now();
  function etape(maintenant: number) {
    const t = Math.min(1, (maintenant - debut) / duree);
    const ease = 1 - (1 - t) ** 3;
    el.textContent = formaterCompact(Math.round(ease * valeurFinale));
    if (t < 1) requestAnimationFrame(etape);
  }
  requestAnimationFrame(etape);
}

/** « Atteint » : l'élément est visible ou a déjà été dépassé par le défilement.
 *  Volontairement plus large qu'un simple test de visibilité : un saut
 *  instantané (lien d'ancre #fonctionnalites, touche Fin, scroll rapide) peut
 *  faire passer un élément de « pas encore atteint » à « déjà au-dessus du
 *  viewport » sans jamais déclencher d'IntersectionObserver au passage — sans
 *  ce test géométrique, l'élément resterait invisible pour toujours. */
function estAtteint(el: Element): boolean {
  return el.getBoundingClientRect().top < window.innerHeight;
}

/** Réévalue une liste d'éléments à chaque scroll/resize jusqu'à ce qu'ils
 *  aient tous été « atteints », puis appelle `action` pour chacun. */
function surAtteinte(elements: HTMLElement[], action: (el: HTMLElement) => void) {
  let restants = elements;
  function verifier() {
    restants = restants.filter((el) => {
      if (!estAtteint(el)) return true;
      action(el);
      return false;
    });
    if (restants.length === 0) {
      window.removeEventListener("scroll", verifier);
      window.removeEventListener("resize", verifier);
    }
  }
  window.addEventListener("scroll", verifier, { passive: true });
  window.addEventListener("resize", verifier);
  verifier();
}

/** Déclenche animerCompteur() dès que l'élément est atteint par le défilement
 *  (immédiatement s'il y est déjà). */
function compterQuandVisible(el: HTMLElement, valeurFinale: number) {
  if (reduireMouvement) {
    el.textContent = formaterCompact(valeurFinale);
    return;
  }
  surAtteinte([el], (cible) => animerCompteur(cible, valeurFinale));
}

/** Fait apparaître (fondu + léger déplacement) les éléments [data-reveal]
 *  au fur et à mesure du défilement. */
function initialiserRevelations() {
  const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
  if (reduireMouvement) {
    for (const el of elements) el.classList.add("visible");
    return;
  }
  surAtteinte(elements, (el) => el.classList.add("visible"));
}

async function chargerEtoilesGitHub() {
  try {
    const rep = await fetch("https://api.github.com/repos/Bastien-Gaffet/krino");
    if (!rep.ok) return;
    const data = await rep.json();
    if (typeof data.stargazers_count === "number") {
      compterQuandVisible($("#nb-etoiles"), data.stargazers_count);
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
  compterQuandVisible($("#kpi-installations"), t.installations);
  compterQuandVisible($("#kpi-revues"), t.photos_revues);
  compterQuandVisible($("#kpi-supprimees"), t.photos_supprimees);

  renderChart($("#chart-root"), serie);
}

/** Bouton « Partager » : feuille de partage native si disponible (mobile),
 *  sinon menu déroulant avec les principaux réseaux + copie du lien. */
function initialiserPartage() {
  const bouton = $<HTMLButtonElement>("#btn-partager");
  const url = window.location.href;
  const titre = document.title;
  const texte = "Krino — trie tes photos, une décision à la fois. Gratuit et open source.";

  if (navigator.share) {
    bouton.addEventListener("click", () => {
      navigator.share({ title: titre, text: texte, url }).catch(() => {});
    });
    return;
  }

  const menu = $("#partage-menu");
  const liens: Record<string, string> = {
    "partage-x": `https://twitter.com/intent/tweet?text=${encodeURIComponent(texte)}&url=${encodeURIComponent(url)}`,
    "partage-facebook": `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    "partage-linkedin": `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    "partage-reddit": `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(titre)}`,
    "partage-whatsapp": `https://api.whatsapp.com/send?text=${encodeURIComponent(`${texte} ${url}`)}`,
  };
  for (const [id, href] of Object.entries(liens)) {
    const a = document.getElementById(id);
    if (a) a.setAttribute("href", href);
  }

  const fermerMenu = () => {
    menu.hidden = true;
    bouton.setAttribute("aria-expanded", "false");
  };

  bouton.addEventListener("click", () => {
    const etaitOuvert = !menu.hidden;
    menu.hidden = etaitOuvert;
    bouton.setAttribute("aria-expanded", String(!etaitOuvert));
  });
  document.addEventListener("click", (e) => {
    const cible = e.target as Node;
    if (!menu.hidden && !menu.contains(cible) && !bouton.contains(cible)) fermerMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      fermerMenu();
      bouton.focus();
    }
  });

  const btnCopier = $<HTMLButtonElement>("#partage-copier");
  const libelleInitial = btnCopier.textContent;
  btnCopier.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      btnCopier.textContent = "Lien copié !";
      setTimeout(() => { btnCopier.textContent = libelleInitial; }, 1500);
    } catch {
      // Presse-papiers indisponible : le lien reste copiable manuellement depuis la barre d'adresse.
    }
  });
}

initialiserRevelations();
initialiserPartage();
void chargerEtoilesGitHub();
void chargerStats();
