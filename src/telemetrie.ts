/* Statistiques d'usage anonymes et optionnelles (activées par défaut,
   désactivables dans Réglages) : nombre de photos passées en revue, nombre
   de photos supprimées, et fait d'installation — pour le graphe public du
   site de Krino. Aucun nom de fichier, chemin de dossier, ni contenu d'image
   n'est jamais lu ou transmis par ce module. Voir docs/CONFIDENTIALITE.md.

   Ce module envoie aussi, sous le même réglage opt-in, des rapports de
   diagnostic technique (modèle d'appareil, version d'OS, version de l'app,
   message d'erreur déjà assaini par l'appelant — jamais de nom de fichier ni
   de chemin) pour pouvoir déboguer des bugs signalés par des testeurs sans
   accès à leur appareil. Voir signalerErreur(). */

const CLE_ANON_ID = "krino-anon-id";
const CLE_ATTENTE = "krino-stats-attente";
const CLE_DERNIER_ENVOI = "krino-stats-dernier-envoi";
const INTERVALLE_MIN_MS = 5 * 60 * 1000;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface Attente {
  revues: number;
  supprimees: number;
}

let activee = true;

/** À appeler au chargement des préférences, et à chaque bascule du réglage. */
export function definirTelemetrieActivee(v: boolean) {
  activee = v;
}

/** Identifiant aléatoire local, jamais relié à une identité. Affiché en
 *  Réglages pour permettre à l'utilisateur de demander la suppression de ses
 *  données côté serveur en le communiquant. */
export function anonId(): string {
  let id = localStorage.getItem(CLE_ANON_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLE_ANON_ID, id);
  }
  return id;
}

function lireAttente(): Attente {
  try {
    return { revues: 0, supprimees: 0, ...JSON.parse(localStorage.getItem(CLE_ATTENTE) ?? "{}") };
  } catch {
    return { revues: 0, supprimees: 0 };
  }
}

function ecrireAttente(a: Attente) {
  localStorage.setItem(CLE_ATTENTE, JSON.stringify(a));
}

export function enregistrerRevue(n = 1) {
  if (!activee || n <= 0) return;
  const a = lireAttente();
  a.revues += n;
  ecrireAttente(a);
}

export function enregistrerSuppression(n: number) {
  if (!activee || n <= 0) return;
  const a = lireAttente();
  a.supprimees += n;
  ecrireAttente(a);
  void envoyerTelemetrie();
}

/** Envoie les compteurs en attente à Supabase (RPC krino_ping), au plus une
 *  fois toutes les INTERVALLE_MIN_MS sauf si force=true. Ne perd jamais rien :
 *  les compteurs ne sont remis à zéro qu'après un envoi réussi. */
export async function envoyerTelemetrie(force = false): Promise<void> {
  if (!activee || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const a = lireAttente();
  if (a.revues === 0 && a.supprimees === 0) return;
  const dernier = Number(localStorage.getItem(CLE_DERNIER_ENVOI) ?? 0);
  if (!force && Date.now() - dernier < INTERVALLE_MIN_MS) return;

  const jour = new Date().toISOString().slice(0, 10);
  try {
    const rep = await fetch(`${SUPABASE_URL}/rest/v1/rpc/krino_ping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        p_anon_id: anonId(),
        p_jour: jour,
        p_revues: a.revues,
        p_supprimees: a.supprimees,
      }),
    });
    if (!rep.ok) return; // on retentera au prochain appel ; rien n'est perdu localement
    ecrireAttente({ revues: 0, supprimees: 0 });
    localStorage.setItem(CLE_DERNIER_ENVOI, String(Date.now()));
  } catch {
    // Hors ligne ou réseau indisponible : les compteurs restent en attente.
  }
}

/** Réinitialise l'identifiant anonyme et les compteurs en attente (bouton
 *  Réglages « Réinitialiser mes statistiques »). Une réinstallation ou un
 *  clic sur ce bouton compteront comme une nouvelle installation côté serveur. */
export function reinitialiserTelemetrie() {
  localStorage.removeItem(CLE_ANON_ID);
  localStorage.removeItem(CLE_ATTENTE);
  localStorage.removeItem(CLE_DERNIER_ENVOI);
}

const MAX_DIAGNOSTICS_SESSION = 20;
const diagnosticsEnvoyes = new Set<string>();
const CLE_DERNIER_PING_APPAREIL = "krino-appareil-dernier-ping";
const INTERVALLE_PING_APPAREIL_MS = 24 * 60 * 60 * 1000;

/** Modèle d'appareil + version d'OS, lus depuis le user-agent de la WebView
 *  Android (ex. "Mozilla/5.0 (Linux; Android 13; SM-G991B) ..."). Aucune
 *  commande native dédiée : cette info y est déjà, pas besoin d'y toucher. */
function infosAppareil(): { appareil: string; os: string } {
  const m = navigator.userAgent.match(/Android\s([\d.]+);\s*([^)]+)\)/);
  return { os: m?.[1] ?? "?", appareil: (m?.[2] ?? "?").trim() };
}

/** Signale la présence de cet appareil (une fois par jour maximum), pour
 *  connaître la population totale par OS/modèle — sans ça, la page d'admin
 *  ne verrait que les appareils qui plantent, impossible de savoir si une
 *  plateforme est réellement plus fragile ou juste plus utilisée. À appeler
 *  une fois au démarrage, indépendamment de toute activité de l'utilisateur. */
export async function enregistrerAppareil(versionApp: string): Promise<void> {
  if (!activee || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const dernier = Number(localStorage.getItem(CLE_DERNIER_PING_APPAREIL) ?? 0);
  if (Date.now() - dernier < INTERVALLE_PING_APPAREIL_MS) return;

  const { appareil, os } = infosAppareil();
  try {
    const rep = await fetch(`${SUPABASE_URL}/rest/v1/rpc/krino_appareil`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        p_anon_id: anonId(),
        p_appareil: appareil,
        p_os: os,
        p_version_app: versionApp,
      }),
    });
    if (!rep.ok) return;
    localStorage.setItem(CLE_DERNIER_PING_APPAREIL, String(Date.now()));
  } catch {
    // Hors ligne : on retentera au prochain démarrage.
  }
}

/** Envoie un rapport de diagnostic technique (best-effort, jamais de retry
 *  pour ne pas boucler sur une erreur réseau). Dédupliqué par message exact
 *  et plafonné par session : une erreur qui se répète pendant qu'un
 *  utilisateur navigue ne doit pas inonder la table. `message` doit déjà
 *  être assaini par l'appelant (aucun nom de fichier, aucun chemin). */
export async function signalerErreur(message: string, versionApp: string): Promise<void> {
  if (!activee || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  if (diagnosticsEnvoyes.has(message) || diagnosticsEnvoyes.size >= MAX_DIAGNOSTICS_SESSION) return;
  diagnosticsEnvoyes.add(message);

  const { appareil, os } = infosAppareil();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/krino_diagnostic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        p_anon_id: anonId(),
        p_appareil: appareil,
        p_os: os,
        p_version_app: versionApp,
        p_message: message.slice(0, 500),
      }),
    });
  } catch {
    // Hors ligne ou réseau indisponible : tant pis pour ce rapport, pas de retry.
  }
}
