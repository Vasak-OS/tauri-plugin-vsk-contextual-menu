use tauri::{command, AppHandle, Manager, Runtime, Webview, Window};

use crate::models::{MenuEntry, MenuRequest, MenuResult};
use crate::state::{resolver, EstadoMenu};
use crate::window::{abrir, LABEL};
use crate::{Config, Result};

/// Abre el menú en una ventana propia, pegada al clic.
#[command]
pub async fn open_menu_window<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    request: MenuRequest,
) -> Result<()> {
    let ruta = app.state::<Config>().route.clone();

    // Se guarda antes de abrir: la ventana pide los ítems apenas monta, y si
    // todavía no estuvieran guardados se dibujaría vacía.
    app.state::<EstadoMenu>()
        .guardar(window.label().to_string(), request.items.clone());

    let ventana = match abrir(&app, &ruta, &request) {
        Ok(ventana) => ventana,
        Err(error) => {
            // Sin ventana no va a haber resultado: se contesta ahora, o quien
            // pidió el menú espera para siempre.
            resolver(&app, MenuResult { id: None, checked: None });
            return Err(error);
        }
    };

    let para_el_evento = app.clone();
    ventana.on_window_event(move |evento| {
        // Perder el foco es la forma normal de descartar un menú: se hizo clic
        // en cualquier otro lado.
        if let tauri::WindowEvent::Focused(false) = evento {
            resolver(&para_el_evento, MenuResult { id: None, checked: None });
        }
    });

    Ok(())
}

/// Los ítems que tiene que dibujar la ventana del menú.
#[command]
pub async fn take_pending_menu<R: Runtime>(app: AppHandle<R>) -> Option<Vec<MenuEntry>> {
    app.state::<EstadoMenu>().items()
}

/// Muestra la ventana, ya con los ítems dibujados adentro.
#[command]
pub async fn show_menu_window<R: Runtime>(app: AppHandle<R>, webview: Webview<R>) -> Result<()> {
    // Sólo la ventana del menú puede mostrarse a sí misma: es un comando que
    // cualquier webview de la aplicación podría llamar.
    if webview.window().label() != LABEL {
        return Ok(());
    }

    if let Some(ventana) = app.get_webview_window(LABEL) {
        ventana.show()?;
        ventana.set_focus()?;
    }

    Ok(())
}

/// Se eligió una opción.
#[command]
pub async fn resolve_menu<R: Runtime>(app: AppHandle<R>, id: String, checked: Option<bool>) {
    resolver(&app, MenuResult { id: Some(id), checked });
}

/// Se cerró el menú sin elegir nada.
#[command]
pub async fn close_menu_window<R: Runtime>(app: AppHandle<R>) {
    resolver(&app, MenuResult { id: None, checked: None });
}
