use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Invalid IP address.")]
    InvalidAddress,
    #[error("The ping command failed: {0}")]
    PingCommand(String),
    #[error("The data file could not be opened.")]
    DataFileOpen,
    #[error("Monitoring history could not be saved.")]
    StorageWrite,
    #[error("Storage error: {0}")]
    Storage(String),
    #[error("Configuration error: {0}")]
    Config(String),
    #[error("Target not found: {0}")]
    TargetNotFound(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub kind: String,
    pub message: String,
}

impl From<AppError> for CommandError {
    fn from(error: AppError) -> Self {
        let kind = match &error {
            AppError::InvalidAddress => "invalidAddress",
            AppError::PingCommand(_) => "pingCommand",
            AppError::DataFileOpen => "dataFileOpen",
            AppError::StorageWrite => "storageWrite",
            AppError::Storage(_) => "storage",
            AppError::Config(_) => "config",
            AppError::TargetNotFound(_) => "targetNotFound",
        };
        Self {
            kind: kind.to_string(),
            message: error.to_string(),
        }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
