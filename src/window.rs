//! La ventana donde se dibuja el menú.
//!
//! Un menú dibujado adentro del webview que lo pide queda recortado al borde de
//! su ventana. En una aplicación grande eso casi nunca se nota; en el panel
//! —una franja de treinta píxeles— el menú no entraría nunca, y en cualquier
//! ventana chica se recorta apenas el clic cae cerca del borde de abajo.
//!
//! Por eso el modo ventana existe además del modo dentro del DOM: la misma
//! lista de ítems, dibujada en una ventana propia, transparente y sin
//! decoración, que no conoce más límite que el de la pantalla.
//!
//! La ventana se crea cada vez y se cierra al elegir o al perder el foco.
//! Mantenerla viva y escondida ahorraría unos milisegundos y costaría un
//! webview permanente en memoria por algo que se abre unos segundos.

use tauri::{
    AppHandle, Manager, Monitor, PhysicalPosition, Position, Runtime, Url, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

use crate::models::{MenuEntry, MenuRequest, RELLENO_VERTICAL};
use crate::{Error, Result};

/// La etiqueta de la ventana. Las aplicaciones tienen que declararla en su
/// capability o el menú se queda sin permisos: sin tema y sin traducciones.
pub const LABEL: &str = "vsk_context_menu";

/// Cuánto se respeta del borde de la pantalla.
const MARGEN: i32 = 8;

/// El borde transparente que se deja alrededor del menú, para que la sombra no
/// quede recortada contra el borde de la ventana. Está también en
/// `guest-js/render.ts`: si cambia una, cambian las dos.
pub const HOLGURA: f64 = 8.0;

/// Ancho de referencia de un caracter en el tipo del menú, en píxeles lógicos.
/// Es una estimación: alcanza para que la ventana no le quede corta al texto,
/// que es lo único que no se puede arreglar después desde el CSS.
const ANCHO_CARACTER: f64 = 7.6;

/// Lo que ocupa el renglón sin contar el texto: el aire de los costados, el
/// icono y la flecha del submenú.
const ANCHO_FIJO: f64 = 64.0;

const ANCHO_MINIMO: f64 = 200.0;
const ANCHO_MAXIMO: f64 = 420.0;

/// El borde del menú, que suma a los dos lados. Sin contarlo, la ventana nace
/// dos píxeles más chica que el menú y le recorta la última línea.
const BORDE: f64 = 2.0;

pub fn app_url() -> String {
    if tauri::is_dev() {
        "http://localhost:1420".to_string()
    } else {
        "tauri://localhost".to_string()
    }
}

/// Abre la ventana del menú, del tamaño de sus ítems y pegada al clic.
pub fn abrir<R: Runtime>(
    app: &AppHandle<R>,
    ruta: &str,
    pedido: &MenuRequest,
) -> Result<WebviewWindow<R>> {
    if pedido.items.is_empty() {
        return Err(Error::MenuVacio);
    }

    // Si ya había uno abierto, el clic derecho lo vuelve a poner donde se hizo,
    // que es lo que uno espera de un menú contextual.
    if let Some(previa) = app.get_webview_window(LABEL) {
        let _ = previa.close();
    }

    if pedido.items.iter().any(tiene_submenu) {
        return Err(Error::SubmenuEnVentana);
    }

    let monitor = monitor_del_punto(app, pedido.x, pedido.y)?;
    let (ancho_menu, alto_menu) = geometria(&pedido.items, pedido.min_width, pedido.max_width);
    let ancho = ancho_menu + HOLGURA * 2.0;
    let alto = alto_menu + HOLGURA * 2.0;

    let ventana = WebviewWindowBuilder::new(
        app,
        LABEL,
        WebviewUrl::App(format!("index.html{ruta}").into()),
    )
    .title("")
    .decorations(false)
    .transparent(true)
    .inner_size(ancho, alto)
    .max_inner_size(ancho, alto)
    .min_inner_size(ancho, alto)
    .resizable(false)
    .visible(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .build()?;

    // La misma navegación explícita que hacen los popups del escritorio: en
    // desarrollo la URL de la aplicación no es la del bundle.
    if let Ok(url) = Url::parse(&format!("{}/index.html{ruta}", app_url())) {
        let _ = ventana.navigate(url);
    }

    // Se acomoda el menú, no la ventana: la ventana es más grande de lo que se
    // ve, y encajarla entera dentro de la pantalla despegaría el menú del clic.
    let escala = monitor.scale_factor();
    let holgura = (HOLGURA * escala) as i32;
    let esquina = posicion(
        &monitor,
        pedido.x,
        pedido.y,
        (ancho_menu * escala) as i32,
        (alto_menu * escala) as i32,
    );
    ventana.set_position(Position::Physical(PhysicalPosition {
        x: esquina.x - holgura,
        y: esquina.y - holgura,
    }))?;

    // Todavía no se muestra: eso lo pide el JavaScript cuando terminó de
    // dibujar los ítems. Mostrarla antes deja ver un rectángulo vacío del
    // tamaño final, que es peor que esperar un cuadro.
    Ok(ventana)
}

/// El monitor donde cayó el clic, o el primario si el punto no cae en ninguno.
fn monitor_del_punto<R: Runtime>(app: &AppHandle<R>, x: i32, y: i32) -> Result<Monitor> {
    let monitores = app.available_monitors()?;

    let encontrado = monitores.into_iter().find(|monitor| {
        let origen = monitor.position();
        let tamano = monitor.size();
        x >= origen.x
            && x < origen.x + tamano.width as i32
            && y >= origen.y
            && y < origen.y + tamano.height as i32
    });

    match encontrado {
        Some(monitor) => Ok(monitor),
        None => app.primary_monitor()?.ok_or(Error::SinMonitor),
    }
}

/// Un submenú no entra en el modo ventana: la ventana se hace del tamaño exacto
/// del menú y el submenú se abre al costado, o sea afuera, donde queda
/// recortado. En modo DOM no pasa, porque ahí el límite es la pantalla.
fn tiene_submenu(item: &MenuEntry) -> bool {
    matches!(item, MenuEntry::Submenu { .. })
}

/// El tamaño del menú, en píxeles lógicos, a partir de los ítems.
fn geometria(items: &[MenuEntry], minimo: Option<f64>, maximo: Option<f64>) -> (f64, f64) {
    let alto: f64 = items.iter().map(MenuEntry::alto).sum::<f64>() + RELLENO_VERTICAL + BORDE;

    let caracteres = items
        .iter()
        .map(MenuEntry::ancho_en_caracteres)
        .max()
        .unwrap_or(0);

    let minimo = minimo.unwrap_or(ANCHO_MINIMO);
    let maximo = maximo.unwrap_or(ANCHO_MAXIMO).max(minimo);
    let ancho = (caracteres as f64 * ANCHO_CARACTER + ANCHO_FIJO).clamp(minimo, maximo) + BORDE;

    (ancho.ceil(), alto.ceil())
}

/// Dónde poner la ventana: en el clic, y si no entra, del otro lado.
fn posicion(monitor: &Monitor, x: i32, y: i32, ancho: i32, alto: i32) -> PhysicalPosition<i32> {
    let tamano = monitor.size();
    let origen = monitor.position();

    PhysicalPosition {
        x: acomodar(x, origen.x, tamano.width as i32, ancho),
        y: acomodar(y, origen.y, tamano.height as i32, alto),
    }
}

/// Corre el menú hacia adentro cuando el clic fue tan cerca del borde que el
/// menú se saldría de la pantalla.
fn acomodar(deseado: i32, origen: i32, largo_pantalla: i32, largo_menu: i32) -> i32 {
    let maximo = origen + largo_pantalla - largo_menu - MARGEN;
    let minimo = origen + MARGEN;

    // El máximo primero y el mínimo después: en una pantalla más chica que el
    // menú, el orden inverso lo dejaría fuera del borde de arriba o del
    // izquierdo, que es donde está lo que más importa ver.
    deseado.min(maximo).max(minimo)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(label: &str) -> MenuEntry {
        MenuEntry::Item {
            id: label.to_string(),
            label: label.to_string(),
            icon: None,
            accelerator: None,
            disabled: false,
            danger: false,
        }
    }

    #[test]
    fn en_el_medio_queda_donde_se_hizo_el_clic() {
        assert_eq!(acomodar(600, 0, 1920, 260), 600);
    }

    #[test]
    fn cerca_del_borde_se_corre_hacia_adentro() {
        assert_eq!(acomodar(1900, 0, 1920, 260), 1920 - 260 - MARGEN);
    }

    #[test]
    fn respeta_el_borde_de_arriba() {
        assert_eq!(acomodar(0, 0, 1080, 200), MARGEN);
    }

    #[test]
    fn en_un_monitor_secundario_respeta_su_origen() {
        assert_eq!(acomodar(2020, 1920, 1920, 260), 2020);
    }

    #[test]
    fn en_una_pantalla_mas_chica_que_el_menu_no_se_va_por_el_borde_de_arriba() {
        assert_eq!(acomodar(150, 0, 200, 260), MARGEN);
    }

    #[test]
    fn el_alto_es_la_suma_de_los_renglones_mas_el_aire() {
        let items = vec![item("Copiar"), MenuEntry::Separator, item("Pegar")];
        let (_, alto) = geometria(&items, None, None);
        assert_eq!(alto, 32.0 + 9.0 + 32.0 + RELLENO_VERTICAL + BORDE);
    }

    #[test]
    fn el_ancho_no_baja_del_minimo_aunque_el_texto_sea_corto() {
        let (ancho, _) = geometria(&[item("Ir")], None, None);
        assert_eq!(ancho, ANCHO_MINIMO + BORDE);
    }

    #[test]
    fn el_ancho_no_pasa_del_maximo_aunque_el_texto_sea_larguisimo() {
        let largo = "Abrir con la aplicación que el sistema tenga configurada para esto";
        let (ancho, _) = geometria(&[item(largo)], None, None);
        assert_eq!(ancho, ANCHO_MAXIMO + BORDE);
    }

    #[test]
    fn el_ancho_lo_manda_el_renglon_mas_largo() {
        let corto = geometria(&[item("Copiar")], None, None).0;
        let largo = geometria(&[item("Copiar"), item("Copiar la ruta entera")], None, None).0;
        assert!(largo > corto);
    }
}
