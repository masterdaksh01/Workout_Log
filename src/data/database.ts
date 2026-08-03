import * as SQLite from 'expo-sqlite';

import type { MuscleGroup } from './types';

// This cached promise shares one SQLite connection with every repository function.
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

type BaseExerciseSeed = {
  baseKey: string;
  name: string;
  muscleGroup: MuscleGroup;
};

type ProfileSettingSeed = {
  key: string;
  value: string;
};

const BASE_EXERCISES: BaseExerciseSeed[] = [
  { baseKey: 'barbell-overhead-press', name: 'Barbell Overhead Press', muscleGroup: 'Shoulders' },
  { baseKey: 'dumbbell-lateral-raise', name: 'Dumbbell Lateral Raise', muscleGroup: 'Shoulders' },
  { baseKey: 'barbell-bench-press', name: 'Barbell Bench Press', muscleGroup: 'Chest' },
  { baseKey: 'incline-dumbbell-press', name: 'Incline Dumbbell Press', muscleGroup: 'Chest' },
  { baseKey: 'barbell-curl', name: 'Barbell Curl', muscleGroup: 'Biceps' },
  { baseKey: 'hammer-curl', name: 'Hammer Curl', muscleGroup: 'Biceps' },
  { baseKey: 'cable-crunch', name: 'Cable Crunch', muscleGroup: 'Abs' },
  { baseKey: 'plank', name: 'Plank', muscleGroup: 'Abs' },
  { baseKey: 'wrist-curl', name: 'Wrist Curl', muscleGroup: 'Forearms' },
  { baseKey: 'reverse-wrist-curl', name: 'Reverse Wrist Curl', muscleGroup: 'Forearms' },
  { baseKey: 'barbell-squat', name: 'Barbell Squat', muscleGroup: 'Quads' },
  { baseKey: 'leg-press', name: 'Leg Press', muscleGroup: 'Quads' },
  { baseKey: 'hip-adduction-machine', name: 'Hip Adduction Machine', muscleGroup: 'Adductors' },
  { baseKey: 'copenhagen-plank', name: 'Copenhagen Plank', muscleGroup: 'Adductors' },
  { baseKey: 'treadmill-run', name: 'Treadmill Run', muscleGroup: 'Cardio' },
  { baseKey: 'stationary-bike', name: 'Stationary Bike', muscleGroup: 'Cardio' },
  { baseKey: 'neck-flexion', name: 'Neck Flexion', muscleGroup: 'Neck' },
  { baseKey: 'neck-extension', name: 'Neck Extension', muscleGroup: 'Neck' },
  { baseKey: 'triceps-pushdown', name: 'Triceps Pushdown', muscleGroup: 'Triceps' },
  { baseKey: 'close-grip-bench-press', name: 'Close-Grip Bench Press', muscleGroup: 'Triceps' },
  { baseKey: 'barbell-shrug', name: 'Barbell Shrug', muscleGroup: 'Traps' },
  { baseKey: 'face-pull', name: 'Face Pull', muscleGroup: 'Traps' },
  { baseKey: 'pull-up', name: 'Pull-Up', muscleGroup: 'Lats' },
  { baseKey: 'lat-pulldown', name: 'Lat Pulldown', muscleGroup: 'Lats' },
  { baseKey: 'back-extension', name: 'Back Extension', muscleGroup: 'Lower Back' },
  { baseKey: 'good-morning', name: 'Good Morning', muscleGroup: 'Lower Back' },
  { baseKey: 'barbell-hip-thrust', name: 'Barbell Hip Thrust', muscleGroup: 'Glutes' },
  { baseKey: 'glute-bridge', name: 'Glute Bridge', muscleGroup: 'Glutes' },
  { baseKey: 'romanian-deadlift', name: 'Romanian Deadlift', muscleGroup: 'Hamstrings' },
  { baseKey: 'lying-leg-curl', name: 'Lying Leg Curl', muscleGroup: 'Hamstrings' },
  { baseKey: 'standing-calf-raise', name: 'Standing Calf Raise', muscleGroup: 'Calves' },
  { baseKey: 'seated-calf-raise', name: 'Seated Calf Raise', muscleGroup: 'Calves' },
];

const PROFILE_SETTING_SEEDS: ProfileSettingSeed[] = [
  { key: 'name', value: '' },
  { key: 'age', value: '' },
  { key: 'weight', value: '' },
  { key: 'body_fat_percentage', value: '' },
  { key: 'theme', value: 'Auto dark' },
  { key: 'timer_sound', value: 'david' },
  { key: 'sound_effects_enabled', value: '0' },
];

// This helper opens the local Expo SQLite database used by repository.ts.
export function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('strong_retry_v1.db');
  }

  return databasePromise;
}

// This initializer creates the app schema that repository.ts reads and writes for all screens.
export async function initDatabase() {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_key TEXT UNIQUE,
      name TEXT NOT NULL,
      muscle_group TEXT,
      source TEXT NOT NULL DEFAULT 'user',
      max_volume REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      name TEXT,
      folder_id INTEGER,
      is_template INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workout_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      previous_weight REAL,
      previous_reps INTEGER,
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_exercise_id INTEGER NOT NULL,
      weight REAL NOT NULL,
      reps INTEGER NOT NULL,
      FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS profile_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_id
      ON workout_exercises(workout_id);

    CREATE INDEX IF NOT EXISTS idx_sets_workout_exercise_id
      ON sets(workout_exercise_id);
  `);

  await migrateWorkoutColumns();
  await migrateExerciseColumns();
  await migrateWorkoutExerciseColumns();
  await seedProfileSettings();
  await seedBaseExercises();
}

// This migration adds V2 workout-template columns for users who already have the V1 workouts table.
async function migrateWorkoutColumns() {
  const db = await getDatabase();
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(workouts)');
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('name')) {
    await db.execAsync('ALTER TABLE workouts ADD COLUMN name TEXT;');
  }

  if (!columnNames.has('folder_id')) {
    await db.execAsync('ALTER TABLE workouts ADD COLUMN folder_id INTEGER;');
  }

  if (!columnNames.has('is_template')) {
    await db.execAsync('ALTER TABLE workouts ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0;');
  }
}

// This migration adds muscle-group browsing support and maps compatible legacy categories.
async function migrateExerciseColumns() {
  const db = await getDatabase();
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(exercises)');
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('muscle_group')) {
    await db.execAsync('ALTER TABLE exercises ADD COLUMN muscle_group TEXT;');
  }

  if (!columnNames.has('base_key')) {
    await db.execAsync('ALTER TABLE exercises ADD COLUMN base_key TEXT;');
  }

  if (!columnNames.has('source')) {
    await db.execAsync("ALTER TABLE exercises ADD COLUMN source TEXT NOT NULL DEFAULT 'user';");
  }

  if (!columnNames.has('max_volume')) {
    await db.execAsync('ALTER TABLE exercises ADD COLUMN max_volume REAL NOT NULL DEFAULT 0;');
  }

  if (columnNames.has('category')) {
    await db.execAsync(`
      UPDATE exercises
      SET muscle_group = CASE LOWER(TRIM(category))
        WHEN 'shoulder' THEN 'Shoulders'
        WHEN 'shoulders' THEN 'Shoulders'
        WHEN 'chest' THEN 'Chest'
        WHEN 'bicep' THEN 'Biceps'
        WHEN 'biceps' THEN 'Biceps'
        WHEN 'abs' THEN 'Abs'
        WHEN 'abdominals' THEN 'Abs'
        WHEN 'core' THEN 'Abs'
        WHEN 'forearm' THEN 'Forearms'
        WHEN 'forearms' THEN 'Forearms'
        WHEN 'quad' THEN 'Quads'
        WHEN 'quads' THEN 'Quads'
        WHEN 'quadriceps' THEN 'Quads'
        WHEN 'adductor' THEN 'Adductors'
        WHEN 'adductors' THEN 'Adductors'
        WHEN 'cardio' THEN 'Cardio'
        WHEN 'neck' THEN 'Neck'
        WHEN 'tricep' THEN 'Triceps'
        WHEN 'triceps' THEN 'Triceps'
        WHEN 'trap' THEN 'Traps'
        WHEN 'traps' THEN 'Traps'
        WHEN 'trapezius' THEN 'Traps'
        WHEN 'lat' THEN 'Lats'
        WHEN 'lats' THEN 'Lats'
        WHEN 'back' THEN 'Lats'
        WHEN 'lower back' THEN 'Lower Back'
        WHEN 'glute' THEN 'Glutes'
        WHEN 'glutes' THEN 'Glutes'
        WHEN 'hamstring' THEN 'Hamstrings'
        WHEN 'hamstrings' THEN 'Hamstrings'
        WHEN 'calf' THEN 'Calves'
        WHEN 'calves' THEN 'Calves'
        ELSE muscle_group
      END
      WHERE muscle_group IS NULL AND category IS NOT NULL;
    `);

    await rebuildExercisesWithoutCategory();
  }

  const currentColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(exercises)');
  const currentColumnNames = new Set(currentColumns.map((column) => column.name));

  if (
    currentColumnNames.has('previous_weight') ||
    currentColumnNames.has('previous_reps')
  ) {
    await rebuildExercisesTable();
  }

  await db.execAsync(`
    UPDATE exercises
    SET max_volume = 0
    WHERE max_volume IS NULL;

    CREATE INDEX IF NOT EXISTS idx_exercises_muscle_group
      ON exercises(muscle_group);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_base_key
      ON exercises(base_key);
  `);

  await deleteRemovedMuscleGroupExercises();
  await rebuildExerciseMaxVolumeStats();
}

// This rebuilds old installs so the exercise catalog only stores shared exercise data.
async function rebuildExercisesWithoutCategory() {
  await rebuildExercisesTable();
}

async function rebuildExercisesTable() {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE IF NOT EXISTS exercises_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_key TEXT UNIQUE,
      name TEXT NOT NULL,
      muscle_group TEXT,
      source TEXT NOT NULL DEFAULT 'user',
      max_volume REAL NOT NULL DEFAULT 0
    );

    INSERT INTO exercises_next (
      id,
      base_key,
      name,
      muscle_group,
      source,
      max_volume
    )
    SELECT
      id,
      base_key,
      name,
      muscle_group,
      source,
      COALESCE(max_volume, 0)
    FROM exercises;

    DROP TABLE exercises;
    ALTER TABLE exercises_next RENAME TO exercises;

    PRAGMA foreign_keys = ON;
  `);
}

// This migration puts previous hit on each workout-card exercise row.
async function migrateWorkoutExerciseColumns() {
  const db = await getDatabase();
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(workout_exercises)');
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('previous_weight')) {
    await db.execAsync('ALTER TABLE workout_exercises ADD COLUMN previous_weight REAL;');
  }

  if (!columnNames.has('previous_reps')) {
    await db.execAsync('ALTER TABLE workout_exercises ADD COLUMN previous_reps INTEGER;');
  }

  if (columnNames.has('max_volume')) {
    await rebuildWorkoutExercisesWithoutMaxVolume();
  }

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_id
      ON workout_exercises(workout_id);
  `);

  await rebuildWorkoutExercisePreviousHitStats();
}

async function rebuildWorkoutExercisesWithoutMaxVolume() {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE IF NOT EXISTS workout_exercises_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      previous_weight REAL,
      previous_reps INTEGER,
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
    );

    INSERT INTO workout_exercises_next (
      id,
      workout_id,
      exercise_id,
      previous_weight,
      previous_reps
    )
    SELECT
      id,
      workout_id,
      exercise_id,
      previous_weight,
      previous_reps
    FROM workout_exercises;

    DROP TABLE workout_exercises;
    ALTER TABLE workout_exercises_next RENAME TO workout_exercises;

    PRAGMA foreign_keys = ON;
  `);
}

// This copies the bundled base catalog into the mutable local exercise table.
async function seedBaseExercises() {
  const db = await getDatabase();

  await db.execAsync('BEGIN TRANSACTION;');

  try {
    for (const exercise of BASE_EXERCISES) {
      await db.runAsync(
        `
          INSERT INTO exercises (base_key, name, muscle_group, source)
          VALUES (?, ?, ?, 'base')
          ON CONFLICT(base_key) DO UPDATE SET
            name = excluded.name,
            muscle_group = excluded.muscle_group,
            source = 'base'
        `,
        exercise.baseKey,
        exercise.name,
        exercise.muscleGroup,
      );
    }

    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

// This keeps editable ProfileScreen values available even on upgraded installs.
async function seedProfileSettings() {
  const db = await getDatabase();

  await db.execAsync('BEGIN TRANSACTION;');

  try {
    for (const setting of PROFILE_SETTING_SEEDS) {
      await db.runAsync(
        'INSERT OR IGNORE INTO profile_settings (key, value) VALUES (?, ?)',
        setting.key,
        setting.value,
      );
    }

    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

// This migration deletes exercises from muscle groups that are no longer supported by the app.
async function deleteRemovedMuscleGroupExercises() {
  const db = await getDatabase();
  const removedGroups = ['oblique', 'obliques', 'abductor', 'abductors'];
  const placeholders = removedGroups.map(() => '?').join(', ');
  const exerciseRows = await db.getAllAsync<{ id: number }>(
    `
      SELECT id
      FROM exercises
      WHERE LOWER(TRIM(muscle_group)) IN (${placeholders})
    `,
    ...removedGroups,
  );

  if (exerciseRows.length === 0) {
    return;
  }

  const exerciseIds = exerciseRows.map((exercise) => exercise.id);
  const exercisePlaceholders = exerciseIds.map(() => '?').join(', ');

  await db.execAsync('BEGIN TRANSACTION;');

  try {
    await db.runAsync(
      `
        DELETE FROM sets
        WHERE workout_exercise_id IN (
          SELECT id
          FROM workout_exercises
          WHERE exercise_id IN (${exercisePlaceholders})
        )
      `,
      ...exerciseIds,
    );
    await db.runAsync(
      `
        DELETE FROM workout_exercises
        WHERE exercise_id IN (${exercisePlaceholders})
      `,
      ...exerciseIds,
    );
    await db.runAsync(
      `
        DELETE FROM exercises
        WHERE id IN (${exercisePlaceholders})
      `,
      ...exerciseIds,
    );
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

// This backfills previous hit for each workout-card exercise row.
async function rebuildWorkoutExercisePreviousHitStats() {
  const db = await getDatabase();

  await db.execAsync(`
    UPDATE workout_exercises
    SET
      previous_weight = (
        SELECT sets.weight
        FROM sets
        WHERE sets.workout_exercise_id = workout_exercises.id
        ORDER BY sets.id DESC
        LIMIT 1
      ),
      previous_reps = (
        SELECT sets.reps
        FROM sets
        WHERE sets.workout_exercise_id = workout_exercises.id
        ORDER BY sets.id DESC
        LIMIT 1
      );
  `);
}

// This backfills app-wide max volume for each exercise from all saved workout history.
async function rebuildExerciseMaxVolumeStats() {
  const db = await getDatabase();

  await db.execAsync(`
    UPDATE exercises
    SET max_volume = COALESCE((
      SELECT MAX(sets.weight * sets.reps)
      FROM workout_exercises
      JOIN sets ON sets.workout_exercise_id = workout_exercises.id
      WHERE workout_exercises.exercise_id = exercises.id
    ), 0);
  `);
}
