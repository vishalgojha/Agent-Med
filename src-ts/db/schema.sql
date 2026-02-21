CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL REFERENCES doctors(id),
  name TEXT NOT NULL,
  dob TEXT,
  phone TEXT,
  meds TEXT,
  allergies TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  doctor_id TEXT NOT NULL REFERENCES doctors(id),
  transcript_hash TEXT NOT NULL UNIQUE,
  subjective TEXT,
  objective TEXT,
  assessment TEXT,
  plan TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prior_auths (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  procedure_code TEXT NOT NULL,
  diagnosis_codes TEXT NOT NULL,
  insurer_id TEXT NOT NULL,
  clinical_justification TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  doctor_id TEXT NOT NULL REFERENCES doctors(id),
  trigger TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sms',
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (patient_id, trigger, scheduled_at)
);

CREATE TABLE IF NOT EXISTS replay_log (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  risk TEXT NOT NULL,
  ok INTEGER NOT NULL,
  output TEXT,
  request_id TEXT,
  actor_id TEXT,
  executed_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start_ms INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_patient_created ON notes(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prior_auths_patient_status ON prior_auths(patient_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status_schedule ON follow_ups(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_follow_ups_retry_count ON follow_ups(status, retry_count, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_replay_executed ON replay_log(executed_at DESC);
