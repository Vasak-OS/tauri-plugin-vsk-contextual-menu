//! Lo que el plugin recuerda mientras el menú está abierto.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::models::{MenuEntry, MenuResult};
use crate::window::LABEL;

/// El evento que recibe la ventana que pidió el menú, con lo que se eligió.
pub const EVENTO_RESULTADO: &str = "vsk-context-menu-result";

struct MenuAbierto {
    /// La ventana que pidió el menú: es la que espera el resultado.
    opener: String,
    items: Vec<MenuEntry>,
}

#[derive(Default)]
pub struct EstadoMenu {
    abierto: Mutex<Option<MenuAbierto>>,
}

impl EstadoMenu {
    pub fn guardar(&self, opener: String, items: Vec<MenuEntry>) {
        *self.abierto.lock().unwrap() = Some(MenuAbierto { opener, items });
    }

    /// Los ítems, para la ventana que los va a dibujar. No los saca del estado:
    /// el menú sigue abierto hasta que alguien lo resuelva.
    pub fn items(&self) -> Option<Vec<MenuEntry>> {
        self.abierto
            .lock()
            .unwrap()
            .as_ref()
            .map(|menu| menu.items.clone())
    }
}

/// Cierra el menú y le avisa a quien lo pidió.
///
/// Saca el menú del estado antes de avisar, así el primero que llega es el que
/// contesta: elegir una opción y perder el foco pasan juntos —elegir mueve el
/// foco— y sin esto la aplicación recibiría dos respuestas, la buena y un
/// «no se eligió nada» pisándola.
pub fn resolver<R: Runtime>(app: &AppHandle<R>, resultado: MenuResult) {
    let menu = {
        let estado = app.state::<EstadoMenu>();
        let mut guardado = estado.abierto.lock().unwrap();
        guardado.take()
    };

    let Some(menu) = menu else {
        return;
    };

    if let Some(ventana) = app.get_webview_window(LABEL) {
        let _ = ventana.close();
    }

    let _ = app.emit_to(menu.opener.as_str(), EVENTO_RESULTADO, resultado);
}
