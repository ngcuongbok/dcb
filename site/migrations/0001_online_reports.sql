-- Reporting mirror only. The booth and Google Sheets remain operational sources.
-- A snapshot is visible only when its complete flag is set in the same commit.
CREATE TABLE IF NOT EXISTS report_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  expected_keys INTEGER NOT NULL CHECK(expected_keys >= 0),
  expected_shifts INTEGER NOT NULL CHECK(expected_shifts >= 0),
  expected_staff INTEGER NOT NULL CHECK(expected_staff >= 0),
  complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0, 1))
);

CREATE TABLE IF NOT EXISTS report_keys (
  snapshot_id TEXT NOT NULL REFERENCES report_snapshots(snapshot_id) ON DELETE CASCADE,
  row_id TEXT NOT NULL,
  order_group TEXT NOT NULL,
  legacy_order INTEGER NOT NULL CHECK(legacy_order IN (0, 1)),
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  booth_type TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  final_amount INTEGER NOT NULL CHECK(final_amount >= 0),
  PRIMARY KEY(snapshot_id, row_id)
);
CREATE INDEX IF NOT EXISTS report_keys_date ON report_keys(snapshot_id, created_at);
CREATE INDEX IF NOT EXISTS report_keys_order ON report_keys(snapshot_id, order_group);

CREATE TABLE IF NOT EXISTS report_shifts (
  snapshot_id TEXT NOT NULL REFERENCES report_snapshots(snapshot_id) ON DELETE CASCADE,
  shift_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT,
  status TEXT NOT NULL,
  total_revenue INTEGER NOT NULL CHECK(total_revenue >= 0),
  cash_revenue INTEGER NOT NULL CHECK(cash_revenue >= 0),
  transfer_revenue INTEGER NOT NULL CHECK(transfer_revenue >= 0),
  ptb_revenue INTEGER NOT NULL CHECK(ptb_revenue >= 0),
  selfbooth_revenue INTEGER NOT NULL CHECK(selfbooth_revenue >= 0),
  PRIMARY KEY(snapshot_id, shift_id)
);
CREATE INDEX IF NOT EXISTS report_shifts_date ON report_shifts(snapshot_id, start_at);

CREATE TABLE IF NOT EXISTS report_staff (
  snapshot_id TEXT NOT NULL REFERENCES report_snapshots(snapshot_id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0, 1)),
  PRIMARY KEY(snapshot_id, staff_id)
);
