-- Base exercise catalog bundled with the app.
-- These rows are copied into the user's local SQLite database on startup.
-- Custom user-created exercises are stored in the same exercises table with source = 'user'.
-- Previous hit is workout-card specific; max volume is app-wide per exercise.

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base_key TEXT UNIQUE,
  name TEXT NOT NULL,
  muscle_group TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  max_volume REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  previous_weight REAL,
  previous_reps INTEGER,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
);

INSERT INTO exercises (base_key, name, muscle_group, source) VALUES
  ('barbell-overhead-press', 'Barbell Overhead Press', 'Shoulders', 'base'),
  ('dumbbell-lateral-raise', 'Dumbbell Lateral Raise', 'Shoulders', 'base'),
  ('barbell-bench-press', 'Barbell Bench Press', 'Chest', 'base'),
  ('incline-dumbbell-press', 'Incline Dumbbell Press', 'Chest', 'base'),
  ('barbell-curl', 'Barbell Curl', 'Biceps', 'base'),
  ('hammer-curl', 'Hammer Curl', 'Biceps', 'base'),
  ('cable-crunch', 'Cable Crunch', 'Abs', 'base'),
  ('plank', 'Plank', 'Abs', 'base'),
  ('wrist-curl', 'Wrist Curl', 'Forearms', 'base'),
  ('reverse-wrist-curl', 'Reverse Wrist Curl', 'Forearms', 'base'),
  ('barbell-squat', 'Barbell Squat', 'Quads', 'base'),
  ('leg-press', 'Leg Press', 'Quads', 'base'),
  ('hip-adduction-machine', 'Hip Adduction Machine', 'Adductors', 'base'),
  ('copenhagen-plank', 'Copenhagen Plank', 'Adductors', 'base'),
  ('treadmill-run', 'Treadmill Run', 'Cardio', 'base'),
  ('stationary-bike', 'Stationary Bike', 'Cardio', 'base'),
  ('neck-flexion', 'Neck Flexion', 'Neck', 'base'),
  ('neck-extension', 'Neck Extension', 'Neck', 'base'),
  ('triceps-pushdown', 'Triceps Pushdown', 'Triceps', 'base'),
  ('close-grip-bench-press', 'Close-Grip Bench Press', 'Triceps', 'base'),
  ('barbell-shrug', 'Barbell Shrug', 'Traps', 'base'),
  ('face-pull', 'Face Pull', 'Traps', 'base'),
  ('pull-up', 'Pull-Up', 'Lats', 'base'),
  ('lat-pulldown', 'Lat Pulldown', 'Lats', 'base'),
  ('back-extension', 'Back Extension', 'Lower Back', 'base'),
  ('good-morning', 'Good Morning', 'Lower Back', 'base'),
  ('barbell-hip-thrust', 'Barbell Hip Thrust', 'Glutes', 'base'),
  ('glute-bridge', 'Glute Bridge', 'Glutes', 'base'),
  ('romanian-deadlift', 'Romanian Deadlift', 'Hamstrings', 'base'),
  ('lying-leg-curl', 'Lying Leg Curl', 'Hamstrings', 'base'),
  ('standing-calf-raise', 'Standing Calf Raise', 'Calves', 'base'),
  ('seated-calf-raise', 'Seated Calf Raise', 'Calves', 'base')
ON CONFLICT(base_key) DO UPDATE SET
  name = excluded.name,
  muscle_group = excluded.muscle_group,
  source = 'base';
