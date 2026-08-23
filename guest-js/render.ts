/**
 * El que dibuja.
 *
 * No sabe de Tauri ni de Vue: recibe una lista de ítems y un lugar, y devuelve
 * un menú de VasakOS con su teclado, sus submenús y su forma de cerrarse. Los
 * dos modos —dentro del DOM y en ventana propia— usan esto mismo, que es lo que
 * garantiza que se vean y se manejen igual.
 */

import { injectStyle } from "./style";
import { aplicarPaleta, type Paleta } from "./theme";
import type { MenuChoice, MenuEntry } from "./types";

/** El borde transparente del modo ventana. Está también en `src/window.rs`. */
export const HOLGURA = 8;

/** Cuánto se espera antes de abrir un submenú al pasar por encima. */
const ESPERA_SUBMENU = 180;

/** Cuánto tiempo se acumulan las teclas para saltar a una opción por su texto. */
const ESPERA_TIPEO = 800;

/** Lo máximo que se espera a la animación de salida antes de sacarlo igual. */
const ESPERA_MAXIMA_DE_SALIDA = 400;

const ES_IMAGEN = /^(data:|blob:|https?:|file:|\/)/;

type Resolutor = (nombre: string) => Promise<string> | string;

let resolutorDeIconos: Resolutor | null = null;

/**
 * Enseña al menú a convertir nombres de iconos en imágenes.
 *
 * El plugin no depende de vicons a propósito: así se puede usar en cualquier
 * aplicación. Las de VasakOS le pasan `getIconSource` una sola vez al arrancar
 * y a partir de ahí los ítems pueden nombrar iconos del sistema.
 */
export function setIconResolver(resolutor: Resolutor | null): void {
  resolutorDeIconos = resolutor;
}

export interface OpcionesDeDibujo {
  items: MenuEntry[];
  /** Se eligió una opción. */
  alElegir: (eleccion: MenuChoice) => void;
  /** Se cerró sin elegir nada. */
  alDescartar: () => void;
  minWidth?: number;
  maxWidth?: number;
  /** Los colores del sistema. Sin ella, el menú usa los de la aplicación. */
  paleta?: Paleta | null;
}

interface PanelAbierto {
  elemento: HTMLElement;
  items: MenuEntry[];
  /** El ítem del panel anterior que lo abrió. */
  disparador?: HTMLElement;
}

/**
 * Enciende la animación de entrada.
 *
 * Forzar el reflujo y agregar la clase en el mismo momento, en vez de esperar
 * un cuadro: un webview que todavía no se mostró —el del modo ventana— no dibuja
 * cuadros, así que el menú se quedaría invisible esperando uno que no llega.
 */
function mostrar(panel: HTMLElement): void {
  void panel.offsetHeight;
  panel.classList.add("vsk-menu--abierto");
}

function esElegible(item: MenuEntry): boolean {
  const tipo = item.type ?? "item";
  if (tipo === "separator" || tipo === "label") return false;
  return !("disabled" in item && item.disabled);
}

function textoDe(item: MenuEntry): string {
  return "label" in item ? item.label : "";
}

/** El menú abierto: sus paneles, su teclado y su forma de irse. */
export class MenuDibujado {
  private readonly paneles: PanelAbierto[] = [];
  private readonly raiz: HTMLElement;
  private readonly contenedor: HTMLElement;
  private readonly opciones: OpcionesDeDibujo;
  private cerrado = false;
  private tipeado = "";
  private tipeadoEn = 0;
  private esperaSubmenu: number | null = null;

  constructor(contenedor: HTMLElement, opciones: OpcionesDeDibujo) {
    injectStyle();
    this.contenedor = contenedor;
    this.opciones = opciones;
    this.raiz = this.crearPanel(opciones.items);
    this.paneles.push({ elemento: this.raiz, items: opciones.items });

    this.alTeclear = this.alTeclear.bind(this);
    this.alApretarAfuera = this.alApretarAfuera.bind(this);
    this.alPerderElFoco = this.alPerderElFoco.bind(this);

    document.addEventListener("keydown", this.alTeclear, true);
    document.addEventListener("pointerdown", this.alApretarAfuera, true);
    window.addEventListener("blur", this.alPerderElFoco);
    window.addEventListener("resize", this.alPerderElFoco);
  }

  get elemento(): HTMLElement {
    return this.raiz;
  }

  /** Lo pone donde se pidió, corrido hacia adentro si no entra. */
  colocar(x: number, y: number): void {
    const ancho = this.raiz.offsetWidth;
    const alto = this.raiz.offsetHeight;
    const limite = this.limites();

    // Se abre hacia abajo y a la derecha del clic; si de ese lado no entra, se
    // abre para el otro, que es lo que hace cualquier menú del sistema.
    let izquierda = x;
    let arriba = y;
    let origen = "top left";

    if (x + ancho > limite.ancho - HOLGURA) {
      izquierda = Math.max(HOLGURA, x - ancho);
      origen = "top right";
    }
    if (y + alto > limite.alto - HOLGURA) {
      arriba = Math.max(HOLGURA, y - alto);
      origen = origen === "top left" ? "bottom left" : "bottom right";
    }

    this.raiz.style.setProperty("--vsk-menu-origen", origen);
    this.raiz.style.left = `${Math.round(izquierda)}px`;
    this.raiz.style.top = `${Math.round(arriba)}px`;
  }

  /** Lo muestra con su animación y le da el foco a la primera opción. */
  abrir(): void {
    mostrar(this.raiz);
    this.enfocarPrimero(this.raiz);
  }

  /** Cierra todo. `motivo` distingue elegir de descartar. */
  cerrar(): void {
    if (this.cerrado) return;
    this.cerrado = true;

    document.removeEventListener("keydown", this.alTeclear, true);
    document.removeEventListener("pointerdown", this.alApretarAfuera, true);
    window.removeEventListener("blur", this.alPerderElFoco);
    window.removeEventListener("resize", this.alPerderElFoco);
    this.cancelarEspera();

    for (const panel of this.paneles) {
      panel.elemento.classList.remove("vsk-menu--abierto");
      panel.elemento.classList.add("vsk-menu--saliendo");
    }

    let seFue = false;
    const irse = () => {
      if (seFue) return;
      seFue = true;
      for (const panel of this.paneles) {
        panel.elemento.remove();
      }
      this.paneles.length = 0;
    };

    // Se va cuando termina de irse, pero con un tope: una animación que nunca
    // termina —una ventana que dejó de dibujar cuadros, alguien que pidió menos
    // movimiento— dejaría el menú colgado del documento para siempre.
    const animacion = this.raiz.getAnimations?.() ?? [];
    const termino = Promise.allSettled(animacion.map((a) => a.finished));
    const tope = new Promise((seguir) => setTimeout(seguir, ESPERA_MAXIMA_DE_SALIDA));
    void Promise.race([termino, tope]).then(irse);
  }

  // ---------------------------------------------------------------- dibujo

  private crearPanel(items: MenuEntry[]): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "vsk-menu";
    panel.setAttribute("role", "menu");
    // También a los submenús, que son paneles aparte: heredarían del documento,
    // no del panel que los abrió.
    aplicarPaleta(panel, this.opciones.paleta ?? null);
    panel.style.minWidth = `${this.opciones.minWidth ?? 200}px`;
    panel.style.maxWidth = `${this.opciones.maxWidth ?? 420}px`;

    const conIcono = items.some(
      (item) => "icon" in item && typeof item.icon === "string",
    );

    for (const item of items) {
      panel.appendChild(this.crearRenglon(item, conIcono));
    }

    this.contenedor.appendChild(panel);
    return panel;
  }

  private crearRenglon(item: MenuEntry, reservarIcono: boolean): HTMLElement {
    const tipo = item.type ?? "item";

    if (tipo === "separator") {
      const linea = document.createElement("div");
      linea.className = "vsk-menu__separador";
      linea.setAttribute("role", "separator");
      return linea;
    }

    if (tipo === "label") {
      const titulo = document.createElement("div");
      titulo.className = "vsk-menu__titulo";
      titulo.textContent = textoDe(item);
      return titulo;
    }

    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "vsk-menu__item";
    boton.tabIndex = -1;
    boton.setAttribute("role", tipo === "checkbox" ? "menuitemcheckbox" : "menuitem");

    const inhabilitado = "disabled" in item && item.disabled === true;
    if (inhabilitado) {
      boton.classList.add("vsk-menu__item--inhabilitado");
      boton.setAttribute("aria-disabled", "true");
    }
    if (tipo === "item" && "danger" in item && item.danger) {
      boton.classList.add("vsk-menu__item--peligro");
    }

    if (tipo === "checkbox") {
      const marcado = "checked" in item && item.checked === true;
      boton.setAttribute("aria-checked", marcado ? "true" : "false");
      boton.appendChild(this.crearTilde(marcado));
    } else if ("icon" in item && typeof item.icon === "string") {
      boton.appendChild(this.crearIcono(item.icon));
    } else if (reservarIcono) {
      const hueco = document.createElement("span");
      hueco.className = "vsk-menu__icono vsk-menu__icono--vacio";
      boton.appendChild(hueco);
    }

    const texto = document.createElement("span");
    texto.className = "vsk-menu__texto";
    texto.textContent = textoDe(item);
    boton.appendChild(texto);

    if (tipo === "item" && "accelerator" in item && item.accelerator) {
      const atajo = document.createElement("span");
      atajo.className = "vsk-menu__atajo";
      atajo.textContent = item.accelerator;
      boton.appendChild(atajo);
    }

    if (tipo === "submenu") {
      boton.setAttribute("aria-haspopup", "menu");
      boton.setAttribute("aria-expanded", "false");
      boton.appendChild(this.crearFlecha());
    }

    this.conectarRenglon(boton, item, inhabilitado);
    return boton;
  }

  private conectarRenglon(
    boton: HTMLElement,
    item: MenuEntry,
    inhabilitado: boolean,
  ): void {
    const tipo = item.type ?? "item";

    boton.addEventListener("mouseenter", () => {
      this.cancelarEspera();
      this.marcarActivo(boton);

      if (inhabilitado) return;

      if (tipo === "submenu") {
        this.esperaSubmenu = window.setTimeout(() => {
          this.abrirSubmenu(boton, item as Extract<MenuEntry, { type: "submenu" }>);
        }, ESPERA_SUBMENU);
      } else {
        // Pasar por una opción común cierra el submenú que hubiera abierto una
        // opción hermana: si no, quedan dos abiertos y no se sabe cuál manda.
        this.cerrarHasta(boton);
      }
    });

    if (inhabilitado) return;

    boton.addEventListener("click", (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      this.activar(boton, item);
    });
  }

  private crearIcono(icono: string): HTMLElement {
    const imagen = document.createElement("img");
    imagen.className = "vsk-menu__icono";
    imagen.alt = "";
    imagen.setAttribute("aria-hidden", "true");

    if (ES_IMAGEN.test(icono)) {
      imagen.src = icono;
    } else if (resolutorDeIconos) {
      // El nombre se resuelve después: el menú se dibuja ya y el icono aparece
      // cuando llega, en vez de hacer esperar al menú entero por una imagen.
      Promise.resolve(resolutorDeIconos(icono))
        .then((fuente) => {
          if (fuente) imagen.src = fuente;
        })
        .catch(() => {
          /* sin icono se ve igual, sólo con el hueco vacío */
        });
    }

    return imagen;
  }

  private crearFlecha(): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "vsk-menu__flecha");
    svg.setAttribute("viewBox", "0 0 15 15");
    svg.setAttribute("aria-hidden", "true");
    const camino = document.createElementNS("http://www.w3.org/2000/svg", "path");
    camino.setAttribute(
      "d",
      "M6.16 3.14c.2-.19.52-.18.7.02l3.75 4c.18.19.18.48 0 .67l-3.75 4a.5.5 0 1 1-.73-.68L9.56 7.5 6.14 3.84a.5.5 0 0 1 .02-.7Z",
    );
    svg.appendChild(camino);
    return svg;
  }

  private crearTilde(marcado: boolean): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute(
      "class",
      marcado ? "vsk-menu__tilde" : "vsk-menu__tilde vsk-menu__tilde--oculto",
    );
    svg.setAttribute("viewBox", "0 0 15 15");
    svg.setAttribute("aria-hidden", "true");
    const camino = document.createElementNS("http://www.w3.org/2000/svg", "path");
    camino.setAttribute(
      "d",
      "M11.47 3.84a.75.75 0 0 1 1.06 1.06l-6 6a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06L6 9.31l5.47-5.47Z",
    );
    svg.appendChild(camino);
    return svg;
  }

  // --------------------------------------------------------------- submenús

  private abrirSubmenu(
    disparador: HTMLElement,
    item: Extract<MenuEntry, { type: "submenu" }>,
  ): void {
    if (this.paneles.some((panel) => panel.disparador === disparador)) {
      return;
    }

    this.cerrarHasta(disparador);

    const panel = this.crearPanel(item.items);
    this.paneles.push({ elemento: panel, items: item.items, disparador });
    disparador.setAttribute("aria-expanded", "true");

    const marco = disparador.getBoundingClientRect();
    const limite = this.limites();
    const ancho = panel.offsetWidth;
    const alto = panel.offsetHeight;

    // Al costado del ítem, solapando un poco para que el mouse pueda cruzar sin
    // pasar por un hueco que cerraría el submenú.
    let izquierda = marco.right - 4;
    if (izquierda + ancho > limite.ancho - HOLGURA) {
      izquierda = Math.max(HOLGURA, marco.left - ancho + 4);
    }

    let arriba = marco.top - 4;
    if (arriba + alto > limite.alto - HOLGURA) {
      arriba = Math.max(HOLGURA, limite.alto - alto - HOLGURA);
    }

    panel.style.left = `${Math.round(izquierda)}px`;
    panel.style.top = `${Math.round(arriba)}px`;
    mostrar(panel);
  }

  /** Cierra los submenús más profundos que el panel donde está `boton`. */
  private cerrarHasta(boton: HTMLElement): void {
    const panelDelBoton = boton.closest(".vsk-menu");
    const indice = this.paneles.findIndex((panel) => panel.elemento === panelDelBoton);
    if (indice < 0) return;

    while (this.paneles.length > indice + 1) {
      const sobrante = this.paneles.pop();
      if (!sobrante) break;
      sobrante.disparador?.setAttribute("aria-expanded", "false");
      sobrante.elemento.remove();
    }
  }

  private cancelarEspera(): void {
    if (this.esperaSubmenu !== null) {
      clearTimeout(this.esperaSubmenu);
      this.esperaSubmenu = null;
    }
  }

  // ---------------------------------------------------------------- teclado

  private activar(boton: HTMLElement, item: MenuEntry): void {
    const tipo = item.type ?? "item";

    if (tipo === "submenu") {
      this.cancelarEspera();
      this.abrirSubmenu(boton, item as Extract<MenuEntry, { type: "submenu" }>);
      const abierto = this.paneles[this.paneles.length - 1];
      this.enfocarPrimero(abierto.elemento);
      return;
    }

    if (tipo === "checkbox") {
      const marcado = "checked" in item && item.checked === true;
      this.opciones.alElegir({ id: (item as { id: string }).id, checked: !marcado });
      return;
    }

    this.opciones.alElegir({ id: (item as { id: string }).id });
  }

  private alTeclear(evento: KeyboardEvent): void {
    const panel = this.paneles[this.paneles.length - 1];
    if (!panel) return;

    switch (evento.key) {
      case "Escape":
        evento.preventDefault();
        evento.stopPropagation();
        // Escape en un submenú vuelve al de arriba; en el primero, cierra todo.
        if (this.paneles.length > 1) {
          this.volverAlPadre();
        } else {
          this.opciones.alDescartar();
        }
        return;
      case "ArrowDown":
        evento.preventDefault();
        this.mover(panel, 1);
        return;
      case "ArrowUp":
        evento.preventDefault();
        this.mover(panel, -1);
        return;
      case "Home":
        evento.preventDefault();
        this.enfocarPrimero(panel.elemento);
        return;
      case "End":
        evento.preventDefault();
        this.mover(panel, -1, true);
        return;
      case "ArrowRight": {
        const activo = this.activoDe(panel.elemento);
        const item = activo ? this.itemDe(panel, activo) : undefined;
        if (activo && item && (item.type ?? "item") === "submenu") {
          evento.preventDefault();
          this.activar(activo, item);
        }
        return;
      }
      case "ArrowLeft":
        if (this.paneles.length > 1) {
          evento.preventDefault();
          this.volverAlPadre();
        }
        return;
      case "Enter":
      case " ": {
        const activo = this.activoDe(panel.elemento);
        const item = activo ? this.itemDe(panel, activo) : undefined;
        if (activo && item) {
          evento.preventDefault();
          this.activar(activo, item);
        }
        return;
      }
      default:
        if (evento.key.length === 1 && !evento.ctrlKey && !evento.altKey && !evento.metaKey) {
          this.saltarPorTexto(panel, evento.key);
        }
    }
  }

  /** Escribir salta a la opción que empieza así, como en cualquier menú. */
  private saltarPorTexto(panel: PanelAbierto, tecla: string): void {
    const ahora = Date.now();
    this.tipeado = ahora - this.tipeadoEn > ESPERA_TIPEO ? tecla : this.tipeado + tecla;
    this.tipeadoEn = ahora;

    const buscado = this.tipeado.toLowerCase();
    const botones = this.botonesDe(panel.elemento);
    const elegibles = panel.items.filter(esElegible);

    const encontrado = elegibles.findIndex((item) =>
      textoDe(item).toLowerCase().startsWith(buscado),
    );
    if (encontrado >= 0) {
      this.marcarActivo(botones[encontrado]);
    }
  }

  private volverAlPadre(): void {
    const hijo = this.paneles[this.paneles.length - 1];
    if (!hijo?.disparador) return;
    const disparador = hijo.disparador;
    this.cerrarHasta(disparador);
    this.marcarActivo(disparador);
  }

  private mover(panel: PanelAbierto, paso: number, alFinal = false): void {
    const botones = this.botonesDe(panel.elemento);
    if (botones.length === 0) return;

    if (alFinal) {
      this.marcarActivo(botones[botones.length - 1]);
      return;
    }

    const activo = this.activoDe(panel.elemento);
    const actual = activo ? botones.indexOf(activo) : -1;
    // Da la vuelta: abajo del último está el primero.
    const siguiente = (actual + paso + botones.length) % botones.length;
    this.marcarActivo(botones[siguiente]);
  }

  private enfocarPrimero(panel: HTMLElement): void {
    const botones = this.botonesDe(panel);
    if (botones.length > 0) this.marcarActivo(botones[0]);
  }

  private botonesDe(panel: HTMLElement): HTMLElement[] {
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        ".vsk-menu__item:not(.vsk-menu__item--inhabilitado)",
      ),
    );
  }

  private activoDe(panel: HTMLElement): HTMLElement | null {
    return panel.querySelector<HTMLElement>(".vsk-menu__item--activo");
  }

  private itemDe(panel: PanelAbierto, boton: HTMLElement): MenuEntry | undefined {
    const indice = this.botonesDe(panel.elemento).indexOf(boton);
    if (indice < 0) return undefined;
    return panel.items.filter(esElegible)[indice];
  }

  private marcarActivo(boton: HTMLElement): void {
    const panel = boton.closest(".vsk-menu");
    panel
      ?.querySelectorAll(".vsk-menu__item--activo")
      .forEach((otro) => otro.classList.remove("vsk-menu__item--activo"));
    boton.classList.add("vsk-menu__item--activo");
    boton.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------- descartar

  private alApretarAfuera(evento: PointerEvent): void {
    const destino = evento.target as Node | null;
    const adentro = this.paneles.some((panel) => panel.elemento.contains(destino));
    if (!adentro) {
      this.opciones.alDescartar();
    }
  }

  private alPerderElFoco(): void {
    this.opciones.alDescartar();
  }

  private limites(): { ancho: number; alto: number } {
    return { ancho: window.innerWidth, alto: window.innerHeight };
  }
}
