/* Graphe SVG fait main (2 séries), sans dépendance externe.
   Suit le skill dataviz : palette catégorielle validée, marks-and-anatomy,
   crosshair + tooltip, légende systématique, table de repli accessible. */

export interface JourStats {
  jour: string; // YYYY-MM-DD
  photos_revues: number;
  photos_supprimees: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const LARGEUR = 800;
const HAUTEUR = 320;
const MARGE = { haut: 20, droite: 64, bas: 34, gauche: 44 };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

function formaterCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function formaterDate(jour: string): string {
  const d = new Date(`${jour}T00:00:00`);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Arrondit à un pas « propre » (1/2/5 × 10^n) pour les ticks de l'axe Y. */
function ticksPropres(max: number, nb = 4): number[] {
  if (max <= 0) return [0];
  const pasBrut = max / nb;
  const magnitude = 10 ** Math.floor(Math.log10(pasBrut));
  const candidats = [1, 2, 5, 10].map((m) => m * magnitude);
  const pas = candidats.find((c) => c >= pasBrut) ?? candidats[candidats.length - 1];
  const ticks: number[] = [];
  for (let v = 0; v <= max + pas; v += pas) ticks.push(Math.round(v));
  return ticks;
}

export function renderChart(racine: HTMLElement, serie: JourStats[]): void {
  racine.textContent = "";
  if (serie.length === 0) return;

  const largeurTrace = LARGEUR - MARGE.gauche - MARGE.droite;
  const hauteurTrace = HAUTEUR - MARGE.haut - MARGE.bas;
  const maxValeur = Math.max(1, ...serie.map((j) => Math.max(j.photos_revues, j.photos_supprimees)));
  const ticks = ticksPropres(maxValeur);
  const plafond = ticks[ticks.length - 1];

  const x = (i: number) => MARGE.gauche + (serie.length === 1 ? 0 : (i / (serie.length - 1)) * largeurTrace);
  const y = (v: number) => MARGE.haut + hauteurTrace - (v / plafond) * hauteurTrace;

  const svg = el("svg", { viewBox: `0 0 ${LARGEUR} ${HAUTEUR}`, role: "presentation" });

  // Grille horizontale + ticks Y
  for (const t of ticks) {
    const ligne = el("line", {
      x1: MARGE.gauche, x2: LARGEUR - MARGE.droite, y1: y(t), y2: y(t),
      stroke: "var(--gridline)", "stroke-width": 1,
    });
    svg.appendChild(ligne);
    const label = el("text", {
      x: MARGE.gauche - 8, y: y(t) + 3, "text-anchor": "end",
      fill: "var(--text-muted)", "font-size": 11,
    });
    label.textContent = formaterCompact(t);
    svg.appendChild(label);
  }

  // Ligne de base + ticks X (premier, milieu, dernier jour)
  const indexTicksX = serie.length > 1 ? [0, Math.floor((serie.length - 1) / 2), serie.length - 1] : [0];
  for (const i of new Set(indexTicksX)) {
    const label = el("text", {
      x: x(i), y: HAUTEUR - MARGE.bas + 18, "text-anchor": i === 0 ? "start" : i === serie.length - 1 ? "end" : "middle",
      fill: "var(--text-muted)", "font-size": 11,
    });
    label.textContent = formaterDate(serie[i].jour);
    svg.appendChild(label);
  }

  const series: { cle: keyof JourStats; couleur: string; nom: string }[] = [
    { cle: "photos_revues", couleur: "var(--series-1)", nom: "Photos passées en revue" },
    { cle: "photos_supprimees", couleur: "var(--series-2)", nom: "Photos supprimées" },
  ];

  for (const s of series) {
    const points = serie.map((j, i) => `${x(i)},${y(j[s.cle] as number)}`).join(" ");
    svg.appendChild(el("polyline", {
      points, fill: "none", stroke: s.couleur, "stroke-width": 2,
      "stroke-linejoin": "round", "stroke-linecap": "round",
    }));

    // Marqueur + étiquette directe en bout de ligne
    const dernier = serie[serie.length - 1];
    const cx = x(serie.length - 1);
    const cy = y(dernier[s.cle] as number);
    svg.appendChild(el("circle", { cx, cy, r: 4, fill: s.couleur, stroke: "var(--surface-1)", "stroke-width": 2 }));
    const label = el("text", {
      x: cx + 8, y: cy + 4, fill: "var(--text-primary)", "font-size": 12, "font-weight": 600,
    });
    label.textContent = formaterCompact(dernier[s.cle] as number);
    svg.appendChild(label);
  }

  // Crosshair (masqué par défaut)
  const crosshair = el("line", {
    x1: 0, x2: 0, y1: MARGE.haut, y2: HAUTEUR - MARGE.bas,
    stroke: "var(--baseline)", "stroke-width": 1, visibility: "hidden",
  });
  svg.appendChild(crosshair);

  const enveloppe = document.createElement("div");
  enveloppe.style.position = "relative";
  enveloppe.appendChild(svg);

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.hidden = true;
  enveloppe.appendChild(tooltip);

  function afficherTooltip(i: number, clientX: number, clientY: number) {
    const j = serie[i];
    tooltip.textContent = "";
    const date = document.createElement("div");
    date.className = "tooltip-date";
    date.textContent = formaterDate(j.jour);
    tooltip.appendChild(date);
    for (const s of series) {
      const ligne = document.createElement("div");
      ligne.className = "tooltip-ligne";
      const cle = document.createElement("span");
      cle.className = "chart-legende-trait";
      cle.style.background = s.couleur;
      const nom = document.createElement("span");
      nom.textContent = s.nom;
      const valeur = document.createElement("span");
      valeur.className = "tooltip-valeur";
      valeur.textContent = String(j[s.cle]);
      ligne.append(cle, nom, valeur);
      tooltip.appendChild(ligne);
    }
    const rect = enveloppe.getBoundingClientRect();
    tooltip.style.left = `${clientX - rect.left}px`;
    tooltip.style.top = `${clientY - rect.top}px`;
    tooltip.hidden = false;
    crosshair.setAttribute("x1", String(x(i)));
    crosshair.setAttribute("x2", String(x(i)));
    crosshair.setAttribute("visibility", "visible");
  }
  function cacherTooltip() {
    tooltip.hidden = true;
    crosshair.setAttribute("visibility", "hidden");
  }

  function indexLePlusProche(clientX: number): number {
    const rect = svg.getBoundingClientRect();
    const posSvg = ((clientX - rect.left) / rect.width) * LARGEUR;
    let meilleur = 0, meilleureDist = Infinity;
    for (let i = 0; i < serie.length; i++) {
      const d = Math.abs(x(i) - posSvg);
      if (d < meilleureDist) { meilleureDist = d; meilleur = i; }
    }
    return meilleur;
  }

  svg.setAttribute("tabindex", "0");
  svg.addEventListener("pointermove", (e) => afficherTooltip(indexLePlusProche(e.clientX), e.clientX, e.clientY));
  svg.addEventListener("pointerleave", cacherTooltip);
  let indexFocus = serie.length - 1;
  svg.addEventListener("focus", () => {
    const rect = svg.getBoundingClientRect();
    afficherTooltip(indexFocus, rect.left + (x(indexFocus) / LARGEUR) * rect.width, rect.top + HAUTEUR / 2);
  });
  svg.addEventListener("blur", cacherTooltip);
  svg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") indexFocus = Math.max(0, indexFocus - 1);
    else if (e.key === "ArrowRight") indexFocus = Math.min(serie.length - 1, indexFocus + 1);
    else return;
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    afficherTooltip(indexFocus, rect.left + (x(indexFocus) / LARGEUR) * rect.width, rect.top + HAUTEUR / 2);
  });

  racine.appendChild(enveloppe);

  // Légende (toujours présente : 2 séries)
  const legende = document.createElement("div");
  legende.className = "chart-legende";
  for (const s of series) {
    const item = document.createElement("span");
    item.className = "chart-legende-item";
    const trait = document.createElement("span");
    trait.className = "chart-legende-trait";
    trait.style.background = s.couleur;
    const nom = document.createElement("span");
    nom.textContent = s.nom;
    item.append(trait, nom);
    legende.appendChild(item);
  }
  racine.appendChild(legende);
}

/** Table de repli accessible : mêmes données que le graphe, sans interaction requise. */
export function renderTable(racine: HTMLElement, serie: JourStats[]): void {
  racine.textContent = "";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trEntete = document.createElement("tr");
  for (const titre of ["Date", "Photos passées en revue", "Photos supprimées"]) {
    const th = document.createElement("th");
    th.textContent = titre;
    trEntete.appendChild(th);
  }
  thead.appendChild(trEntete);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const j of serie) {
    const tr = document.createElement("tr");
    const tdDate = document.createElement("td");
    tdDate.textContent = formaterDate(j.jour);
    const tdRevues = document.createElement("td");
    tdRevues.textContent = String(j.photos_revues);
    const tdSupprimees = document.createElement("td");
    tdSupprimees.textContent = String(j.photos_supprimees);
    tr.append(tdDate, tdRevues, tdSupprimees);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  racine.appendChild(table);
}
