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
    return (await invoke<NombreReponse>(cmd("mettre_corbeille"), { ids })).nombre;
  }

  async listerCorbeille(): Promise<Media[]> {
    return (await invoke<ScanReponse>(cmd("lister_corbeille"))).medias;
  }

  async restaurer(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    return (await invoke<NombreReponse>(cmd("restaurer"), { ids })).nombre;
  }

  async supprimerDefinitivement(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    return (
      await invoke<NombreReponse>(cmd("supprimer_definitivement"), { ids })
    ).nombre;
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
