-- 流式生成内容段（溢出表）：大文本不入 request_logs 主表，避免拖慢日志列表查询。
-- detail_level=detailed 时随流式落账写入（受日志策略门控）；保留期清理与主表同步。
CREATE TABLE IF NOT EXISTS stream_segments (
    log_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (log_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_stream_segments_created ON stream_segments(created_at);
