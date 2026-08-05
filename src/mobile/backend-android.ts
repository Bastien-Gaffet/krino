/**
 * Backend Android — adossé au plugin Tauri `krino-media` (MediaStore).
 *
 * Chaque méthode fait un aller-retour vers le Kotlin de
 * `src-tauri/plugins/krino-media/android`. `lireEtat`/`ecrireEtat` sont une
 * exception : ils passent par `localStorage`, qui est déjà le stockage privé
 * de l'application dans la WebView Android — inutile d'ajouter une commande
 * native pour ça (voir le commentaire de `Etat` dans `./backend`).
 */

import { invoke } from "@tauri-apps/api/core";
import {
  type Backend,
  type Etat,
  type IdentifiantMedia,
  type Media,
  type PermissionEtat,
  ETAT_VIDE,
} from "./backend";
import { signalerErreur } from "../telemetrie";

const CLE_ETAT = "krino.android.etat";

const PLUGIN = "krino-media";
const cmd = (nom: string) => `plugin:${PLUGIN}|${nom}`;

type PermissionReponse = { etat: PermissionEtat };
type ScanReponse = { medias: Media[] };
type VignetteReponse = { uri: string };
type UrlVideoReponse = { url: string };
type NombreReponse = { nombre: number };

export class BackendAndroid implements Backend {
  readonly nom = "android";

  async permission(): Promise<PermissionEtat> {
    return (await invoke<PermissionReponse>(cmd("permission"))).etat;
  }

  async demanderPermission(): Promise<PermissionEtat> {
    const etat = (await invoke<PermissionReponse>(cmd("demander_permission"))).etat;
    // Si l'état n'était pas déjà "refusee", demander_permission() n'a fait
    // que relire l'état courant (déjà accordé) sans ouvrir de boîte système
    // — la réponse est donc déjà définitive.
    if (etat !== "refusee") return etat;

    // Sinon, côté Kotlin, demander_permission() a seulement DÉCLENCHÉ la
    // boîte système et répondu tout de suite avec l'état actuel (donc
    // encore "refusee"), sans attendre l'utilisateur : le mécanisme de
    // callback natif de Tauri pour ça s'est révélé peu fiable sur au moins
    // un appareil réel (la promesse restait bloquée indéfiniment, même
    // après une réponse système en bonne et due forme). On réévalue l'état
    // réel via permission() — une commande simple, sans ce mécanisme —
    // quand la page redevient visible, signe que la boîte système vient de
    // se fermer.
    return new Promise<PermissionEtat>((resolve) => {
      const surRetourVisible = () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", surRetourVisible);
        resolve(this.permission());
      };
      document.addEventListener("visibilitychange", surRetourVisible);
    });
  }

  async scanner(): Promise<Media[]> {
    return (await invoke<ScanReponse>(cmd("scanner"))).medias;
  }

  async vignette(media: Media, taille: number): Promise<string> {
    return (
      await invoke<VignetteReponse>(cmd("vignette"), {
        id: media.id,
        taille,
        video: media.video,
      })
    ).uri;
  }

  async urlVideo(media: Media): Promise<string> {
    return (await invoke<UrlVideoReponse>(cmd("url_video"), { id: media.id })).url;
  }

  async mettreCorbeille(medias: IdentifiantMedia[]): Promise<number> {
    if (medias.length === 0) return 0;
    return this.confirmerViaCorbeille(
      medias,
      () => invoke<NombreReponse>(cmd("mettre_corbeille"), { items: medias }),
      true,
    );
  }

  async listerCorbeille(): Promise<Media[]> {
    return (await invoke<ScanReponse>(cmd("lister_corbeille"))).medias;
  }

  async restaurer(medias: IdentifiantMedia[]): Promise<number> {
    if (medias.length === 0) return 0;
    return this.confirmerViaCorbeille(
      medias,
      () => invoke<NombreReponse>(cmd("restaurer"), { items: medias }),
      false,
    );
  }

  async supprimerDefinitivement(medias: IdentifiantMedia[]): Promise<number> {
    if (medias.length === 0) return 0;
    return this.confirmerViaCorbeille(
      medias,
      () => invoke<NombreReponse>(cmd("supprimer_definitivement"), { items: medias }),
      false,
    );
  }

  /**
   * `mettreCorbeille`/`restaurer`/`supprimerDefinitivement` attendent tous
   * une confirmation système (`createTrashRequest`/`createDeleteRequest`)
   * relayée par le callback natif Tauri `@ActivityCallback` — le même
   * mécanisme qui, pour la permission photos (voir `demanderPermission`
   * ci-dessus), s'est révélé bloqué indéfiniment sur au moins un appareil
   * réel malgré une confirmation système en bonne et due forme.
   *
   * Un premier secours (revérifier l'état réel via `listerCorbeille()` dès
   * que l'app redevient visible), puis un filet à délai fixe indépendant de
   * tout signal navigateur, se sont révélés insuffisants à leur tour — même
   * blocage persistant. Cause probable trouvée en relisant le code
   * appelant : `Promise.race` propage un REJET dès que la PREMIÈRE des
   * promesses se règle, qu'elle réussisse ou échoue — si l'appel natif
   * rejette (une vraie erreur, pas juste une lenteur), ce rejet remontait
   * jusqu'à `validerMois()` qui n'avait pas de `try/catch` autour de
   * `await backend.mettreCorbeille(...)` : `chargement(null)` n'était donc
   * jamais atteint, et le voile de chargement restait affiché indéfiniment
   * — indiscernable d'un vrai blocage côté utilisateur, alors qu'aucun des
   * filets ci-dessous n'avait de raison d'agir puisque la promesse s'était
   * déjà réglée (par un rejet). Cette méthode ne doit donc plus jamais
   * rejeter : un échec de l'appel natif est maintenant traité comme un
   * signal de plus qui déclenche la vérification, pas une fin de partie.
   *
   * Reste un cas que rien ci-dessous ne peut couvrir : si l'appel natif
   * bloque le thread principal AVANT même d'atteindre la boîte système
   * (aucune boîte ne s'affiche, aucune erreur ne remonte, et le blocage
   * dépasse largement les délais de secours — confirmé sur un appareil
   * réel), la WebView elle-même se bloque, donc plus aucun `setTimeout` JS
   * ne peut s'exécuter pour nous sauver. La vraie cause trouvée : le côté
   * natif reconstruisait le type (image/vidéo) de chaque média en
   * interrogeant la collection générique `MediaStore.Files` — déjà signalée
   * ailleurs dans ce fichier comme peu fiable sur certains appareils.
   * `medias` porte maintenant `video` (déjà connu côté JS depuis le même
   * scanner()), pour que le natif reconstruise l'URI typée directement,
   * sans requête supplémentaire.
   */
  private async confirmerViaCorbeille(
    medias: IdentifiantMedia[],
    invoquerNatif: () => Promise<NombreReponse>,
    attendrePresenceEnCorbeille: boolean,
  ): Promise<number> {
    const ids = medias.map((m) => m.id);
    let regle = false;
    const nettoyeurs: Array<() => void> = [];
    const nettoyer = () => {
      regle = true;
      nettoyeurs.forEach((fn) => fn());
    };

    // Propre filet de temps : si `lister_corbeille` (l'appel natif utilisé
    // pour vérifier) est lui-même affecté par ce qui bloque le reste, cette
    // vérification ne doit pas non plus pouvoir bloquer indéfiniment.
    const verifierEtat = async (): Promise<number> => {
      try {
        const corbeille = await Promise.race([
          this.listerCorbeille(),
          new Promise<Media[]>((_, reject) =>
            window.setTimeout(() => reject(new Error("délai de vérification dépassé")), 5000),
          ),
        ]);
        const dansCorbeille = new Set(corbeille.map((m) => m.id));
        return ids.filter((id) => dansCorbeille.has(id) === attendrePresenceEnCorbeille).length;
      } catch {
        // Impossible de confirmer l'état réel : mieux vaut débloquer l'écran
        // avec un résultat pessimiste (0 = rien de confirmé) que de rester
        // bloqué indéfiniment.
        return 0;
      }
    };

    const promesseNative = invoquerNatif()
      .then((r) => r.nombre)
      .catch(
        (erreur: unknown) =>
          void signalerErreur(
            `confirmerViaCorbeille : appel natif rejeté (${erreur instanceof Error ? erreur.message : String(erreur)})`,
          ),
      )
      .then((n) => (typeof n === "number" ? n : verifierEtat()))
      .finally(nettoyer);

    const promesseVisibilite = new Promise<number>((resolve) => {
      const surRetourVisible = () => {
        if (regle || document.visibilityState !== "visible") return;
        // Laisse le temps à MediaStore de refléter la confirmation système
        // avant de vérifier — sinon on risque de lire un état pas encore à
        // jour juste après la fermeture de la boîte de dialogue.
        window.setTimeout(() => {
          if (!regle) void verifierEtat().then(resolve);
        }, 800);
      };
      document.addEventListener("visibilitychange", surRetourVisible);
      nettoyeurs.push(() => document.removeEventListener("visibilitychange", surRetourVisible));
    });

    // Filet de dernier recours : si ni le callback natif ni un changement de
    // visibilité ne se sont manifestés après un délai généreux (le temps
    // pour l'utilisateur de répondre à une boîte système), on vérifie quand
    // même — plutôt qu'un chargement bloqué indéfiniment sans recours. On le
    // signale (voir signalerErreur) : si ça se déclenche, ni le callback
    // natif ni visibilitychange n'ont fonctionné sur cet appareil — utile à
    // savoir sans avoir l'appareil en main.
    const promesseDelai = new Promise<number>((resolve) => {
      const id = window.setTimeout(() => {
        if (regle) return;
        void signalerErreur(
          `confirmerViaCorbeille : ni le callback natif ni visibilitychange après 15s (attendrePresence=${attendrePresenceEnCorbeille})`,
        );
        void verifierEtat().then(resolve);
      }, 15000);
      nettoyeurs.push(() => window.clearTimeout(id));
    });

    return Promise.race([promesseNative, promesseVisibilite, promesseDelai]);
  }

  async lireEtat(): Promise<Etat> {
    try {
      const brut = localStorage.getItem(CLE_ETAT);
      return { ...ETAT_VIDE, ...(brut ? (JSON.parse(brut) as Partial<Etat>) : {}) };
    } catch {
      return { ...ETAT_VIDE };
    }
  }

  async ecrireEtat(etat: Etat): Promise<void> {
    localStorage.setItem(CLE_ETAT, JSON.stringify(etat));
  }
}
