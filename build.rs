const COMMANDS: &[&str] = &[
    "open_menu_window",
    "close_menu_window",
    "take_pending_menu",
    "resolve_menu",
    "show_menu_window",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
