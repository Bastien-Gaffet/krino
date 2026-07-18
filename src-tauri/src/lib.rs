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

#[tauri::command]
fn scanner(racine: String) -> Result<Vec<Media>, String> {
    let racine = PathBuf::from(&racine);
    if !racine.is_dir() {
        return Err("Dossier introuvable".into());
    }
    let mut medias = Vec::new();
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
        let meta = entree.metadata().map_err(|e| e.to_string())?;
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let rel = entree
            .path()
            .strip_prefix(&racine)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        medias.push(Media {
            rel,
            taille: meta.len(),
            mtime_ms,
            exif_ms: if video { None } else { date_exif(entree.path()) },
            video,
            wic: EXT_WIC.contains(&ext.as_str()),
        });
    }
    Ok(medias)
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

mod wic {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::Foundation::GENERIC_READ;
    use windows::Win32::Graphics::Imaging::*;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::SHCreateMemStream;

    pub fn decoder_en_png(chemin: &str, largeur_max: u32) -> windows::core::Result<Vec<u8>> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let fabrique: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
            let decodeur = fabrique.CreateDecoderFromFilename(
                &HSTRING::from(chemin),
                None,
                GENERIC_READ,
                WICDecodeMetadataCacheOnDemand,
            )?;
            let cadre = decodeur.GetFrame(0)?;

            let (mut l, mut h) = (0u32, 0u32);
            cadre.GetSize(&mut l, &mut h)?;
            let source: IWICBitmapSource = if largeur_max > 0 && l > largeur_max {
                let echelle = fabrique.CreateBitmapScaler()?;
                let nh = (h as u64 * largeur_max as u64 / l as u64) as u32;
                echelle.Initialize(&cadre, largeur_max, nh, WICBitmapInterpolationModeFant)?;
                echelle.cast()?
            } else {
                cadre.cast()?
            };

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
        .invoke_handler(tauri::generate_handler![
            scanner,
            lire_etat,
            ecrire_etat,
            valider_mois,
            lister_corbeille,
            restaurer_fichier,
            vider_corbeille,
            restaurer_corbeille,
            apercu_png
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
