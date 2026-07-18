use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const DOSSIER_ETAT: &str = ".krino";
const FICHIER_ETAT: &str = "etat.json";
const CORBEILLE: &str = "corbeille";

const EXT_IMAGES: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "avif", "heic", "heif",
];
const EXT_VIDEOS: &[&str] = &["mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp"];
/// Formats que la WebView ne sait pas afficher : décodés côté Rust via WIC.
const EXT_WIC: &[&str] = &["heic", "heif", "tif", "tiff"];

#[derive(Serialize)]
struct Media {
    rel: String,
    taille: u64,
    mtime_ms: i64,
    exif_ms: Option<i64>,
    video: bool,
    wic: bool,
}

#[derive(Serialize, Deserialize, Default)]
struct Etat {
    #[serde(default)]
    decisions: HashMap<String, String>, // rel -> "garder" | "jeter"
    #[serde(default)]
    mois_valides: Vec<String>,
    #[serde(default)]
    raccourcis: HashMap<String, String>,
    #[serde(default)]
    source_date: String, // "exif" (défaut) ou "fichier"
    #[serde(default)]
    ordre: Vec<String>, // ordre chronologique des décisions (annulation inter-sessions)
}

fn chemin_etat(racine: &Path) -> PathBuf {
    racine.join(DOSSIER_ETAT).join(FICHIER_ETAT)
}

fn chemin_corbeille(racine: &Path) -> PathBuf {
    racine.join(DOSSIER_ETAT).join(CORBEILLE)
}

/// Date de prise de vue EXIF (DateTimeOriginal, sinon DateTime), en ms epoch.
fn date_exif(chemin: &Path) -> Option<i64> {
    let fichier = fs::File::open(chemin).ok()?;
    let mut lecteur = std::io::BufReader::new(fichier);
    let exif = exif::Reader::new().read_from_container(&mut lecteur).ok()?;
    for tag in [exif::Tag::DateTimeOriginal, exif::Tag::DateTime] {
        if let Some(champ) = exif.get_field(tag, exif::In::PRIMARY) {
            if let exif::Value::Ascii(ref v) = champ.value {
                if let Some(brut) = v.first() {
                    if let Ok(dt) = exif::DateTime::from_ascii(brut) {
                        return Some(epoch_ms(
                            dt.year as i64,
                            dt.month as i64,
                            dt.day as i64,
                            dt.hour as i64,
                            dt.minute as i64,
                            dt.second as i64,
                        ));
                    }
                }
            }
        }
    }
    None
}

/// (année, mois, jour, h, m, s) civil -> epoch ms (algorithme de Howard Hinnant).
fn epoch_ms(annee: i64, mois: i64, jour: i64, h: i64, min: i64, s: i64) -> i64 {
    let a = if mois <= 2 { annee - 1 } else { annee };
    let ere = a.div_euclid(400);
    let yoe = a - ere * 400;
    let mp = if mois > 2 { mois - 3 } else { mois + 9 };
    let doy = (153 * mp + 2) / 5 + jour - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let jours = ere * 146_097 + doe - 719_468;
    ((jours * 86_400) + h * 3600 + min * 60 + s) * 1000
}

/// Scan récursif. L'EXIF est lu en parallèle (rayon) et la progression est
/// envoyée à l'interface via l'événement `scan-progres`.
#[tauri::command]
async fn scanner(fenetre: tauri::Window, racine: String) -> Result<Vec<Media>, String> {
    use rayon::prelude::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tauri::Emitter;

    let racine = PathBuf::from(&racine);
    if !racine.is_dir() {
        return Err("Dossier introuvable".into());
    }

    // 1) Parcours rapide de l'arborescence (métadonnées seules)
    let mut entrees = Vec::new();
    for entree in WalkDir::new(&racine)
        .into_iter()
        .filter_entry(|e| e.file_name().to_string_lossy() != DOSSIER_ETAT)
        .filter_map(|e| e.ok())
    {
        if !entree.file_type().is_file() {
            continue;
        }
        let ext = entree
            .path()
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let video = EXT_VIDEOS.contains(&ext.as_str());
        if !video && !EXT_IMAGES.contains(&ext.as_str()) {
            continue;
        }
        entrees.push((entree.into_path(), ext, video));
    }
    let total = entrees.len();
    let _ = fenetre.emit("scan-progres", (0usize, total));

    // Cache EXIF : rel -> (mtime_ms, taille, exif_ms). Un fichier inchangé
    // (même date, même taille) n'est pas rouvert au rescan.
    type CacheExif = HashMap<String, (i64, u64, Option<i64>)>;
    let chemin_cache = racine.join(DOSSIER_ETAT).join("exif_cache.json");
    let cache: CacheExif = fs::read_to_string(&chemin_cache)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    // 2) Lecture EXIF en parallèle (sauf entrées en cache), avec progression
    let fait = AtomicUsize::new(0);
    let medias: Vec<Media> = entrees
        .par_iter()
        .filter_map(|(chemin, ext, video)| {
            let meta = fs::metadata(chemin).ok()?;
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            let rel = chemin
                .strip_prefix(&racine)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            let exif_ms = if *video {
                None
            } else {
                match cache.get(&rel) {
                    Some(&(m, t, e)) if m == mtime_ms && t == meta.len() => e,
                    _ => date_exif(chemin),
                }
            };
            let n = fait.fetch_add(1, Ordering::Relaxed) + 1;
            if n % 100 == 0 || n == total {
                let _ = fenetre.emit("scan-progres", (n, total));
            }
            Some(Media {
                rel,
                taille: meta.len(),
                mtime_ms,
                exif_ms,
                video: *video,
                wic: EXT_WIC.contains(&ext.as_str()),
            })
        })
        .collect();

    // 3) Réécriture du cache pour le prochain lancement
    let nouveau_cache: CacheExif = medias
        .iter()
        .filter(|m| !m.video)
        .map(|m| (m.rel.clone(), (m.mtime_ms, m.taille, m.exif_ms)))
        .collect();
    if let Ok(json) = serde_json::to_string(&nouveau_cache) {
        let _ = fs::create_dir_all(chemin_cache.parent().unwrap());
        let _ = fs::write(&chemin_cache, json);
    }
    Ok(medias)
}

/// Renvoie le chemin d'une miniature JPEG (320 px) du fichier, générée via WIC
/// et mise en cache dans `.krino/miniatures` — la clé intègre la date de
/// modification, donc un fichier remplacé régénère sa miniature.
#[tauri::command]
async fn miniature(racine: String, rel: String, corbeille: bool) -> Result<String, String> {
    use std::hash::{Hash, Hasher};
    let racine_p = PathBuf::from(&racine);
    let source = if corbeille {
        chemin_corbeille(&racine_p).join(&rel)
    } else {
        racine_p.join(&rel)
    };
    let meta = fs::metadata(&source).map_err(|e| e.to_string())?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut hacheur = std::collections::hash_map::DefaultHasher::new();
    rel.hash(&mut hacheur);
    mtime.hash(&mut hacheur);
    let dossier = racine_p.join(DOSSIER_ETAT).join("miniatures");
    let cible = dossier.join(format!("{:016x}.jpg", hacheur.finish()));
    if !cible.exists() {
        fs::create_dir_all(&dossier).map_err(|e| e.to_string())?;
        wic::generer_miniature(&source.to_string_lossy(), &cible.to_string_lossy(), 320)
            .map_err(|e| format!("miniature : {e}"))?;
    }
    Ok(cible.to_string_lossy().into_owned())
}

#[tauri::command]
fn lire_etat(racine: String) -> Result<Etat, String> {
    let chemin = chemin_etat(Path::new(&racine));
    if !chemin.exists() {
        return Ok(Etat::default());
    }
    let brut = fs::read_to_string(&chemin).map_err(|e| e.to_string())?;
    serde_json::from_str(&brut).map_err(|e| e.to_string())
}

#[tauri::command]
fn ecrire_etat(racine: String, etat: Etat) -> Result<(), String> {
    let chemin = chemin_etat(Path::new(&racine));
    fs::create_dir_all(chemin.parent().unwrap()).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&etat).map_err(|e| e.to_string())?;
    fs::write(&chemin, json).map_err(|e| e.to_string())
}

/// Déplace les fichiers "jeter" d'un mois validé vers la corbeille interne,
/// en préservant leur chemin relatif (restauration possible).
#[tauri::command]
fn valider_mois(racine: String, rels: Vec<String>) -> Result<u32, String> {
    let racine = PathBuf::from(&racine);
    let corbeille = chemin_corbeille(&racine);
    let mut deplaces = 0u32;
    for rel in rels {
        let source = racine.join(&rel);
        if !source.is_file() {
            continue; // déjà déplacé ou disparu
        }
        let dest = corbeille.join(&rel);
        fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::rename(&source, &dest).map_err(|e| format!("{rel} : {e}"))?;
        deplaces += 1;
    }
    Ok(deplaces)
}

#[derive(Serialize)]
struct ElementCorbeille {
    rel: String,
    taille: u64,
    video: bool,
    wic: bool,
}

#[tauri::command]
fn lister_corbeille(racine: String) -> Result<Vec<ElementCorbeille>, String> {
    let corbeille = chemin_corbeille(Path::new(&racine));
    let mut liste = Vec::new();
    if corbeille.is_dir() {
        for e in WalkDir::new(&corbeille).into_iter().filter_map(|e| e.ok()) {
            if !e.file_type().is_file() {
                continue;
            }
            let ext = e
                .path()
                .extension()
                .map(|x| x.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            liste.push(ElementCorbeille {
                rel: e
                    .path()
                    .strip_prefix(&corbeille)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/"),
                taille: e.metadata().map(|m| m.len()).unwrap_or(0),
                video: EXT_VIDEOS.contains(&ext.as_str()),
                wic: EXT_WIC.contains(&ext.as_str()),
            });
        }
    }
    Ok(liste)
}

#[tauri::command]
fn vider_corbeille(racine: String) -> Result<(), String> {
    let corbeille = chemin_corbeille(Path::new(&racine));
    if corbeille.is_dir() {
        fs::remove_dir_all(&corbeille).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Restaure un seul fichier de la corbeille à son emplacement d'origine.
#[tauri::command]
fn restaurer_fichier(racine: String, rel: String) -> Result<(), String> {
    let racine = PathBuf::from(&racine);
    let source = chemin_corbeille(&racine).join(&rel);
    let dest = racine.join(&rel);
    if dest.exists() {
        return Err("Un fichier existe déjà à l'emplacement d'origine".into());
    }
    fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::rename(&source, &dest).map_err(|e| e.to_string())
}

/// Restaure tout le contenu de la corbeille à son emplacement d'origine.
#[tauri::command]
fn restaurer_corbeille(racine: String) -> Result<u32, String> {
    let racine = PathBuf::from(&racine);
    let corbeille = chemin_corbeille(&racine);
    let mut restaures = 0u32;
    if corbeille.is_dir() {
        for e in WalkDir::new(&corbeille).into_iter().filter_map(|e| e.ok()) {
            if !e.file_type().is_file() {
                continue;
            }
            let rel = e.path().strip_prefix(&corbeille).unwrap().to_path_buf();
            let dest = racine.join(&rel);
            fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
            if !dest.exists() {
                fs::rename(e.path(), &dest).map_err(|e| e.to_string())?;
                restaures += 1;
            }
        }
        let _ = fs::remove_dir_all(&corbeille);
    }
    Ok(restaures)
}

/// Décode une image non affichable par la WebView (HEIC, TIFF…) via
/// Windows Imaging Component et la renvoie en data-URL PNG.
/// Nécessite l'« Extension d'image HEIF » du Microsoft Store pour le HEIC.
#[tauri::command]
fn apercu_png(chemin: String, largeur_max: u32) -> Result<String, String> {
    wic::decoder_en_png(&chemin, largeur_max)
        .map(|png| {
            use base64::Engine;
            format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(png)
            )
        })
        .map_err(|e| format!("Décodage impossible : {e}"))
}

/// Crée (ou recrée) le dossier de démonstration du tutoriel dans %TEMP%,
/// avec 6 images réparties sur deux mois — dont une « rafale » de 3 photos.
#[tauri::command]
fn creer_dossier_demo() -> Result<String, String> {
    const IMAGES: [&[u8]; 6] = [
        include_bytes!("../assets/demo/demo1.png"),
        include_bytes!("../assets/demo/demo2.png"),
        include_bytes!("../assets/demo/demo3.png"),
        include_bytes!("../assets/demo/demo4.png"),
        include_bytes!("../assets/demo/demo5.png"),
        include_bytes!("../assets/demo/demo6.png"),
    ];
    let dossier = std::env::temp_dir().join("krino_demo");
    if dossier.exists() {
        fs::remove_dir_all(&dossier).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&dossier).map_err(|e| e.to_string())?;
    let maintenant = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;
    const JOUR: i64 = 86_400;
    // 3 photos en rafale (2 s d'écart) le mois dernier, 3 photos espacées il y a deux mois
    let dates = [
        maintenant - 35 * JOUR,
        maintenant - 35 * JOUR + 2,
        maintenant - 35 * JOUR + 4,
        maintenant - 65 * JOUR,
        maintenant - 62 * JOUR,
        maintenant - 58 * JOUR,
    ];
    for (i, (octets, date)) in IMAGES.iter().zip(dates).enumerate() {
        let chemin = dossier.join(format!("demo_{:02}.png", i + 1));
        fs::write(&chemin, octets).map_err(|e| e.to_string())?;
        filetime::set_file_mtime(&chemin, filetime::FileTime::from_unix_time(date, 0))
            .map_err(|e| e.to_string())?;
    }
    Ok(dossier.to_string_lossy().into_owned())
}

mod wic {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::Foundation::{GENERIC_READ, GENERIC_WRITE};
    use windows::Win32::Graphics::Imaging::*;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::SHCreateMemStream;

    unsafe fn source_redimensionnee(
        fabrique: &IWICImagingFactory,
        chemin: &str,
        largeur_max: u32,
    ) -> windows::core::Result<IWICBitmapSource> {
        unsafe {
            let decodeur = fabrique.CreateDecoderFromFilename(
                &HSTRING::from(chemin),
                None,
                GENERIC_READ,
                WICDecodeMetadataCacheOnDemand,
            )?;
            let cadre = decodeur.GetFrame(0)?;
            let (mut l, mut h) = (0u32, 0u32);
            cadre.GetSize(&mut l, &mut h)?;
            if largeur_max > 0 && l > largeur_max {
                let echelle = fabrique.CreateBitmapScaler()?;
                let nh = (h as u64 * largeur_max as u64 / l as u64) as u32;
                echelle.Initialize(&cadre, largeur_max, nh, WICBitmapInterpolationModeFant)?;
                echelle.cast()
            } else {
                cadre.cast()
            }
        }
    }

    /// Génère une miniature JPEG sur disque (cache des vues en grille).
    pub fn generer_miniature(
        source_chemin: &str,
        cible: &str,
        largeur_max: u32,
    ) -> windows::core::Result<()> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let fabrique: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
            let source = source_redimensionnee(&fabrique, source_chemin, largeur_max)?;
            let flux = fabrique.CreateStream()?;
            flux.InitializeFromFilename(&HSTRING::from(cible), GENERIC_WRITE.0)?;
            let encodeur = fabrique.CreateEncoder(&GUID_ContainerFormatJpeg, std::ptr::null())?;
            encodeur.Initialize(&flux, WICBitmapEncoderNoCache)?;
            let mut cadre_sortie = None;
            encodeur.CreateNewFrame(&mut cadre_sortie, std::ptr::null_mut())?;
            let cadre_sortie = cadre_sortie.unwrap();
            cadre_sortie.Initialize(None)?;
            cadre_sortie.WriteSource(&source, std::ptr::null())?;
            cadre_sortie.Commit()?;
            encodeur.Commit()?;
            Ok(())
        }
    }

    pub fn decoder_en_png(chemin: &str, largeur_max: u32) -> windows::core::Result<Vec<u8>> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let fabrique: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
            let source = source_redimensionnee(&fabrique, chemin, largeur_max)?;

            let flux = SHCreateMemStream(None).ok_or_else(windows::core::Error::empty)?;
            let encodeur = fabrique.CreateEncoder(&GUID_ContainerFormatPng, std::ptr::null())?;
            encodeur.Initialize(&flux, WICBitmapEncoderNoCache)?;
            let mut cadre_sortie = None;
            encodeur.CreateNewFrame(&mut cadre_sortie, std::ptr::null_mut())?;
            let cadre_sortie = cadre_sortie.unwrap();
            cadre_sortie.Initialize(None)?;
            cadre_sortie.WriteSource(&source, std::ptr::null())?;
            cadre_sortie.Commit()?;
            encodeur.Commit()?;

            let mut stat = STATSTG::default();
            flux.Stat(&mut stat, STATFLAG_NONAME)?;
            let taille = stat.cbSize as usize;
            flux.Seek(0, STREAM_SEEK_SET, None)?;
            let mut tampon = vec![0u8; taille];
            let mut lus = 0u32;
            flux.Read(
                tampon.as_mut_ptr() as *mut _,
                taille as u32,
                Some(&mut lus),
            )
            .ok()?;
            tampon.truncate(lus as usize);
            Ok(tampon)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            scanner,
            lire_etat,
            ecrire_etat,
            valider_mois,
            lister_corbeille,
            restaurer_fichier,
            vider_corbeille,
            restaurer_corbeille,
            apercu_png,
            miniature,
            creer_dossier_demo
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
