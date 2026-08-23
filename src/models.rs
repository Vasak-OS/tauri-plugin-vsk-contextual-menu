use serde::{Deserialize, Serialize};

/// Un renglón del menú.
///
/// El mismo árbol viaja por los tres lados: lo arma la aplicación en
/// JavaScript, lo mide Rust para saber de qué tamaño hacer la ventana, y lo
/// vuelve a leer el JavaScript que la dibuja. Por eso vive acá y no en cada
/// aplicación: si el árbol es uno solo, el menú es uno solo.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MenuEntry {
    /// Una opción común. `id` es lo que se recibe al elegirla.
    Item {
        id: String,
        label: String,
        #[serde(default)]
        icon: Option<String>,
        #[serde(default)]
        accelerator: Option<String>,
        #[serde(default)]
        disabled: bool,
        /// Acciones que destruyen algo: se pintan con el color de error.
        #[serde(default)]
        danger: bool,
    },
    /// Una opción que se prende y se apaga.
    Checkbox {
        id: String,
        label: String,
        #[serde(default)]
        checked: bool,
        #[serde(default)]
        disabled: bool,
    },
    /// Una opción que abre otro menú al costado.
    Submenu {
        label: String,
        #[serde(default)]
        icon: Option<String>,
        items: Vec<MenuEntry>,
    },
    /// Una línea que separa grupos de opciones.
    Separator,
    /// Un título de grupo, que no se puede elegir.
    Label { label: String },
}

/// Alto de cada tipo de renglón, en píxeles lógicos. Tiene que coincidir con el
/// CSS de `guest-js/style.ts`: es la única forma de que la ventana nazca del
/// tamaño exacto del menú, sin franja vacía abajo ni recorte.
pub const ALTO_ITEM: f64 = 32.0;
pub const ALTO_SEPARADOR: f64 = 9.0;
pub const ALTO_TITULO: f64 = 26.0;
/// El aire de arriba y de abajo del menú entero.
pub const RELLENO_VERTICAL: f64 = 8.0;

impl MenuEntry {
    pub fn alto(&self) -> f64 {
        match self {
            MenuEntry::Separator => ALTO_SEPARADOR,
            MenuEntry::Label { .. } => ALTO_TITULO,
            _ => ALTO_ITEM,
        }
    }

    /// Cuántos caracteres ocupa el renglón más largo, contando el acelerador y
    /// el espacio que se le deja a la flecha del submenú.
    pub fn ancho_en_caracteres(&self) -> usize {
        match self {
            MenuEntry::Separator => 0,
            MenuEntry::Label { label } => label.chars().count(),
            MenuEntry::Item {
                label, accelerator, ..
            } => {
                label.chars().count()
                    + accelerator
                        .as_ref()
                        .map(|texto| texto.chars().count() + 3)
                        .unwrap_or(0)
            }
            MenuEntry::Checkbox { label, .. } => label.chars().count(),
            MenuEntry::Submenu { label, .. } => label.chars().count() + 3,
        }
    }
}

/// El pedido de menú que manda la aplicación.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuRequest {
    pub items: Vec<MenuEntry>,
    /// Dónde se hizo el clic, en coordenadas físicas de la pantalla entera. Las
    /// calcula el JavaScript sumándole a las del evento la posición de su
    /// ventana: adentro de un webview no hay forma de saber dónde está el
    /// puntero en la pantalla, y en Wayland tampoco la hay desde Rust.
    pub x: i32,
    pub y: i32,
    #[serde(default)]
    pub min_width: Option<f64>,
    #[serde(default)]
    pub max_width: Option<f64>,
}

/// Lo que se le manda de vuelta a la ventana que pidió el menú.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuResult {
    /// El `id` de la opción elegida, o `None` si se cerró sin elegir nada.
    pub id: Option<String>,
    /// El estado nuevo, cuando lo elegido fue una casilla.
    #[serde(default)]
    pub checked: Option<bool>,
}
