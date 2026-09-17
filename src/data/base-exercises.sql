-- Base exercise catalog bundled with the app.
-- These rows are copied into the user's local SQLite database on startup.
-- Custom user-created exercises are stored in the same exercises table with source = 'user'.
-- Previous hit is workout-card specific; personal best is app-wide per exercise.

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base_key TEXT UNIQUE,
  name TEXT NOT NULL,
  muscle_group TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  max_volume REAL NOT NULL DEFAULT 0,
  personal_best_weight REAL,
  personal_best_reps INTEGER
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
  -- SHOULDER PRESS
  ('barbell-overhead-press', 'Barbell Overhead Press', 'Shoulders', 'base'),
  ('machine-shoulder-press', 'Machine Shoulder Press', 'Shoulders', 'base'),
  ('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'Shoulders', 'base'),

  -- FRONT DELT
  ('cable-front-raise', 'Cable Front Raise', 'Shoulders', 'base'),
  ('machine-shoulder-press-front', 'Machine Shoulder Press (Front Delt)', 'Shoulders', 'base'),

  -- LATERAL DELT
  ('dumbbell-lateral-raise', 'Dumbbell Lateral Raise', 'Shoulders', 'base'),
  ('cable-lateral-raise', 'Cable Lateral Raise', 'Shoulders', 'base'),\
  ('machine-lateral-raise', 'Machine Lateral Raise', 'Shoulders', 'base'),

  -- REAR DELT
  ('machine-rear-delt-fly', 'Machine Rear Delt Fly', 'Shoulders', 'base'),
  ('cable-rear-delt-fly', 'Cable Rear Delt Fly', 'Shoulders', 'base'),
  ('dumbbell-rear-delt-fly', 'Dumbbell Rear Delt Fly', 'Shoulders', 'base'),

  -- CHEST
  ('flat-barbell-bench-press', 'Flat Barbell Bench Press', 'Chest', 'base'),
  ('machine-chest-fly', 'Machine Chest Fly', 'Chest', 'base'),

  -- UPPER CHEST
  ('incline-dumbbell-press', 'Incline Dumbbell Press', 'Chest', 'base'),
  ('low-high-chest-fly', 'Low To High Chest Fly', 'Chest', 'base'),
  ('incline-barbell-bench-press', 'Incline Barbell Bench Press', 'Chest', 'base'),

  -- LOWER CHEST
  ('high-low-chest-fly', 'High To Low Chest Fly', 'Chest', 'base'),
  ('decline-machine-press', 'Decline Machine Press', 'Chest', 'base'),

  -- BICEPS
  ('barbell-curl', 'Barbell Curl', 'Biceps', 'base'),
  ('dumbbell-curl', 'Dumbbell Curl', 'Biceps', 'base'),
  ('baysian-curl', 'Baysian Curl', 'Biceps', 'base'),
  ('preacher-curl', 'Preacher Curl', 'Biceps', 'base'),
  ('cable-curl', 'Cable Curl', 'Biceps', 'base'),

  -- ABS
  ('cable-crunch', 'Cable Crunch', 'Abs', 'base'),
  ('machine-crunch', 'Machine Crunch', 'Abs', 'base'),
  ('leg-raise', 'Leg Raise', 'Abs', 'base'),
  ('decline-crunch', 'Decline Crunch', 'Abs', 'base'),

  -- FOREARMS
  ('wrist-curl', 'Wrist Curl', 'Forearms', 'base'),
  ('reverse-wrist-curl', 'Reverse Wrist Curl', 'Forearms', 'base'),
  ('hammer-curl', 'Hammer Curl', 'Forearms', 'base'),
  ('reverse-curl', 'Reverse Curl', 'Forearms', 'base'),

  -- QUADS
  ('squat', 'Squat', 'Quads', 'base'),
  ('leg-press', 'Leg Press', 'Quads', 'base'),
  ('leg-extension', 'Leg Extension', 'Quads', 'base'),

  -- ADDUCTORS
  ('hip-adduction-machine', 'Hip Adduction Machine', 'Adductors', 'base'),
  ('copenhagen-plank', 'Copenhagen Plank', 'Adductors', 'base'),

  -- CARDIO
  ('treadmill-run', 'Treadmill Run', 'Cardio', 'base'),
  ('stationary-bike', 'Stationary Bike', 'Cardio', 'base'),

  -- NECK
  ('neck-flexion', 'Neck Flexion', 'Neck', 'base'),
  ('neck-extension', 'Neck Extension', 'Neck', 'base'),

  -- TRICEPS
  ('triceps-pushdown', 'Triceps Pushdown', 'Triceps', 'base'),
  ('overhead-tricep-extension', 'Overhead Tricep Extension', 'Triceps', 'base'),
  ('close-grip-bench-press', 'Close-Grip Bench Press', 'Triceps', 'base'),

  -- TRAPS
  ('Smith-machine-shrug', 'Smith Machine Shrug', 'Traps', 'base'),
  ('face-pull', 'Face Pull', 'Traps', 'base'),
  ('t-bar-wide-grip', 'T-bar Wide Grip', 'Traps', 'base'),
  ('kelso-shrug', 'Kelso Shrug', 'Traps', 'base'),

  -- LATS
  ('pull-up', 'Pull-Up', 'Lats', 'base'),
  ('lat-pulldown', 'Lat Pulldown', 'Lats', 'base'),
  ('pullover', 'Pullover', 'Lats', 'base'),

  -- LOWER BACK
  ('back-extension', 'Back Extension', 'Lower Back', 'base'),
  ('good-morning', 'Good Morning', 'Lower Back', 'base'),

  -- GLUTES
  ('barbell-hip-thrust', 'Barbell Hip Thrust', 'Glutes', 'base'),
  ('machine-hip-thrust', 'Machine Hip Thrust', 'Glutes', 'base'),

  -- HAMSTRINGS
  ('romanian-deadlift', 'Romanian Deadlift', 'Hamstrings', 'base'),
  ('lying-leg-curl', 'Lying Leg Curl', 'Hamstrings', 'base'),
  ('seated-leg-curl', 'Seated Leg Curl', 'Hamstrings', 'base'),

  -- CALVES
  ('standing-calf-raise', 'Standing Calf Raise', 'Calves', 'base'),
  ('seated-calf-raise', 'Seated Calf Raise', 'Calves', 'base')

ON CONFLICT(base_key) DO UPDATE SET
  name = excluded.name,
  muscle_group = excluded.muscle_group,
  source = 'base';
