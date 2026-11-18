//! Deskling native shell.
//!
//! The Rust side only hosts the overlay window. Agent events never pass through here yet,
//! and no logging plugin is installed (ADR-009).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Deskling");
}
