-- Editable ProfileScreen settings bundled with the app.
-- These defaults are seeded into the user's local SQLite database on startup.

CREATE TABLE IF NOT EXISTS profile_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO profile_settings (key, value) VALUES
  ('name', ''),
  ('age', ''),
  ('weight', ''),
  ('body_fat_percentage', ''),
  ('theme', 'Auto dark'),
  ('timer_sound', 'David.mp3'),
  ('sound_effects_enabled', '0');
