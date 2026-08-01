package app.krino.media

import android.Manifest
import android.app.Activity
import android.content.ContentResolver
import android.content.ContentUris
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Size
import androidx.activity.result.ActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.core.content.ContextCompat
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
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
// L'alias "lecture" est répété en dur dans demanderPermission() ci-dessous :
// une constante de companion object n'est pas résolvable depuis l'annotation
// de sa propre classe (limitation du compilateur Kotlin).
@TauriPlugin(
    permissions = [
        Permission(
            strings = [Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO],
            alias = "lecture",
        ),
    ],
)
class MediaPlugin(private val activity: Activity) : Plugin(activity) {

    private val permissionsLecture: Array<String>
        get() = arrayOf(
            Manifest.permission.READ_MEDIA_IMAGES,
            Manifest.permission.READ_MEDIA_VIDEO,
        )

    // `createTrashRequest`/`createDeleteRequest` ne renvoient que le code de
    // résultat de la boîte système, pas la liste des URIs traitées : on se
    // souvient ici de la taille de la dernière demande pour construire la
    // réponse dans le callback d'activité correspondant. Un champ par
    // opération car les trois s'appuient sur le même mécanisme de callback
    // mais ne peuvent pas se chevaucher (une seule boîte système à la fois).
    private var tailleDemandeCorbeille = 0
    private var tailleDemandeRestauration = 0
    private var tailleDemandeSuppression = 0

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
        // La demande système est asynchrone : répondre tout de suite renverrait
        // systématiquement « refusee », l'utilisateur n'ayant pas encore eu le
        // temps de répondre à la boîte. `requestPermissionForAlias` fait
        // patienter `invoke` jusqu'au résultat réel, relayé par
        // `resultatPermission` ci-dessous.
        requestPermissionForAlias("lecture", invoke, "resultatPermission")
    }

    @PermissionCallback
    fun resultatPermission(invoke: Invoke) {
        reponseEtat(invoke)
    }

    private val colonnesMedia = arrayOf(
        MediaStore.MediaColumns._ID,
        MediaStore.MediaColumns.DISPLAY_NAME,
        MediaStore.MediaColumns.SIZE,
        MediaStore.MediaColumns.MIME_TYPE,
        MediaStore.MediaColumns.DATE_TAKEN,
        MediaStore.MediaColumns.DATE_MODIFIED,
    )

    /**
     * Interroge images et vidéos.
     *
     * `DATE_TAKEN` est en millisecondes ; il est absent sur certains fichiers
     * (captures d'écran, fichiers copiés), auquel cas on retombe sur
     * `DATE_MODIFIED`, exprimé lui en secondes.
     *
     * @param corbeille Si vrai, ne renvoie que les éléments `IS_TRASHED = 1`
     *   (par défaut MediaStore les exclut déjà des requêtes normales).
     */
    private fun interrogerMedias(corbeille: Boolean): JSArray {
        val medias = JSArray()

        val sources = listOf(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI to false,
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI to true,
        )

        val args = Bundle().apply {
            putString(
                ContentResolver.QUERY_ARG_SQL_SORT_ORDER,
                "${MediaStore.MediaColumns.DATE_TAKEN} DESC",
            )
            if (corbeille) {
                putInt(MediaStore.QUERY_ARG_MATCH_TRASHED, MediaStore.MATCH_ONLY)
            }
        }

        for ((collection, estVideo) in sources) {
            activity.contentResolver.query(
                collection,
                colonnesMedia,
                args,
                null,
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

        return medias
    }

    /** Énumère images et vidéos, hors éléments déjà à la corbeille. */
    @Command
    fun scanner(invoke: Invoke) {
        val ret = JSObject()
        ret.put("medias", interrogerMedias(corbeille = false))
        invoke.resolve(ret)
    }

    /** Médias actuellement à la corbeille (`IS_TRASHED = 1`). */
    @Command
    fun listerCorbeille(invoke: Invoke) {
        val ret = JSObject()
        ret.put("medias", interrogerMedias(corbeille = true))
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
        val args = invoke.parseArgs(ArgsVignette::class.java)
        val uri = uriDepuisId(args.id)

        // On vérifie que la vignette est effectivement décodable avant de
        // renvoyer l'URI : un média corrompu doit échouer ici, pas silencieusement
        // dans la WebView.
        try {
            activity.contentResolver.loadThumbnail(uri, Size(args.taille, args.taille), null)
        } catch (e: Exception) {
            invoke.reject("vignette indisponible : ${e.message}")
            return
        }

        val ret = JSObject()
        ret.put("uri", uri.toString())
        invoke.resolve(ret)
    }

    /**
     * Envoie les médias à la corbeille système.
     *
     * Une seule confirmation utilisateur pour jusqu'à 2000 URIs : c'est ce qui
     * permet de ne demander qu'une confirmation par mois validé, pas une par
     * photo. `createTrashRequest` ne consent pas silencieusement pour les
     * médias possédés par une autre application (le cas courant : appareil
     * photo, messagerie…), d'où le passage par une activité système.
     */
    @Command
    fun mettreCorbeille(invoke: Invoke) {
        val ids = invoke.parseArgs(ArgsIds::class.java).ids
        if (ids.isEmpty()) {
            val ret = JSObject()
            ret.put("nombre", 0)
            invoke.resolve(ret)
            return
        }
        val uris = ids.map { uriDepuisId(it) }
        tailleDemandeCorbeille = uris.size
        val pending = MediaStore.createTrashRequest(activity.contentResolver, uris, true)
        startIntentSenderForResult(
            invoke,
            IntentSenderRequest.Builder(pending.intentSender).build(),
            "resultatCorbeille",
        )
    }

    @ActivityCallback
    fun resultatCorbeille(invoke: Invoke, result: ActivityResult) {
        val ret = JSObject()
        // `createTrashRequest` est tout ou rien : soit l'utilisateur confirme
        // et les `n` URIs partent à la corbeille, soit il refuse et rien ne
        // bouge — il n'y a pas de résultat partiel à distinguer ici.
        ret.put("nombre", if (result.resultCode == Activity.RESULT_OK) tailleDemandeCorbeille else 0)
        invoke.resolve(ret)
    }

    /** Sort les médias de la corbeille (`IS_TRASHED = 0`). */
    @Command
    fun restaurer(invoke: Invoke) {
        val ids = invoke.parseArgs(ArgsIds::class.java).ids
        if (ids.isEmpty()) {
            val ret = JSObject()
            ret.put("nombre", 0)
            invoke.resolve(ret)
            return
        }
        val uris = ids.map { uriDepuisId(it) }
        tailleDemandeRestauration = uris.size
        val pending = MediaStore.createTrashRequest(activity.contentResolver, uris, false)
        startIntentSenderForResult(
            invoke,
            IntentSenderRequest.Builder(pending.intentSender).build(),
            "resultatRestauration",
        )
    }

    @ActivityCallback
    fun resultatRestauration(invoke: Invoke, result: ActivityResult) {
        val ret = JSObject()
        ret.put("nombre", if (result.resultCode == Activity.RESULT_OK) tailleDemandeRestauration else 0)
        invoke.resolve(ret)
    }

    /** Suppression irréversible (`MediaStore.createDeleteRequest`). */
    @Command
    fun supprimerDefinitivement(invoke: Invoke) {
        val ids = invoke.parseArgs(ArgsIds::class.java).ids
        if (ids.isEmpty()) {
            val ret = JSObject()
            ret.put("nombre", 0)
            invoke.resolve(ret)
            return
        }
        val uris = ids.map { uriDepuisId(it) }
        tailleDemandeSuppression = uris.size
        val pending = MediaStore.createDeleteRequest(activity.contentResolver, uris)
        startIntentSenderForResult(
            invoke,
            IntentSenderRequest.Builder(pending.intentSender).build(),
            "resultatSuppression",
        )
    }

    @ActivityCallback
    fun resultatSuppression(invoke: Invoke, result: ActivityResult) {
        val ret = JSObject()
        ret.put("nombre", if (result.resultCode == Activity.RESULT_OK) tailleDemandeSuppression else 0)
        invoke.resolve(ret)
    }

    private fun uriDepuisId(id: String): Uri = ContentUris.withAppendedId(
        MediaStore.Files.getContentUri("external"),
        id.toLong(),
    )
}

class ArgsVignette {
    lateinit var id: String
    var taille: Int = 200
}

class ArgsIds {
    lateinit var ids: Array<String>
}
