/**
 * El envoltorio para Vue.
 *
 * Vive en un archivo aparte y Vue es una dependencia opcional: una aplicación
 * que no use Vue puede usar el menú igual, con `showContextMenu`.
 */

import { onBeforeUnmount, onMounted } from "vue";

import { closeContextMenu, showContextMenu } from "./api";
import type { MenuAnchor, MenuChoice, MenuEntry, ShowOptions } from "./types";
import { mountContextMenuWindow } from "./window-mode";

export function useContextMenu() {
  // Un menú abierto sobrevive a la vista que lo abrió si nadie lo cierra: al
  // desmontarse el componente ya no hay quién atienda lo que se elija.
  onBeforeUnmount(() => closeContextMenu());

  return {
    show: (items: MenuEntry[], donde: MenuAnchor, opciones?: ShowOptions) =>
      showContextMenu(items, donde, opciones),
    close: closeContextMenu,
  };
}

/**
 * Para el componente que la aplicación pone en la ruta del menú.
 *
 * ```vue
 * <script setup lang="ts">
 * import { useContextMenuWindow } from "@vasakgroup/plugin-vsk-contextual-menu/vue";
 * useContextMenuWindow();
 * </script>
 * <template><div /></template>
 * ```
 */
export function useContextMenuWindow(): void {
  onMounted(() => {
    void mountContextMenuWindow();
  });
}

export type { MenuChoice, MenuEntry };
