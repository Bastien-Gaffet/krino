/**
 * Contrat entre l'interface mobile et la photothèque de l'appareil.
 *
 * C'est la pièce durable de Krino mobile : l'UI ne connaît que cette interface,
 * jamais MediaStore ni PhotoKit. Deux implémentations sont prévues —
 * `BackendDemo` (navigateur, pour prévisualiser l'UI sans appareil) et, à venir,
 * le backend Android adossé au plugin Kotlin MediaStore.
 *
 * Chaque méthode correspond à une opération MediaStore documentée dans
 * `docs/MOBILE.md` ; ne rien ajouter ici qui n'ait pas d'équivalent natif.
 */

/** Un média de la photothèque. */
export type Media = {
  /** Identifiant MediaStore (`_ID`). Clé de l'état de tri. */
  id: string;
  /** Nom de fichier affiché (`DISPLAY_NAME`). */
  nom: string;
  /** URI affichable directement par la WebView (`content://…`). */
  uri: string;
  /** Taille en octets (`SIZE`). */
  taille: number;
  /** Date de prise de vue en ms (`DATE_TAKEN`, déjà extraite de l'EXIF par le système). */
  dateMs: number;
  /** Vrai si le `MIME_TYPE` est une vidéo. */
  video: boolean;
};

/** Décision prise sur un média. `null` = pas encore décidé. */
export type Decision = "garder" | "jeter";

/**
 * Sous-ensemble de `Media` nécessaire pour cibler une opération corbeille.
 *
 * `video` doit voyager avec l'id : côté Android, reconstruire l'URI
 * MediaStore exige de savoir si c'est une image ou une vidéo (collections
 * distinctes) — et interroger ce type côté natif via la collection
 * générique `Files` s'est révélé bloquant sur au moins un appareil réel.
 * L'appelant connaît déjà cette info (elle vient du même scanner()), pas de
 * raison de la lui faire redemander au natif.
 */
export type IdentifiantMedia = Pick<Media, "id" | "video">;

/**
 * État de tri, conservé dans le stockage privé de l'application.
 *
 * Contrairement au desktop — où `etat.json` vit dans le dossier trié pour
 * « voyager avec lui » — il n'y a pas de dossier sur mobile : l'état est
 * indexé par identifiant MediaStore.
 */
export type Etat = {
  decisions: Record<string, Decision>;
  /** Clés de mois (`AAAA-MM`) déjà validés. */
  moisFaits: string[];
};

/**
 * Résultat d'une demande d'accès à la photothèque.
 *
 * `partielle` correspond à `READ_MEDIA_VISUAL_USER_SELECTED` (Android 14+) :
 * l'utilisateur n'a autorisé qu'une sélection de photos, ce qui casse le modèle
 * « je trie toute ma photothèque » — l'UI doit l'expliquer, pas l'ignorer.
 */
export type PermissionEtat = "accordee" | "partielle" | "refusee";

export interface Backend {
  /** Nom court de l'implémentation, affiché en mode démo. */
  readonly nom: string;

  /** Vrai si la photothèque est accessible sans nouvelle demande. */
  permission(): Promise<PermissionEtat>;

  /** Déclenche la demande d'accès système. */
  demanderPermission(): Promise<PermissionEtat>;

  /** Énumère la photothèque (hors éléments déjà à la corbeille). */
  scanner(): Promise<Media[]>;

  /**
   * URL affichable d'une vignette d'environ `taille` px, pour les grilles.
   *
   * Android : `ContentResolver.loadThumbnail` — qui remplace à lui seul tout le
   * module `wic` du desktop, puisqu'il décode le HEIC nativement et renvoie une
   * vignette déjà orientée selon l'EXIF.
   */
  vignette(media: Media, taille: number): Promise<string>;

  /**
   * URL de lecture d'une vidéo, pour une vraie lecture dans la carte de tri
   * (pas juste un aperçu figé).
   *
   * Android : un petit serveur HTTP local (127.0.0.1 uniquement) — une URI
   * `content://` assignée directement à une balise `<video>` ne charge rien
   * dans la WebView Android, même limitation de process-isolation que pour
   * les `<img>` (contournée pour celles-ci par un encodage base64 ; une
   * vidéo entière ne tient pas raisonnablement en mémoire de la même façon).
   */
  urlVideo(media: Media): Promise<string>;

  /**
   * Envoie les médias à la corbeille système.
   *
   * Android : `MediaStore.createTrashRequest` — jusqu'à 2000 URIs pour une
   * seule confirmation utilisateur, rétention 30 jours, restaurable.
   * Renvoie le nombre réellement mis à la corbeille (0 si l'utilisateur refuse).
   */
  mettreCorbeille(medias: IdentifiantMedia[]): Promise<number>;

  /** Médias actuellement à la corbeille (`IS_TRASHED = 1`). */
  listerCorbeille(): Promise<Media[]>;

  /** Sort les médias de la corbeille (`IS_TRASHED = 0`). */
  restaurer(medias: IdentifiantMedia[]): Promise<number>;

  /** Suppression irréversible (`MediaStore.createDeleteRequest`). */
  supprimerDefinitivement(medias: IdentifiantMedia[]): Promise<number>;

  lireEtat(): Promise<Etat>;
  ecrireEtat(etat: Etat): Promise<void>;
}

/* Pas de favoris : le but du pré-tri mobile est d'éliminer les photos ratées,
   pas de constituer une collection. Si le besoin revient, passer par
   `MediaStore.createFavoriteRequest` — le favori serait alors celui du système,
   partagé avec Google Photos, et non un marquage interne à l'application. */
export const ETAT_VIDE: Etat = { decisions: {}, moisFaits: [] };

/** Clé de mois `AAAA-MM`, utilisée pour regrouper et pour `Etat.moisFaits`. */
export function cleMois(dateMs: number): string {
  const d = new Date(dateMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Libellé lisible d'une clé de mois, dans la langue active. */
export function libelleMois(cle: string, locale: string): string {
  const [a, m] = cle.split("-").map(Number);
  const libelle = new Date(a, m - 1, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  return libelle.charAt(0).toUpperCase() + libelle.slice(1);
}

/** Formate une taille en octets de façon compacte. */
export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  const unites = ["Ko", "Mo", "Go", "To"];
  let v = octets / 1024;
  let i = 0;
  while (v >= 1024 && i < unites.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${unites[i]}`;
}
