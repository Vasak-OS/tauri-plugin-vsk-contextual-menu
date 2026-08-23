/**
 * El menú contextual de VasakOS.
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

import { MenuDibujado, setIconResolver } from "./render";
import { paletaDelSistema, precargarPaleta } from "./theme";
import type { MenuAnchor, MenuChoice, MenuEntry, ShowOptions } from "./types";
import { openContextMenuWindow } from "./window-mode";

/**
 * Sólo puede haber un menú abierto por ventana: abrir el segundo cierra el
 * primero, como en cualquier escritorio.
 *
 * Se guarda también cómo descartarlo, y no sólo el menú: cerrarlo sin contestar
 * dejaría esperando para siempre a quien lo abrió.
 */
let abierto: MenuDibujado | null = null;
let descartar: (() => void) | null = null;

function coordenadas(donde: MenuAnchor): { x: number; y: number } {
  if ("clientX" in donde) {
    return { x: donde.clientX, y: donde.clientY };
  }
  return { x: donde.x, y: donde.y };
}

/**
 * Abre el menú y devuelve lo que se eligió, o `null` si se cerró sin elegir.
 *
 * Si `donde` es el evento del clic derecho, además le corta el menú que dibuja
 * el motor del navegador: nadie quiere «Inspeccionar elemento» adentro de una
 * aplicación del escritorio.
 */
export async function showContextMenu(
  items: MenuEntry[],
  donde: MenuAnchor,
  opciones: ShowOptions = {},
): Promise<MenuChoice | null> {
  if ("preventDefault" in donde) {
    donde.preventDefault();
  }

  const punto = coordenadas(donde);

  if (opciones.window) {
    return openContextMenuWindow(items, punto, opciones);
  }

  closeContextMenu();

  if (items.length === 0) {
    return null;
  }

  // Los colores del sistema. Vienen de una sola lectura que queda guardada, así
  // que sólo el primer menú del programa espera algo, y poco.
  const paleta = await paletaDelSistema();

  return new Promise<MenuChoice | null>((resolver) => {
    const terminar = (eleccion: MenuChoice | null) => {
      if (abierto === menu) {
        abierto = null;
        descartar = null;
      }
      menu.cerrar();
      resolver(eleccion);
    };

    const menu = new MenuDibujado(document.body, {
      items,
      paleta,
      minWidth: opciones.minWidth,
      maxWidth: opciones.maxWidth,
      alElegir: terminar,
      alDescartar: () => terminar(null),
    });

    abierto = menu;
    descartar = () => terminar(null);
    menu.colocar(punto.x, punto.y);
    menu.abrir();
  });
}

/**
 * Cierra el menú abierto, si hay alguno.
 *
 * Quien lo haya abierto recibe `null`, igual que si se lo hubiera descartado con
 * Escape: para la aplicación que espera una respuesta, cerrarle el menú por
 * abajo y que nadie le conteste son la misma situación.
 */
export function closeContextMenu(): void {
  const cerrar = descartar;
  descartar = null;
  cerrar?.();
  abierto = null;
}

/**
 * Apaga el menú del clic derecho que dibuja el motor del navegador en toda la
 * ventana.
 *
 * WebKit ofrece «Recargar» e «Inspeccionar elemento» sobre una aplicación que
 * no es una página web: ninguna de las dos tiene sentido, y recargar deja la
 * ventana en un estado que nadie pidió. Prevenir el comportamiento por defecto
 * no cancela los escuchas de la página, así que los menús propios siguen
 * abriéndose igual.
 */
export function disableNativeContextMenu(): void {
  document.addEventListener("contextmenu", (evento) => evento.preventDefault(), {
    capture: true,
  });
}

/** Todo junto, para el arranque de la aplicación. */
export function setupContextMenu(opciones: {
  /** Cómo convertir un nombre de icono del sistema en una imagen. */
  iconResolver?: (nombre: string) => Promise<string> | string;
  /** Apagar el menú de WebKit. Por omisión, sí. */
  disableNative?: boolean;
} = {}): void {
  if (opciones.iconResolver) {
    setIconResolver(opciones.iconResolver);
  }
  if (opciones.disableNative !== false) {
    disableNativeContextMenu();
  }

  precargarPaleta();
}

