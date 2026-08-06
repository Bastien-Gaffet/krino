package app.krino.media

import android.content.ContentUris
import android.content.Context
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import java.io.BufferedOutputStream
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/**
 * Petit serveur HTTP local (127.0.0.1 uniquement), pour streamer les vidéos
 * vers la balise `<video>` de la WebView.
 *
 * Une URI `content://` assignée directement à `<video src>` ne charge rien
 * dans la WebView Android — même limitation de process-isolation déjà
 * rencontrée pour les `<img>` (contournée par un encodage base64, mais une
 * vidéo entière ne tient pas raisonnablement en mémoire comme une image).
 * Passer par une vraie URL `http://` locale laisse la WebView gérer le
 * streaming, le buffering et le seeking normalement — y compris les
 * requêtes `Range`, nécessaires pour avancer dans la vidéo sans devoir tout
 * retélécharger depuis le début.
 *
 * N'écoute que sur la boucle locale (127.0.0.1) : jamais exposé au réseau.
 * Une connexion par requête (pas de keep-alive) : plus simple à implémenter
 * correctement, et largement suffisant pour un usage strictement local.
 */
class VideoServer(private val context: Context) {
    private var serverSocket: ServerSocket? = null

    /** Port effectivement choisi par l'OS (0 tant que pas démarré). */
    var port: Int = 0
        private set

    @Synchronized
    fun demarrerSiBesoin(): Int {
        serverSocket?.let { if (!it.isClosed) return port }

        // `getLoopbackAddress()` ne garantit PAS 127.0.0.1 : sa javadoc dit
        // qu'elle peut renvoyer l'adresse IPv4 OU IPv6 (::1) selon la
        // plateforme. Le client (JS) cible explicitement "127.0.0.1" — un
        // décalage IPv4/IPv6 ferait échouer la connexion silencieusement.
        val socket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
        serverSocket = socket
        port = socket.localPort

        thread(name = "krino-video-server", isDaemon = true) {
            while (!socket.isClosed) {
                try {
                    val client = socket.accept()
                    thread(name = "krino-video-client", isDaemon = true) { traiter(client) }
                } catch (e: IOException) {
                    // Socket fermée (arrêt de l'appli) : la boucle s'arrête
                    // d'elle-même puisque `socket.isClosed` devient vrai.
                }
            }
        }
        return port
    }

    private fun traiter(client: Socket) {
        client.use { s ->
            try {
                val entree = s.getInputStream().bufferedReader(Charsets.ISO_8859_1)
                val ligneRequete = entree.readLine() ?: return
                val parties = ligneRequete.split(" ")
                if (parties.size < 2) {
                    repondreErreur(s, 400, "Bad Request")
                    return
                }
                val methode = parties[0]
                val chemin = parties[1]

                var rangeEntete: String? = null
                while (true) {
                    val ligne = entree.readLine() ?: break
                    if (ligne.isEmpty()) break
                    val sep = ligne.indexOf(':')
                    if (sep > 0 && ligne.substring(0, sep).trim().equals("Range", ignoreCase = true)) {
                        rangeEntete = ligne.substring(sep + 1).trim()
                    }
                }

                // Chromium (donc la WebView Android) applique désormais
                // « Private Network Access » : une page envoie d'abord un
                // préflight OPTIONS avec Access-Control-Request-Private-Network
                // avant toute requête vers une adresse privée/loopback, et
                // exige Access-Control-Allow-Private-Network: true en retour
                // — sinon la vraie requête n'est même pas envoyée, et fetch()
                // échoue avec un simple "Failed to fetch" sans détail. Comme
                // ce serveur ne répondait qu'à GET (405 sur le reste, sans le
                // moindre en-tête CORS), le préflight échouait silencieusement.
                if (methode == "OPTIONS") {
                    repondrePreflight(s)
                    return
                }
                if (methode != "GET") {
                    repondreErreur(s, 405, "Method Not Allowed")
                    return
                }

                val id = chemin.removePrefix("/video/").substringBefore("?").toLongOrNull()
                if (id == null) {
                    repondreErreur(s, 404, "Not Found")
                    return
                }
                servirVideo(s, id, rangeEntete)
            } catch (e: IOException) {
                // Client parti en cours de route (changement de carte,
                // fermeture de l'appli…) : rien à faire, juste ne pas planter.
            }
        }
    }

    /**
     * Taille réelle du média, en octets, ou -1 si indéterminable.
     *
     * NE PAS utiliser `AssetFileDescriptor.getLength()` ici : l'implémentation
     * par défaut de `ContentProvider.openAssetFile()` enveloppe le fichier
     * avec `AssetFileDescriptor.UNKNOWN_LENGTH` (-1), et MediaProvider ne la
     * redéfinit pas pour `openAssetFileDescriptor`. On lisait donc -1, d'où
     * un `Content-Length: 0` : une réponse HTTP 200 parfaitement valide mais
     * vide, que le lecteur ne peut pas décoder — sans lever la moindre
     * erreur, puisque la requête a « réussi ». C'était la vraie cause de la
     * lecture bloquée (aperçu visible, contrôles grisés, aucun rapport).
     *
     * `ParcelFileDescriptor.getStatSize()` fait un vrai `fstat` sur le
     * descripteur ; la colonne MediaStore SIZE sert de repli.
     */
    private fun tailleReelle(pfd: ParcelFileDescriptor, uri: android.net.Uri): Long {
        val parStat = try {
            pfd.statSize
        } catch (e: Exception) {
            -1L
        }
        if (parStat > 0) return parStat

        return context.contentResolver.query(
            uri,
            arrayOf(MediaStore.MediaColumns.SIZE),
            null,
            null,
            null,
        )?.use { c -> if (c.moveToFirst()) c.getLong(0) else -1L } ?: -1L
    }

    private fun servirVideo(s: Socket, id: Long, rangeEntete: String?) {
        val uri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
        val resolver = context.contentResolver

        val mime = resolver.query(
            uri,
            arrayOf(MediaStore.MediaColumns.MIME_TYPE),
            null,
            null,
            null,
        )?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: "video/mp4"

        val pfd = try {
            resolver.openFileDescriptor(uri, "r")
        } catch (e: Exception) {
            null
        }
        if (pfd == null) {
            repondreErreur(s, 404, "Not Found")
            return
        }

        pfd.use { descripteur ->
            val longueurTotale = tailleReelle(descripteur, uri)
            if (longueurTotale <= 0) {
                // Mieux vaut une vraie erreur HTTP qu'un 200 vide : un corps
                // vide est indiscernable d'un problème de lecteur côté client.
                repondreErreur(s, 500, "Taille du média indeterminable")
                return
            }

            var debut = 0L
            var fin = longueurTotale - 1
            if (rangeEntete != null && rangeEntete.startsWith("bytes=")) {
                val plage = rangeEntete.removePrefix("bytes=").split("-")
                plage.getOrNull(0)?.trim()?.toLongOrNull()?.let { debut = it }
                plage.getOrNull(1)?.trim()?.toLongOrNull()?.let { fin = it }
            }
            debut = debut.coerceIn(0, longueurTotale - 1)
            fin = fin.coerceIn(debut, longueurTotale - 1)
            val longueur = fin - debut + 1

            val sortie = BufferedOutputStream(s.getOutputStream())
            val statut = if (rangeEntete != null) "206 Partial Content" else "200 OK"
            val entetes = buildString {
                append("HTTP/1.1 $statut\r\n")
                append("Content-Type: $mime\r\n")
                append("Accept-Ranges: bytes\r\n")
                append("Content-Length: $longueur\r\n")
                if (rangeEntete != null) append("Content-Range: bytes $debut-$fin/$longueurTotale\r\n")
                appendCorsPna(this)
                append("Connection: close\r\n")
                append("\r\n")
            }
            sortie.write(entetes.toByteArray(Charsets.ISO_8859_1))

            // `InputStream.skip()` peut sauter MOINS d'octets que demandé (c'est
            // documenté) : pour un Range, on positionne le canal, seul moyen
            // fiable de servir exactement la plage demandée.
            ParcelFileDescriptor.AutoCloseInputStream(descripteur).use { flux ->
                flux.channel.position(debut)
                val tampon = ByteArray(64 * 1024)
                var reste = longueur
                while (reste > 0) {
                    val lus = flux.read(tampon, 0, minOf(tampon.size.toLong(), reste).toInt())
                    if (lus <= 0) break
                    sortie.write(tampon, 0, lus)
                    reste -= lus
                }
            }
            sortie.flush()
        }
    }

    /**
     * En-têtes CORS + Private Network Access, sur TOUTE réponse (succès et
     * erreurs) : Chromium vérifie ces en-têtes indépendamment du code de
     * statut, et un 404/500 sans eux romprait aussi la requête `fetch()`.
     */
    private fun appendCorsPna(sb: StringBuilder) {
        sb.append("Access-Control-Allow-Origin: *\r\n")
        sb.append("Access-Control-Allow-Private-Network: true\r\n")
        sb.append("Access-Control-Allow-Methods: GET, OPTIONS\r\n")
        sb.append("Access-Control-Allow-Headers: Range\r\n")
        sb.append("Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n")
    }

    private fun repondrePreflight(s: Socket) {
        val entetes = buildString {
            append("HTTP/1.1 204 No Content\r\n")
            appendCorsPna(this)
            append("Content-Length: 0\r\n")
            append("Connection: close\r\n")
            append("\r\n")
        }
        s.getOutputStream().apply {
            write(entetes.toByteArray(Charsets.ISO_8859_1))
            flush()
        }
    }

    private fun repondreErreur(s: Socket, code: Int, texte: String) {
        val corps = texte.toByteArray(Charsets.UTF_8)
        val entetes = buildString {
            append("HTTP/1.1 $code $texte\r\n")
            append("Content-Length: ${corps.size}\r\n")
            appendCorsPna(this)
            append("Connection: close\r\n")
            append("\r\n")
        }
        s.getOutputStream().apply {
            write(entetes.toByteArray(Charsets.ISO_8859_1))
            write(corps)
            flush()
        }
    }
}
