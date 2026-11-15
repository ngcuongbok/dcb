-- Only the owner configured on the Worker can add or remove managers.
CREATE TABLE IF NOT EXISTS report_allowed_managers (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  added_at TEXT NOT NULL,
  added_by TEXT NOT NULL
);
