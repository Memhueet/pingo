use std::path::PathBuf;

use crate::error::AppError;

const APP_NAME: &str = "pingo";
const DATA_FILE: &str = "pingo-history.db";

/// Returns the path to the default data directory for Pingo.
pub fn data_dir() -> Result<PathBuf, AppError> {
    let dir = dirs::data_dir()
        .ok_or_else(|| AppError::Config("could not determine data directory".to_string()))?
        .join(APP_NAME);
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError::Config(format!("could not create data directory: {}", e)))?;
    Ok(dir)
}

/// Returns the path to the default active monitoring data file.
pub fn default_data_path() -> Result<PathBuf, AppError> {
    Ok(data_dir()?.join(DATA_FILE))
}

/// Returns the path to a standalone data file in the current directory.
/// Used for tests or external file operations.
pub fn test_data_path(name: &str) -> PathBuf {
    PathBuf::from(std::env::temp_dir()).join(name)
}
