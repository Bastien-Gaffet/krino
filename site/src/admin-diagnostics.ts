/* Page d'admin, protégée par Supabase Auth (pas un mot de passe côté client :
   les fonctions RPC appelées ici vérifient auth.jwt() côté serveur, voir
   docs/supabase-diagnostic-admin.sql — krino_est_admin()). Aucune dépendance
   externe : juste fetch() vers l'API REST/Auth de Supabase. */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const CLE_SESSION = "krino-admin-session";

interface Session {
  access_token: string;
}

interface TauxLigne {
  categorie: string;
  utilisateurs: number;
  rapports_bugs: number;
  taux: number | null;
}

interface Resume {
  utilisateurs: number;
  rapports_bugs: number;
  appareils_distincts: number;
  os_distincts: number;
}

interface JourBugs {
  jour: string;
  rapports_bugs: number;
}

interface MessageFrequent {
  message: string;
  occurrences: number;
  derniere_fois: string;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

function lireSession(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem(CLE_SESSION) ?? "null");
  } catch {
    return null;
  }
}

function ecrireSession(s: Session | null) {
  if (s) sessionStorage.setItem(CLE_SESSION, JSON.stringify(s));
  else sessionStorage.removeItem(CLE_SESSION);
}

async function connecter(email: string, motDePasse: string): Promise<Session> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Configuration Supabase manquante.");
  const rep = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password: motDePasse }),
  });
  if (!rep.ok) throw new Error("Identifiants refusés.");
  const data = await rep.json();
  return { access_token: data.access_token };
}

async function rpc<T>(nom: string, session: Session, args: Record<string, unknown> = {}): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Configuration Supabase manquante.");
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(args),
  });
  if (!rep.ok) throw new Error(`${nom} a échoué (${rep.status})`);
  return rep.json();
}

function barreLigne(label: string, valeur: number, max: number, classe: string): string {
  const pct = max > 0 ? Math.max(2, Math.round((valeur / max) * 100)) : 0;
  return `
    <div class="admin-barre-ligne">
      <span class="admin-barre-label" title="${label}">${label}</span>
      <div class="admin-barre-piste">
        <div class="admin-barre admin-barre--${classe}" style="width:${pct}%"></div>
      </div>
      <span class="admin-barre-valeur">${valeur}</span>
    </div>`;
}

function rendreTaux(cible: HTMLElement, lignes: TauxLigne[]) {
  if (lignes.length === 0) {
    cible.innerHTML = `<p class="admin-note">Pas encore de données.</p>`;
    return;
  }
  const maxUtilisateurs = Math.max(...lignes.map((l) => l.utilisateurs), 1);
  const maxBugs = Math.max(...lignes.map((l) => l.rapports_bugs), 1);
  cible.innerHTML = lignes
    .map(
      (l) => `
      <div class="admin-groupe">
        <div class="admin-groupe-titre">
          ${l.categorie ?? "?"}
          <span class="admin-taux">${l.taux !== null ? `${(l.taux * 100).toFixed(1)}% de taux de rapport` : ""}</span>
        </div>
        ${barreLigne("Utilisateurs", l.utilisateurs, maxUtilisateurs, "utilisateurs")}
        ${barreLigne("Rapports de bugs", l.rapports_bugs, maxBugs, "bugs")}
      </div>`,
    )
    .join("");
}

function rendreJours(cible: HTMLElement, jours: JourBugs[]) {
  if (jours.length === 0) {
    cible.innerHTML = `<p class="admin-note">Aucun rapport sur cette période.</p>`;
    return;
  }
  const max = Math.max(...jours.map((j) => j.rapports_bugs), 1);
  cible.innerHTML = `
    <div class="admin-colonnes">
      ${jours
        .map((j) => {
          const hauteur = Math.max(2, Math.round((j.rapports_bugs / max) * 100));
          const date = new Date(`${j.jour}T00:00:00`).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
          });
          return `
          <div class="admin-colonne" title="${date} — ${j.rapports_bugs}">
            <div class="admin-colonne-barre" style="height:${hauteur}%"></div>
            <span class="admin-colonne-label">${date}</span>
          </div>`;
        })
        .join("")}
    </div>`;
}

function rendreMessages(cible: HTMLTableSectionElement, lignes: MessageFrequent[]) {
  if (lignes.length === 0) {
    cible.innerHTML = `<tr><td colspan="3" class="admin-note">Aucun rapport pour l'instant.</td></tr>`;
    return;
  }
  cible.innerHTML = lignes
    .map(
      (l) => `
      <tr>
        <td class="admin-message-cellule">${l.message}</td>
        <td>${l.occurrences}</td>
        <td>${new Date(l.derniere_fois).toLocaleString("fr-FR")}</td>
      </tr>`,
    )
    .join("");
}

async function chargerTableauDeBord(session: Session) {
  const [resume, parOs, parMarque, parVersion, parJour, messages] = await Promise.all([
    rpc<Resume[]>("krino_admin_resume", session).then((r) => r[0]),
    rpc<TauxLigne[]>("krino_admin_taux_par_os", session),
    rpc<TauxLigne[]>("krino_admin_taux_par_marque", session),
    rpc<TauxLigne[]>("krino_admin_taux_par_version_app", session),
    rpc<JourBugs[]>("krino_admin_bugs_par_jour", session, { p_jours: 30 }),
    rpc<MessageFrequent[]>("krino_admin_messages_frequents", session, { p_limite: 15 }),
  ]);

  $("#admin-kpis").innerHTML = `
    <div class="admin-kpi"><span class="admin-kpi-valeur">${resume.utilisateurs}</span><span>Appareils connus</span></div>
    <div class="admin-kpi"><span class="admin-kpi-valeur">${resume.rapports_bugs}</span><span>Rapports de bugs</span></div>
    <div class="admin-kpi"><span class="admin-kpi-valeur">${resume.appareils_distincts}</span><span>Modèles distincts</span></div>
    <div class="admin-kpi"><span class="admin-kpi-valeur">${resume.os_distincts}</span><span>Versions Android</span></div>
  `;

  rendreTaux($("#admin-graphe-os"), parOs);
  rendreTaux($("#admin-graphe-marque"), parMarque);
  rendreTaux($("#admin-graphe-version"), parVersion);
  rendreJours($("#admin-graphe-jours"), parJour);
  rendreMessages($("#admin-table-messages tbody"), messages);
}

async function afficherTableau(session: Session) {
  $("#admin-connexion").hidden = true;
  const tableau = $("#admin-tableau");
  tableau.hidden = false;
  try {
    await chargerTableauDeBord(session);
  } catch (e) {
    tableau.hidden = true;
    $("#admin-connexion").hidden = false;
    const erreur = $<HTMLParagraphElement>("#admin-erreur-connexion");
    erreur.textContent =
      e instanceof Error ? e.message : "Session expirée, reconnecte-toi.";
    erreur.hidden = false;
    ecrireSession(null);
  }
}

function demarrer() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    $("#admin-connexion").innerHTML = `<p class="admin-erreur">Configuration Supabase manquante.</p>`;
    return;
  }

  const dejaConnecte = lireSession();
  if (dejaConnecte) void afficherTableau(dejaConnecte);

  $<HTMLFormElement>("#admin-form-connexion").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const erreur = $<HTMLParagraphElement>("#admin-erreur-connexion");
    erreur.hidden = true;
    try {
      const session = await connecter(
        $<HTMLInputElement>("#admin-email").value,
        $<HTMLInputElement>("#admin-mdp").value,
      );
      ecrireSession(session);
      await afficherTableau(session);
    } catch (e) {
      erreur.textContent = e instanceof Error ? e.message : "Connexion impossible.";
      erreur.hidden = false;
    }
  });

  $("#admin-deconnexion").addEventListener("click", () => {
    ecrireSession(null);
    $("#admin-tableau").hidden = true;
    $("#admin-connexion").hidden = false;
  });
}

demarrer();
