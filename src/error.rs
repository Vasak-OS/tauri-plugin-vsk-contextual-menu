use serde::{ser::Serializer, Serialize};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("No hay ningún monitor donde dibujar el menú")]
    SinMonitor,
    #[error("El menú se pidió con la lista de ítems vacía")]
    MenuVacio,
    #[error("El modo ventana no dibuja submenús: la ventana se hace del tamaño del menú y el submenú quedaría recortado. Usá el modo normal para menús con submenús.")]
    SubmenuEnVentana,
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
