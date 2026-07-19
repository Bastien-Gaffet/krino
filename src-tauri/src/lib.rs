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
    #[serde(default)]
    regroupement: String, // "mois" (défaut) ou "evenement"
    #[serde(default)]
    favoris: Vec<String>,
    #[serde(default)]
    albums: HashMap<String, Vec<String>>, // nom d'album -> rels
}

/// Drapeau d'annulation des tâches longues (scan, doublons, rangement).
static ANNULE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn annulation_demandee() -> bool {
    ANNULE.load(std::sync::atomic::Ordering::Relaxed)
}

#[tauri::command]
fn annuler_tache() {
    ANNULE.store(true, std::sync::atomic::Ordering::Relaxed);
}

fn chemin_etat(racine: &Path) -> PathBuf {
    racine.join(DOSSIER_ETAT).join(FICHIER_ETAT)
}

fn chemin_corbeille(racine: &Path) -> PathBuf {
    racine.join(DOSSIER_ETAT).join(CORBEILLE)
}

/// Supprime, en remontant depuis les feuilles, les dossiers devenus vides sous
/// `racine`. Ne touche jamais à la racine elle-même ni au dossier `.krino`
/// (état/corbeille interne). `remove_dir` n'aboutit que si le dossier est vide.
fn supprimer_dossiers_vides(racine: &Path) {
    let dossier_etat = racine.join(DOSSIER_ETAT);
    for e in WalkDir::new(racine)
        .contents_first(true)
        .into_iter()
        .filter_entry(|e| e.path() != dossier_etat.as_path())
        .filter_map(|e| e.ok())
    {
        if e.file_type().is_dir() && e.path() != racine {
            let _ = fs::remove_dir(e.path()); // n'aboutit que si vide
        }
    }
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
    ANNULE.store(false, std::sync::atomic::Ordering::Relaxed);

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
            if annulation_demandee() {
                return None;
            }
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
    if annulation_demandee() {
        return Err("Annulé".into());
    }

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
    // Version du rendu : bump pour régénérer toutes les miniatures (orientation EXIF).
    "_o2".hash(&mut hacheur);
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
    // Supprime les dossiers d'origine devenus vides (jamais la racine ni .krino)
    supprimer_dossiers_vides(&racine);
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

/// Vérifie qu'un chemin relatif reste bien à l'intérieur de la corbeille
/// (protège la suppression définitive contre toute échappée via `..`).
fn chemin_dans_corbeille(corbeille: &Path, rel: &str) -> Result<PathBuf, String> {
    let cible = corbeille.join(rel);
    // On compare les parents canonisés : le fichier lui-même doit exister.
    let base = corbeille.canonicalize().map_err(|e| e.to_string())?;
    let cible_abs = cible.canonicalize().map_err(|e| e.to_string())?;
    if !cible_abs.starts_with(&base) {
        return Err("Chemin hors de la corbeille".into());
    }
    Ok(cible)
}

/// Restaure une liste de fichiers de la corbeille à leur emplacement d'origine.
#[tauri::command]
fn restaurer_fichiers(racine: String, rels: Vec<String>) -> Result<u32, String> {
    let racine = PathBuf::from(&racine);
    let corbeille = chemin_corbeille(&racine);
    let mut restaures = 0u32;
    for rel in &rels {
        let source = chemin_dans_corbeille(&corbeille, rel)?;
        let dest = racine.join(rel);
        if dest.exists() {
            continue;
        }
        fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::rename(&source, &dest).map_err(|e| e.to_string())?;
        restaures += 1;
    }
    Ok(restaures)
}

/// Supprime définitivement une liste de fichiers, uniquement s'ils sont situés
/// dans la corbeille interne (sécurité : aucun chemin hors corbeille accepté).
#[tauri::command]
fn supprimer_definitivement(racine: String, rels: Vec<String>) -> Result<u32, String> {
    let corbeille = chemin_corbeille(Path::new(&racine));
    let mut supprimes = 0u32;
    for rel in &rels {
        let cible = chemin_dans_corbeille(&corbeille, rel)?;
        fs::remove_file(&cible).map_err(|e| e.to_string())?;
        supprimes += 1;
    }
    Ok(supprimes)
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

#[derive(Serialize, Clone)]
struct FichierDoublon {
    rel: String,
    taille: u64,
    mtime_ms: i64,
    video: bool,
    wic: bool,
}

/// Outil « Doublons » : regroupe les fichiers identiques (`mode = "exact"`,
/// SHA-256 du contenu) ou les images visuellement semblables
/// (`mode = "similaires"`, dHash 64 bits à distance de Hamming ≤ seuil).
/// Le choix de ce qui est gardé reste entièrement à l'utilisateur.
#[tauri::command]
async fn chercher_doublons(
    fenetre: tauri::Window,
    racine: String,
    mode: String,
    seuil: u32,
) -> Result<Vec<Vec<FichierDoublon>>, String> {
    use rayon::prelude::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tauri::Emitter;

    let racine_p = PathBuf::from(&racine);
    let similaires = mode == "similaires";
    ANNULE.store(false, std::sync::atomic::Ordering::Relaxed);

    let mut fichiers: Vec<(PathBuf, FichierDoublon)> = Vec::new();
    for e in WalkDir::new(&racine_p)
        .into_iter()
        .filter_entry(|e| e.file_name().to_string_lossy() != DOSSIER_ETAT)
        .filter_map(|e| e.ok())
    {
        if !e.file_type().is_file() {
            continue;
        }
        let ext = e
            .path()
            .extension()
            .map(|x| x.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let video = EXT_VIDEOS.contains(&ext.as_str());
        let image = EXT_IMAGES.contains(&ext.as_str());
        if similaires && !image {
            continue; // le perceptuel ne s'applique qu'aux images
        }
        if !similaires && !image && !video {
            continue;
        }
        let meta = match e.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let rel = e
            .path()
            .strip_prefix(&racine_p)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        fichiers.push((
            e.into_path(),
            FichierDoublon {
                rel,
                taille: meta.len(),
                mtime_ms,
                video,
                wic: EXT_WIC.contains(&ext.as_str()),
            },
        ));
    }

    let total = fichiers.len();
    let fait = AtomicUsize::new(0);
    let progres = |n: usize| {
        if n % 50 == 0 || n == total {
            let _ = fenetre.emit("doublons-progres", (n, total));
        }
    };

    let mut groupes: Vec<Vec<FichierDoublon>> = if similaires {
        // dHash en parallèle (décodage WIC réduit à 9×8, niveaux de gris)
        let hashes: Vec<(u64, &FichierDoublon)> = fichiers
            .par_iter()
            .filter_map(|(chemin, f)| {
                if annulation_demandee() {
                    return None;
                }
                let h = wic::dhash(&chemin.to_string_lossy());
                progres(fait.fetch_add(1, Ordering::Relaxed) + 1);
                // Empreintes dégénérées (image quasi uniforme) : inexploitables
                let h = h?;
                let bits = h.count_ones();
                if !(4..=60).contains(&bits) {
                    return None;
                }
                Some((h, f))
            })
            .collect();

        let mut par_hash: HashMap<u64, Vec<&FichierDoublon>> = HashMap::new();
        for (h, f) in hashes {
            par_hash.entry(h).or_default().push(f);
        }
        let uniques: Vec<u64> = par_hash.keys().copied().collect();

        // Union-find sur les empreintes distinctes (seuil > 0)
        let mut parent: HashMap<u64, u64> = uniques.iter().map(|&h| (h, h)).collect();
        fn trouver(parent: &mut HashMap<u64, u64>, mut h: u64) -> u64 {
            while parent[&h] != h {
                let p = parent[&parent[&h]];
                parent.insert(h, p);
                h = p;
            }
            h
        }
        if seuil > 0 {
            for i in 0..uniques.len() {
                for j in (i + 1)..uniques.len() {
                    if (uniques[i] ^ uniques[j]).count_ones() <= seuil {
                        let a = trouver(&mut parent, uniques[i]);
                        let b = trouver(&mut parent, uniques[j]);
                        parent.insert(a, b);
                    }
                }
            }
        }
        let mut groupes_map: HashMap<u64, Vec<FichierDoublon>> = HashMap::new();
        for h in uniques {
            let r = trouver(&mut parent, h);
            groupes_map
                .entry(r)
                .or_default()
                .extend(par_hash[&h].iter().map(|f| (*f).clone()));
        }
        groupes_map.into_values().filter(|g| g.len() > 1).collect()
    } else {
        // Exact : pré-groupe par taille, puis SHA-256 complet en parallèle
        let mut par_taille: HashMap<u64, Vec<&(PathBuf, FichierDoublon)>> = HashMap::new();
        for e in &fichiers {
            par_taille.entry(e.1.taille).or_default().push(e);
        }
        let candidats: Vec<&(PathBuf, FichierDoublon)> = par_taille
            .into_values()
            .filter(|v| v.len() > 1)
            .flatten()
            .collect();
        let _ = fenetre.emit("doublons-progres", (0usize, candidats.len()));
        let total = candidats.len();
        let progres = |n: usize| {
            if n % 20 == 0 || n == total {
                let _ = fenetre.emit("doublons-progres", (n, total));
            }
        };
        let hashes: Vec<([u8; 32], &FichierDoublon)> = candidats
            .par_iter()
            .filter_map(|(chemin, f)| {
                if annulation_demandee() {
                    return None;
                }
                use sha2::{Digest, Sha256};
                let r = (|| -> std::io::Result<[u8; 32]> {
                    let mut h = Sha256::new();
                    let mut fh = fs::File::open(chemin)?;
                    std::io::copy(&mut fh, &mut h)?;
                    Ok(h.finalize().into())
                })();
                progres(fait.fetch_add(1, Ordering::Relaxed) + 1);
                r.ok().map(|h| (h, f))
            })
            .collect();
        let mut par_hash: HashMap<[u8; 32], Vec<FichierDoublon>> = HashMap::new();
        for (h, f) in hashes {
            par_hash.entry(h).or_default().push(f.clone());
        }
        par_hash.into_values().filter(|g| g.len() > 1).collect()
    };

    if annulation_demandee() {
        return Err("Annulé".into());
    }

    // Plus gros fichier d'abord dans chaque groupe ; gros groupes en premier
    for g in &mut groupes {
        g.sort_by(|a, b| b.taille.cmp(&a.taille).then(a.rel.cmp(&b.rel)));
    }
    groupes.sort_by_key(|g| std::cmp::Reverse(g.iter().skip(1).map(|f| f.taille).sum::<u64>()));
    Ok(groupes)
}

const MOIS_FR: [&str; 12] = [
    "01_Janvier", "02_Février", "03_Mars", "04_Avril", "05_Mai", "06_Juin",
    "07_Juillet", "08_Août", "09_Septembre", "10_Octobre", "11_Novembre", "12_Décembre",
];

/// (année, mois) d'un instant epoch ms (algorithme civil inverse de Hinnant).
fn annee_mois(epoch_ms: i64) -> (i64, u32) {
    let jours = epoch_ms.div_euclid(86_400_000);
    let z = jours + 719_468;
    let ere = z.div_euclid(146_097);
    let doe = z - ere * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let mois = if mp < 10 { mp + 3 } else { mp - 9 };
    let annee = yoe + ere * 400 + i64::from(mois <= 2);
    (annee, mois as u32)
}

/// Range les fichiers médias en arborescence `AAAA/MM_Mois/` (date EXIF si
/// `source_date == "exif"`, sinon date de fichier). Chaque déplacement est
/// consigné dans un journal pour pouvoir annuler le dernier rangement.
#[tauri::command]
async fn ranger_par_date(
    fenetre: tauri::Window,
    racine: String,
    source_date: String,
) -> Result<(u32, u32), String> {
    use tauri::Emitter;
    ANNULE.store(false, std::sync::atomic::Ordering::Relaxed);
    let racine_p = PathBuf::from(&racine);

    let mut fichiers = Vec::new();
    for e in WalkDir::new(&racine_p)
        .into_iter()
        .filter_entry(|e| e.file_name().to_string_lossy() != DOSSIER_ETAT)
        .filter_map(|e| e.ok())
    {
        if !e.file_type().is_file() {
            continue;
        }
        let ext = e
            .path()
            .extension()
            .map(|x| x.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if EXT_IMAGES.contains(&ext.as_str()) || EXT_VIDEOS.contains(&ext.as_str()) {
            fichiers.push(e.into_path());
        }
    }

    let total = fichiers.len();
    let mut journal: Vec<(String, String)> = Vec::new();
    let (mut deplaces, mut ignores) = (0u32, 0u32);
    for (n, chemin) in fichiers.iter().enumerate() {
        if annulation_demandee() {
            break; // les déplacements déjà faits restent consignés
        }
        if n % 20 == 0 || n + 1 == total {
            let _ = fenetre.emit("rangement-progres", (n + 1, total));
        }
        let meta = match fs::metadata(chemin) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let date_ms = if source_date == "exif" {
            date_exif(chemin).unwrap_or(mtime_ms)
        } else {
            mtime_ms
        };
        let (annee, mois) = annee_mois(date_ms);
        let dossier_cible = racine_p
            .join(annee.to_string())
            .join(MOIS_FR[(mois as usize).saturating_sub(1).min(11)]);
        let nom = chemin.file_name().unwrap().to_os_string();
        if chemin.parent() == Some(dossier_cible.as_path()) {
            ignores += 1;
            continue; // déjà au bon endroit
        }
        let mut cible = dossier_cible.join(&nom);
        let mut n_suffixe = 2;
        while cible.exists() {
            let tige = Path::new(&nom).file_stem().unwrap().to_string_lossy().into_owned();
            let ext = Path::new(&nom)
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            cible = dossier_cible.join(format!("{tige}_{n_suffixe}{ext}"));
            n_suffixe += 1;
        }
        if fs::create_dir_all(&dossier_cible).is_err() || fs::rename(chemin, &cible).is_err() {
            ignores += 1;
            continue;
        }
        journal.push((
            chemin.strip_prefix(&racine_p).unwrap().to_string_lossy().replace('\\', "/"),
            cible.strip_prefix(&racine_p).unwrap().to_string_lossy().replace('\\', "/"),
        ));
        deplaces += 1;
    }

    if !journal.is_empty() {
        let chemin_journal = racine_p.join(DOSSIER_ETAT).join("rangement_journal.json");
        let _ = fs::create_dir_all(chemin_journal.parent().unwrap());
        let _ = fs::write(
            &chemin_journal,
            serde_json::to_string(&journal).map_err(|e| e.to_string())?,
        );
    }
    // Supprime les dossiers devenus vides (jamais la racine ni .krino)
    supprimer_dossiers_vides(&racine_p);
    Ok((deplaces, ignores))
}

/// Annule le dernier rangement en rejouant le journal à l'envers.
#[tauri::command]
fn annuler_rangement(racine: String) -> Result<u32, String> {
    let racine_p = PathBuf::from(&racine);
    let chemin_journal = racine_p.join(DOSSIER_ETAT).join("rangement_journal.json");
    let brut = fs::read_to_string(&chemin_journal)
        .map_err(|_| "Aucun rangement à annuler".to_string())?;
    let journal: Vec<(String, String)> =
        serde_json::from_str(&brut).map_err(|e| e.to_string())?;
    let mut restaures = 0u32;
    for (origine, cible) in journal.iter().rev() {
        let de = racine_p.join(cible);
        let vers = racine_p.join(origine);
        if !de.is_file() || vers.exists() {
            continue;
        }
        let _ = fs::create_dir_all(vers.parent().unwrap());
        if fs::rename(&de, &vers).is_ok() {
            restaures += 1;
        }
    }
    let _ = fs::remove_file(&chemin_journal);
    Ok(restaures)
}

/// Copie les fichiers d'un album dans `<racine>/Albums/<nom>/` (jamais de
/// déplacement : l'arborescence par date reste intacte).
#[tauri::command]
async fn exporter_album(racine: String, nom: String, rels: Vec<String>) -> Result<u32, String> {
    let racine_p = PathBuf::from(&racine);
    let nom_sain: String = nom
        .chars()
        .map(|c| if r#"\/:*?"<>|"#.contains(c) { '_' } else { c })
        .collect();
    let dossier = racine_p.join("Albums").join(nom_sain.trim());
    fs::create_dir_all(&dossier).map_err(|e| e.to_string())?;
    let mut copies = 0u32;
    for rel in rels {
        let source = racine_p.join(&rel);
        if !source.is_file() {
            continue;
        }
        let cible = dossier.join(source.file_name().unwrap());
        if cible.exists() {
            continue; // déjà exporté
        }
        fs::copy(&source, &cible).map_err(|e| format!("{rel} : {e}"))?;
        copies += 1;
    }
    Ok(copies)
}

mod wic {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::Foundation::{GENERIC_READ, GENERIC_WRITE};
    use windows::Win32::Graphics::Imaging::*;
    use windows::Win32::System::Com::StructuredStorage::{
        PropVariantToUInt16WithDefault, PROPVARIANT,
    };
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::SHCreateMemStream;

    /// Lit l'orientation EXIF (tag 274) du cadre décodé via le lecteur de
    /// métadonnées WIC. Renvoie une valeur 1..=8 (défaut 1 = aucune rotation).
    unsafe fn lire_orientation_exif(cadre: &IWICBitmapFrameDecode) -> u16 {
        unsafe {
            let Ok(lecteur) = cadre.GetMetadataQueryReader() else {
                return 1;
            };
            // JPEG : /app1/ifd/... ; TIFF/HEIF : /ifd/... — première requête qui réussit.
            for requete in ["/app1/ifd/{ushort=274}", "/ifd/{ushort=274}"] {
                let mut pv = PROPVARIANT::default();
                if lecteur
                    .GetMetadataByName(&HSTRING::from(requete), &mut pv)
                    .is_ok()
                {
                    let v = PropVariantToUInt16WithDefault(&pv, 1);
                    if (1..=8).contains(&v) {
                        return v;
                    }
                }
            }
            1
        }
    }

    /// Mappe une orientation EXIF (1..=8) sur les options de transformation WIC
    /// (rotations dans le sens horaire).
    fn transformation_orientation(exif: u16) -> WICBitmapTransformOptions {
        match exif {
            2 => WICBitmapTransformFlipHorizontal,
            3 => WICBitmapTransformRotate180,
            4 => WICBitmapTransformFlipVertical,
            5 => WICBitmapTransformOptions(
                WICBitmapTransformRotate90.0 | WICBitmapTransformFlipHorizontal.0,
            ),
            6 => WICBitmapTransformRotate90,
            7 => WICBitmapTransformOptions(
                WICBitmapTransformRotate270.0 | WICBitmapTransformFlipHorizontal.0,
            ),
            8 => WICBitmapTransformRotate270,
            _ => WICBitmapTransformRotate0,
        }
    }

    unsafe fn source_redimensionnee(
        fabrique: &IWICImagingFactory,
        chemin: &str,
        largeur_max: u32,
        orienter: bool,
    ) -> windows::core::Result<IWICBitmapSource> {
        unsafe {
            let decodeur = fabrique.CreateDecoderFromFilename(
                &HSTRING::from(chemin),
                None,
                GENERIC_READ,
                WICDecodeMetadataCacheOnDemand,
            )?;
            let cadre = decodeur.GetFrame(0)?;
            // Applique l'orientation EXIF (miniatures uniquement) avant la mise à l'échelle.
            let options = if orienter {
                transformation_orientation(lire_orientation_exif(&cadre))
            } else {
                WICBitmapTransformRotate0
            };
            let base: IWICBitmapSource = if options != WICBitmapTransformRotate0 {
                let rotateur = fabrique.CreateBitmapFlipRotator()?;
                rotateur.Initialize(&cadre, options)?;
                rotateur.cast()?
            } else {
                cadre.cast()?
            };
            // Dimensions APRÈS rotation.
            let (mut l, mut h) = (0u32, 0u32);
            base.GetSize(&mut l, &mut h)?;
            if largeur_max > 0 && l > largeur_max {
                let echelle = fabrique.CreateBitmapScaler()?;
                let nh = (h as u64 * largeur_max as u64 / l as u64) as u32;
                echelle.Initialize(&base, largeur_max, nh, WICBitmapInterpolationModeFant)?;
                echelle.cast()
            } else {
                Ok(base)
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
            let source = source_redimensionnee(&fabrique, source_chemin, largeur_max, true)?;
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

    /// dHash 64 bits : réduction 9×8 en niveaux de gris via WIC, puis gradient
    /// horizontal — insensible à la recompression et au redimensionnement.
    pub fn dhash(chemin: &str) -> Option<u64> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let fabrique: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER).ok()?;
            let decodeur = fabrique
                .CreateDecoderFromFilename(
                    &HSTRING::from(chemin),
                    None,
                    GENERIC_READ,
                    WICDecodeMetadataCacheOnDemand,
                )
                .ok()?;
            let cadre = decodeur.GetFrame(0).ok()?;
            let echelle = fabrique.CreateBitmapScaler().ok()?;
            echelle
                .Initialize(&cadre, 9, 8, WICBitmapInterpolationModeFant)
                .ok()?;
            let gris = fabrique.CreateFormatConverter().ok()?;
            gris.Initialize(
                &echelle,
                &GUID_WICPixelFormat8bppGray,
                WICBitmapDitherTypeNone,
                None,
                0.0,
                WICBitmapPaletteTypeCustom,
            )
            .ok()?;
            let mut px = [0u8; 72];
            gris.CopyPixels(std::ptr::null(), 9, &mut px).ok()?;
            let mut h = 0u64;
            for y in 0..8 {
                for x in 0..8 {
                    h = (h << 1) | u64::from(px[y * 9 + x] > px[y * 9 + x + 1]);
                }
            }
            Some(h)
        }
    }

    pub fn decoder_en_png(chemin: &str, largeur_max: u32) -> windows::core::Result<Vec<u8>> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let fabrique: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
            let source = source_redimensionnee(&fabrique, chemin, largeur_max, false)?;

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
            restaurer_fichiers,
            supprimer_definitivement,
            vider_corbeille,
            restaurer_corbeille,
            apercu_png,
            miniature,
            chercher_doublons,
            annuler_tache,
            ranger_par_date,
            annuler_rangement,
            exporter_album,
            creer_dossier_demo
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
