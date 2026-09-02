 pub mod error;
 pub mod models;
 pub mod ping;
 pub mod storage;
 pub mod config;
 pub mod scheduler;
 pub mod commands;
 
 #[cfg_attr(mobile, tauri::mobile_entry_point)]
 pub fn run() {
    // Capture panic info before macOS event loop swallows it
    let prev_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
    let _runtime = tokio::runtime::Runtime::new().expect("failed to create Tokio runtime");
        eprintln!("=== PANIC ===");
        eprintln!("{}", info);
        prev_hook(info);
    }));

 use crate::storage::Storage;

 let storage = Storage::open(":memory:").expect("in-memory storage must be openable");
 let settings = storage.get_settings().unwrap_or_default();

     use std::sync::Arc;
     use std::sync::Mutex as StdMutex;
     use crate::scheduler::SchedulerState;
     let scheduler_state = Arc::new(SchedulerState::new(&settings, ":memory:".to_string()));
 
     tauri::Builder::default()
         .plugin(tauri_plugin_dialog::init())
         .manage(commands::AppState {
             storage: tokio::sync::Mutex::new(storage),
             scheduler: scheduler_state.clone(),
             app_handle: StdMutex::new(None),
         })
         .setup(move |_app| Ok(()))
         .invoke_handler(tauri::generate_handler![
             commands::bootstrap,
             commands::save_settings,
             commands::save_target,
            commands::update_target,
             commands::delete_target,
             commands::set_target_enabled,
             commands::samples,
             commands::open_history_file,
             commands::history_samples,
             commands::start_ping,
             commands::stop_ping,
             commands::clear_history,
             commands::switch_data_file,
             commands::save_data_file_as,
             commands::new_data_file,
         ])
         .run(tauri::generate_context!())
         .expect("failed to run Pingo");
 }
