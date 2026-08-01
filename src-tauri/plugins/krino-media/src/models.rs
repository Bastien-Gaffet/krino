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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdsArgs {
    pub ids: Vec<String>,
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
