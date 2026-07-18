use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const DOSSIER_ETAT: &str = ".krino";
const FICHIER_ETAT: &str = "etat.json";
const CORBEILLE: &str = "corbeille";

const EXT_IMAGES: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "avif"];
const EXT_VIDEOS: &[&str] = &["mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp"];

#[derive(Serialize)]
struct Media {
    rel: String,
    taille: u64,
    mtime_ms: i64,
    mois: String,
    video: bool,
}

#[derive(Serialize, Deserialize, Default)]
struct Etat {
    #[serde(default)]
    decisions: HashMap<String, String>, // rel -> "garder" | "jeter"
    #[serde(default)]
    mois_valides: Vec<String>,
    #[serde(default)]
    raccourcis: HashMap<String, String>,
}

fn chemin_etat(racine: &Path) -> PathBuf {
    racine.join(DOSSIER_ETAT).join(FICHIER_ETAT)
}

fn chemin_corbeille(racine: &Path) -> PathBuf {
    racine.join(DOSSIER_ETAT).join(CORBEILLE)
}

fn mois_depuis_mtime(ms: i64) -> String {
    // Conversion epoch ms -> (année, mois) sans dépendance chrono,
    // via l'algorithme de Howard Hinnant (civil_from_days).
    let jours = ms.div_euclid(86_400_000);
    let z = jours + 719_468;
    let ere = z.div_euclid(146_097);
    let doe = (z - ere * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + ere * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let annee = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}", annee, m)
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
            mois: mois_depuis_mtime(mtime_ms),
            video,
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
struct InfoCorbeille {
    fichiers: u64,
    octets: u64,
}

#[tauri::command]
fn info_corbeille(racine: String) -> Result<InfoCorbeille, String> {
    let corbeille = chemin_corbeille(Path::new(&racine));
    let mut info = InfoCorbeille { fichiers: 0, octets: 0 };
    if corbeille.is_dir() {
        for e in WalkDir::new(&corbeille).into_iter().filter_map(|e| e.ok()) {
            if e.file_type().is_file() {
                info.fichiers += 1;
                info.octets += e.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    Ok(info)
}

#[tauri::command]
fn vider_corbeille(racine: String) -> Result<(), String> {
    let corbeille = chemin_corbeille(Path::new(&racine));
    if corbeille.is_dir() {
        fs::remove_dir_all(&corbeille).map_err(|e| e.to_string())?;
    }
    Ok(())
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
            info_corbeille,
            vider_corbeille,
            restaurer_corbeille
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
