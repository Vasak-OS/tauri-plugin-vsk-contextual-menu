/**
 * El aspecto del menú.
 *
 * Va como CSS plano y no como clases de Tailwind a propósito: el plugin se
 * publica compilado, y las clases de Tailwind que viven adentro de un paquete
 * no las ve el escaneo de la aplicación que lo usa, así que llegarían sin
 * estilo. Con CSS plano el menú se ve igual en cualquier aplicación, tenga
 * Tailwind o no.
 *
 * Los colores salen de las variables del sistema (`--use-*`, las que cambia
 * config-manager al pasar a oscuro), con el color claro de fábrica como
 * respaldo por si el menú se dibuja en una aplicación que todavía no las
 * define.
 *
 * Las medidas de los renglones están repetidas en `src/models.rs`: Rust las
 * necesita para que la ventana del modo ventana nazca del tamaño exacto del
 * menú. Si cambia una, cambian las dos.
 */
export const CSS = `
.vsk-menu {
  /* Cada color se busca en tres lados, en este orden: lo que le puso el plugin
     leyendo config-manager, la variable del sistema que define la aplicación, y
     el color de fábrica. Así el menú se ve bien tanto en una aplicación de
     VasakOS como en una que no defina nada. */
  --vsk-radio: var(--vsk-menu-radio, var(--corner-radius, 10px));
  --vsk-fondo: var(--vsk-menu-fondo, var(--use-ui-background, #eff1f5));
  --vsk-borde: var(--vsk-menu-borde, var(--use-ui-border, #dce0e8));
  --vsk-texto: var(--vsk-menu-texto, var(--use-text-main, #4c4f69));
  --vsk-tenue: var(--vsk-menu-texto-tenue, var(--use-text-muted, #6c6f85));
  --vsk-primario: var(--vsk-menu-primario, var(--use-primary, #dd7878));
  --vsk-sobre-primario: var(--vsk-menu-texto-sobre-primario, var(--use-text-on-primary, #5c5f77));
  --vsk-error: var(--use-status-error, #d20f39);

  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483000;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--vsk-borde);
  border-radius: var(--vsk-radio);
  background: color-mix(in srgb, var(--vsk-fondo) 82%, transparent);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  box-shadow: 0 10px 30px rgb(0 0 0 / 22%);
  color: var(--vsk-texto);
  font-family: inherit;
  font-size: 14px;
  line-height: 1;
  text-align: left;
  user-select: none;
  opacity: 0;
  transform: scale(0.96);
  transform-origin: var(--vsk-menu-origen, top left);
  transition: opacity 120ms ease-out, transform 120ms ease-out;
}

.vsk-menu--abierto {
  opacity: 1;
  transform: none;
}

.vsk-menu--saliendo {
  opacity: 0;
  transform: scale(0.96);
}

/* En modo ventana el panel no ocupa toda la ventana: alrededor queda un borde
   transparente para la sombra. Ese borde lo mide Rust (HOLGURA, en
   src/window.rs) y hay que tocarlo en los dos lados a la vez. Un clic ahí
   descarta el menú, como un clic afuera. */
.vsk-menu-fondo {
  position: fixed;
  inset: 0;
  margin: 0;
  padding: 0;
  background: transparent;
}

/* El ancho lo decidió Rust al hacer la ventana: si el panel se dejara crecer
   con su contenido podría pasarse y quedar recortado contra el borde. */
.vsk-menu-fondo .vsk-menu {
  position: absolute;
  width: calc(100vw - 16px);
  max-width: none;
}

.vsk-menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: max(2px, calc(var(--vsk-radio) - 4px));
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: default;
  outline: none;
  transition: background-color 90ms ease-out, color 90ms ease-out;
}

.vsk-menu__item:hover,
.vsk-menu__item:focus-visible,
.vsk-menu__item--activo {
  background: var(--vsk-primario);
  color: var(--vsk-sobre-primario);
}

.vsk-menu__item--peligro {
  color: var(--vsk-error);
}

.vsk-menu__item--peligro:hover,
.vsk-menu__item--peligro:focus-visible,
.vsk-menu__item--peligro.vsk-menu__item--activo {
  background: var(--vsk-error);
  color: var(--vsk-fondo);
}

.vsk-menu__item--inhabilitado,
.vsk-menu__item--inhabilitado:hover {
  background: transparent;
  color: var(--vsk-tenue);
  opacity: 0.5;
  cursor: default;
}

.vsk-menu__icono {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  object-fit: contain;
}

/* El hueco del icono se guarda aunque el ítem no tenga: sin esto, un menú con
   algunas opciones con icono y otras sin él queda con el texto en zigzag. */
.vsk-menu__icono--vacio {
  display: inline-block;
}

.vsk-menu__texto {
  flex: 1 1 auto;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.vsk-menu__atajo {
  flex: 0 0 auto;
  padding-left: 12px;
  color: var(--vsk-tenue);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.vsk-menu__item:hover .vsk-menu__atajo,
.vsk-menu__item--activo .vsk-menu__atajo {
  color: inherit;
  opacity: 0.75;
}

.vsk-menu__flecha {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.vsk-menu__tilde {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  fill: currentColor;
}

.vsk-menu__tilde--oculto {
  visibility: hidden;
}

.vsk-menu__separador {
  height: 1px;
  margin: 4px 0;
  border: 0;
  background: var(--vsk-borde);
  opacity: 0.7;
}

.vsk-menu__titulo {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 26px;
  padding: 0 10px;
  color: var(--vsk-tenue);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

@media (prefers-reduced-motion: reduce) {
  .vsk-menu,
  .vsk-menu__item {
    transition: none;
  }
}
`;

const ID = "vsk-contextual-menu-style";

/** Mete el CSS en el documento, una sola vez por ventana. */
export function injectStyle(): void {
  if (typeof document === "undefined" || document.getElementById(ID)) {
    return;
  }

  const tag = document.createElement("style");
  tag.id = ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
