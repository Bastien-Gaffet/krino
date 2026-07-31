; Hook de désinstallation NSIS pour Krino.
;
; Le désinstalleur standard généré par Tauri supprime l'exécutable et les
; raccourcis, mais ne touche pas au profil WebView2 (réglages, thème, langue,
; dossiers récents, identifiant anonyme des statistiques — voir
; docs/CONFIDENTIALITE.md), stocké sous %LOCALAPPDATA%\com.basti.krino. On
; propose donc explicitement à l'utilisateur de le conserver (pour retrouver
; ses réglages à une réinstallation) ou de tout supprimer proprement.
;
; Les .krino/ créés dans les dossiers de photos triés par l'utilisateur ne
; sont volontairement jamais touchés ici : ce ne sont pas des données
; applicatives, ils appartiennent au dossier de l'utilisateur.

!macro NSIS_HOOK_POSTUNINSTALL
  MessageBox MB_YESNO|MB_ICONQUESTION "Supprimer aussi vos réglages Krino (thème, langue, dossiers récents, identifiant de statistiques) ?$\r$\n$\r$\nChoisissez Non pour les retrouver tels quels en cas de réinstallation." IDNO krino_garder_profil
    RMDir /r "$LOCALAPPDATA\com.basti.krino"
  krino_garder_profil:
!macroend
