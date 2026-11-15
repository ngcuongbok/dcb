-- Bounded JSON chunks make a complete mirror affordable to refresh frequently
-- on the D1 free plan. No activation codes or customer details are stored.
CREATE TABLE IF NOT EXISTS report_chunks (
  snapshot_id TEXT NOT NULL REFERENCES report_snapshots(snapshot_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('keys','shifts','staff')),
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0),
  row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 100),
  records_json TEXT NOT NULL CHECK(json_valid(records_json)),
  PRIMARY KEY(snapshot_id, kind, chunk_index)
);
