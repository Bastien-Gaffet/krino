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
  type Media,
  type PermissionEtat,
  ETAT_VIDE,
} from "./backend";

const CLE_ETAT = "krino.android.etat";

const PLUGIN = "krino-media";
const cmd = (nom: string) => `plugin:${PLUGIN}|${nom}`;

type PermissionReponse = { etat: PermissionEtat };
type ScanReponse = { medias: Media[] };
type VignetteReponse = { uri: string };
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

  async mettreCorbeille(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    return this.confirmerViaCorbeille(
      ids,
      () => invoke<NombreReponse>(cmd("mettre_corbeille"), { ids }),
      true,
    );
  }

  async listerCorbeille(): Promise<Media[]> {
    return (await invoke<ScanReponse>(cmd("lister_corbeille"))).medias;
  }

  async restaurer(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    return this.confirmerViaCorbeille(
      ids,
      () => invoke<NombreReponse>(cmd("restaurer"), { ids }),
      false,
    );
  }

  async supprimerDefinitivement(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    return this.confirmerViaCorbeille(
      ids,
      () => invoke<NombreReponse>(cmd("supprimer_definitivement"), { ids }),
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
   * que l'app redevient visible) s'est révélé insuffisant à son tour : une
   * testeuse a eu le même blocage indéfini malgré ce correctif, sur un
   * Samsung Android 11, sans qu'aucune erreur ne remonte (voir
   * signalerErreur) — signe que ni le callback natif NI l'évènement
   * `visibilitychange` ne se déclenchent sur cet appareil pour ce dialogue
   * système précis (contrairement à celui de la permission, qui fonctionne).
   * On ajoute donc un filet supplémentaire, indépendant de tout signal du
   * navigateur : une vérification différée dans le temps, qui se déclenche
   * de toute façon même si rien d'autre ne s'est jamais manifesté.
   */
  private async confirmerViaCorbeille(
    ids: string[],
    invoquerNatif: () => Promise<NombreReponse>,
    attendrePresenceEnCorbeille: boolean,
  ): Promise<number> {
    let regle = false;
    const nettoyeurs: Array<() => void> = [];
    const nettoyer = () => {
      regle = true;
      nettoyeurs.forEach((fn) => fn());
    };

    const verifierEtat = async (): Promise<number> => {
      const corbeille = await this.listerCorbeille();
      const dansCorbeille = new Set(corbeille.map((m) => m.id));
      return ids.filter((id) => dansCorbeille.has(id) === attendrePresenceEnCorbeille).length;
    };

    const promesseNative = invoquerNatif()
      .then((r) => r.nombre)
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
    // même — plutôt qu'un chargement bloqué indéfiniment sans recours.
    const promesseDelai = new Promise<number>((resolve) => {
      const id = window.setTimeout(() => {
        if (!regle) void verifierEtat().then(resolve);
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
