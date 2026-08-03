import { getDatabase } from './database';
import type {
  CreateExerciseInput,
  CreateWorkoutTemplateInput,
  Exercise,
  Folder,
  FolderWithTemplates,
  MuscleGroup,
  SaveWorkoutExercise,
  WorkoutDashboardData,
  WorkoutDetail,
  WorkoutDetailExercise,
  WorkoutSet,
  WorkoutSummary,
  WorkoutTemplate,
} from './types';

// This result type normalizes SQLite insert responses used by create and save functions below.
type InsertResult = {
  lastInsertRowId: number;
};

// This row type describes the joined performed-workout query that getWorkout maps for HistoryScreen.
type WorkoutRow = {
  workoutId: number;
  timestamp: string;
  workoutExerciseId: number | null;
  exerciseId: number | null;
  exerciseName: string | null;
  setId: number | null;
  weight: number | null;
  reps: number | null;
};

// This row type converts SQLite folder column names into the Folder shape from types.ts.
type FolderRow = {
  id: number;
  name: string;
  sortOrder: number;
};

// This row type carries template exercise names from SQLite into WorkoutScreen preview text.
type TemplateExerciseRow = {
  workoutId: number;
  exerciseName: string | null;
};

// This row type carries template card metadata from SQLite into WorkoutDashboardData.
type TemplateRow = {
  id: number;
  name: string | null;
  folderId: number | null;
};

// This row type reads the source template metadata needed to duplicate a workout template.
type TemplateSourceRow = {
  id: number;
  name: string | null;
  folderId: number | null;
};

// This row type preserves exercise ordering when duplicating a workout template.
type TemplateExerciseIdRow = {
  exerciseId: number;
};

// This function returns all exercises for ExercisesScreen lists and WorkoutScreen template creation.
export async function getExercises() {
  const db = await getDatabase();

  return db.getAllAsync<Exercise>(
    `
      SELECT
        id,
        base_key AS baseKey,
        name,
        muscle_group AS muscleGroup,
        source,
        max_volume AS maxVolume
      FROM exercises
      ORDER BY LOWER(name), id DESC
    `,
  );
}

// This function returns exercises assigned to one clickable muscle-group label in ExercisesScreen.
export async function getExercisesByMuscleGroup(muscleGroup: MuscleGroup) {
  const db = await getDatabase();

  return db.getAllAsync<Exercise>(
    `
      SELECT
        id,
        base_key AS baseKey,
        name,
        muscle_group AS muscleGroup,
        source,
        max_volume AS maxVolume
      FROM exercises
      WHERE muscle_group = ?
      ORDER BY LOWER(name), id DESC
    `,
    muscleGroup,
  );
}

// This function stores custom user-created exercises in the same local catalog as base exercises.
export async function createCustomExercise(input: CreateExerciseInput): Promise<Exercise> {
  const db = await getDatabase();
  const name = input.name.trim();

  const result = (await db.runAsync(
    `
      INSERT INTO exercises (name, muscle_group, source)
      VALUES (?, ?, 'user')
    `,
    name,
    input.muscleGroup,
  )) as InsertResult;

  return {
    id: result.lastInsertRowId,
    baseKey: null,
    name,
    muscleGroup: input.muscleGroup,
    source: 'user',
    maxVolume: 0,
  };
}

// This function deletes an exercise from the exercises table when ExercisesScreen requests it.
export async function deleteExercise(id: number) {
  const db = await getDatabase();

  await db.runAsync('DELETE FROM exercises WHERE id = ?', id);
}

// This function creates a top-level template folder for the Workout dashboard.
export async function createFolder(name: string): Promise<Folder> {
  const db = await getDatabase();
  const trimmedName = name.trim();
  const sortOrderRow = await db.getFirstAsync<{ nextSortOrder: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextSortOrder FROM folders',
  );
  const sortOrder = sortOrderRow?.nextSortOrder ?? 0;

  const result = (await db.runAsync(
    'INSERT INTO folders (name, sort_order) VALUES (?, ?)',
    trimmedName,
    sortOrder,
  )) as InsertResult;

  return {
    id: result.lastInsertRowId,
    name: trimmedName,
    sortOrder,
  };
}

// This function deletes a folder and all template data assigned to it after WorkoutScreen confirms the action.
export async function deleteFolder(id: number) {
  const db = await getDatabase();

  await db.execAsync('BEGIN TRANSACTION;');

  try {
    await db.runAsync(
      `
        DELETE FROM sets
        WHERE workout_exercise_id IN (
          SELECT workout_exercises.id
          FROM workout_exercises
          JOIN workouts ON workouts.id = workout_exercises.workout_id
          WHERE workouts.folder_id = ? AND workouts.is_template = 1
        )
      `,
      id,
    );
    await db.runAsync(
      `
        DELETE FROM workout_exercises
        WHERE workout_id IN (
          SELECT id FROM workouts WHERE folder_id = ? AND is_template = 1
        )
      `,
      id,
    );
    await db.runAsync('DELETE FROM workouts WHERE folder_id = ? AND is_template = 1', id);
    await db.runAsync('DELETE FROM folders WHERE id = ?', id);
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

// This function renames a top-level template folder from the Workout dashboard menu.
export async function renameFolder(id: number, name: string): Promise<Folder> {
  const db = await getDatabase();
  const trimmedName = name.trim();

  await db.runAsync('UPDATE folders SET name = ? WHERE id = ?', trimmedName, id);

  const folder = await db.getFirstAsync<FolderRow>(
    'SELECT id, name, sort_order AS sortOrder FROM folders WHERE id = ?',
    id,
  );

  if (!folder) {
    throw new Error('Template not found.');
  }

  return folder;
}

// This function builds the folder, template, and unassigned-workout payload consumed by WorkoutScreen.
export async function getWorkoutDashboardData(): Promise<WorkoutDashboardData> {
  const db = await getDatabase();
  const folders = await db.getAllAsync<FolderRow>(`
    SELECT id, name, sort_order AS sortOrder
    FROM folders
    ORDER BY sort_order ASC, id ASC
  `);
  const templates = await db.getAllAsync<TemplateRow>(`
    SELECT id, name, folder_id AS folderId
    FROM workouts
    WHERE is_template = 1
    ORDER BY id DESC
  `);
  const templateExercises = await db.getAllAsync<TemplateExerciseRow>(`
    SELECT
      workout_exercises.workout_id AS workoutId,
      exercises.name AS exerciseName
    FROM workout_exercises
    JOIN workouts
      ON workouts.id = workout_exercises.workout_id
    LEFT JOIN exercises
      ON exercises.id = workout_exercises.exercise_id
    WHERE workouts.is_template = 1
    ORDER BY workout_exercises.id ASC
  `);
  const exerciseNamesByWorkoutId = new Map<number, string[]>();

  // This loop groups template exercise names so WorkoutScreen cards can show concise previews.
  for (const exercise of templateExercises) {
    const exerciseNames = exerciseNamesByWorkoutId.get(exercise.workoutId) ?? [];
    exerciseNames.push(exercise.exerciseName ?? 'Deleted exercise');
    exerciseNamesByWorkoutId.set(exercise.workoutId, exerciseNames);
  }

  const templatesByFolderId = new Map<number | null, WorkoutTemplate[]>();

  // This loop groups template cards by folderId for folder sections and the My Workouts section.
  for (const template of templates) {
    const workoutTemplate: WorkoutTemplate = {
      id: template.id,
      name: template.name ?? `Workout ${template.id}`,
      folderId: template.folderId,
      exerciseNames: exerciseNamesByWorkoutId.get(template.id) ?? [],
      lastPerformed: null,
    };
    const folderTemplates = templatesByFolderId.get(template.folderId) ?? [];
    folderTemplates.push(workoutTemplate);
    templatesByFolderId.set(template.folderId, folderTemplates);
  }

  // This mapping attaches workout counts and child templates to the folders displayed in WorkoutScreen.
  const foldersWithTemplates: FolderWithTemplates[] = folders.map((folder) => {
    const workouts = templatesByFolderId.get(folder.id) ?? [];

    return {
      ...folder,
      workoutCount: workouts.length,
      workouts,
    };
  });

  return {
    folders: foldersWithTemplates,
    unassignedWorkouts: templatesByFolderId.get(null) ?? [],
  };
}

// This function inserts a workout template and its ordered exercise list from WorkoutScreen.
export async function createWorkoutTemplate(input: CreateWorkoutTemplateInput) {
  const db = await getDatabase();
  const trimmedName = input.name.trim();
  const timestamp = new Date().toISOString();

  await db.execAsync('BEGIN TRANSACTION;');

  try {
    const workoutResult = (await db.runAsync(
      'INSERT INTO workouts (timestamp, name, folder_id, is_template) VALUES (?, ?, ?, 1)',
      timestamp,
      trimmedName,
      input.folderId,
    )) as InsertResult;

    for (const exerciseId of input.exerciseIds) {
      await db.runAsync(
        'INSERT INTO workout_exercises (workout_id, exercise_id) VALUES (?, ?)',
        workoutResult.lastInsertRowId,
        exerciseId,
      );
    }

    await db.execAsync('COMMIT;');
    return workoutResult.lastInsertRowId;
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

// This function copies a template and its exercise order for the WorkoutScreen duplicate menu action.
export async function duplicateWorkoutTemplate(id: number) {
  const db = await getDatabase();
  const source = await db.getFirstAsync<TemplateSourceRow>(
    'SELECT id, name, folder_id AS folderId FROM workouts WHERE id = ? AND is_template = 1',
    id,
  );

  if (!source) {
    throw new Error('Workout template not found.');
  }

  const exercises = await db.getAllAsync<TemplateExerciseIdRow>(
    `
      SELECT exercise_id AS exerciseId
      FROM workout_exercises
      WHERE workout_id = ?
      ORDER BY id ASC
    `,
    id,
  );

  return createWorkoutTemplate({
    exerciseIds: exercises.map((exercise) => exercise.exerciseId),
    folderId: source.folderId,
    name: source.name ?? `Workout ${source.id}`,
  });
}

// This function removes only template-owned data so completed workout rows remain available to HistoryScreen.
export async function deleteWorkoutTemplate(id: number) {
  const db = await getDatabase();

  await db.execAsync('BEGIN TRANSACTION;');

  try {
    await db.runAsync(
      `
        DELETE FROM sets
        WHERE workout_exercise_id IN (
          SELECT workout_exercises.id
          FROM workout_exercises
          JOIN workouts ON workouts.id = workout_exercises.workout_id
          WHERE workouts.id = ? AND workouts.is_template = 1
        )
      `,
      id,
    );
    await db.runAsync(
      `
        DELETE FROM workout_exercises
        WHERE workout_id IN (
          SELECT id FROM workouts WHERE id = ? AND is_template = 1
        )
      `,
      id,
    );
    await db.runAsync('DELETE FROM workouts WHERE id = ? AND is_template = 1', id);
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

// This function persists drag-and-drop assignment to a folder or back to My Workouts from WorkoutScreen.
export async function moveWorkoutTemplateToFolder(id: number, folderId: number | null) {
  const db = await getDatabase();

  await db.runAsync(
    'UPDATE workouts SET folder_id = ? WHERE id = ? AND is_template = 1',
    folderId,
    id,
  );
}

// This legacy V1 function stores a completed performed workout that HistoryScreen later reads.
export async function saveWorkout(exercises: SaveWorkoutExercise[]) {
  const db = await getDatabase();
  const timestamp = new Date().toISOString();

  await db.execAsync('BEGIN TRANSACTION;');

  try {
    const workoutResult = (await db.runAsync(
      'INSERT INTO workouts (timestamp) VALUES (?)',
      timestamp,
    )) as InsertResult;

    const workoutId = workoutResult.lastInsertRowId;

    for (const exercise of exercises) {
      const workoutExerciseResult = (await db.runAsync(
        'INSERT INTO workout_exercises (workout_id, exercise_id) VALUES (?, ?)',
        workoutId,
        exercise.exerciseId,
      )) as InsertResult;

      for (const set of exercise.sets) {
        await db.runAsync(
          'INSERT INTO sets (workout_exercise_id, weight, reps) VALUES (?, ?, ?)',
          workoutExerciseResult.lastInsertRowId,
          set.weight,
          set.reps,
        );
        await updateWorkoutExercisePerformanceStats(
          workoutExerciseResult.lastInsertRowId,
          exercise.exerciseId,
          set.weight,
          set.reps,
        );
      }
    }

    await db.execAsync('COMMIT;');
    return workoutId;
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

// This function returns performed-workout summaries for the History tab while excluding templates.
export async function getWorkoutSummaries() {
  const db = await getDatabase();

  return db.getAllAsync<WorkoutSummary>(`
    SELECT
      workouts.id,
      workouts.timestamp,
      COUNT(DISTINCT workout_exercises.id) AS exerciseCount,
      COUNT(sets.id) AS setCount
    FROM workouts
    LEFT JOIN workout_exercises
      ON workout_exercises.workout_id = workouts.id
    LEFT JOIN sets
      ON sets.workout_exercise_id = workout_exercises.id
    WHERE workouts.is_template = 0
    GROUP BY workouts.id
    ORDER BY workouts.timestamp DESC
  `);
}

// This function returns a performed workout detail record for the History tab while excluding templates.
export async function getWorkout(id: number): Promise<WorkoutDetail | null> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WorkoutRow>(
    `
      SELECT
        workouts.id AS workoutId,
        workouts.timestamp,
        workout_exercises.id AS workoutExerciseId,
        workout_exercises.exercise_id AS exerciseId,
        exercises.name AS exerciseName,
        sets.id AS setId,
        sets.weight,
        sets.reps
      FROM workouts
      LEFT JOIN workout_exercises
        ON workout_exercises.workout_id = workouts.id
      LEFT JOIN exercises
        ON exercises.id = workout_exercises.exercise_id
      LEFT JOIN sets
        ON sets.workout_exercise_id = workout_exercises.id
      WHERE workouts.id = ?
        AND workouts.is_template = 0
      ORDER BY workout_exercises.id ASC, sets.id ASC
    `,
    id,
  );

  if (rows.length === 0) {
    return null;
  }

  const workout: WorkoutDetail = {
    id: rows[0].workoutId,
    timestamp: rows[0].timestamp,
    exercises: [],
  };
  const exerciseMap = new Map<number, WorkoutDetailExercise>();

  // This loop folds joined rows into nested exercises and sets for HistoryScreen rendering.
  for (const row of rows) {
    if (row.workoutExerciseId === null || row.exerciseId === null) {
      continue;
    }

    let workoutExercise = exerciseMap.get(row.workoutExerciseId);

    if (!workoutExercise) {
      workoutExercise = {
        id: row.workoutExerciseId,
        exerciseId: row.exerciseId,
        exerciseName: row.exerciseName ?? `Deleted exercise #${row.exerciseId}`,
        sets: [],
      };
      exerciseMap.set(row.workoutExerciseId, workoutExercise);
      workout.exercises.push(workoutExercise);
    }

    if (row.setId !== null && row.weight !== null && row.reps !== null) {
      const set: WorkoutSet = {
        id: row.setId,
        weight: row.weight,
        reps: row.reps,
      };
      workoutExercise.sets.push(set);
    }
  }

  return workout;
}

// This keeps previous hit per workout-card row and max volume app-wide per exercise.
async function updateWorkoutExercisePerformanceStats(
  workoutExerciseId: number,
  exerciseId: number,
  weight: number,
  reps: number,
) {
  const db = await getDatabase();
  const volume = weight * reps;

  await db.runAsync(
    `
      UPDATE workout_exercises
      SET
        previous_weight = ?,
        previous_reps = ?
      WHERE id = ?
    `,
    weight,
    reps,
    workoutExerciseId,
  );
  await db.runAsync(
    `
      UPDATE exercises
      SET
        max_volume = MAX(max_volume, ?)
      WHERE id = ?
    `,
    volume,
    exerciseId,
  );
}
