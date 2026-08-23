/**
 * El menú contextual de VasakOS.
 *
 * Un solo menú para todo el sistema: las aplicaciones describen qué opciones
 * ofrecen y el plugin decide cómo se ven, cómo responden al teclado y cómo se
 * cierran.
 *
 * ```ts
 * const elegido = await showContextMenu(
 *   [
 *     { id: "copiar", label: t("actions.copy"), icon: "edit-copy", accelerator: "Ctrl+C" },
 *     { type: "separator" },
 *     { id: "borrar", label: t("actions.delete"), icon: "edit-delete", danger: true },
 *   ],
 *   evento,
 * );
 *
 * if (elegido?.id === "copiar") copiar();
 * ```
 */

export type {
  MenuAnchor,
  MenuCheckbox,
  MenuChoice,
  MenuEntry,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSubmenu,
  ShowOptions,
} from "./types";

export {
  closeContextMenu,
  disableNativeContextMenu,
  setupContextMenu,
  showContextMenu,
} from "./api";
export { setIconResolver } from "./render";
export { mountContextMenuWindow, openContextMenuWindow } from "./window-mode";
export { useContextMenu, useContextMenuWindow } from "./composable";
