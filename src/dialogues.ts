/* Dialogues Krino : remplacent alert/confirm/prompt natifs (centrés, thème,
   pas de mention localhost). Un seul <dialog> réutilisé, API à Promise. */

type Options = { danger?: boolean; valeurInitiale?: string };

function elements() {
  const dlg = document.getElementById("dialogue-krino") as HTMLDialogElement;
  return {
    dlg,
    texte: dlg.querySelector(".dialogue-texte") as HTMLElement,
    champ: dlg.querySelector(".dialogue-champ") as HTMLInputElement,
    ok: dlg.querySelector(".dialogue-ok") as HTMLButtonElement,
    annuler: dlg.querySelector(".dialogue-annuler") as HTMLButtonElement,
  };
}

function ouvrir(message: string, mode: "confirmer" | "demander" | "informer",
                opts: Options = {}): Promise<string | null> {
  const { dlg, texte, champ, ok, annuler } = elements();
  texte.textContent = message;
  champ.hidden = mode !== "demander";
  champ.value = opts.valeurInitiale ?? "";
  annuler.hidden = mode === "informer";
  ok.classList.toggle("btn-danger", !!opts.danger);
  return new Promise((resoudre) => {
    const fermer = (valeur: string | null) => {
      ok.onclick = annuler.onclick = null;
      dlg.onclose = null;
      if (dlg.open) dlg.close();
      resoudre(valeur);
    };
    ok.onclick = () => fermer(mode === "demander" ? champ.value.trim() : "ok");
    annuler.onclick = () => fermer(null);
    dlg.onclose = () => fermer(null); // Échap
    champ.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); ok.click(); } };
    dlg.showModal();
    if (mode === "demander") champ.focus();
    else ok.focus();
  });
}

/** confirm() maison — résout true si confirmé. */
export async function confirmer(message: string, opts: Options = {}): Promise<boolean> {
  return (await ouvrir(message, "confirmer", opts)) !== null;
}

/** prompt() maison — résout la saisie (trim) ou null si annulé/vide. */
export async function demander(message: string, opts: Options = {}): Promise<string | null> {
  const v = await ouvrir(message, "demander", opts);
  return v ? v : null;
}

/** alert() maison. */
export async function informer(message: string): Promise<void> {
  await ouvrir(message, "informer");
}
