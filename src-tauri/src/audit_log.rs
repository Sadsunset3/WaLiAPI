//! 审计日志策略：控制正文是否落库，并按保留期清理历史记录。

use crate::{db::models::RequestLog, settings_store::SettingsStore};
use sqlx::SqlitePool;
use std::sync::{OnceLock, RwLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogDetailLevel {
    Basic,
    Detailed,
}

impl LogDetailLevel {
    pub fn parse(value: &str) -> Self {
        if value.eq_ignore_ascii_case("detailed") {
            Self::Detailed
        } else {
            Self::Basic
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LogPolicy {
    pub detail_level: LogDetailLevel,
    /// 0 means retain forever.
    pub retention_days: u64,
}

impl Default for LogPolicy {
    fn default() -> Self {
        Self {
            detail_level: LogDetailLevel::Basic,
            retention_days: 7,
        }
    }
}

static POLICY: OnceLock<RwLock<LogPolicy>> = OnceLock::new();

fn policy_cell() -> &'static RwLock<LogPolicy> {
    // Library consumers and migration/integration tests may create a
    // Repository without booting AppState. Preserve the historical detailed
    // write behavior until the application startup explicitly applies the
    // persisted policy (whose product default is basic).
    POLICY.get_or_init(|| {
        RwLock::new(LogPolicy {
            detail_level: LogDetailLevel::Detailed,
            retention_days: 7,
        })
    })
}

pub fn policy_from_settings(settings: &SettingsStore) -> LogPolicy {
    let defaults = LogPolicy::default();
    let retention_days = settings.get_u64("logs.retention_days", defaults.retention_days);
    LogPolicy {
        detail_level: LogDetailLevel::parse(&settings.get_str("logs.detail_level", "basic")),
        retention_days: normalize_retention_days(retention_days),
    }
}

/// Supported retention values shared by UI and backend. Unknown persisted
/// values fall back to the safe default instead of creating an unbounded
/// cleanup interval or overflowing chrono's duration conversion.
pub fn normalize_retention_days(value: u64) -> u64 {
    match value {
        0 | 1 | 7 | 30 | 90 => value,
        _ => LogPolicy::default().retention_days,
    }
}

pub fn apply_settings(settings: &SettingsStore) {
    let policy = policy_from_settings(settings);
    if let Ok(mut current) = policy_cell().write() {
        *current = policy;
    }
}

pub fn current_policy() -> LogPolicy {
    policy_cell()
        .read()
        .map(|policy| *policy)
        .unwrap_or_default()
}

/// Apply the active policy immediately before persistence. This centralizes
/// all request-log write paths because they already share Repository::create_log.
pub fn effective_log(log: &RequestLog) -> RequestLog {
    effective_log_with_policy(log, current_policy())
}

pub fn effective_log_with_policy(log: &RequestLog, policy: LogPolicy) -> RequestLog {
    let mut effective = log.clone();
    if policy.detail_level == LogDetailLevel::Basic {
        effective.request_body = None;
        effective.response_choices = None;
    }
    effective
}

/// Delete expired rows in small transactions so cleanup does not hold the
/// SQLite write lock for the entire history.
pub async fn cleanup_expired_logs(
    pool: &SqlitePool,
    retention_days: u64,
) -> Result<u64, sqlx::Error> {
    if retention_days == 0 {
        return Ok(0);
    }
    let cutoff = (chrono::Utc::now() - chrono::Duration::days(retention_days as i64)).to_rfc3339();
    let mut deleted = 0;
    loop {
        let mut tx = pool.begin().await?;
        let findings = sqlx::query(
            "DELETE FROM request_security_findings WHERE log_id IN \
             (SELECT id FROM request_logs WHERE created_at < ? LIMIT 500)",
        )
        .bind(&cutoff)
        .execute(&mut *tx)
        .await?;
        let segments = sqlx::query(
            "DELETE FROM stream_segments WHERE log_id IN \
             (SELECT id FROM request_logs WHERE created_at < ? LIMIT 500)",
        )
        .bind(&cutoff)
        .execute(&mut *tx)
        .await?;
        let rows = sqlx::query(
            "DELETE FROM request_logs WHERE id IN \
             (SELECT id FROM request_logs WHERE created_at < ? LIMIT 500)",
        )
        .bind(&cutoff)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        deleted += rows.rows_affected();
        let _ = (findings, segments);
        if rows.rows_affected() == 0 {
            break;
        }
    }
    Ok(deleted)
}

pub async fn run_maintenance_loop(pool: SqlitePool, settings: SettingsStore) {
    apply_settings(&settings);
    let run = || async {
        let policy = policy_from_settings(&settings);
        if let Err(error) = cleanup_expired_logs(&pool, policy.retention_days).await {
            tracing::warn!(%error, "审计日志自动清理失败");
        }
        apply_settings(&settings);
    };
    run().await;
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(6 * 60 * 60));
    loop {
        interval.tick().await;
        run().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::RequestLog;

    #[test]
    fn basic_policy_drops_large_payloads() {
        let mut log = RequestLog::default();
        log.request_body = Some("large".into());
        log.response_choices = Some("response".into());
        let effective = effective_log_with_policy(&log, LogPolicy::default());
        assert!(effective.request_body.is_none());
        assert!(effective.response_choices.is_none());
    }

    #[test]
    fn detail_level_parser_is_safe() {
        assert_eq!(LogDetailLevel::parse("detailed"), LogDetailLevel::Detailed);
        assert_eq!(LogDetailLevel::parse("unexpected"), LogDetailLevel::Basic);
    }
}
