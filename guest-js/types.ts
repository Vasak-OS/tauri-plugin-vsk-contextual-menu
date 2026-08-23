/** Un renglón del menú. Es el mismo árbol que entiende el Rust del plugin. */
export type MenuEntry =
  | MenuItem
  | MenuCheckbox
  | MenuSubmenu
  | MenuSeparator
  | MenuLabel;

export interface MenuItem {
  type?: "item";
  /** Lo que se recibe al elegir esta opción. */
  id: string;
  /** El texto, ya traducido: el menú no traduce nada por su cuenta. */
  label: string;
  /** Un icono del sistema por nombre, o una imagen lista para usar. */
  icon?: string;
  /** El atajo, escrito como se lee: `Ctrl+C`. El menú no lo escucha, lo muestra. */
  accelerator?: string;
  disabled?: boolean;
  /** Acciones que destruyen algo: se pintan con el color de error. */
  danger?: boolean;
}

export interface MenuCheckbox {
  type: "checkbox";
  id: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
}

export interface MenuSubmenu {
  type: "submenu";
  label: string;
  icon?: string;
  items: MenuEntry[];
}

export interface MenuSeparator {
  type: "separator";
}

export interface MenuLabel {
  type: "label";
  label: string;
}

/** Lo elegido. `checked` sólo viene cuando fue una casilla. */
export interface MenuChoice {
  id: string;
  checked?: boolean;
}

/** Dónde abrir el menú. */
export type MenuAnchor = MouseEvent | { x: number; y: number };

export interface ShowOptions {
  /** Ancho mínimo, en píxeles. */
  minWidth?: number;
  /** Ancho máximo, antes de cortar el texto con puntos suspensivos. */
  maxWidth?: number;
  /**
   * Dibujarlo en una ventana propia en vez de adentro de la que lo pide.
   *
   * Hace falta cuando la ventana es más chica que el menú —el panel— o cuando
   * el menú tiene que poder salirse de ella. Cuesta abrir un webview, así que
   * no conviene por costumbre.
   */
  window?: boolean;
}
