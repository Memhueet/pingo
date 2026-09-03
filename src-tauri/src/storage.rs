use std::path::Path;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Result as SqlResult};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::*;

pub struct Storage {
    conn: Connection,
}

impl Storage {
    /// Open an existing database or create a new one at the given path.
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, AppError> {
        let conn = Connection::open(path).map_err(|e| AppError::Storage(e.to_string()))?;
        let mut storage = Self { conn };
        storage.init_schema().map_err(|e| AppError::Storage(e.to_string()))?;
        Ok(storage)
    }

    fn init_schema(&mut self) -> SqlResult<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS targets (
                id          TEXT PRIMARY KEY,
                ipv4        TEXT NOT NULL,
                alias       TEXT NOT NULL DEFAULT '',
                enabled     INTEGER NOT NULL DEFAULT 1,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ping_samples (
                id          TEXT PRIMARY KEY,
                target_id   TEXT NOT NULL REFERENCES targets(id),
                sent_at     TEXT NOT NULL,
                status      TEXT NOT NULL,
                latency_ms  REAL,
                error_kind  TEXT
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_samples_target
                ON ping_samples(target_id, sent_at);
            ",
        )?;
        Ok(())
    }

    // ── Settings ──────────────────────────────────────────────

    pub fn get_settings(&self) -> SqlResult<AppSettings> {
        fn get_str(conn: &Connection, key: &str, default: &str) -> String {
             conn.prepare("SELECT value FROM settings WHERE key = ?1")
                 .and_then(|mut s| s.query_row(params![key], |row| row.get::<_, String>(0)))
                 .unwrap_or(default.to_string())
         }
 
         Ok(AppSettings {
            ping_interval_seconds: get_str(&self.conn, "ping_interval_seconds", "5").parse().unwrap_or(5),
            ping_timeout_seconds: get_str(&self.conn, "ping_timeout_seconds", "5").parse().unwrap_or(5),
            retention_days: get_str(&self.conn, "retention_days", "7").parse().unwrap_or(7),
            alert_threshold: get_str(&self.conn, "alert_threshold", "3").parse().unwrap_or(3),
            alias_color: get_str(&self.conn, "alias_color", "").to_string(),
            ipv4_color: get_str(&self.conn, "ipv4_color", "").to_string(),
            theme_id: get_str(&self.conn, "theme_id", "pure-white").to_string(),
            backoff_intervals: parse_backoff_intervals(&get_str(
                &self.conn,
                "backoff_intervals",
                "10,60,180,600,1800,3600",
            )),
        })
    }

    pub fn save_settings(&self, settings: &AppSettings) -> SqlResult<()> {
        let pairs = [
            (
                "ping_interval_seconds",
                &settings.ping_interval_seconds.to_string(),
            ),
            (
                "ping_timeout_seconds",
                &settings.ping_timeout_seconds.to_string(),
            ),
            ("retention_days", &settings.retention_days.to_string()),
            (
                "alert_threshold",
                &settings.alert_threshold.to_string(),
            ),
            ("alias_color", &settings.alias_color),
            ("ipv4_color", &settings.ipv4_color),
            ("theme_id", &settings.theme_id),
            (
                "backoff_intervals",
                &settings
                    .backoff_intervals
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(","),
            ),
        ];
        for (key, value) in &pairs {
            self.conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )?;
        }
        Ok(())
    }

    // ── Targets ───────────────────────────────────────────────

    pub fn list_targets(&self) -> SqlResult<Vec<Target>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, ipv4, alias, enabled, created_at, updated_at FROM targets ORDER BY created_at")?;
        let rows = stmt.query_map([], |row| {
            let id_str: String = row.get(0)?;
            Ok(Target {
                id: Uuid::parse_str(&id_str).unwrap_or_default(),
                ipv4: row.get(1)?,
                alias: row.get(2)?,
                enabled: row.get::<_, i32>(3)? != 0,
                created_at: row.get::<_, String>(4)?.parse().unwrap_or_else(|_| Utc::now()),
                updated_at: row.get::<_, String>(5)?.parse().unwrap_or_else(|_| Utc::now()),
            })
        })?;
        let mut targets = Vec::new();
        for row in rows {
            targets.push(row.map_err(|e| e)?);
        }
        Ok(targets)
    }

    pub fn save_target(&self, target: &Target) -> SqlResult<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO targets (id, ipv4, alias, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
               ipv4      = excluded.ipv4,
               alias     = excluded.alias,
               enabled   = excluded.enabled,
               updated_at = excluded.updated_at",
            params![
                target.id.to_string(),
                target.ipv4,
                target.alias,
                target.enabled as i32,
                target.created_at.to_rfc3339(),
                now,
            ],
        )?;
        Ok(())
    }

    pub fn update_target_enabled(&self, id: Uuid, enabled: bool) -> Result<Target, AppError> {
        let now = Utc::now().to_rfc3339();
        let rows = self
            .conn
            .execute(
                "UPDATE targets SET enabled = ?1, updated_at = ?2 WHERE id = ?3",
                params![enabled as i32, now, id.to_string()],
            )
            .map_err(|e| AppError::Storage(e.to_string()))?;
        if rows == 0 {
            return Err(AppError::TargetNotFound(id.to_string()));
        }
        // Return updated target
        self.get_target(id)
    }

    pub fn get_target(&self, id: Uuid) -> Result<Target, AppError> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, ipv4, alias, enabled, created_at, updated_at FROM targets WHERE id = ?1")
            .map_err(|e| AppError::Storage(e.to_string()))?;
        stmt.query_row(params![id.to_string()], |row| {
            let id_str: String = row.get(0)?;
            Ok(Target {
                id: Uuid::parse_str(&id_str).unwrap_or_default(),
                ipv4: row.get(1)?,
                alias: row.get(2)?,
                enabled: row.get::<_, i32>(3)? != 0,
                created_at: row.get::<_, String>(4)?.parse().unwrap_or_else(|_| Utc::now()),
                updated_at: row.get::<_, String>(5)?.parse().unwrap_or_else(|_| Utc::now()),
            })
        })
        .map_err(|_| AppError::TargetNotFound(id.to_string()))
    }

    pub fn delete_target(&self, id: Uuid) -> SqlResult<()> {
        // Delete associated samples first, then the target
        self.conn
            .execute("DELETE FROM ping_samples WHERE target_id = ?1", params![id.to_string()])?;
        self.conn
            .execute("DELETE FROM targets WHERE id = ?1", params![id.to_string()])?;
        Ok(())
    }

    // ── Ping Samples ──────────────────────────────────────────

    pub fn insert_sample(&self, sample: &PingSample) -> SqlResult<()> {
        self.conn.execute(
            "INSERT INTO ping_samples (id, target_id, sent_at, status, latency_ms, error_kind)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                sample.id.to_string(),
                sample.target_id.to_string(),
                sample.sent_at.to_rfc3339(),
                serde_json::to_string(&sample.status).unwrap_or_default(),
                sample.latency_ms,
                sample.error_kind,
            ],
        )?;
        Ok(())
    }

    pub fn samples_for_target(
        &self,
        target_id: Uuid,
        from: Option<DateTime<Utc>>,
        to: Option<DateTime<Utc>>,
    ) -> SqlResult<Vec<PingSample>> {
        let mut sql = String::from(
            "SELECT id, target_id, sent_at, status, latency_ms, error_kind
             FROM ping_samples WHERE target_id = ?1",
        );
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> =
            vec![Box::new(target_id.to_string())];

        if from.is_some() {
            sql.push_str(" AND sent_at >= ?2");
            param_values.push(Box::new(from.unwrap().to_rfc3339()));
        }
        if to.is_some() {
            let idx = if from.is_some() { 3 } else { 2 };
            sql.push_str(&format!(" AND sent_at <= ?{}", idx));
            param_values.push(Box::new(to.unwrap().to_rfc3339()));
        }
        sql.push_str(" ORDER BY sent_at ASC");

        let mut stmt = self.conn.prepare(&sql).map_err(|e| e)?;
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            let id_str: String = row.get(0)?;
            let target_id_str: String = row.get(1)?;
            let status_str: String = row.get(3)?;
            Ok(PingSample {
                id: Uuid::parse_str(&id_str).unwrap_or_default(),
                target_id: Uuid::parse_str(&target_id_str).unwrap_or_default(),
                sent_at: row.get::<_, String>(2)?.parse().unwrap_or_else(|_| Utc::now()),
                status: serde_json::from_str(&status_str).unwrap_or(crate::models::PingStatus::Error),
                latency_ms: row.get(4)?,
                error_kind: row.get(5)?,
            })
        })
        .map_err(|e| e)?;

        let mut samples = Vec::new();
        for row in rows {
            samples.push(row.map_err(|e| e)?);
        }
        Ok(samples)
    }

    pub fn cleanup_retention(&self, days: i64) -> SqlResult<usize> {
        let cutoff = (Utc::now() - chrono::Duration::days(days)).to_rfc3339();
        let deleted = self
            .conn
            .execute("DELETE FROM ping_samples WHERE sent_at < ?1", params![cutoff])?;
        Ok(deleted)
    }

    pub fn clear_samples(&self) -> SqlResult<usize> {
        let deleted = self.conn.execute("DELETE FROM ping_samples", [])?;
        self.conn.execute("VACUUM", [])?;
        Ok(deleted)
    }

    pub fn db_path(&self) -> SqlResult<String> {
        self.conn.query_row(
            "SELECT file FROM pragma_database_list WHERE name = 'main'",
            [],
            |row| row.get::<_, String>(0),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    struct TestHarness {
        _dir: TempDir,
        storage: Storage,
    }

    impl TestHarness {
        fn new() -> Self {
            let dir = TempDir::new().unwrap();
            let path = dir.path().join("test.db");
            let storage = Storage::open(&path).unwrap();
            TestHarness { _dir: dir, storage }
        }
    }

    #[test]
    fn init_schema_creates_tables() {
        let h = TestHarness::new();
        let targets = h.storage.list_targets().unwrap();
        assert!(targets.is_empty());
    }

    #[test]
    fn save_and_list_target() {
        let h = TestHarness::new();
        let storage = &h.storage;
        let target = Target {
            id: Uuid::new_v4(),
            ipv4: "192.168.1.1".to_string(),
            alias: "Router".to_string(),
            enabled: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        storage.save_target(&target).unwrap();
        let targets = storage.list_targets().unwrap();
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].ipv4, "192.168.1.1");
    }

    #[test]
    fn update_target_enabled() {
        let h = TestHarness::new();
        let storage = &h.storage;
        let target = Target {
            id: Uuid::new_v4(),
            ipv4: "10.0.0.1".to_string(),
            alias: "Test".to_string(),
            enabled: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        storage.save_target(&target).unwrap();
        let updated = storage.update_target_enabled(target.id, false).unwrap();
        assert!(!updated.enabled);
    }

    #[test]
    fn insert_and_query_samples() {
        let h = TestHarness::new();
        let storage = &h.storage;
        let target = Target {
            id: Uuid::new_v4(),
            ipv4: "8.8.8.8".to_string(),
            alias: "DNS".to_string(),
            enabled: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        storage.save_target(&target).unwrap();

        let sample = PingSample {
            id: Uuid::new_v4(),
            target_id: target.id,
            sent_at: Utc::now(),
            status: PingStatus::Success,
            latency_ms: Some(10.5),
            error_kind: None,
        };
        storage.insert_sample(&sample).unwrap();
        let samples = storage.samples_for_target(target.id, None, None).unwrap();
        assert_eq!(samples.len(), 1);
        assert_eq!(samples[0].latency_ms, Some(10.5));
    }

    #[test]
    fn save_and_get_settings() {
        let h = TestHarness::new();
        let storage = &h.storage;
        let settings = AppSettings {
            ping_interval_seconds: 10,
            ping_timeout_seconds: 3,
            retention_days: 14,
            alert_threshold: 5,
            backoff_intervals: vec![15, 90, 300, 900, 2700, 7200],
            ..AppSettings::default()
        };
        storage.save_settings(&settings).unwrap();
        let loaded = storage.get_settings().unwrap();
        assert_eq!(loaded.ping_interval_seconds, 10);
        assert_eq!(loaded.retention_days, 14);
        assert_eq!(loaded.alert_threshold, 5);
        assert_eq!(
            loaded.backoff_intervals,
            vec![15, 90, 300, 900, 2700, 7200]
        );
    }

    #[test]
    fn cleanup_old_samples() {
        let h = TestHarness::new();
        let storage = &h.storage;
        let target = Target {
            id: Uuid::new_v4(),
            ipv4: "1.1.1.1".to_string(),
            alias: "Cloudflare".to_string(),
            enabled: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        storage.save_target(&target).unwrap();

        let old_sample = PingSample {
            id: Uuid::new_v4(),
            target_id: target.id,
            sent_at: Utc::now() - chrono::Duration::days(30),
            status: PingStatus::Success,
            latency_ms: Some(1.0),
            error_kind: None,
        };
        storage.insert_sample(&old_sample).unwrap();

        let recent_sample = PingSample {
            id: Uuid::new_v4(),
            target_id: target.id,
            sent_at: Utc::now(),
            status: PingStatus::Success,
            latency_ms: Some(2.0),
            error_kind: None,
        };
        storage.insert_sample(&recent_sample).unwrap();

        let deleted = storage.cleanup_retention(7).unwrap();
        assert!(deleted >= 1);

        let remaining = storage.samples_for_target(target.id, None, None).unwrap();
        assert_eq!(remaining.len(), 1);
    }
}
