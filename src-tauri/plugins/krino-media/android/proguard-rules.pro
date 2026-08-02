# Filet de sécurité pour tout le code du plugin.
#
# Tauri fournit déjà des règles génériques (mobile/android/proguard-rules.pro
# dans le crate `tauri`) qui protègent les méthodes @Command/@PermissionCallback/
# @ActivityCallback des classes @TauriPlugin, et les classes @InvokeArg. On a
# déjà été mordu une fois par une classe (ArgsVignette/ArgsIds) qui n'avait pas
# @InvokeArg et se faisait renommer par R8, cassant la désérialisation Jackson
# en silence (invoke.parseArgs() rejetait systématiquement, sans jamais planter
# la build — juste un échec muet à l'exécution). Les méthodes de callback
# (resultatPermission, resultatCorbeille…) sont retrouvées par LEUR NOM au
# moment de l'exécution (HashMap indexé par method.name) : si R8 les renomme
# pour une raison quelconque malgré la règle générique, l'appel ne plante pas
# non plus — il ne se termine simplement jamais, invisible sans ce filet.
#
# Plutôt que de dépendre uniquement des règles fines de Tauri pour deviner
# correctement à chaque nouvelle classe/méthode qu'on ajoute, on protège tout
# le paquet du plugin : il est minuscule, le coût en taille d'APK est nul.
-keep class app.krino.media.** { *; }
