/**
 * De dónde saca el menú sus colores y su redondeo.
 *
 * Los pide config-manager: el esquema de colores que el sistema tiene elegido y
 * el radio de las esquinas, los mismos que usa el resto del escritorio. No
 * alcanza con leer las variables CSS de la aplicación, porque el menú tiene que
 * verse bien igual cuando se dibuja antes de que la aplicación haya cargado su
 * configuración —la ventana del modo ventana monta y dibuja en ese hueco— y
 * cuando la aplicación no define esas variables.
 *
 * Si config-manager no está, o no contesta, el menú cae a las variables del
 * sistema (`--use-*`) y de ahí al color de fábrica: no se queda sin dibujar por
 * no saber de qué color pintarse.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Los colores que el menú necesita, ya elegidos entre claro y oscuro. */
export interface Paleta {
  fondo: string;
  borde: string;
  texto: string;
  textoTenue: string;
  primario: string;
  textoSobrePrimario: string;
  /** El radio de las esquinas, con unidad. */
  radio: string;
}

interface EsquemaUi {
  color: { primary: string; secondary: string };
  text: { main: string; muted: string; "on-primary": string };
  background: string;
  border: string;
  surface: string;
}

interface Esquema {
  scheme: { colors: { dark: { ui: EsquemaUi }; light: { ui: EsquemaUi } } };
}

interface Configuracion {
  style?: {
    darkmode?: boolean;
    "color-scheme"?: string;
    radius?: number;
  };
}

let pedido: Promise<Paleta | null> | null = null;
let escuchando = false;

/**
 * La paleta del sistema, o `null` si config-manager no está disponible.
 *
 * Se pide una sola vez y se recuerda: un menú se abre muchas veces por minuto y
 * la configuración cambia unas pocas veces por día. El evento `config-changed`
 * —el mismo que escuchan las aplicaciones— la vuelve a pedir.
 */
export function paletaDelSistema(): Promise<Paleta | null> {
  escuchar();
  pedido ??= leer();
  return pedido;
}

/** Vuelve a pedirla la próxima vez que haga falta. */
export function olvidarPaleta(): void {
  pedido = null;
}

/**
 * La pide ya, para que el primer clic derecho no espere.
 *
 * Sin esto el primer menú del programa espera dos idas y vueltas al backend
 * antes de dibujarse. Son pocos milisegundos, pero son los del primer clic.
 */
export function precargarPaleta(): void {
  void paletaDelSistema();
}

function escuchar(): void {
  if (escuchando) return;
  escuchando = true;

  void listen("config-changed", () => olvidarPaleta()).catch(() => {
    // Sin eventos el menú sigue andando: se queda con la paleta que leyó.
  });
}

async function leer(): Promise<Paleta | null> {
  try {
    const crudo = await invoke<string>("plugin:config-manager|read_config");
    if (!crudo) return null;

    const config = JSON.parse(crudo) as Configuracion;
    const estilo = config.style ?? {};

    const radio =
      typeof estilo.radius === "number" ? `${estilo.radius}px` : "10px";

    const id = estilo["color-scheme"];
    if (!id) return null;

    const esquema = await invoke<Esquema | null>(
      "plugin:config-manager|get_scheme_by_id",
      { schemeId: id },
    );
    if (!esquema) return null;

    const variante = estilo.darkmode
      ? esquema.scheme.colors.dark
      : esquema.scheme.colors.light;

    return {
      fondo: variante.ui.background,
      borde: variante.ui.border,
      texto: variante.ui.text.main,
      textoTenue: variante.ui.text.muted,
      primario: variante.ui.color.primary,
      textoSobrePrimario: variante.ui.text["on-primary"],
      radio,
    };
  } catch {
    // config-manager no está instalado, o esta ventana no tiene su permiso.
    return null;
  }
}

/** Le pinta la paleta a un panel del menú. */
export function aplicarPaleta(panel: HTMLElement, paleta: Paleta | null): void {
  if (!paleta) return;

  panel.style.setProperty("--vsk-menu-fondo", paleta.fondo);
  panel.style.setProperty("--vsk-menu-borde", paleta.borde);
  panel.style.setProperty("--vsk-menu-texto", paleta.texto);
  panel.style.setProperty("--vsk-menu-texto-tenue", paleta.textoTenue);
  panel.style.setProperty("--vsk-menu-primario", paleta.primario);
  panel.style.setProperty("--vsk-menu-texto-sobre-primario", paleta.textoSobrePrimario);
  panel.style.setProperty("--vsk-menu-radio", paleta.radio);
}
