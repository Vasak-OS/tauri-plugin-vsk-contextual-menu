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

/**
 * Completa el `type` de cada renglón antes de cruzar a Rust.
 *
 * En una opción común el tipo es opcional —lo dice el tipo de TypeScript, y así
 * está escrito en todos los ejemplos—: quien la escribe pone `id` y `label` y
 * nada más. El JavaScript que dibuja el menú lo resuelve solo
 * (`item.type ?? "item"`), pero del lado de Rust el árbol es un enum etiquetado
 * por ese campo, y sin él la deserialización falla con «missing field `type`»:
 * el menú no abría y la aplicación sólo veía un error de argumentos.
 *
 * Se completa acá, que es el único lugar donde el árbol sale de JavaScript.
 */
export function conTipo(items: MenuEntry[]): MenuEntry[] {
  return items.map((item) => {
    if (!("type" in item) || item.type === undefined) {
      return { ...item, type: "item" } as MenuEntry;
    }

    // Un submenú trae adentro más renglones, con el mismo problema.
    if (item.type === "submenu") {
      return { ...item, items: conTipo(item.items) };
    }

    return item;
  });
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
            items: conTipo(items),
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
    // Acá el menú es su propia ventana: `blur` y `resize` de la página llegan
    // solos al mostrarla —al mapearse cambia de tamaño y el foco va y viene con
    // la ventana que la pidió— y cerraban el menú a los cien milisegundos de
    // abrirse, sin que llegara a verse. El foco lo maneja esta función, más
    // abajo, con los eventos de la ventana de verdad.
    cerrarAlPerderElFoco: false,
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

  // Se cierra cuando la ventana pierde el foco, pero recién después de haberlo
  // tenido: entre que se crea y se muestra, el compositor manda un par de
  // cambios de foco que no significan que alguien se haya ido a otra cosa.
  const ventana = getCurrentWindow();
  let tuvoElFoco = false;

  const dejarDeEscuchar = await ventana.onFocusChanged(({ payload: enfocada }) => {
    if (enfocada) {
      tuvoElFoco = true;
      return;
    }

    if (!tuvoElFoco) {
      return;
    }

    dejarDeEscuchar();
    menu.cerrar();
    void invoke("plugin:vsk-contextual-menu|close_menu_window");
  });
}
