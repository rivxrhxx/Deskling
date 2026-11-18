//! Deskling native shell.
//!
//! The Rust side hosts the desktop widget window and the receive-only Claude Code hook bridge
//! (`hook_bridge`, ADR-024). No logging plugin is installed (ADR-009).

#[cfg(unix)]
mod hook_bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // A desktop widget: no Dock icon, no ⌘Tab entry (ADR-021). Closing is done from the toolbar.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            // Claude Code hook records arrive on a local Unix socket and go to the webview validated (ADR-024).
            #[cfg(unix)]
            hook_bridge::start(app.handle());
            #[cfg(not(unix))]
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Deskling");
}
