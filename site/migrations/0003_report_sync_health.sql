ALTER TABLE report_snapshots ADD COLUMN checked_at TEXT;
UPDATE report_snapshots SET checked_at = completed_at WHERE complete = 1;
