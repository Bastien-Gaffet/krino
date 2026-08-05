package app.krino.media

import android.Manifest
import android.app.Activity
import android.content.ContentResolver
import android.content.ContentUris
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.util.Size
import androidx.activity.result.ActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream

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
        get() = if (Build.VERSION.SDK_INT >= 33) {
            arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO)
        } else {
            arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }

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
        // Le mécanisme `@PermissionCallback` de Tauri (retrouvé par son nom
        // à l'exécution via réflexion) s'est révélé peu fiable sur au moins
        // un appareil réel : la promesse JS restait bloquée indéfiniment
        // même après une réponse système en bonne et due forme, malgré une
        // règle ProGuard dédiée. On ne dépend donc plus de lui : on
        // déclenche juste la boîte système et on répond immédiatement avec
        // l'état ACTUEL (donc "refusee"), sans attendre l'utilisateur. Le
        // frontend réévalue l'état réel via permission() — une commande
        // simple, sans ce mécanisme — quand la page redevient visible après
        // la fermeture de la boîte système (voir autoriser() dans main.ts).
        ActivityCompat.requestPermissions(activity, permissionsLecture, DEMANDE_LECTURE)
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
     * Taille de décodage au ratio du média, plutôt qu'un carré forcé.
     *
     * `Size(taille, taille)` déforme les photos dont le ratio original
     * s'éloigne du carré — vu sur téléphone, mêmes symptômes que l'icône
     * Ko-fi aplatie par une taille CSS imposée : `loadThumbnail` ne garantit
     * pas de préserver le ratio pour chaque format/codec. `WIDTH`/`HEIGHT`
     * sont déjà dans MediaStore, pas besoin de décoder l'image pour les
     * connaître.
     */
    private fun tailleDecodage(uri: Uri, cible: Int): Size {
        val dimensions = activity.contentResolver.query(
            uri,
            arrayOf(MediaStore.MediaColumns.WIDTH, MediaStore.MediaColumns.HEIGHT),
            null,
            null,
            null,
        )?.use { curseur ->
            if (curseur.moveToFirst()) {
                val largeur = curseur.getInt(0)
                val hauteur = curseur.getInt(1)
                if (largeur > 0 && hauteur > 0) largeur to hauteur else null
            } else {
                null
            }
        } ?: return Size(cible, cible)

        val (largeur, hauteur) = dimensions
        return if (largeur >= hauteur) {
            Size(cible, (cible.toLong() * hauteur / largeur).toInt().coerceAtLeast(1))
        } else {
            Size((cible.toLong() * largeur / hauteur).toInt().coerceAtLeast(1), cible)
        }
    }

    /**
     * Décode l'image depuis ses octets d'origine (`BitmapFactory` +
     * `inSampleSize`), au lieu de passer par le cache de `loadThumbnail`.
     * Contrepartie : contrairement à `loadThumbnail`, ce chemin n'applique
     * pas l'orientation EXIF tout seul — on la relit et on tourne le bitmap
     * nous-mêmes.
     */
    private fun decoderImageSource(uri: Uri, cible: Int): Bitmap {
        val taille = tailleDecodage(uri, cible)

        val bornes = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        activity.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, bornes)
        }
        if (bornes.outWidth <= 0 || bornes.outHeight <= 0) {
            // Bornes illisibles (format exotique, fichier distant lent…) :
            // le cache système reste un repli raisonnable.
            return activity.contentResolver.loadThumbnail(uri, taille, null)
        }

        var echantillon = 1
        while (
            bornes.outWidth / (echantillon * 2) >= taille.width &&
            bornes.outHeight / (echantillon * 2) >= taille.height
        ) {
            echantillon *= 2
        }

        val brut = activity.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = echantillon })
        } ?: return activity.contentResolver.loadThumbnail(uri, taille, null)

        val rotation = try {
            activity.contentResolver.openInputStream(uri)?.use { flux ->
                when (ExifInterface(flux).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
            } ?: 0
        } catch (e: Exception) {
            0
        }

        if (rotation == 0) return brut
        val matrice = Matrix().apply { postRotate(rotation.toFloat()) }
        return Bitmap.createBitmap(brut, 0, 0, brut.width, brut.height, matrice, true)
    }

    /**
     * Vignette au ratio d'origine, encodée en data URI.
     *
     * `loadThumbnail` décode le HEIC nativement et applique déjà l'orientation
     * EXIF. On encode le résultat en base64 plutôt que de renvoyer l'URI
     * `content://` : le rendu de la WebView Android s'exécute dans un
     * processus séparé de l'application, qui n'hérite pas de ses permissions
     * MediaStore — un `<img src="content://…">` n'y charge tout simplement
     * rien, sans erreur visible.
     *
     * On reconstruit l'URI depuis la collection typée (images ou vidéos) —
     * la même que celle utilisée par `scanner()` — plutôt que depuis la
     * collection générique `Files` : `loadThumbnail` s'est révélé peu fiable
     * sur cette dernière selon les appareils.
     */
    @Command
    fun vignette(invoke: Invoke) {
        val args = invoke.parseArgs(ArgsVignette::class.java)
        val collection = if (args.video) {
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }
        val uri = ContentUris.withAppendedId(collection, args.id.toLong())

        val bitmap = try {
            // `loadThumbnail` peut renvoyer une vignette mise en cache par le
            // système, plus petite que la taille demandée — observé sur
            // certains appareils (Samsung notamment) où la carte de tri
            // (jusqu'à 1400px, voir tailleCarte() côté JS) ressortait
            // visiblement moins nette que la vraie photo. En dessous de ce
            // seuil (grille, éventail des cartes de mois), le cache système
            // suffit largement et reste plus rapide — la nouvelle méthode ne
            // sert que là où l'écart de netteté se voit vraiment.
            if (!args.video && args.taille > SEUIL_DECODE_SOURCE) {
                decoderImageSource(uri, args.taille)
            } else {
                activity.contentResolver.loadThumbnail(uri, tailleDecodage(uri, args.taille), null)
            }
        } catch (e: Exception) {
            invoke.reject("vignette indisponible (id=${args.id}, video=${args.video}) : ${e.javaClass.simpleName} ${e.message}")
            return
        }

        val flux = ByteArrayOutputStream()
        val compresse = bitmap.compress(Bitmap.CompressFormat.JPEG, 82, flux)
        if (!compresse || flux.size() == 0) {
            // `compress` renvoie un booléen de succès qu'il est facile
            // d'ignorer par erreur : un échec silencieux ici produirait une
            // data URI vide, donc une résolution « réussie » mais une image
            // introuvable côté WebView — indiscernable d'un vrai bug de
            // rendu sans ce garde-fou explicite.
            invoke.reject(
                "vignette indisponible (id=${args.id}) : compression JPEG vide (ok=$compresse, octets=${flux.size()}, bitmap=${bitmap.width}x${bitmap.height})",
            )
            return
        }
        val base64 = Base64.encodeToString(flux.toByteArray(), Base64.NO_WRAP)

        val ret = JSObject()
        ret.put("uri", "data:image/jpeg;base64,$base64")
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
        val items = invoke.parseArgs(ArgsMedias::class.java).items
        if (items.isEmpty()) {
            val ret = JSObject()
            ret.put("nombre", 0)
            invoke.resolve(ret)
            return
        }
        val uris = urisDepuisItems(items)
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
        val items = invoke.parseArgs(ArgsMedias::class.java).items
        if (items.isEmpty()) {
            val ret = JSObject()
            ret.put("nombre", 0)
            invoke.resolve(ret)
            return
        }
        val uris = urisDepuisItems(items)
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
        val items = invoke.parseArgs(ArgsMedias::class.java).items
        if (items.isEmpty()) {
            val ret = JSObject()
            ret.put("nombre", 0)
            invoke.resolve(ret)
            return
        }
        val uris = urisDepuisItems(items)
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

    /**
     * Construit les URIs typées (Images/Video) depuis les identifiants ET le
     * type déjà connus côté JS (même `scanner()` que pour tout le reste).
     *
     * `createTrashRequest`/`createDeleteRequest` rejettent les URIs de la
     * collection générique `Files` avec « All requested items must be Media
     * items » (confirmé par un rapport de diagnostic réel) — même piège déjà
     * rencontré et corrigé pour `loadThumbnail` (voir vignette()). Une
     * première version de ce correctif interrogeait `Files` côté natif pour
     * retrouver le type de chaque média avant de reconstruire l'URI typée —
     * mais cette requête s'est révélée elle-même bloquante sur un appareil
     * réel (aucune boîte système ne s'affichait, aucune erreur ne remontait,
     * blocage total du thread principal donc de la WebView elle-même — plus
     * aucun filet JS ne pouvait s'exécuter pour s'en sortir). Plus aucune
     * requête ici : le type voyage avec chaque id depuis le JS, qui le
     * connaît déjà.
     */
    private fun urisDepuisItems(items: Array<ArgMediaItem>): List<Uri> = items.map {
        val collection = if (it.video) {
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }
        ContentUris.withAppendedId(collection, it.id.toLong())
    }

    companion object {
        private const val DEMANDE_LECTURE = 4001
        // Au-dessus de ça, un décodage depuis la source (voir
        // decoderImageSource) : en dessous, le cache loadThumbnail suffit et
        // reste plus rapide (grille, éventail des cartes de mois).
        private const val SEUIL_DECODE_SOURCE = 400
    }
}

// `@InvokeArg` protège la classe de l'obfuscation R8 en build release : sans
// elle, Jackson ne peut plus reconstruire l'objet par réflexion une fois le
// constructeur/les champs renommés — `invoke.parseArgs()` rejette alors
// TOUJOURS l'appel, silencieusement pour l'utilisateur (la vignette reste
// blanche). C'est très exactement ce qui s'est produit ici, absent depuis la
// toute première version de ce fichier.
@InvokeArg
class ArgsVignette {
    lateinit var id: String
    var taille: Int = 200
    var video: Boolean = false
}

/** Un média ciblé par une opération corbeille — `video` permet de
 *  reconstruire l'URI typée sans requête MediaStore supplémentaire côté
 *  natif (voir urisDepuisItems). */
@InvokeArg
class ArgMediaItem {
    lateinit var id: String
    var video: Boolean = false
}

@InvokeArg
class ArgsMedias {
    lateinit var items: Array<ArgMediaItem>
}
