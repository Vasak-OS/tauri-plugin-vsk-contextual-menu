# Tauri Plugin vsk-contextual-menu

El menú del clic derecho de VasakOS. Las aplicaciones describen **qué** opciones
ofrecen; el plugin decide cómo se ven, cómo responden al teclado y cómo se
cierran. Un solo menú para todo el escritorio en vez de uno por aplicación.

- Sigue el tema del sistema —colores y redondeo— sin que la aplicación haga nada.
- Iconos del sistema, atajos, casillas, submenús, separadores y títulos.
- Teclado completo: flechas, Inicio/Fin, Escape, y escribir para saltar a una
  opción.
- Dos modos de dibujo, con el mismo aspecto y el mismo comportamiento.

## Requisitos

- Rust **1.77.2+**
- Tauri **v2**

## Instalación

### 1. El crate

```toml
[dependencies]
tauri-plugin-vsk-contextual-menu = { git = "https://github.com/Vasak-OS/tauri-plugin-vsk-contextual-menu", branch = "main" }
```

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_vsk_contextual_menu::init())
```

### 2. El paquete de JavaScript

```bash
bun add @vasakgroup/plugin-vsk-contextual-menu
```

### 3. Los permisos

En `src-tauri/capabilities/default.json`:

```json
{
  "windows": ["main", "vsk_context_menu"],
  "permissions": ["vsk-contextual-menu:default", "config-manager:default"]
}
```

> `vsk_context_menu` es la ventana del modo ventana. Si falta, el menú se abre
> sin permisos: sin tema y sin traducciones. Alcanza con no usar el modo ventana
> para no necesitarla, pero declararla no cuesta nada.

## Uso

```ts
import { showContextMenu } from "@vasakgroup/plugin-vsk-contextual-menu";

const elegido = await showContextMenu(
  [
    { id: "abrir", label: t("actions.open"), icon: "document-open", accelerator: "Enter" },
    { id: "copiar", label: t("actions.copy"), icon: "edit-copy", accelerator: "Ctrl+C" },
    { type: "separator" },
    { type: "checkbox", id: "ocultos", label: t("view.hidden"), checked: mostrarOcultos },
    { type: "submenu", label: t("actions.openWith"), items: aplicaciones },
    { type: "separator" },
    { id: "borrar", label: t("actions.delete"), icon: "edit-delete", danger: true },
  ],
  evento,
);

if (elegido?.id === "borrar") borrar();
```

`showContextMenu` devuelve `{ id, checked? }` con lo elegido, o `null` si se
cerró sin elegir nada. Si se le pasa el evento del clic derecho, además le corta
el menú que dibuja WebKit.

El texto de las opciones va **ya traducido**: el menú no traduce nada por su
cuenta, porque las claves son de cada aplicación.

### En Vue

```ts
const { show } = useContextMenu();
// El menú se cierra solo cuando se desmonta el componente que lo abrió.
```

### Al arrancar la aplicación

```ts
import { getIconSource } from "@vasakgroup/plugin-vicons";
import { setupContextMenu } from "@vasakgroup/plugin-vsk-contextual-menu";

setupContextMenu({ iconResolver: getIconSource });
```

El plugin no depende de vicons a propósito, así se puede usar en cualquier
aplicación. Enseñarle a resolver nombres de iconos es una línea, y a partir de
ahí los ítems pueden nombrar iconos del sistema (`edit-copy`) además de pasar
una imagen ya lista (`data:`, `blob:`, una ruta).

## El tema

Los colores y el radio de las esquinas salen de **config-manager**: el esquema
que el sistema tiene elegido, la variante clara u oscura según `darkmode`, y el
`radius` de la configuración. Los mismos que usa el resto del escritorio, sin
que la aplicación tenga que pasarle nada.

No alcanzaba con leer las variables CSS de la aplicación. El menú se dibuja
también antes de que la aplicación haya cargado su configuración —la ventana del
modo ventana monta y dibuja en ese hueco—, y ahí las variables todavía no están.

Cada color se busca en tres lados, en este orden:

1. Lo que el plugin leyó de config-manager.
2. La variable del sistema que define la aplicación (`--use-ui-background`, …).
3. El color de fábrica.

Así que si config-manager no está instalado, o esta ventana no tiene su permiso,
el menú se ve igual: cae al tema de la aplicación. La configuración se lee una
vez y se recuerda; el evento `config-changed` —el mismo que escuchan las
aplicaciones— la vuelve a pedir.

## Los dos modos

**Adentro del DOM**, que es lo normal: el menú se dibuja en la ventana que lo
pide. No cuesta nada y no necesita permisos extra.

**En una ventana propia**, con `{ window: true }`: para cuando el menú no entra
en la ventana que lo pide —el panel mide unos treinta píxeles de alto— o cuando
tiene que poder salirse de ella. Abre un webview, así que no conviene por
costumbre.

El modo ventana necesita una ruta donde dibujarse, porque la ventana carga la
aplicación:

```ts
// routes/index.ts
{ path: "/vsk-context-menu", component: () => import("@/views/ContextMenuView.vue") }
```

```vue
<!-- ContextMenuView.vue -->
<script setup lang="ts">
import { useContextMenuWindow } from "@vasakgroup/plugin-vsk-contextual-menu";
useContextMenuWindow();
</script>

<template><div /></template>
```

Si la ruta por omisión no sirve, `init_with_route("#/otra-ruta")`.

## Lo que no hace

**Submenús en modo ventana.** La ventana se hace del tamaño exacto del menú, así
que un submenú se abriría afuera y quedaría recortado. El plugin lo rechaza con
un error claro en vez de dibujarlo mal. En modo DOM andan, porque ahí el único
límite es la pantalla.

**Cambiarle el menú a las aplicaciones ajenas.** En Wayland cada cliente dibuja
el suyo en su propia superficie y no hay protocolo para reemplazarlo: ni este
plugin ni ninguno puede tocar el menú de Firefox o de LibreOffice. Para esas la
vía es el tema de GTK y el de Qt.

## Las medidas

El alto de cada renglón está en dos lados a la vez: en el CSS
(`guest-js/style.ts`) y en Rust (`src/models.rs`), que lo necesita para que la
ventana del modo ventana nazca del tamaño exacto del menú. Si cambia uno, cambia
el otro.

## Licencia

GPL-3.0-only
