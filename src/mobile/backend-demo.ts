/**
 * Backend de démonstration — navigateur uniquement.
 *
 * Sert exclusivement à prévisualiser et régler l'interface mobile sans appareil
 * Android ni chaîne de build native. Les photos viennent de picsum.photos (avec
 * une graine, donc toujours les mêmes), l'état est dans le `localStorage`, et la
 * « corbeille » est simulée en mémoire.
 *
 * À SUPPRIMER une fois le backend Android en place : aucun code de production ne
 * doit en dépendre — seule l'interface `Backend` est durable.
 */

import {
  type Backend,
  type Etat,
  type IdentifiantMedia,
  type Media,
  type PermissionEtat,
  ETAT_VIDE,
} from "./backend";

const CLE_ETAT = "krino.demo.etat";
const CLE_CORBEILLE = "krino.demo.corbeille";

/** Répartition des photos de démo : [mois écoulés, nombre de photos]. */
const REPARTITION: [number, number][] = [
  [0, 23],
  [1, 31],
  [2, 12],
  [4, 18],
  [7, 41],
  [11, 7],
];

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function alea(graine: number): () => number {
  let a = graine;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function construireCatalogue(): Media[] {
  const rnd = alea(20260731);
  const medias: Media[] = [];
  let n = 0;

  for (const [moisEcoules, nombre] of REPARTITION) {
    const base = new Date();
    // Se placer au 1er AVANT de reculer : depuis un 31, `setMonth` déborde sur le
    // mois suivant quand le mois visé est plus court (31 juillet - 1 mois = 1er
    // juillet), et deux lots atterrissaient dans le même mois.
    base.setDate(1);
    base.setMonth(base.getMonth() - moisEcoules);

    for (let i = 0; i < nombre; i++) {
      n++;
      // Portrait la plupart du temps : c'est ce qui sort d'un téléphone.
      const portrait = rnd() > 0.28;
      const l = portrait ? 900 : 1400;
      const h = portrait ? 1400 : 900;
      const video = rnd() > 0.9;
      const jour = 1 + Math.floor(rnd() * 27);
      const date = new Date(base.getFullYear(), base.getMonth(), jour, 8 + Math.floor(rnd() * 12));

      medias.push({
        id: `demo-${n}`,
        nom: `${video ? "VID" : "IMG"}_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(jour).padStart(2, "0")}_${String(n).padStart(4, "0")}.${video ? "mp4" : "jpg"}`,
        uri: `https://picsum.photos/seed/krino${n}/${l}/${h}`,
        taille: Math.floor((video ? 18e6 : 1.6e6) + rnd() * (video ? 7e7 : 4e6)),
        dateMs: date.getTime(),
        video,
      });
    }
  }
  return medias;
}

function lireJSON<T>(cle: string, defaut: T): T {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : defaut;
  } catch {
    return defaut;
  }
}

export class BackendDemo implements Backend {
  readonly nom = "démo";
  private catalogue = construireCatalogue();
  private accorde = false;

  async permission(): Promise<PermissionEtat> {
    return this.accorde ? "accordee" : "refusee";
  }

  async demanderPermission(): Promise<PermissionEtat> {
    // Latence volontaire : la vraie demande Android ouvre une boîte système.
    await new Promise((r) => setTimeout(r, 400));
    this.accorde = true;
    return "accordee";
  }

  async scanner(): Promise<Media[]> {
    await new Promise((r) => setTimeout(r, 300));
    const corbeille = new Set(lireJSON<string[]>(CLE_CORBEILLE, []));
    return this.catalogue.filter((m) => !corbeille.has(m.id));
  }

  async vignette(media: Media, taille: number): Promise<string> {
    // picsum sert la même graine dans n'importe quelle dimension : on demande
    // directement un carré, ce qui évite de télécharger la pleine résolution.
    const graine = media.uri.split("/seed/")[1]?.split("/")[0] ?? media.id;
    return `https://picsum.photos/seed/${graine}/${taille}/${taille}`;
  }

  async urlVideo(): Promise<string> {
    // Pas de vrais fichiers vidéo en démo : un clip public de test, juste
    // pour prévisualiser le composant <video> sans appareil Android.
    return "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
  }

  async mettreCorbeille(medias: IdentifiantMedia[]): Promise<number> {
    const corbeille = lireJSON<string[]>(CLE_CORBEILLE, []);
    for (const { id } of medias) if (!corbeille.includes(id)) corbeille.push(id);
    localStorage.setItem(CLE_CORBEILLE, JSON.stringify(corbeille));
    return medias.length;
  }

  async listerCorbeille(): Promise<Media[]> {
    const corbeille = new Set(lireJSON<string[]>(CLE_CORBEILLE, []));
    return this.catalogue.filter((m) => corbeille.has(m.id));
  }

  async restaurer(medias: IdentifiantMedia[]): Promise<number> {
    const ids = new Set(medias.map((m) => m.id));
    const garde = lireJSON<string[]>(CLE_CORBEILLE, []).filter((id) => !ids.has(id));
    localStorage.setItem(CLE_CORBEILLE, JSON.stringify(garde));
    return medias.length;
  }

  async supprimerDefinitivement(medias: IdentifiantMedia[]): Promise<number> {
    // En démo on ne perd rien pour de vrai : on sort juste le média du catalogue.
    const ids = new Set(medias.map((m) => m.id));
    this.catalogue = this.catalogue.filter((m) => !ids.has(m.id));
    return this.restaurer(medias);
  }

  async lireEtat(): Promise<Etat> {
    return { ...ETAT_VIDE, ...lireJSON<Partial<Etat>>(CLE_ETAT, {}) };
  }

  async ecrireEtat(etat: Etat): Promise<void> {
    localStorage.setItem(CLE_ETAT, JSON.stringify(etat));
  }

  /** Remet la démo à zéro (bouton dédié dans l'UI de préview). */
  reinitialiser() {
    localStorage.removeItem(CLE_ETAT);
    localStorage.removeItem(CLE_CORBEILLE);
    this.catalogue = construireCatalogue();
  }
}
