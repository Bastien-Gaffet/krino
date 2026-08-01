//! Accès à la photothèque Android (MediaStore) pour le pré-tri Krino.
//!
//! Le frontend ne connaît que l'interface `Backend` de `src/mobile/backend.ts` ;
//! ce plugin en est l'implémentation Android. Sur desktop, toutes les commandes
//! échouent volontairement : le tri par dossier y est assuré par les commandes
//! historiques de `lib.rs`.
//!
//! Périmètre actuel : lecture seule (permission, scan, vignettes). La mise à la
//! corbeille (`createTrashRequest`) demande de traiter un retour d'activité
//! Android et arrive dans un second temps — voir `docs/MOBILE.md`.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

mod error;
mod models;

pub use error::{Error, Result};
pub use models::*;

#[cfg(mobile)]
use tauri::plugin::PluginHandle;

/// Doit correspondre au `package` déclaré dans `android/build.gradle.kts`
/// et à l'emplacement de la classe Kotlin.
#[cfg(target_os = "android")]
const PLUGIN_ANDROID: &str = "app.krino.media";

pub struct KrinoMedia<R: Runtime> {
    #[cfg(mobile)]
    handle: PluginHandle<R>,
    // Sur desktop on conserve l'AppHandle plutôt qu'un PhantomData<R> : l'état
    // géré par Tauri doit être Send + Sync, or PhantomData<R> ferait hériter
    // la structure des traits de R, qui ne les garantit pas.
    #[cfg(not(mobile))]
    _app: tauri::AppHandle<R>,
}

#[cfg(mobile)]
impl<R: Runtime> KrinoMedia<R> {
    pub fn permission(&self) -> Result<PermissionReponse> {
        self.handle
            .run_mobile_plugin("permission", SansArgument {})
            .map_err(Into::into)
    }

    pub fn demander_permission(&self) -> Result<PermissionReponse> {
        self.handle
            .run_mobile_plugin("demanderPermission", SansArgument {})
            .map_err(Into::into)
    }

    pub fn scanner(&self) -> Result<ScanReponse> {
        self.handle
            .run_mobile_plugin("scanner", SansArgument {})
            .map_err(Into::into)
    }

    pub fn vignette(&self, args: VignetteArgs) -> Result<VignetteReponse> {
        self.handle
            .run_mobile_plugin("vignette", args)
            .map_err(Into::into)
    }

    pub fn lister_corbeille(&self) -> Result<ScanReponse> {
        self.handle
            .run_mobile_plugin("listerCorbeille", SansArgument {})
            .map_err(Into::into)
    }

    pub fn mettre_corbeille(&self, args: IdsArgs) -> Result<NombreReponse> {
        self.handle
            .run_mobile_plugin("mettreCorbeille", args)
            .map_err(Into::into)
    }

    pub fn restaurer(&self, args: IdsArgs) -> Result<NombreReponse> {
        self.handle
            .run_mobile_plugin("restaurer", args)
            .map_err(Into::into)
    }

    pub fn supprimer_definitivement(&self, args: IdsArgs) -> Result<NombreReponse> {
        self.handle
            .run_mobile_plugin("supprimerDefinitivement", args)
            .map_err(Into::into)
    }
}

#[cfg(not(mobile))]
impl<R: Runtime> KrinoMedia<R> {
    pub fn permission(&self) -> Result<PermissionReponse> {
        Err(Error::HorsAndroid)
    }

    pub fn demander_permission(&self) -> Result<PermissionReponse> {
        Err(Error::HorsAndroid)
    }

    pub fn scanner(&self) -> Result<ScanReponse> {
        Err(Error::HorsAndroid)
    }

    pub fn vignette(&self, _args: VignetteArgs) -> Result<VignetteReponse> {
        Err(Error::HorsAndroid)
    }

    pub fn lister_corbeille(&self) -> Result<ScanReponse> {
        Err(Error::HorsAndroid)
    }

    pub fn mettre_corbeille(&self, _args: IdsArgs) -> Result<NombreReponse> {
        Err(Error::HorsAndroid)
    }

    pub fn restaurer(&self, _args: IdsArgs) -> Result<NombreReponse> {
        Err(Error::HorsAndroid)
    }

    pub fn supprimer_definitivement(&self, _args: IdsArgs) -> Result<NombreReponse> {
        Err(Error::HorsAndroid)
    }
}

/// Accès au plugin depuis n'importe quel type implémentant `Manager`.
pub trait KrinoMediaExt<R: Runtime> {
    fn krino_media(&self) -> &KrinoMedia<R>;
}

impl<R: Runtime, T: Manager<R>> KrinoMediaExt<R> for T {
    fn krino_media(&self) -> &KrinoMedia<R> {
        self.state::<KrinoMedia<R>>().inner()
    }
}

#[tauri::command]
async fn permission<R: Runtime>(app: tauri::AppHandle<R>) -> Result<PermissionReponse> {
    app.krino_media().permission()
}

#[tauri::command]
async fn demander_permission<R: Runtime>(app: tauri::AppHandle<R>) -> Result<PermissionReponse> {
    app.krino_media().demander_permission()
}

#[tauri::command]
async fn scanner<R: Runtime>(app: tauri::AppHandle<R>) -> Result<ScanReponse> {
    app.krino_media().scanner()
}

#[tauri::command]
async fn vignette<R: Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    taille: u32,
) -> Result<VignetteReponse> {
    app.krino_media().vignette(VignetteArgs { id, taille })
}

#[tauri::command]
async fn lister_corbeille<R: Runtime>(app: tauri::AppHandle<R>) -> Result<ScanReponse> {
    app.krino_media().lister_corbeille()
}

#[tauri::command]
async fn mettre_corbeille<R: Runtime>(
    app: tauri::AppHandle<R>,
    ids: Vec<String>,
) -> Result<NombreReponse> {
    app.krino_media().mettre_corbeille(IdsArgs { ids })
}

#[tauri::command]
async fn restaurer<R: Runtime>(
    app: tauri::AppHandle<R>,
    ids: Vec<String>,
) -> Result<NombreReponse> {
    app.krino_media().restaurer(IdsArgs { ids })
}

#[tauri::command]
async fn supprimer_definitivement<R: Runtime>(
    app: tauri::AppHandle<R>,
    ids: Vec<String>,
) -> Result<NombreReponse> {
    app.krino_media().supprimer_definitivement(IdsArgs { ids })
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("krino-media")
        .invoke_handler(tauri::generate_handler![
            permission,
            demander_permission,
            scanner,
            vignette,
            lister_corbeille,
            mettre_corbeille,
            restaurer,
            supprimer_definitivement
        ])
        .setup(|app, _api| {
            // iOS viendra plus tard, avec un backend PhotoKit distinct.
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin(PLUGIN_ANDROID, "MediaPlugin")?;

            #[cfg(all(mobile, not(target_os = "android")))]
            compile_error!("seul Android est pris en charge pour l'instant");

            #[cfg(mobile)]
            app.manage(KrinoMedia { handle });

            #[cfg(not(mobile))]
            app.manage(KrinoMedia::<R> { _app: app.clone() });

            Ok(())
        })
        .build()
}
