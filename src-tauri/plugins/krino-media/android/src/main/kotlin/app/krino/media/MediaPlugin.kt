package app.krino.media

import android.Manifest
import android.app.Activity
import android.content.ContentUris
import android.content.pm.PackageManager
import android.os.Build
import android.provider.MediaStore
import android.util.Size
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

/**
 * Accès à la photothèque via MediaStore.
 *
 * Remplace à lui seul le module `wic` du desktop : Android décode nativement le
 * HEIC, renvoie des vignettes déjà orientées selon l'EXIF, et expose `DATE_TAKEN`
 * déjà extrait — d'où l'absence totale de code de décodage ici.
 */
@TauriPlugin
class MediaPlugin(private val activity: Activity) : Plugin(activity) {

    private val permissionsLecture: Array<String>
        get() = arrayOf(
            Manifest.permission.READ_MEDIA_IMAGES,
            Manifest.permission.READ_MEDIA_VIDEO,
        )

    private fun accorde(permission: String): Boolean =
        ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED

    /** `accordee`, `partielle` (Android 14+) ou `refusee`. */
    private fun etatPermission(): String {
        val complet = permissionsLecture.all { accorde(it) }
        if (complet) return "accordee"

        // Android 14+ : accès limité à une sélection de photos. C'est un cas
        // distinct d'un refus — le tri ne portera que sur cette sélection.
        if (Build.VERSION.SDK_INT >= 34 &&
            accorde(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
        ) {
            return "partielle"
        }
        return "refusee"
    }

    private fun reponseEtat(invoke: Invoke) {
        val ret = JSObject()
        ret.put("etat", etatPermission())
        invoke.resolve(ret)
    }

    @Command
    fun permission(invoke: Invoke) {
        reponseEtat(invoke)
    }

    @Command
    fun demanderPermission(invoke: Invoke) {
        if (etatPermission() != "refusee") {
            reponseEtat(invoke)
            return
        }
        // `requestPermissions` de la classe Plugin de Tauri rappelle
        // `onPermissionsResult`, mais pour rester simple à ce stade on répond
        // après la demande système via le rappel standard d'activité.
        activity.requestPermissions(permissionsLecture, DEMANDE_LECTURE)
        reponseEtat(invoke)
    }

    /**
     * Énumère images et vidéos, hors éléments déjà à la corbeille.
     *
     * `DATE_TAKEN` est en millisecondes ; il est absent sur certains fichiers
     * (captures d'écran, fichiers copiés), auquel cas on retombe sur
     * `DATE_MODIFIED`, exprimé lui en secondes.
     */
    @Command
    fun scanner(invoke: Invoke) {
        val medias = JSArray()

        val colonnes = arrayOf(
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.SIZE,
            MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.DATE_TAKEN,
            MediaStore.MediaColumns.DATE_MODIFIED,
        )

        val sources = listOf(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI to false,
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI to true,
        )

        for ((collection, estVideo) in sources) {
            activity.contentResolver.query(
                collection,
                colonnes,
                // IS_TRASHED n'est pas exposé comme filtre ici : par défaut
                // MediaStore exclut déjà les éléments à la corbeille.
                null,
                null,
                "${MediaStore.MediaColumns.DATE_TAKEN} DESC",
            )?.use { curseur ->
                val iId = curseur.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                val iNom = curseur.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
                val iTaille = curseur.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
                val iPrise = curseur.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_TAKEN)
                val iModif = curseur.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_MODIFIED)

                while (curseur.moveToNext()) {
                    val id = curseur.getLong(iId)
                    val prise = if (curseur.isNull(iPrise)) 0L else curseur.getLong(iPrise)
                    val dateMs = if (prise > 0L) prise else curseur.getLong(iModif) * 1000L

                    val media = JSObject()
                    media.put("id", id.toString())
                    media.put("nom", curseur.getString(iNom) ?: "")
                    media.put("uri", ContentUris.withAppendedId(collection, id).toString())
                    media.put("taille", curseur.getLong(iTaille))
                    media.put("dateMs", dateMs)
                    media.put("video", estVideo)
                    medias.put(media)
                }
            }
        }

        val ret = JSObject()
        ret.put("medias", medias)
        invoke.resolve(ret)
    }

    /**
     * Vignette carrée.
     *
     * `loadThumbnail` décode le HEIC nativement et applique déjà l'orientation
     * EXIF. On renvoie l'URI du média : la WebView sait l'afficher directement,
     * inutile de recopier des octets à travers le pont.
     */
    @Command
    fun vignette(invoke: Invoke) {
        val id = invoke.parseArgs(ArgsVignette::class.java).id
        val taille = invoke.parseArgs(ArgsVignette::class.java).taille

        val uri = ContentUris.withAppendedId(
            MediaStore.Files.getContentUri("external"),
            id.toLong(),
        )

        // On vérifie que la vignette est effectivement décodable avant de
        // renvoyer l'URI : un média corrompu doit échouer ici, pas silencieusement
        // dans la WebView.
        try {
            activity.contentResolver.loadThumbnail(uri, Size(taille, taille), null)
        } catch (e: Exception) {
            invoke.reject("vignette indisponible : ${e.message}")
            return
        }

        val ret = JSObject()
        ret.put("uri", uri.toString())
        invoke.resolve(ret)
    }

    companion object {
        private const val DEMANDE_LECTURE = 4001
    }
}

class ArgsVignette {
    lateinit var id: String
    var taille: Int = 200
}
