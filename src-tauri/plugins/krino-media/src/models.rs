use serde::{Deserialize, Serialize};

/// Un média de la photothèque, tel que renvoyé par MediaStore.
///
/// Les champs correspondent exactement au contrat TypeScript
/// `src/mobile/backend.ts` : toute modification doit être répercutée des deux
/// côtés.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    /// `MediaStore.MediaColumns._ID`, sous forme de chaîne.
    pub id: String,
    /// `DISPLAY_NAME`.
    pub nom: String,
    /// URI `content://` affichable directement par la WebView.
    pub uri: String,
    /// `SIZE`, en octets.
    pub taille: u64,
    /// `DATE_TAKEN` en millisecondes (déjà extrait de l'EXIF par le système).
    pub date_ms: i64,
    /// Vrai si le `MIME_TYPE` désigne une vidéo.
    pub video: bool,
}

/// Résultat d'une demande d'accès à la photothèque.
///
/// `Partielle` correspond à `READ_MEDIA_VISUAL_USER_SELECTED` (Android 14+) :
/// l'utilisateur n'a autorisé qu'une sélection de photos.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PermissionEtat {
    Accordee,
    Partielle,
    Refusee,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SansArgument {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VignetteArgs {
    pub id: String,
    pub taille: u32,
    /// Détermine la collection MediaStore (images ou vidéos) utilisée pour
    /// reconstruire l'URI côté Android — voir le commentaire de `vignette()`
    /// dans le plugin Kotlin.
    pub video: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VignetteReponse {
    /// URI affichable de la vignette.
    pub uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReponse {
    pub medias: Vec<Media>,
}

/// Un média ciblé par une opération corbeille. `video` doit voyager avec
/// l'id : côté Android, reconstruire l'URI MediaStore typée (Images/Video)
/// exige de savoir de quelle collection il s'agit — une requête native pour
/// le retrouver depuis l'id seul s'est révélée bloquante sur au moins un
/// appareil réel (voir le commentaire de `urisDepuisItems` côté Kotlin).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: String,
    pub video: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItemsArgs {
    pub items: Vec<MediaItem>,
}

/// Nombre de médias réellement traités par une opération de corbeille.
///
/// `createTrashRequest`/`createDeleteRequest` sont tout ou rien : une seule
/// confirmation système couvre tous les identifiants, donc ce nombre vaut soit
/// `ids.len()`, soit `0` si l'utilisateur a refusé la boîte de dialogue.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NombreReponse {
    pub nombre: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionReponse {
    pub etat: PermissionEtat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlVideoArgs {
    pub id: String,
}

/// URL `http://127.0.0.1:<port>/video/<id>` du serveur local de streaming
/// vidéo (voir `VideoServer` côté Kotlin) — une URI `content://` ne charge
/// rien dans une balise `<video>` de la WebView Android.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlVideoReponse {
    pub url: String,
}
