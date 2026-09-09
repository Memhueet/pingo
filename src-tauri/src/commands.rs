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
    /// 设置时忽略 from/to：以该目标最新样本时刻为锚点取前 N 秒窗口，
    /// 历史/停用目标落在最后有数据的一段而非当前时刻
    pub latest_window_secs: Option<i64>,
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
    let target_stats = storage
        .target_stats()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let ping_running = state.scheduler.ping_running.load(Ordering::Acquire);
    Ok(BootstrapPayload {
        settings,
        targets,
        target_stats,
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
    {
        let mut backoff = state.scheduler.backoff_intervals.lock().await;
        *backoff = settings.backoff_intervals.clone();
    }
    state.scheduler.request_reschedule();

    Ok(settings)
}

#[tauri::command]
pub async fn save_target(
    state: State<'_, AppState>,
    new_target: NewTarget,
) -> CommandResult<Target> {
    // Validate address
    if !crate::models::is_valid_address(&new_target.address) {
        return Err(AppError::InvalidAddress.into());
    }

     let address = new_target.address.clone();
     let alias = if new_target.alias.is_empty() {
         address.clone()
     } else {
         new_target.alias
     };
     let storage = state.storage.lock().await;
     let now = Utc::now();
     let target = Target {
         id: Uuid::new_v4(),
         address,
         alias,
         enabled: true,
        created_at: now,
        updated_at: now,
    };
    storage
        .save_target(&target)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    state.scheduler.request_reschedule();
    Ok(target)
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTargetPayload {
    pub id: Uuid,
    pub address: String,
    pub alias: String,
}

#[tauri::command]
pub async fn update_target(
    state: State<'_, AppState>,
    payload: UpdateTargetPayload,
) -> CommandResult<Target> {
    if !crate::models::is_valid_address(&payload.address) {
        return Err(AppError::InvalidAddress.into());
    }
    let alias = if payload.alias.is_empty() {
        payload.address.clone()
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
        address: payload.address,
        alias,
        enabled: existing.enabled,
        created_at: existing.created_at,
        updated_at: now,
    };
    storage
        .save_target(&target)
        .map_err(|e| AppError::Storage(e.to_string()))?;
    state.scheduler.request_reschedule();
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
    state.scheduler.request_reschedule();
    Ok(())
}

#[tauri::command]
pub async fn set_target_enabled(
    state: State<'_, AppState>,
    payload: SetTargetEnabledPayload,
) -> CommandResult<Target> {
    let storage = state.storage.lock().await;
    let target = storage
        .update_target_enabled(payload.id, payload.enabled)?;
    state.scheduler.request_reschedule();
    Ok(target)
}

#[tauri::command]
pub async fn samples(
    state: State<'_, AppState>,
    query: SamplesQuery,
) -> CommandResult<Vec<PingSample>> {
    let storage = state.storage.lock().await;
    if let Some(window_secs) = query.latest_window_secs {
        return storage
            .samples_latest_window(query.target_id, window_secs)
            .map_err(|e| AppError::Storage(e.to_string()).into());
    }
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
    let target_stats = storage.target_stats().map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(HistoryFilePayload { path, targets, target_stats })
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
     state.scheduler.request_reschedule();
     Ok(())
 }

#[tauri::command]
pub async fn stop_ping(state: State<'_, AppState>) -> CommandResult<()> {
    state.scheduler.ping_running.store(false, Ordering::Release);
    state.scheduler.request_reschedule();
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
    let target_stats = new_storage
        .target_stats()
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

    let mut backoff = state.scheduler.backoff_intervals.lock().await;
    *backoff = settings.backoff_intervals.clone();
    drop(backoff);

    state.scheduler.request_reschedule();

    Ok(BootstrapPayload {
        settings,
        targets,
        target_stats,
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
    let target_stats = new_storage
        .target_stats()
        .map_err(|e| AppError::Storage(e.to_string()))?;

    let mut storage_guard = state.storage.lock().await;
    *storage_guard = new_storage;
    drop(storage_guard);

    let mut data_path_guard = state.scheduler.data_path.lock().await;
    *data_path_guard = path.clone();
    drop(data_path_guard);

    state.scheduler.request_reschedule();

    Ok(BootstrapPayload {
        settings,
        targets,
        target_stats,
        ping_running: state.scheduler.ping_running.load(Ordering::Acquire),
    })
}

/// Windows 11：把主题表面/文字色写入 DWM，让系统标题栏与主题同色。
/// 其余平台与 Windows 10（无 DWMWA_CAPTION_COLOR 属性）为空实现，
/// 标题栏维持 setTheme 的深浅两档语义。
#[tauri::command]
pub async fn apply_window_theme(
    window: tauri::WebviewWindow,
    background: String,
    text: String,
) -> CommandResult<()> {
    apply_window_theme_impl(&window, &background, &text)
}

#[cfg(windows)]
fn apply_window_theme_impl(
    window: &tauri::WebviewWindow,
    background: &str,
    text: &str,
) -> CommandResult<()> {
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    };

    // 窗口句柄未就绪时跳过（外观效果，下次换主题时会重试），无效颜色则视为前端 bug 上报
    let Some(hwnd) = window.hwnd().ok().map(|h| h.0) else {
        return Ok(());
    };
    let Some(surface) = crate::models::parse_colorref(background) else {
        return Err(AppError::Config(format!("invalid color: {background}")).into());
    };
    let Some(text_color) = crate::models::parse_colorref(text) else {
        return Err(AppError::Config(format!("invalid color: {text}")).into());
    };

    // Windows 10 无这些属性，DwmSetWindowAttribute 返回错误，静默忽略
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_CAPTION_COLOR as u32,
            &surface as *const u32 as *const core::ffi::c_void,
            4,
        );
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_TEXT_COLOR as u32,
            &text_color as *const u32 as *const core::ffi::c_void,
            4,
        );
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR as u32,
            &surface as *const u32 as *const core::ffi::c_void,
            4,
        );
    }
    Ok(())
}

#[cfg(not(windows))]
fn apply_window_theme_impl(
    _window: &tauri::WebviewWindow,
    _background: &str,
    _text: &str,
) -> CommandResult<()> {
    Ok(())
}
