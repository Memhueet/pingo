use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;

 use tauri::AppHandle;
 use chrono::{DateTime, Utc};
 use tauri::State;
 use tokio::sync::Mutex;
 use std::sync::Mutex as StdMutex;
 use uuid::Uuid;
 
 use crate::error::{AppError, CommandResult};
 use crate::models::*;
 use crate::scheduler::SchedulerState;
 use crate::storage::Storage;
// use crate::config;
 
 // ── Tauri-managed app state ────────────────────────────────
 
 pub struct AppState {
     pub storage: Mutex<Storage>,
     pub scheduler: Arc<SchedulerState>,
     pub app_handle: StdMutex<Option<AppHandle>>,
 }
 
// ── Query / mutation payloads ──────────────────────────────

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetIdPayload {
    pub id: Uuid,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetTargetEnabledPayload {
    pub id: Uuid,
    pub enabled: bool,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamplesQuery {
    pub target_id: Uuid,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySamplesQuery {
    pub path: String,
    pub target_id: Uuid,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
}

// ── Commands ───────────────────────────────────────────────

#[tauri::command]
pub async fn bootstrap(state: State<'_, AppState>) -> CommandResult<BootstrapPayload> {
    let storage = state.storage.lock().await;
    let settings = storage.get_settings().map_err(|e| AppError::Storage(e.to_string()))?;
    let targets = storage.list_targets().map_err(|e| AppError::Storage(e.to_string()))?;
    let ping_running = state.scheduler.ping_running.load(Ordering::Acquire);
    Ok(BootstrapPayload {
        settings,
        targets,
        ping_running,
    })
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> CommandResult<AppSettings> {
    let storage = state.storage.lock().await;
    storage
        .save_settings(&settings)
        .map_err(|e| AppError::Storage(e.to_string()))?;

    // Update scheduler settings
    {
        let mut interval = state.scheduler.interval_seconds.lock().await;
        *interval = settings.ping_interval_seconds;
    }
    {
        let mut timeout = state.scheduler.timeout_seconds.lock().await;
        *timeout = settings.ping_timeout_seconds;
    }
    {
        let mut threshold = state.scheduler.alert_threshold.lock().await;
        *threshold = settings.alert_threshold;
    }

    Ok(settings)
}

#[tauri::command]
pub async fn save_target(
    state: State<'_, AppState>,
    new_target: NewTarget,
) -> CommandResult<Target> {
    // Validate IPv4
    if !crate::models::is_valid_ipv4(&new_target.ipv4) {
        return Err(AppError::InvalidIpv4.into());
    }

     let ipv4 = new_target.ipv4.clone();
     let alias = if new_target.alias.is_empty() {
         ipv4.clone()
     } else {
         new_target.alias
     };
     let storage = state.storage.lock().await;
     let now = Utc::now();
     let target = Target {
         id: Uuid::new_v4(),
         ipv4,
         alias,
         enabled: true,
        created_at: now,
        updated_at: now,
    };
    storage
        .save_target(&target)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(target)
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTargetPayload {
    pub id: Uuid,
    pub ipv4: String,
    pub alias: String,
}

#[tauri::command]
pub async fn update_target(
    state: State<'_, AppState>,
    payload: UpdateTargetPayload,
) -> CommandResult<Target> {
    if !crate::models::is_valid_ipv4(&payload.ipv4) {
        return Err(AppError::InvalidIpv4.into());
    }
    let alias = if payload.alias.is_empty() {
        payload.ipv4.clone()
    } else {
        payload.alias
    };
    let storage = state.storage.lock().await;
    let existing = storage
        .get_target(payload.id)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let now = Utc::now();
    let target = Target {
        id: payload.id,
        ipv4: payload.ipv4,
        alias,
        enabled: existing.enabled,
        created_at: existing.created_at,
        updated_at: now,
    };
    storage
        .save_target(&target)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(target)
}


#[tauri::command]
pub async fn delete_target(
    state: State<'_, AppState>,
    payload: TargetIdPayload,
) -> CommandResult<()> {
    let storage = state.storage.lock().await;
    storage
        .delete_target(payload.id)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn set_target_enabled(
    state: State<'_, AppState>,
    payload: SetTargetEnabledPayload,
) -> CommandResult<Target> {
    let storage = state.storage.lock().await;
    storage
        .update_target_enabled(payload.id, payload.enabled)
        .map_err(|e| e.into())
}

#[tauri::command]
pub async fn samples(
    state: State<'_, AppState>,
    query: SamplesQuery,
) -> CommandResult<Vec<PingSample>> {
    let storage = state.storage.lock().await;
    storage
        .samples_for_target(query.target_id, query.from, query.to)
        .map_err(|e| AppError::Storage(e.to_string()).into())
}

#[tauri::command]
pub async fn open_history_file(path: String) -> CommandResult<HistoryFilePayload> {
    let storage =
        Storage::open(PathBuf::from(&path)).map_err(|_| AppError::DataFileOpen)?;
    let targets = storage
        .list_targets()
        .map_err(|_| AppError::DataFileOpen)?;
    Ok(HistoryFilePayload { path, targets })
}

#[tauri::command]
pub async fn history_samples(query: HistorySamplesQuery) -> CommandResult<Vec<PingSample>> {
    let storage =
        Storage::open(PathBuf::from(&query.path)).map_err(|_| AppError::DataFileOpen)?;
    storage
        .samples_for_target(query.target_id, query.from, query.to)
        .map_err(|e| AppError::Storage(e.to_string()).into())
}

 #[tauri::command]
 pub async fn start_ping(app: AppHandle, state: State<'_, AppState>) -> CommandResult<()> {
     state.scheduler.ping_running.store(true, Ordering::Release);
     *state.app_handle.lock().unwrap() = Some(app);

     if !state.scheduler.scheduler_started.swap(true, Ordering::AcqRel) {
         let app_handle = state.app_handle.lock().unwrap().clone().unwrap();
         let sched_state = state.scheduler.clone();
         crate::scheduler::start(app_handle, sched_state);
     }
     Ok(())
 }

#[tauri::command]
pub async fn stop_ping(state: State<'_, AppState>) -> CommandResult<()> {
    state.scheduler.ping_running.store(false, Ordering::Release);
    Ok(())
}

#[tauri::command]
pub async fn clear_history(state: State<'_, AppState>) -> CommandResult<usize> {
    let storage = state.storage.lock().await;
    let deleted = storage
        .clear_samples()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(deleted)
}

#[tauri::command]
pub async fn switch_data_file(
    state: State<'_, AppState>,
    path: String,
) -> CommandResult<BootstrapPayload> {
    let new_storage =
        Storage::open(PathBuf::from(&path)).map_err(|_| AppError::DataFileOpen)?;
    let settings = new_storage
        .get_settings()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let targets = new_storage
        .list_targets()
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let mut storage_guard = state.storage.lock().await;
    *storage_guard = new_storage;
    drop(storage_guard);

    let mut data_path_guard = state.scheduler.data_path.lock().await;
    *data_path_guard = path.clone();
    drop(data_path_guard);

    let mut interval = state.scheduler.interval_seconds.lock().await;
    *interval = settings.ping_interval_seconds;
    drop(interval);

    let mut timeout = state.scheduler.timeout_seconds.lock().await;
    *timeout = settings.ping_timeout_seconds;
    drop(timeout);

    let mut threshold = state.scheduler.alert_threshold.lock().await;
    *threshold = settings.alert_threshold;
    drop(threshold);

    Ok(BootstrapPayload {
        settings,
        targets,
        ping_running: state.scheduler.ping_running.load(Ordering::Acquire),
    })
}

#[tauri::command]
pub async fn save_data_file_as(
    state: State<'_, AppState>,
    path: String,
) -> CommandResult<String> {
    use std::fs;

    let storage = state.storage.lock().await;

    let current_path = storage
        .db_path()
        .map_err(|e| AppError::Storage(e.to_string()))?;

    fs::copy(&current_path, &path).map_err(|e| AppError::Storage(e.to_string()))?;

    Ok(path)
}

#[tauri::command]
pub async fn new_data_file(
    state: State<'_, AppState>,
    path: String,
) -> CommandResult<BootstrapPayload> {
    let new_storage =
        Storage::open(PathBuf::from(&path)).map_err(|e| AppError::Storage(e.to_string()))?;
    let settings = new_storage
        .get_settings()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let targets = new_storage
        .list_targets()
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let mut storage_guard = state.storage.lock().await;
    *storage_guard = new_storage;
    drop(storage_guard);

    let mut data_path_guard = state.scheduler.data_path.lock().await;
    *data_path_guard = path.clone();
    drop(data_path_guard);

    Ok(BootstrapPayload {
        settings,
        targets,
        ping_running: state.scheduler.ping_running.load(Ordering::Acquire),
    })
}
