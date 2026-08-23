/**
 * El modo ventana: el menú dibujado en una ventana propia.
 *
 * Hacen falta las dos mitades. La aplicación que quiere el menú llama a
 * `openContextMenuWindow`; la ruta que la aplicación registró para el menú
 * llama a `mountContextMenuWindow`, que es la que dibuja.
 */

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { HOLGURA, MenuDibujado } from "./render";
import { injectStyle } from "./style";
import { paletaDelSistema } from "./theme";
import type { MenuChoice, MenuEntry, ShowOptions } from "./types";

const EVENTO_RESULTADO = "vsk-context-menu-result";

interface Resultado {
  id: string | null;
  checked: boolean | null;
}

/** Abre el menú en una ventana propia y espera lo que se elija. */
export async function openContextMenuWindow(
  items: MenuEntry[],
  punto: { x: number; y: number },
  opciones: ShowOptions = {},
): Promise<MenuChoice | null> {
  const ventana = getCurrentWindow();

  // El clic viene en coordenadas de la página; la ventana del menú se ubica en
  // coordenadas de la pantalla. Adentro de un webview no hay forma de saber
  // dónde está el puntero en la pantalla, así que se suma a mano dónde empieza
  // esta ventana. En Wayland tampoco se puede preguntar desde Rust.
  const [origen, escala] = await Promise.all([
    ventana.innerPosition(),
    ventana.scaleFactor(),
  ]);

  const x = Math.round(origen.x + punto.x * escala);
  const y = Math.round(origen.y + punto.y * escala);

  return new Promise<MenuChoice | null>((resolver, rechazar) => {
    let desuscribir: (() => void) | null = null;

    const terminar = (eleccion: MenuChoice | null) => {
      desuscribir?.();
      desuscribir = null;
      resolver(eleccion);
    };

    ventana
      .listen<Resultado>(EVENTO_RESULTADO, ({ payload }) => {
        terminar(
          payload.id === null
            ? null
            : {
                id: payload.id,
                ...(payload.checked === null ? {} : { checked: payload.checked }),
              },
        );
      })
      .then((parar) => {
        desuscribir = parar;

        return invoke("plugin:vsk-contextual-menu|open_menu_window", {
          request: {
            items,
            x,
            y,
            minWidth: opciones.minWidth ?? null,
            maxWidth: opciones.maxWidth ?? null,
          },
        });
      })
      .catch((error) => {
        desuscribir?.();
        rechazar(error);
      });
  });
}

/**
 * Dibuja el menú en la ventana que el plugin abrió.
 *
 * Es lo único que tiene que hacer la ruta que la aplicación registra para el
 * menú. Devuelve cuando el menú ya está dibujado y visible.
 */
export async function mountContextMenuWindow(): Promise<void> {
  injectStyle();

  // La ventana es transparente: cualquier fondo que traiga la aplicación se
  // vería como un rectángulo opaco alrededor del menú.
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";

  // Las dos cosas juntas: la ventana recién montó y todo lo que tarde en llegar
  // es tiempo con la pantalla vacía.
  const [items, paleta] = await Promise.all([
    invoke<MenuEntry[] | null>("plugin:vsk-contextual-menu|take_pending_menu"),
    paletaDelSistema(),
  ]);

  if (!items || items.length === 0) {
    await invoke("plugin:vsk-contextual-menu|close_menu_window");
    return;
  }

  const fondo = document.createElement("div");
  fondo.className = "vsk-menu-fondo";
  document.body.appendChild(fondo);

  const menu = new MenuDibujado(fondo, {
    items,
    paleta,
    alElegir: (eleccion) => {
      menu.cerrar();
      void invoke("plugin:vsk-contextual-menu|resolve_menu", {
        id: eleccion.id,
        checked: eleccion.checked ?? null,
      });
    },
    alDescartar: () => {
      menu.cerrar();
      void invoke("plugin:vsk-contextual-menu|close_menu_window");
    },
  });

  // El panel va en la esquina, adentro del borde transparente que Rust dejó
  // para la sombra y para los submenús.
  menu.elemento.style.left = `${HOLGURA}px`;
  menu.elemento.style.top = `${HOLGURA}px`;
  menu.abrir();

  // Recién ahora se muestra la ventana: mostrarla antes deja ver un rectángulo
  // vacío del tamaño final.
  await invoke("plugin:vsk-contextual-menu|show_menu_window");
}
