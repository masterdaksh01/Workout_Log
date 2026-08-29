// This list defines every muscle group supported by the visual exercise browser and database field.
export const MUSCLE_GROUPS = [
  'Shoulders',
  'Chest',
  'Biceps',
  'Abs',
  'Forearms',
  'Quads',
  'Adductors',
  'Cardio',
  'Neck',
  'Triceps',
  'Traps',
  'Lats',
  'Lower Back',
  'Glutes',
  'Hamstrings',
  'Calves',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export type ExerciseSource = 'base' | 'user';

// This type mirrors rows from the exercises table used by ExercisesScreen and WorkoutScreen.
export type Exercise = {
  id: number;
  baseKey: string | null;
  name: string;
  muscleGroup: MuscleGroup | null;
  note: string;
  source: ExerciseSource;
  maxVolume: number;
};

export type CreateExerciseInput = {
  name: string;
  muscleGroup: MuscleGroup;
};

// This type stores editable profile/settings values shown on ProfileScreen.
export type ProfileSettings = {
  name: string;
  age: string;
  weight: string;
  bodyFatPercentage: string;
  calorieIntake: string;
  theme: string;
  timerSound: string;
  soundEffectsEnabled: boolean;
};

export type ProfileMetricKey = 'weight' | 'bodyFatPercentage' | 'calorieIntake';

export type ProfileMetricEntry = {
  id: string;
  metric: ProfileMetricKey;
  timestamp: string;
  value: string;
};

// This type represents one performed set returned in HistoryScreen workout details.
export type WorkoutSet = {
  id: number;
  weight: number;
  reps: number;
  duration: string | null;
};

// This type groups a performed exercise with its sets for the HistoryScreen detail view.
export type WorkoutDetailExercise = {
  id: number;
  exerciseId: number;
  exerciseName: string;
  muscleGroup: MuscleGroup | null;
  sets: WorkoutSet[];
};

// This type is the full performed workout shape returned by repository.ts to HistoryScreen.
export type WorkoutDetail = {
  id: number;
  timestamp: string;
  exercises: WorkoutDetailExercise[];
};

// This type is the compact performed workout row shown in the HistoryScreen list.
export type WorkoutSummary = {
  id: number;
  timestamp: string;
  exerciseCount: number;
  setCount: number;
};

// This input type is used by the legacy V1 workout saver in NewWorkoutScreen and repository.ts.
export type SaveWorkoutExercise = {
  exerciseId: number;
  sets: Array<{
    weight: number;
    reps: number;
    duration?: string;
  }>;
};

// This type mirrors rows from the folders table displayed by WorkoutScreen.
export type Folder = {
  id: number;
  name: string;
  sortOrder: number;
};

// This type represents one workout template card built by repository.ts for WorkoutScreen.
export type WorkoutTemplate = {
  id: number;
  name: string;
  folderId: number | null;
  exerciseNames: string[];
  exercises: WorkoutTemplateExercise[];
  lastPerformed: string | null;
};

export type WorkoutTemplateExercise = {
  id: number;
  name: string;
  muscleGroup: MuscleGroup | null;
  note: string;
  previousWeight: number | null;
  previousReps: number | null;
};

// This type combines a folder with the template cards nested beneath it in WorkoutScreen.
export type FolderWithTemplates = Folder & {
  workoutCount: number;
  workouts: WorkoutTemplate[];
};

// This type is the dashboard payload returned by repository.ts to the Workout tab.
export type WorkoutDashboardData = {
  folders: FolderWithTemplates[];
  unassignedWorkouts: WorkoutTemplate[];
};

// This input type carries template form data from WorkoutScreen into repository.ts.
export type CreateWorkoutTemplateInput = {
  name: string;
  folderId: number | null;
  exerciseIds: number[];
};
