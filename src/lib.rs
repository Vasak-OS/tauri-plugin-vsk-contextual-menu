//! El menú contextual de VasakOS.
//!
//! Un solo menú para todo el sistema: el mismo dibujo, el mismo teclado y los
//! mismos iconos en el escritorio, el gestor de archivos, la galería y lo que
//! venga. Las aplicaciones describen *qué* opciones ofrecen; el plugin decide
//! cómo se ven y cómo se manejan.
//!
//! Tiene dos modos, y los dos dibujan exactamente lo mismo:
//!
//! * **Dentro del DOM** —lo normal—: el menú se dibuja en la ventana que lo
//!   pide. No cuesta nada y no necesita permisos extra.
//! * **En una ventana propia**: para cuando el menú no entra en la ventana que
//!   lo pide, como el panel. Ver [`window`].
//!
//! Lo que este plugin *no* puede hacer es cambiarle el menú a las aplicaciones
//! ajenas: en Wayland cada cliente dibuja el suyo en su propia superficie y no
//! hay protocolo para reemplazarlo. Para esas, la vía es el tema de GTK y de
//! Qt.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

mod commands;
mod error;
mod models;
mod state;
pub mod window;

pub use error::{Error, Result};
pub use models::*;
pub use state::EVENTO_RESULTADO;
pub use window::LABEL;

/// La ruta por omisión de la ventana del menú, dentro de la aplicación que usa
/// el plugin.
pub const RUTA_POR_OMISION: &str = "#/vsk-context-menu";

/// Dónde encuentra el plugin la ruta que dibuja el menú en modo ventana.
pub struct Config {
    pub route: String,
}

/// Inicializa el plugin con la ruta por omisión (`#/vsk-context-menu`).
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    init_with_route(RUTA_POR_OMISION)
}

/// Inicializa el plugin con una ruta propia para la ventana del menú.
///
/// Sólo hace falta cambiarla si la aplicación no puede registrar la ruta por
/// omisión. La ruta es la parte que va después de `index.html`, con su
/// almohadilla: `#/lo-que-sea`.
pub fn init_with_route<R: Runtime>(route: &str) -> TauriPlugin<R> {
    let route = route.to_string();

    Builder::new("vsk-contextual-menu")
        .invoke_handler(tauri::generate_handler![
            commands::open_menu_window,
            commands::close_menu_window,
            commands::take_pending_menu,
            commands::show_menu_window,
            commands::resolve_menu,
        ])
        .setup(move |app, _api| {
            app.manage(Config {
                route: route.clone(),
            });
            app.manage(state::EstadoMenu::default());
            Ok(())
        })
        .build()
}
