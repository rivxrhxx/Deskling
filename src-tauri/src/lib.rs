//! Deskling native shell.
//!
//! The Rust side only hosts the desktop widget window. Agent events never pass through here yet,
//! and no logging plugin is installed (ADR-009).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // A desktop widget: no Dock icon, no ⌘Tab entry (ADR-021). Closing is done from the toolbar.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            #[cfg(not(target_os = "macos"))]
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Deskling");
}
