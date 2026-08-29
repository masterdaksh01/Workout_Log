import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import { BlurView } from 'expo-blur';
import type { ComponentRef } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import {
  createFolder,
  createWorkoutTemplate,
  deleteFolder,
  deleteWorkoutTemplate,
  duplicateWorkoutTemplate,
  getExercises,
  getWorkoutDashboardData,
  moveWorkoutTemplateToFolder,
  renameFolder,
  renameWorkoutTemplate,
  saveExerciseNote,
  saveWorkout,
} from '../data/repository';
import type {
  CreateWorkoutTemplateInput,
  Exercise,
  FolderWithTemplates,
  MuscleGroup,
  SaveWorkoutExercise,
  WorkoutDashboardData,
  WorkoutTemplate,
  WorkoutTemplateExercise,
} from '../data/types';
import { MUSCLE_GROUPS } from '../data/types';
import { ExerciseInfoScreen, ExercisesScreen } from './ExercisesScreen';
import { sharedStyles } from './sharedStyles';

// These local types describe screen-only refs and create-target state used by the Workout dashboard.
type FolderViewRef = ComponentRef<typeof View>;
type WorkoutTopTab = 'routines' | 'exercises';
type ExercisePickerFilter = MuscleGroup | 'All';
type CreateTarget = {
  folderId: number | null;
};
type ActiveExercisePickerTarget =
  | { mode: 'add' }
  | { mode: 'replace'; exerciseKey: string };
type DeleteConfirmation = {
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
  confirmLabel?: string;
  destructive?: boolean;
};
type RenameTarget = {
  kind: 'folder' | 'workout';
  id: number;
  name: string;
};
type ActiveRestTimer = {
  exerciseKey: string;
  setId: string;
  duration: number;
  remaining: number;
};
type StartedWorkoutSet = {
  id: string;
  setNumber: number;
  previousWeight: number | null;
  previousReps: number | null;
  duration: string;
  weight: string;
  reps: string;
  restSeconds: number;
  completed: boolean;
};
type StartedWorkoutExercise = {
  key: string;
  exerciseId: number;
  name: string;
  muscleGroup: MuscleGroup | null;
  note: string;
  noteOpen: boolean;
  sets: StartedWorkoutSet[];
};
type StartedWorkout = {
  id: number;
  name: string;
  exercises: StartedWorkoutExercise[];
};
// This empty value lets WorkoutScreen render before repository.ts returns dashboard data.
const emptyDashboardData: WorkoutDashboardData = {
  folders: [],
  unassignedWorkouts: [],
};

const folderIcon = require('../assets/folder-icon.png');
const defaultRestSeconds = 90;
const firstSetRestSeconds = 75;
const timerSoundModules = [
  require('../assets/File1.mpeg'),
  require('../assets/File2.mpeg'),
  require('../assets/File3.mpeg'),
] as const;
let lastSetCompletionSoundIndex: number | null = null;
const setSwipeDeleteDistance = 90;

// This formatter prepares the future last-performed value shown on workout template cards.
function formatLastPerformed(timestamp: string | null) {
  if (!timestamp) {
    return '';
  }

  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// This helper creates a short exercise preview from template exercise names returned by repository.ts.
function getExercisePreview(exerciseNames: string[]) {
  const preview = exerciseNames.join(', ');

  if (preview.length <= 54) {
    return preview;
  }

  return `${preview.slice(0, 51)}...`;
}

function formatWorkoutDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatCardioDurationInput(value: string) {
  const totalSeconds = parseWorkoutDurationInput(value);

  return totalSeconds === null ? null : formatWorkoutDuration(totalSeconds);
}

function parseWorkoutDurationInput(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.includes(':')) {
    const [minutesValue, secondsValue = '0'] = trimmedValue.split(':');
    const minutes = Number.parseInt(minutesValue, 10);
    const seconds = Number.parseInt(secondsValue, 10);

    if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds < 0 || seconds > 59) {
      return null;
    }

    return Math.max(minutes * 60 + seconds, 0);
  }

  const seconds = Number.parseInt(trimmedValue, 10);

  return Number.isInteger(seconds) && seconds >= 0 ? seconds : null;
}

function formatPreviousSet(weight: number | null, reps: number | null) {
  if (weight === null || reps === null) {
    return '                  -';
  }

  return `${weight} kg x ${reps}`;
}

function formatPreviousCardioSet(reps: number | null) {
  if (reps === null) {
    return '                  -';
  }

  return formatWorkoutDuration(reps);
}

function createStartedWorkout(workout: WorkoutTemplate): StartedWorkout {
  return {
    id: workout.id,
    name: workout.name,
    exercises: workout.exercises.map((exercise, exerciseIndex) => {
      const previousWeight = exercise.previousWeight;
      const previousReps = exercise.previousReps;

      return {
        exerciseId: exercise.id,
        key: `${exercise.id}-${exerciseIndex}`,
        muscleGroup: exercise.muscleGroup,
        name: exercise.name,
        note: exercise.note,
        noteOpen: exercise.note.trim().length > 0,
        sets: [1, 2].map((setNumber) => ({
          completed: false,
          duration: exercise.muscleGroup === 'Cardio' && previousReps !== null
            ? formatWorkoutDuration(previousReps)
            : '',
          id: `${exercise.id}-${exerciseIndex}-${setNumber}`,
          previousReps,
          previousWeight,
          reps: previousReps !== null ? String(previousReps) : '',
          restSeconds: setNumber === 1 ? firstSetRestSeconds : defaultRestSeconds,
          setNumber,
          weight: previousWeight !== null ? String(previousWeight) : '',
        })),
      };
    }),
  };
}

function createStartedWorkoutExercise(
  exercise: Pick<Exercise, 'id' | 'muscleGroup' | 'name' | 'note'>,
  exerciseIndex: number,
): StartedWorkoutExercise {
  return {
    exerciseId: exercise.id,
    key: `${exercise.id}-active-${exerciseIndex}-${Date.now()}`,
    muscleGroup: exercise.muscleGroup,
    name: exercise.name,
    note: exercise.note,
    noteOpen: exercise.note.trim().length > 0,
    sets: [1, 2].map((setNumber) => ({
      completed: false,
      duration: '',
      id: `${exercise.id}-active-${exerciseIndex}-${setNumber}-${Date.now()}`,
      previousReps: null,
      previousWeight: null,
      reps: '',
      restSeconds: setNumber === 1 ? firstSetRestSeconds : defaultRestSeconds,
      setNumber,
      weight: '',
    })),
  };
}

function parseSetNumber(value: string) {
  const parsedValue = Number.parseFloat(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function getRandomSetCompletionSoundModule() {
  const availableIndexes = timerSoundModules
    .map((_, index) => index)
    .filter((index) => index !== lastSetCompletionSoundIndex);
  const randomIndex =
    availableIndexes[Math.floor(Math.random() * availableIndexes.length)] ?? 0;

  lastSetCompletionSoundIndex = randomIndex;
  return timerSoundModules[randomIndex] ?? null;
}

function playSetCompletionSound() {
  const soundModule = getRandomSetCompletionSoundModule();

  if (!soundModule) {
    return;
  }

  try {
    const player = createAudioPlayer(soundModule);

    player.play();
    setTimeout(() => {
      try {
        player.remove();
      } catch {
        // Playback cleanup should never interrupt the workout UI.
      }
    }, 5000);
  } catch {
    // Missing or invalid local audio should fail silently for set completion.
  }
}

// This screen is the V2 Workout tab and coordinates folder, template, menu, and drag-drop state.
export function WorkoutScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const [activeTopTab, setActiveTopTab] = useState<WorkoutTopTab>('routines');
  const [dashboardData, setDashboardData] = useState<WorkoutDashboardData>(emptyDashboardData);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<number>>(new Set());
  const [folderPromptVisible, setFolderPromptVisible] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameName, setRenameName] = useState('');
  const [folderMenuId, setFolderMenuId] = useState<number | null>(null);
  const [menuTemplateId, setMenuTemplateId] = useState<number | null>(null);
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<number | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<WorkoutTemplateExercise | null>(null);
  const [exercisesNestedScreenOpen, setExercisesNestedScreenOpen] = useState(false);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [startedWorkout, setStartedWorkout] = useState<StartedWorkout | null>(null);
  const [activeExercisePickerTarget, setActiveExercisePickerTarget] =
    useState<ActiveExercisePickerTarget | null>(null);
  const [startedExerciseMenuKey, setStartedExerciseMenuKey] = useState<string | null>(null);
  const [isStartedWorkoutMinimized, setIsStartedWorkoutMinimized] = useState(false);
  const [workoutElapsedSeconds, setWorkoutElapsedSeconds] = useState(0);
  const [activeRestTimer, setActiveRestTimer] = useState<ActiveRestTimer | null>(null);
  const folderRefs = useRef<Record<number, FolderViewRef | null>>({});
  const myWorkoutsHeadingRef = useRef<FolderViewRef | null>(null);

  // This loader fetches folders, templates, and unassigned workouts from repository.ts.
  const loadDashboard = useCallback(async () => {
    setDashboardData(await getWorkoutDashboardData());
  }, []);

  const allWorkouts = useMemo(
    () => [
      ...dashboardData.folders.flatMap((folder) => folder.workouts),
      ...dashboardData.unassignedWorkouts,
    ],
    [dashboardData.folders, dashboardData.unassignedWorkouts],
  );
  const selectedWorkout = useMemo(
    () => allWorkouts.find((workout) => workout.id === selectedWorkoutId) ?? null,
    [allWorkouts, selectedWorkoutId],
  );
  const nestedWorkoutScreenOpen = Boolean(
    selectedWorkoutId ||
    selectedExercise ||
    (startedWorkout && !isStartedWorkoutMinimized) ||
    exercisesNestedScreenOpen,
  );

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: nestedWorkoutScreenOpen
        ? { display: 'none' }
        : {
          backgroundColor: '#1c1c1e',
          borderTopColor: '#2c2c2e',
        },
    });

    return () => {
      navigation.setOptions({
        tabBarStyle: {
          backgroundColor: '#1c1c1e',
          borderTopColor: '#2c2c2e',
        },
      });
    };
  }, [navigation, nestedWorkoutScreenOpen]);

  useEffect(() => {
    if (!startedWorkout) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setWorkoutElapsedSeconds((current) => current + 1);
      setActiveRestTimer((current) => {
        if (!current || current.remaining <= 0) {
          return current;
        }

        return {
          ...current,
          remaining: Math.max(current.remaining - 1, 0),
        };
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [startedWorkout]);

  useEffect(() => {
    if (selectedWorkoutId !== null && !selectedWorkout) {
      setSelectedWorkoutId(null);
      setDetailMenuOpen(false);
    }
  }, [selectedWorkout, selectedWorkoutId]);

  useEffect(() => {
    const params = route.params as { initialTopTab?: WorkoutTopTab } | undefined;

    if (params?.initialTopTab) {
      setActiveTopTab(params.initialTopTab);
      navigation.setParams({ initialTopTab: undefined } as never);
    }
  }, [navigation, route.params]);

  // This focus effect refreshes the dashboard when the centered Workout tab becomes active.
  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard]),
  );

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (deleteConfirmation) {
          setDeleteConfirmation(null);
          return true;
        }

        if (renameTarget) {
          setRenameTarget(null);
          setRenameName('');
          return true;
        }

        if (folderPromptVisible) {
          setFolderName('');
          setFolderPromptVisible(false);
          return true;
        }

        if (detailMenuOpen) {
          setDetailMenuOpen(false);
          return true;
        }

        if (startedExerciseMenuKey) {
          setStartedExerciseMenuKey(null);
          return true;
        }

        if (activeExercisePickerTarget) {
          setActiveExercisePickerTarget(null);
          return true;
        }

        if (startedWorkout) {
          setDeleteConfirmation({
            confirmLabel: 'Discard',
            message: 'Cancel this workout? Completed sets will not be saved.',
            onConfirm: async () => {
              setStartedWorkout(null);
              setIsStartedWorkoutMinimized(false);
              setWorkoutElapsedSeconds(0);
              setActiveRestTimer(null);
              setActiveExercisePickerTarget(null);
            },
            title: 'Cancel workout',
          });
          return true;
        }

        if (selectedExercise) {
          setSelectedExercise(null);
          return true;
        }

        if (selectedWorkoutId) {
          setSelectedWorkoutId(null);
          return true;
        }

        if (createTarget) {
          setCreateTarget(null);
          return true;
        }

        if (activeTopTab === 'exercises') {
          setActiveTopTab('routines');
          return true;
        }

        return false;
      });

      return () => subscription.remove();
    }, [
      activeTopTab,
      createTarget,
      deleteConfirmation,
      detailMenuOpen,
      folderPromptVisible,
      renameTarget,
      selectedExercise,
      selectedWorkoutId,
      activeExercisePickerTarget,
      startedWorkout,
      startedExerciseMenuKey,
    ]),
  );

  // This callback keeps a map of folder view refs so drop coordinates can be matched to folders.
  const setFolderRef = useCallback((folderId: number, ref: FolderViewRef | null) => {
    if (ref) {
      folderRefs.current[folderId] = ref;
      return;
    }

    delete folderRefs.current[folderId];
  }, []);

  // This helper measures folders and treats everything below My Workouts as its drop area.
  const findDropFolderId = useCallback((screenY: number) => {
    return new Promise<number | null | undefined>((resolve) => {
      const entries: Array<{ folderId: number | null; ref: FolderViewRef }> = Object.entries(
        folderRefs.current,
      ).flatMap(([folderId, ref]) => (ref ? [{ folderId: Number(folderId), ref }] : []));

      if (entries.length === 0 && !myWorkoutsHeadingRef.current) {
        resolve(undefined);
        return;
      }

      let pending = entries.length + (myWorkoutsHeadingRef.current ? 1 : 0);
      let matchedFolderId: number | null | undefined;

      const resolveWhenDone = () => {
        pending -= 1;

        if (pending === 0) {
          resolve(matchedFolderId);
        }
      };

      for (const entry of entries) {
        entry.ref.measureInWindow((_x, y, _width, height) => {
          if (screenY >= y && screenY <= y + height) {
            matchedFolderId = entry.folderId;
          }

          resolveWhenDone();
        });
      }

      myWorkoutsHeadingRef.current?.measureInWindow((_x, y, _width, height) => {
        if (screenY >= y + height) {
          matchedFolderId = null;
        }

        resolveWhenDone();
      });
    });
  }, []);

  // This handler persists a dragged template's new folderId through repository.ts and refreshes the dashboard.
  const handleDropTemplate = useCallback(
    async (templateId: number, screenY: number) => {
      const folderId = await findDropFolderId(screenY);

      if (folderId === undefined) {
        return;
      }

      await moveWorkoutTemplateToFolder(templateId, folderId);
      await loadDashboard();
    },
    [findDropFolderId, loadDashboard],
  );

  // This handler keeps folder expanded or collapsed state local to the open WorkoutScreen session.
  const toggleFolder = useCallback((folderId: number) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);

      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  }, []);

  const handleOpenWorkout = useCallback((templateId: number) => {
    setFolderMenuId(null);
    setMenuTemplateId(null);
    setSelectedExercise(null);
    setSelectedWorkoutId(templateId);
    setDetailMenuOpen(false);
  }, []);

  // This handler creates a folder through repository.ts after validating the modal input.
  async function handleCreateFolder() {
    if (!folderName.trim()) {
      Alert.alert('Template name required', 'Enter a template name before creating it.');
      return;
    }

    await createFolder(folderName);
    setFolderName('');
    setFolderPromptVisible(false);
    await loadDashboard();
  }

  async function handleRenameTarget() {
    if (!renameTarget) {
      return;
    }

    if (!renameName.trim()) {
      Alert.alert('Template name required', 'Enter a template name before renaming it.');
      return;
    }

    if (renameTarget.kind === 'folder') {
      await renameFolder(renameTarget.id, renameName);
    } else {
      await renameWorkoutTemplate(renameTarget.id, renameName);
    }

    setRenameTarget(null);
    setRenameName('');
    await loadDashboard();
  }

  // This handler saves a new template through repository.ts and returns to the dashboard.
  async function handleCreateTemplate(input: CreateWorkoutTemplateInput) {
    await createWorkoutTemplate(input);
    setCreateTarget(null);
    await loadDashboard();
  }

  // This handler warns when folder deletion will also remove its templates before refreshing the dashboard.
  const handleDeleteFolder = useCallback(
    (folderId: number, workoutCount: number) => {
      setFolderMenuId(null);
      const message =
        workoutCount > 0 ? 'This deletes all workouts in template' : 'Delete this template?';

      setDeleteConfirmation({
        title: 'Delete template',
        message,
        onConfirm: async () => {
          await deleteFolder(folderId);
          setExpandedFolderIds((current) => {
            const next = new Set(current);
            next.delete(folderId);
            return next;
          });
          await loadDashboard();
        },
      });
    },
    [loadDashboard],
  );

  // This handler duplicates a template through repository.ts from the card menu.
  const handleDuplicateTemplate = useCallback(
    async (templateId: number) => {
      setMenuTemplateId(null);
      await duplicateWorkoutTemplate(templateId);
      await loadDashboard();
    },
    [loadDashboard],
  );

  // This handler confirms deletion before repository.ts removes the template and its related data.
  const handleDeleteTemplate = useCallback(
    (templateId: number) => {
      setMenuTemplateId(null);
      setDetailMenuOpen(false);
      setDeleteConfirmation({
        title: 'Delete workout',
        message: 'Delete this workout template?',
        onConfirm: async () => {
          await deleteWorkoutTemplate(templateId);
          if (selectedWorkoutId === templateId) {
            setSelectedWorkoutId(null);
            setSelectedExercise(null);
          }
          await loadDashboard();
        },
      });
    },
    [loadDashboard, selectedWorkoutId],
  );

  const updateStartedWorkoutSet = useCallback(
    (
      exerciseKey: string,
      setId: string,
      changes: Partial<Pick<StartedWorkoutSet, 'duration' | 'weight' | 'reps' | 'restSeconds' | 'completed'>>,
    ) => {
      setStartedWorkout((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          exercises: current.exercises.map((exercise) =>
            exercise.key === exerciseKey
              ? {
                ...exercise,
                sets: exercise.sets.map((set) =>
                  set.id === setId ? { ...set, ...changes } : set,
                ),
              }
              : exercise,
          ),
        };
      });
    },
    [],
  );

  const handleAddStartedSet = useCallback((exerciseKey: string) => {
    setStartedWorkout((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        exercises: current.exercises.map((exercise) => {
          if (exercise.key !== exerciseKey) {
            return exercise;
          }

          const lastSet = exercise.sets[exercise.sets.length - 1];
          const nextSetNumber = exercise.sets.length + 1;

          return {
            ...exercise,
            sets: [
              ...exercise.sets,
              {
                completed: false,
                duration: lastSet?.duration ?? '',
                id: `${exercise.key}-${nextSetNumber}-${Date.now()}`,
                previousReps: exercise.muscleGroup === 'Cardio' && lastSet?.duration
                  ? parseWorkoutDurationInput(lastSet.duration)
                  : lastSet?.reps
                    ? parseSetNumber(lastSet.reps)
                    : lastSet?.previousReps ?? null,
                previousWeight: lastSet?.weight
                  ? parseSetNumber(lastSet.weight)
                  : lastSet?.previousWeight ?? null,
                reps: lastSet?.reps ?? '',
                restSeconds: defaultRestSeconds,
                setNumber: nextSetNumber,
                weight: lastSet?.weight ?? '',
              },
            ],
          };
        }),
      };
    });
  }, []);

  const handleDeleteStartedSet = useCallback((exerciseKey: string, setId: string) => {
    setStartedWorkout((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        exercises: current.exercises.map((exercise) => {
          if (exercise.key !== exerciseKey) {
            return exercise;
          }

          return {
            ...exercise,
            sets: exercise.sets
              .filter((set) => set.id !== setId)
              .map((set, index) => ({ ...set, setNumber: index + 1 })),
          };
        }),
      };
    });
    setActiveRestTimer((current) =>
      current?.exerciseKey === exerciseKey && current.setId === setId ? null : current,
    );
  }, []);

  const handleRemoveStartedExercise = useCallback((exerciseKey: string) => {
    setStartedExerciseMenuKey(null);
    setStartedWorkout((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        exercises: current.exercises.filter((exercise) => exercise.key !== exerciseKey),
      };
    });
    setActiveRestTimer((current) => (current?.exerciseKey === exerciseKey ? null : current));
  }, []);

  const handleAddStartedExercises = useCallback((exercises: Exercise[]) => {
    setStartedWorkout((current) => {
      if (!current) {
        return current;
      }

      const existingExerciseIds = new Set(current.exercises.map((exercise) => exercise.exerciseId));
      const exercisesToAdd = exercises.filter((exercise) => !existingExerciseIds.has(exercise.id));

      if (exercisesToAdd.length === 0) {
        return current;
      }

      return {
        ...current,
        exercises: [
          ...current.exercises,
          ...exercisesToAdd.map((exercise, index) =>
            createStartedWorkoutExercise(exercise, current.exercises.length + index),
          ),
        ],
      };
    });
    setActiveExercisePickerTarget(null);
  }, []);

  const handleReplaceStartedExercise = useCallback(
    (exerciseKey: string, replacementExercise: Exercise) => {
      setStartedWorkout((current) => {
        if (!current) {
          return current;
        }

        const existingExerciseIds = new Set(
          current.exercises
            .filter((exercise) => exercise.key !== exerciseKey)
            .map((exercise) => exercise.exerciseId),
        );

        if (existingExerciseIds.has(replacementExercise.id)) {
          return current;
        }

        return {
          ...current,
          exercises: current.exercises.map((exercise) => {
            if (exercise.key !== exerciseKey || exercise.exerciseId === replacementExercise.id) {
              return exercise;
            }

            return {
              ...exercise,
              exerciseId: replacementExercise.id,
              muscleGroup: replacementExercise.muscleGroup,
              name: replacementExercise.name,
              note: replacementExercise.note,
              noteOpen: replacementExercise.note.trim().length > 0,
              sets: exercise.sets.map((set) => ({
                ...set,
                duration: replacementExercise.muscleGroup === 'Cardio' ? '' : set.duration,
                previousReps: null,
                previousWeight: null,
              })),
            };
          }),
        };
      });
      setActiveRestTimer((current) =>
        current?.exerciseKey === exerciseKey ? null : current,
      );
      setActiveExercisePickerTarget(null);
    },
    [],
  );

  const updateStartedExerciseNote = useCallback((exerciseKey: string, note: string) => {
    let exerciseIdToSave: number | null = null;

    setStartedWorkout((current) => {
      if (!current) {
        return current;
      }

      const matchingExercise = current.exercises.find((exercise) => exercise.key === exerciseKey);
      exerciseIdToSave = matchingExercise?.exerciseId ?? null;

      return {
        ...current,
        exercises: current.exercises.map((exercise) =>
          exercise.key === exerciseKey ? { ...exercise, note } : exercise,
        ),
      };
    });

    setSelectedExercise((current) =>
      current?.id === exerciseIdToSave ? { ...current, note } : current,
    );

    if (exerciseIdToSave !== null) {
      void saveExerciseNote(exerciseIdToSave, note);
    }
  }, []);

  const openStartedExerciseNote = useCallback((exerciseKey: string) => {
    setStartedExerciseMenuKey(null);
    setStartedWorkout((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        exercises: current.exercises.map((exercise) =>
          exercise.key === exerciseKey ? { ...exercise, noteOpen: true } : exercise,
        ),
      };
    });
  }, []);

  const closeEmptyStartedExerciseNote = useCallback((exerciseKey: string) => {
    setStartedWorkout((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        exercises: current.exercises.map((exercise) =>
          exercise.key === exerciseKey && !exercise.note.trim()
            ? { ...exercise, noteOpen: false }
            : exercise,
        ),
      };
    });
  }, []);

  const handleCompleteStartedSet = useCallback(
    (exerciseKey: string, set: StartedWorkoutSet) => {
      if (set.completed) {
        updateStartedWorkoutSet(exerciseKey, set.id, { completed: false });
        setActiveRestTimer((current) =>
          current?.exerciseKey === exerciseKey && current.setId === set.id ? null : current,
        );
        return;
      }

      updateStartedWorkoutSet(exerciseKey, set.id, { completed: true });
      playSetCompletionSound();
      setActiveRestTimer({
        duration: set.restSeconds,
        exerciseKey,
        remaining: set.restSeconds,
        setId: set.id,
      });
    },
    [updateStartedWorkoutSet],
  );

  const handleConfirmFinishStartedWorkout = useCallback(async () => {
    const workout = startedWorkout;

    if (!workout) {
      return;
    }

    const completedExercises: SaveWorkoutExercise[] = workout.exercises
      .map((exercise) => ({
        exerciseId: exercise.exerciseId,
        sets: exercise.sets
          .filter((set) => set.completed)
          .map((set) => {
            if (exercise.muscleGroup === 'Cardio') {
              const duration = formatCardioDurationInput(set.duration);
              const durationSeconds = duration === null ? 0 : parseWorkoutDurationInput(duration) ?? 0;

              return {
                duration: duration ?? undefined,
                reps: durationSeconds,
                weight: 0,
              };
            }

            return {
              reps: Math.round(parseSetNumber(set.reps)),
              weight: parseSetNumber(set.weight),
            };
          })
          .filter((set) => set.reps > 0 || set.weight > 0),
      }))
      .filter((exercise) => exercise.sets.length > 0);

    if (completedExercises.length > 0) {
      await saveWorkout(completedExercises, {
        durationSeconds: workoutElapsedSeconds,
        name: workout.name,
      });
      await loadDashboard();
    }

    setStartedWorkout(null);
    setIsStartedWorkoutMinimized(false);
    setWorkoutElapsedSeconds(0);
    setActiveRestTimer(null);
    setActiveExercisePickerTarget(null);
    setSelectedWorkoutId(null);
  }, [loadDashboard, startedWorkout, workoutElapsedSeconds]);

  const handleRequestFinishStartedWorkout = useCallback(() => {
    setDeleteConfirmation({
      confirmLabel: 'Finish',
      destructive: false,
      message: 'Finish this workout and save the completed sets?',
      onConfirm: handleConfirmFinishStartedWorkout,
      title: 'Finish workout',
    });
  }, [handleConfirmFinishStartedWorkout]);

  const handleRequestCancelStartedWorkout = useCallback(() => {
    setDeleteConfirmation({
      confirmLabel: 'Discard',
      message: 'Cancel this workout? Completed sets will not be saved.',
      onConfirm: async () => {
        setStartedWorkout(null);
        setIsStartedWorkoutMinimized(false);
        setWorkoutElapsedSeconds(0);
        setActiveRestTimer(null);
        setActiveExercisePickerTarget(null);
      },
      title: 'Cancel workout',
    });
  }, []);

  // This renderer connects each folder row from repository.ts to its expandable folder section component.
  const renderFolder = useCallback(
    ({ item }: { item: FolderWithTemplates }) => (
      <FolderSection
        expanded={expandedFolderIds.has(item.id)}
        folder={item}
        folderMenuOpen={folderMenuId === item.id}
        menuTemplateId={menuTemplateId}
        onDeleteFolder={() => handleDeleteFolder(item.id, item.workoutCount)}
        onDeleteTemplate={handleDeleteTemplate}
        onDropTemplate={handleDropTemplate}
        onDuplicateTemplate={handleDuplicateTemplate}
        onEmptyPress={() => setCreateTarget({ folderId: item.id })}
        onOpenWorkout={handleOpenWorkout}
        onCreateWorkout={() => {
          setFolderMenuId(null);
          setCreateTarget({ folderId: item.id });
        }}
        onRenameFolder={() => {
          setFolderMenuId(null);
          setRenameTarget({ id: item.id, kind: 'folder', name: item.name });
          setRenameName(item.name);
        }}
        onSetFolderRef={setFolderRef}
        onToggleFolder={() => toggleFolder(item.id)}
        image={folderIcon}
        onToggleFolderMenu={() => {
          setMenuTemplateId(null);
          setFolderMenuId((current) => (current === item.id ? null : item.id));
        }}
        onToggleMenu={(templateId) =>
          setMenuTemplateId((current) => {
            setFolderMenuId(null);
            return current === templateId ? null : templateId;
          })
        }
      />
    ),
    [
      expandedFolderIds,
      folderMenuId,
      handleDeleteFolder,
      handleDeleteTemplate,
      handleDropTemplate,
      handleDuplicateTemplate,
      handleOpenWorkout,
      menuTemplateId,
      setFolderRef,
      toggleFolder,
    ],
  );

  // This memoized header renders the Templates heading and its two actions.
  const dashboardHeader = useMemo(
    () => (
      <View>
        <View style={styles.templatesHeader}>
          <Text style={styles.templatesTitle}>Templates</Text>
          <Pressable
            onPress={() => setFolderPromptVisible(true)}
            style={[sharedStyles.button, styles.headerButton]}
          >
            <Text style={sharedStyles.buttonText}>Template</Text>
          </Pressable>
          <Pressable
            onPress={() => setCreateTarget({ folderId: null })}
            style={[sharedStyles.button, styles.headerButton]}
          >
            <Text style={sharedStyles.buttonText}>Workout</Text>
          </Pressable>
        </View>
      </View>
    ),
    [],
  );

  // This memoized footer keeps My Workouts expanded at the bottom without a folder icon or delete menu.
  const dashboardFooter = useMemo(
    () => (
      <View style={[styles.folderSection, styles.myWorkoutsSection]}>
        <View ref={myWorkoutsHeadingRef} style={styles.folderRow}>
          <Text style={styles.folderName}>
            My Workouts{' '}
            <Text style={styles.folderCount}>({dashboardData.unassignedWorkouts.length})</Text>
          </Text>
        </View>
        <WorkoutCardGrid
          menuTemplateId={menuTemplateId}
          onDeleteTemplate={handleDeleteTemplate}
          onDropTemplate={handleDropTemplate}
          onDuplicateTemplate={handleDuplicateTemplate}
          onOpenWorkout={handleOpenWorkout}
          onToggleMenu={(templateId) =>
            setMenuTemplateId((current) => {
              setFolderMenuId(null);
              return current === templateId ? null : templateId;
            })
          }
          workouts={dashboardData.unassignedWorkouts}
        />
      </View>
    ),
    [
      dashboardData.unassignedWorkouts,
      handleDeleteTemplate,
      handleDropTemplate,
      handleDuplicateTemplate,
      handleOpenWorkout,
      menuTemplateId,
    ],
  );

  const modalLayer = (
    <>
      <FolderPromptModal
        folderName={folderName}
        onCancel={() => {
          setFolderName('');
          setFolderPromptVisible(false);
        }}
        onChangeFolderName={setFolderName}
        onCreate={handleCreateFolder}
        visible={folderPromptVisible}
      />
      <RenameTemplateModal
        onCancel={() => {
          setRenameTarget(null);
          setRenameName('');
        }}
        onChangeName={setRenameName}
        onRename={handleRenameTarget}
        templateName={renameName}
        visible={Boolean(renameTarget)}
      />
      <DeleteConfirmationModal
        confirmation={deleteConfirmation}
        onCancel={() => setDeleteConfirmation(null)}
        onConfirm={async () => {
          const confirmation = deleteConfirmation;

          if (!confirmation) {
            return;
          }

          setDeleteConfirmation(null);
          await confirmation.onConfirm();
        }}
      />
    </>
  );

  if (selectedExercise) {
    return (
      <>
        <ExerciseInfoScreen
          exercise={selectedExercise}
          onBack={() => setSelectedExercise(null)}
        />
        {modalLayer}
      </>
    );
  }

  if (startedWorkout && activeExercisePickerTarget) {
    const existingExerciseIds = startedWorkout.exercises.map((exercise) => exercise.exerciseId);
    const targetExercise =
      activeExercisePickerTarget.mode === 'replace'
        ? startedWorkout.exercises.find(
          (exercise) => exercise.key === activeExercisePickerTarget.exerciseKey,
        )
        : null;

    return (
      <>
        <ActiveWorkoutExercisePickerScreen
          existingExerciseIds={existingExerciseIds}
          mode={activeExercisePickerTarget.mode}
          onAddExercises={handleAddStartedExercises}
          onBack={() => setActiveExercisePickerTarget(null)}
          onReplaceExercise={(exercise) => {
            if (activeExercisePickerTarget.mode === 'replace') {
              handleReplaceStartedExercise(activeExercisePickerTarget.exerciseKey, exercise);
            }
          }}
          targetExerciseName={targetExercise?.name}
        />
        {modalLayer}
      </>
    );
  }

  if (startedWorkout && !isStartedWorkoutMinimized) {
    return (
      <>
        <StartedWorkoutScreen
          activeRestTimer={activeRestTimer}
          elapsedSeconds={workoutElapsedSeconds}
          onAddExercise={() => setActiveExercisePickerTarget({ mode: 'add' })}
          onAddSet={handleAddStartedSet}
          onCancel={handleRequestCancelStartedWorkout}
          onChangeSet={updateStartedWorkoutSet}
          onCompleteSet={handleCompleteStartedSet}
          onDeleteSet={handleDeleteStartedSet}
          onFinish={handleRequestFinishStartedWorkout}
          onMinimize={() => setIsStartedWorkoutMinimized(true)}
          onAddNote={openStartedExerciseNote}
          onChangeExerciseNote={updateStartedExerciseNote}
          onCloseEmptyExerciseNote={closeEmptyStartedExerciseNote}
          onOpenExerciseInfo={(exercise) =>
            setSelectedExercise({
              id: exercise.exerciseId,
              muscleGroup: exercise.muscleGroup,
              name: exercise.name,
              note: exercise.note,
              personalBestReps: null,
              personalBestWeight: null,
              previousReps: null,
              previousWeight: null,
            })
          }
          onRemoveExercise={handleRemoveStartedExercise}
          onReplaceExercise={(exerciseKey) => {
            setStartedExerciseMenuKey(null);
            setActiveExercisePickerTarget({ exerciseKey, mode: 'replace' });
          }}
          onToggleExerciseMenu={(exerciseKey) =>
            setStartedExerciseMenuKey((current) =>
              current === exerciseKey ? null : exerciseKey,
            )
          }
          startedExerciseMenuKey={startedExerciseMenuKey}
          workout={startedWorkout}
        />
        {modalLayer}
      </>
    );
  }

  if (selectedWorkout) {
    return (
      <>
        <WorkoutTemplateDetailScreen
          menuOpen={detailMenuOpen}
          onBack={() => {
            setSelectedWorkoutId(null);
            setDetailMenuOpen(false);
          }}
          onDelete={() => handleDeleteTemplate(selectedWorkout.id)}
          onEdit={() => {
            setDetailMenuOpen(false);
            Alert.alert('Edit workout', 'Workout editing will be added later.');
          }}
          onOpenExercise={setSelectedExercise}
          onRename={() => {
            setDetailMenuOpen(false);
            setRenameTarget({ id: selectedWorkout.id, kind: 'workout', name: selectedWorkout.name });
            setRenameName(selectedWorkout.name);
          }}
          onStartWorkout={() => {
            setDetailMenuOpen(false);
            setSelectedWorkoutId(null);
            setWorkoutElapsedSeconds(0);
            setActiveRestTimer(null);
            setIsStartedWorkoutMinimized(false);
            setStartedWorkout(createStartedWorkout(selectedWorkout));
          }}
          onToggleMenu={() => setDetailMenuOpen((current) => !current)}
          workout={selectedWorkout}
        />
        {modalLayer}
      </>
    );
  }

  // This branch shows the create-template flow from the same tab without adding another bottom tab.
  if (createTarget) {
    return (
      <CreateWorkoutTemplateScreen
        folderId={createTarget.folderId}
        onCancel={() => setCreateTarget(null)}
        onSave={handleCreateTemplate}
      />
    );
  }

  // This render section keeps both top-tab views mounted so their local state survives tab switches.
  return (
    <View style={styles.screen}>
      {exercisesNestedScreenOpen ? null : (
        <>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Workout</Text>
          </View>

          <View accessibilityRole="tablist" style={styles.topTabSwitcher}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTopTab === 'routines' }}
              onPress={() => setActiveTopTab('routines')}
              style={[
                styles.topTabButton,
                activeTopTab === 'routines' ? styles.topTabButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.topTabText,
                  activeTopTab === 'routines' ? styles.topTabTextActive : null,
                ]}
              >
                Routines
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTopTab === 'exercises' }}
              onPress={() => setActiveTopTab('exercises')}
              style={[
                styles.topTabButton,
                activeTopTab === 'exercises' ? styles.topTabButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.topTabText,
                  activeTopTab === 'exercises' ? styles.topTabTextActive : null,
                ]}
              >
                Exercises
              </Text>
            </Pressable>
          </View>
        </>
      )}

      <View
        style={[styles.topTabContent, activeTopTab !== 'routines' ? styles.hiddenTabContent : null]}
      >
        <FlatList
          ListFooterComponent={dashboardFooter}
          ListHeaderComponent={dashboardHeader}
          contentContainerStyle={[
            styles.listContent,
            startedWorkout && isStartedWorkoutMinimized ? styles.listContentWithMiniWorkout : null,
          ]}
          data={dashboardData.folders}
          extraData={{ expandedFolderIds, folderMenuId, menuTemplateId }}
          keyExtractor={(folder) => String(folder.id)}
          keyboardShouldPersistTaps="handled"
          renderItem={renderFolder}
        />

        {modalLayer}
      </View>

      <View
        style={[styles.topTabContent, activeTopTab !== 'exercises' ? styles.hiddenTabContent : null]}
      >
        <ExercisesScreen
          isActive={activeTopTab === 'exercises'}
          onNestedOpenChange={setExercisesNestedScreenOpen}
        />
      </View>
      {startedWorkout && isStartedWorkoutMinimized ? (
        <MinimizedStartedWorkoutBar
          elapsedSeconds={workoutElapsedSeconds}
          onExpand={() => setIsStartedWorkoutMinimized(false)}
          workoutName={startedWorkout.name}
        />
      ) : null}
    </View>
  );
}

type RenameTemplateModalProps = {
  visible: boolean;
  templateName: string;
  onChangeName: (name: string) => void;
  onRename: () => void;
  onCancel: () => void;
};

// This modal reuses the folder naming flow for user-created template folders.
function RenameTemplateModal({
  visible,
  templateName,
  onChangeName,
  onRename,
  onCancel,
}: RenameTemplateModalProps) {
  return (
    <Modal animationType="none" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Rename template</Text>
          <TextInput
            autoCapitalize="words"
            autoFocus
            onChangeText={onChangeName}
            placeholder="Upper Body"
            style={sharedStyles.input}
            value={templateName}
          />
          <View style={styles.modalActions}>
            <Pressable
              onPress={onCancel}
              style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.modalButton]}
            >
              <Text style={sharedStyles.buttonTextSecondary}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onRename} style={[sharedStyles.button, styles.modalButton]}>
              <Text style={sharedStyles.buttonText}>Rename</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// This modal uses app styling for destructive confirmations instead of the native Android alert.
type DeleteConfirmationModalProps = {
  confirmation: DeleteConfirmation | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
};

function DeleteConfirmationModal({
  confirmation,
  onCancel,
  onConfirm,
}: DeleteConfirmationModalProps) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={Boolean(confirmation)}>
      <BlurView intensity={35} style={styles.confirmationBackdrop} tint="dark">
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{confirmation?.title}</Text>
          <Text style={styles.modalMessage}>{confirmation?.message}</Text>
          <View style={styles.modalActions}>
            <Pressable
              onPress={onCancel}
              style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.modalButton]}
            >
              <Text style={sharedStyles.buttonTextSecondary}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={[sharedStyles.button, styles.modalButton]}
            >
              <Text style={sharedStyles.buttonText}>{confirmation?.confirmLabel ?? 'Delete'}</Text>
            </Pressable>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

// This prop type connects the folder-name modal back to WorkoutScreen state and handlers.
type FolderPromptModalProps = {
  visible: boolean;
  folderName: string;
  onChangeFolderName: (name: string) => void;
  onCreate: () => void;
  onCancel: () => void;
};

// This modal prompts for a folder name and sends creation back to WorkoutScreen.
function FolderPromptModal({
  visible,
  folderName,
  onChangeFolderName,
  onCreate,
  onCancel,
}: FolderPromptModalProps) {
  return (
    <Modal animationType="none" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Template name</Text>
          <TextInput
            autoCapitalize="words"
            autoFocus
            onChangeText={onChangeFolderName}
            placeholder="Upper Body"
            style={sharedStyles.input}
            value={folderName}
          />
          <View style={styles.modalActions}>
            <Pressable
              onPress={onCancel}
              style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.modalButton]}
            >
              <Text style={sharedStyles.buttonTextSecondary}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onCreate} style={[sharedStyles.button, styles.modalButton]}>
              <Text style={sharedStyles.buttonText}>Create</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// This prop type connects the template creation form to its parent dashboard save and cancel handlers.
type CreateWorkoutTemplateScreenProps = {
  folderId: number | null;
  onSave: (input: CreateWorkoutTemplateInput) => Promise<void>;
  onCancel: () => void;
};

// This form collects a template name and ordered exercise list before saving through WorkoutScreen.
function CreateWorkoutTemplateScreen({
  folderId,
  onSave,
  onCancel,
}: CreateWorkoutTemplateScreenProps) {
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<number[]>([]);
  const [workoutNameWarningVisible, setWorkoutNameWarningVisible] = useState(false);
  const [exerciseRequiredWarningVisible, setExerciseRequiredWarningVisible] = useState(false);
  const [exerciseFilter, setExerciseFilter] = useState<ExercisePickerFilter>('All');

  // This effect loads exercises from repository.ts so templates can reference the exercise catalog.
  useEffect(() => {
    getExercises().then(setExercises);
  }, []);

  // This handler validates the template name and passes the creation payload to WorkoutScreen.
  async function handleSave() {
    if (!name.trim()) {
      setWorkoutNameWarningVisible(true);
      return;
    }

    if (selectedExerciseIds.length === 0) {
      setExerciseRequiredWarningVisible(true);
      return;
    }

    await onSave({
      exerciseIds: Array.from(new Set(selectedExerciseIds)),
      folderId,
      name,
    });
  }

  // This derived list turns selected exercise IDs into display rows while preserving selection order.
  const selectedExerciseIdSet = useMemo(() => new Set(selectedExerciseIds), [selectedExerciseIds]);
  const selectedExercises = selectedExerciseIds
    .map((exerciseId) => exercises.find((exercise) => exercise.id === exerciseId))
    .filter((exercise): exercise is Exercise => Boolean(exercise));
  const filteredExercises = useMemo(
    () =>
      exerciseFilter === 'All'
        ? exercises
        : exercises.filter((exercise) => exercise.muscleGroup === exerciseFilter),
    [exerciseFilter, exercises],
  );

  // This render section shows the template form, selected exercise order, and available exercises.
  return (
    <>
      <FlatList
        ListFooterComponent={
          <View style={styles.createFooter}>
            <Pressable onPress={handleSave} style={sharedStyles.button}>
              <Text style={sharedStyles.buttonText}>Save Workout</Text>
            </Pressable>
          </View>
        }
        ListHeaderComponent={
          <View>
            <View style={styles.createHeader}>
              <Pressable
                onPress={onCancel}
                style={[sharedStyles.button, sharedStyles.buttonSecondary]}
              >
                <Text style={sharedStyles.buttonTextSecondary}>Back</Text>
              </Pressable>
              <Text style={styles.createTitle}>Create Workout Template</Text>
            </View>

            <Text style={sharedStyles.label}>Workout name</Text>
            <TextInput
              autoCapitalize="words"
              onChangeText={setName}
              placeholder="Upper"
              style={sharedStyles.input}
              value={name}
            />

            <View style={sharedStyles.section}>
              <Text style={styles.sectionTitle}>Exercise Order</Text>
              {selectedExercises.length === 0 ? (
                <Text style={sharedStyles.emptyText}>No exercises added.</Text>
              ) : (
                selectedExercises.map((exercise, index) => (
                  <Text key={`${exercise.id}-${index}`} style={styles.selectedExercise}>
                    {index + 1}. {exercise.name}
                  </Text>
                ))
              )}
            </View>

            <Text style={styles.sectionTitle}>Exercises</Text>
            <ScrollView
              contentContainerStyle={styles.exerciseFilterContent}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.exerciseFilterScroller}
            >
              {(['All', ...MUSCLE_GROUPS] as ExercisePickerFilter[]).map((filter) => {
                const selected = exerciseFilter === filter;

                return (
                  <Pressable
                    key={filter}
                    onPress={() => setExerciseFilter(filter)}
                    style={[
                      styles.exerciseFilterButton,
                      selected ? styles.exerciseFilterButtonActive : null,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.exerciseFilterText,
                        selected ? styles.exerciseFilterTextActive : null,
                      ]}
                    >
                      {filter}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        contentContainerStyle={styles.createContent}
        data={filteredExercises}
        keyExtractor={(exercise) => String(exercise.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selected = selectedExerciseIdSet.has(item.id);

          return (
            <View style={styles.exercisePickerRow}>
              <View style={styles.exerciseText}>
                <Text style={styles.exerciseName}>{item.name}</Text>
              </View>
              <Pressable
                onPress={() =>
                  setSelectedExerciseIds((current) =>
                    current.includes(item.id)
                      ? current.filter((exerciseId) => exerciseId !== item.id)
                      : [...current, item.id],
                  )
                }
                style={[
                  sharedStyles.button,
                  selected ? sharedStyles.buttonSecondary : null,
                ]}
              >
                <Text style={selected ? sharedStyles.buttonTextSecondary : sharedStyles.buttonText}>
                  {selected ? 'Remove' : 'Add'}
                </Text>
              </Pressable>
            </View>
          );
        }}
        style={styles.screen}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setWorkoutNameWarningVisible(false)}
        transparent
        visible={workoutNameWarningVisible}
      >
        <BlurView intensity={35} style={styles.confirmationBackdrop} tint="dark">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Workout name required</Text>
            <Text style={styles.modalMessage}>Enter a workout name before saving it.</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setWorkoutNameWarningVisible(false)}
                style={[sharedStyles.button, styles.modalButton]}
              >
                <Text style={sharedStyles.buttonText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </BlurView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setExerciseRequiredWarningVisible(false)}
        transparent
        visible={exerciseRequiredWarningVisible}
      >
        <BlurView intensity={35} style={styles.confirmationBackdrop} tint="dark">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Exercise required</Text>
            <Text style={styles.modalMessage}>Add at least one exercise before saving it.</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setExerciseRequiredWarningVisible(false)}
                style={[sharedStyles.button, styles.modalButton]}
              >
                <Text style={sharedStyles.buttonText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </BlurView>
      </Modal>
    </>
  );
}

type ActiveWorkoutExercisePickerScreenProps = {
  mode: ActiveExercisePickerTarget['mode'];
  existingExerciseIds: number[];
  targetExerciseName?: string;
  onBack: () => void;
  onAddExercises: (exercises: Exercise[]) => void;
  onReplaceExercise: (exercise: Exercise) => void;
};

function ActiveWorkoutExercisePickerScreen({
  mode,
  existingExerciseIds,
  targetExerciseName,
  onBack,
  onAddExercises,
  onReplaceExercise,
}: ActiveWorkoutExercisePickerScreenProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<number[]>([]);
  const [exerciseRequiredWarningVisible, setExerciseRequiredWarningVisible] = useState(false);
  const [exerciseFilter, setExerciseFilter] = useState<ExercisePickerFilter>('All');

  useEffect(() => {
    getExercises().then(setExercises);
  }, []);

  const unavailableExerciseIdSet = useMemo(
    () => new Set(existingExerciseIds),
    [existingExerciseIds],
  );
  const selectedExerciseIdSet = useMemo(() => new Set(selectedExerciseIds), [selectedExerciseIds]);
  const selectedExercises = selectedExerciseIds
    .map((exerciseId) => exercises.find((exercise) => exercise.id === exerciseId))
    .filter((exercise): exercise is Exercise => Boolean(exercise));
  const availableExercises = useMemo(
    () => exercises.filter((exercise) => !unavailableExerciseIdSet.has(exercise.id)),
    [exercises, unavailableExerciseIdSet],
  );
  const filteredExercises = useMemo(
    () =>
      exerciseFilter === 'All'
        ? availableExercises
        : availableExercises.filter((exercise) => exercise.muscleGroup === exerciseFilter),
    [availableExercises, exerciseFilter],
  );

  function handleAddExercises() {
    if (selectedExercises.length === 0) {
      setExerciseRequiredWarningVisible(true);
      return;
    }

    onAddExercises(selectedExercises);
  }

  return (
    <>
      <FlatList
        ListEmptyComponent={<Text style={sharedStyles.emptyText}>No available exercises.</Text>}
        ListFooterComponent={
          mode === 'add' ? (
            <View style={styles.createFooter}>
              <Pressable onPress={handleAddExercises} style={sharedStyles.button}>
                <Text style={sharedStyles.buttonText}>Add Exercise</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View>
            <View style={styles.createHeader}>
              <Pressable
                onPress={onBack}
                style={[sharedStyles.button, sharedStyles.buttonSecondary]}
              >
                <Text style={sharedStyles.buttonTextSecondary}>Back</Text>
              </Pressable>
              <Text style={styles.createTitle}>
                {mode === 'add' ? 'Add Exercise' : 'Replace Exercise'}
              </Text>
            </View>

            {mode === 'add' ? (
              <View style={sharedStyles.section}>
                <Text style={styles.sectionTitle}>Exercise Order</Text>
                {selectedExercises.length === 0 ? (
                  <Text style={sharedStyles.emptyText}>No exercises added.</Text>
                ) : (
                  selectedExercises.map((exercise, index) => (
                    <Text key={`${exercise.id}-${index}`} style={styles.selectedExercise}>
                      {index + 1}. {exercise.name}
                    </Text>
                  ))
                )}
              </View>
            ) : (
              <View style={sharedStyles.section}>
                <Text style={styles.sectionTitle}>Replacing</Text>
                <Text style={styles.selectedExercise}>{targetExerciseName ?? 'Exercise'}</Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>Exercises</Text>
            <ScrollView
              contentContainerStyle={styles.exerciseFilterContent}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.exerciseFilterScroller}
            >
              {(['All', ...MUSCLE_GROUPS] as ExercisePickerFilter[]).map((filter) => {
                const selected = exerciseFilter === filter;

                return (
                  <Pressable
                    key={filter}
                    onPress={() => setExerciseFilter(filter)}
                    style={[
                      styles.exerciseFilterButton,
                      selected ? styles.exerciseFilterButtonActive : null,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.exerciseFilterText,
                        selected ? styles.exerciseFilterTextActive : null,
                      ]}
                    >
                      {filter}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        contentContainerStyle={styles.createContent}
        data={filteredExercises}
        keyExtractor={(exercise) => String(exercise.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selected = selectedExerciseIdSet.has(item.id);

          return (
            <View style={styles.exercisePickerRow}>
              <View style={styles.exerciseText}>
                <Text style={styles.exerciseName}>{item.name}</Text>
              </View>
              <Pressable
                onPress={() => {
                  if (mode === 'replace') {
                    onReplaceExercise(item);
                    return;
                  }

                  setSelectedExerciseIds((current) =>
                    current.includes(item.id)
                      ? current.filter((exerciseId) => exerciseId !== item.id)
                      : [...current, item.id],
                  );
                }}
                style={[
                  sharedStyles.button,
                  selected ? sharedStyles.buttonSecondary : null,
                ]}
              >
                <Text style={selected ? sharedStyles.buttonTextSecondary : sharedStyles.buttonText}>
                  {mode === 'replace' ? 'Replace' : selected ? 'Remove' : 'Add'}
                </Text>
              </Pressable>
            </View>
          );
        }}
        style={styles.screen}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setExerciseRequiredWarningVisible(false)}
        transparent
        visible={exerciseRequiredWarningVisible}
      >
        <BlurView intensity={35} style={styles.confirmationBackdrop} tint="dark">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Exercise required</Text>
            <Text style={styles.modalMessage}>Add at least one exercise before saving it.</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setExerciseRequiredWarningVisible(false)}
                style={[sharedStyles.button, styles.modalButton]}
              >
                <Text style={sharedStyles.buttonText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </BlurView>
      </Modal>
    </>
  );
}

type WorkoutTemplateDetailScreenProps = {
  workout: WorkoutTemplate;
  menuOpen: boolean;
  onBack: () => void;
  onToggleMenu: () => void;
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
  onOpenExercise: (exercise: WorkoutTemplateExercise) => void;
  onStartWorkout: () => void;
};

function WorkoutTemplateDetailScreen({
  workout,
  menuOpen,
  onBack,
  onToggleMenu,
  onEdit,
  onRename,
  onDelete,
  onOpenExercise,
  onStartWorkout,
}: WorkoutTemplateDetailScreenProps) {
  return (
    <View style={styles.detailScreen}>
      <View style={styles.detailTopBar}>
        <Pressable onPress={onBack} style={styles.detailIconButton}>
          <Ionicons color="#ffffff" name="chevron-back" size={24} />
        </Pressable>
        <Pressable onPress={onToggleMenu} style={styles.detailIconButton}>
          <Ionicons color="#3b82f6" name="ellipsis-horizontal" size={22} />
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={styles.detailActionMenu}>
          <Pressable onPress={onEdit} style={styles.detailActionMenuItem}>
            <Text style={styles.detailActionMenuText}>Edit</Text>
          </Pressable>
          <Pressable onPress={onRename} style={styles.detailActionMenuItem}>
            <Text style={styles.detailActionMenuText}>Rename</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={styles.detailActionMenuItem}>
            <Text style={styles.detailActionMenuText}>Delete</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        ListEmptyComponent={<Text style={sharedStyles.emptyText}>No exercises added.</Text>}
        ListHeaderComponent={
          <View style={styles.detailHeader}>
            <Text numberOfLines={1} style={styles.detailTitle}>
              {workout.name}
            </Text>
            <Text numberOfLines={1} style={styles.detailSubtitle}>
              Last performed: {formatLastPerformed(workout.lastPerformed) || '                  -'}
            </Text>
          </View>
        }
        contentContainerStyle={styles.detailListContent}
        data={workout.exercises}
        keyExtractor={(exercise, index) => `${exercise.id}-${index}`}
        renderItem={({ item, index }) => (
          <WorkoutTemplateExerciseRow
            exercise={item}
            index={index}
            onOpen={() => onOpenExercise(item)}
          />
        )}
      />

      <View style={styles.startWorkoutBar}>
        <Pressable onPress={onStartWorkout} style={styles.startWorkoutButton}>
          <Text style={styles.startWorkoutButtonText}>START WORKOUT</Text>
        </Pressable>
      </View>
    </View>
  );
}

type WorkoutTemplateExerciseRowProps = {
  exercise: WorkoutTemplateExercise;
  index: number;
  onOpen: () => void;
};

function WorkoutTemplateExerciseRow({
  exercise,
  index,
  onOpen,
}: WorkoutTemplateExerciseRowProps) {
  return (
    <View style={styles.detailExerciseRow}>
      <View style={styles.detailExerciseThumb}>
        <Text style={styles.detailExerciseThumbText}>{index + 1}</Text>
      </View>
      <View style={styles.detailExerciseText}>
        <Text numberOfLines={1} style={styles.detailExerciseName}>
          {exercise.name}
        </Text>
        <Text numberOfLines={1} style={styles.detailExerciseGroup}>
          {exercise.muscleGroup ?? 'Exercise'}
        </Text>
      </View>
      <Pressable onPress={onOpen} style={styles.exerciseHelpButton}>
        <Text style={styles.exerciseHelpText}>?</Text>
      </Pressable>
    </View>
  );
}

type StartedWorkoutScreenProps = {
  workout: StartedWorkout;
  elapsedSeconds: number;
  activeRestTimer: ActiveRestTimer | null;
  onCancel: () => void;
  onFinish: () => void;
  onMinimize: () => void;
  onAddExercise: () => void;
  onAddSet: (exerciseKey: string) => void;
  onCompleteSet: (exerciseKey: string, set: StartedWorkoutSet) => void;
  onDeleteSet: (exerciseKey: string, setId: string) => void;
  onAddNote: (exerciseKey: string) => void;
  onChangeExerciseNote: (exerciseKey: string, note: string) => void;
  onCloseEmptyExerciseNote: (exerciseKey: string) => void;
  onOpenExerciseInfo: (exercise: StartedWorkoutExercise) => void;
  onRemoveExercise: (exerciseKey: string) => void;
  onReplaceExercise: (exerciseKey: string) => void;
  onToggleExerciseMenu: (exerciseKey: string) => void;
  onChangeSet: (
    exerciseKey: string,
    setId: string,
    changes: Partial<Pick<StartedWorkoutSet, 'duration' | 'weight' | 'reps' | 'restSeconds' | 'completed'>>,
  ) => void;
  startedExerciseMenuKey: string | null;
};

function StartedWorkoutScreen({
  workout,
  elapsedSeconds,
  activeRestTimer,
  onCancel,
  onFinish,
  onMinimize,
  onAddExercise,
  onAddSet,
  onCompleteSet,
  onDeleteSet,
  onAddNote,
  onChangeExerciseNote,
  onCloseEmptyExerciseNote,
  onOpenExerciseInfo,
  onRemoveExercise,
  onReplaceExercise,
  onToggleExerciseMenu,
  onChangeSet,
  startedExerciseMenuKey,
}: StartedWorkoutScreenProps) {
  return (
    <View style={styles.startedScreen}>
      <View style={styles.startedTopBar}>
        <Pressable onPress={onMinimize} style={styles.startedIconButton}>
          <Ionicons color="#ffffff" name="chevron-down" size={22} />
        </Pressable>
        <Text style={styles.startedElapsed}>{formatWorkoutDuration(elapsedSeconds)}</Text>
        <Pressable onPress={onFinish} style={styles.startedFinishButton}>
          <Text style={styles.startedFinishText}>FINISH</Text>
        </Pressable>
      </View>

      <FlatList
        ListFooterComponent={
          <View style={styles.startedFooter}>
            <Pressable onPress={onAddExercise} style={styles.startedAddExerciseButton}>
              <Text style={styles.startedAddExerciseText}>ADD EXERCISE</Text>
            </Pressable>
            <Pressable onPress={onCancel} style={styles.startedCancelButton}>
              <Text style={styles.startedCancelText}>CANCEL WORKOUT</Text>
            </Pressable>
          </View>
        }
        ListHeaderComponent={
          <View style={styles.startedHeader}>
            <View style={styles.startedTitleRow}>
              <Text numberOfLines={1} style={styles.startedWorkoutTitle}>
                {workout.name}
              </Text>
            </View>
            <Text style={styles.startedWorkoutSubtitle}>
              {formatWorkoutDuration(elapsedSeconds)}
            </Text>
          </View>
        }
        contentContainerStyle={styles.startedListContent}
        data={workout.exercises}
        keyExtractor={(exercise) => exercise.key}
        renderItem={({ item }) => (
          <StartedWorkoutExerciseSection
            activeRestTimer={activeRestTimer}
            exercise={item}
            menuOpen={startedExerciseMenuKey === item.key}
            onAddSet={() => onAddSet(item.key)}
            onAddNote={() => onAddNote(item.key)}
            onChangeNote={(note) => onChangeExerciseNote(item.key, note)}
            onChangeSet={(setId, changes) => onChangeSet(item.key, setId, changes)}
            onCloseEmptyNote={() => onCloseEmptyExerciseNote(item.key)}
            onCompleteSet={(set) => onCompleteSet(item.key, set)}
            onDeleteSet={(setId) => onDeleteSet(item.key, setId)}
            onOpenInfo={() => onOpenExerciseInfo(item)}
            onRemoveExercise={() => onRemoveExercise(item.key)}
            onReplaceExercise={() => onReplaceExercise(item.key)}
            onToggleMenu={() => onToggleExerciseMenu(item.key)}
          />
        )}
      />
    </View>
  );
}

type StartedWorkoutExerciseSectionProps = {
  exercise: StartedWorkoutExercise;
  activeRestTimer: ActiveRestTimer | null;
  menuOpen: boolean;
  onAddSet: () => void;
  onAddNote: () => void;
  onChangeNote: (note: string) => void;
  onCloseEmptyNote: () => void;
  onOpenInfo: () => void;
  onCompleteSet: (set: StartedWorkoutSet) => void;
  onDeleteSet: (setId: string) => void;
  onRemoveExercise: () => void;
  onReplaceExercise: () => void;
  onToggleMenu: () => void;
  onChangeSet: (
    setId: string,
    changes: Partial<Pick<StartedWorkoutSet, 'duration' | 'weight' | 'reps' | 'restSeconds' | 'completed'>>,
  ) => void;
};

function StartedWorkoutExerciseSection({
  exercise,
  activeRestTimer,
  menuOpen,
  onAddSet,
  onAddNote,
  onChangeNote,
  onCloseEmptyNote,
  onOpenInfo,
  onCompleteSet,
  onDeleteSet,
  onRemoveExercise,
  onReplaceExercise,
  onToggleMenu,
  onChangeSet,
}: StartedWorkoutExerciseSectionProps) {
  const showNote = exercise.noteOpen || exercise.note.trim().length > 0;
  const isCardio = exercise.muscleGroup === 'Cardio';

  return (
    <View style={styles.startedExerciseSection}>
      <View style={styles.startedExerciseHeader}>
        <Text numberOfLines={1} style={styles.startedExerciseTitle}>
          {exercise.name}
        </Text>
        <Pressable onPress={onOpenInfo} style={styles.startedGraphButton}>
          <Ionicons color="#3b82f6" name="analytics-outline" size={18} />
        </Pressable>
        <Pressable onPress={onToggleMenu} style={styles.startedMoreButton}>
          <Ionicons color="#3b82f6" name="ellipsis-horizontal" size={18} />
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={styles.startedExerciseMenu}>
          <Pressable onPress={onRemoveExercise} style={styles.startedExerciseMenuItem}>
            <Text style={[styles.startedExerciseMenuText, styles.destructiveMenuText]}>
              Remove Exercise
            </Text>
          </Pressable>
          <Pressable onPress={onReplaceExercise} style={styles.startedExerciseMenuItem}>
            <Text style={styles.startedExerciseMenuText}>Replace Exercise</Text>
          </Pressable>
          <Pressable onPress={onAddNote} style={styles.startedExerciseMenuItem}>
            <Text style={styles.startedExerciseMenuText}>Add Note</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.startedSetHeader}>
        <Text style={[styles.startedSetHeaderText, styles.startedSetColumn]}>SET</Text>
        <Text style={[styles.startedSetHeaderText, styles.startedPreviousColumn]}>          PREVIOUS</Text>
        {isCardio ? (
          <Text style={[styles.startedSetHeaderText, styles.startedTimeInputColumn]}>Time</Text>
        ) : (
          <>
            <Text style={[styles.startedSetHeaderText, styles.startedInputColumn]}>KG</Text>
            <Text style={[styles.startedSetHeaderText, styles.startedInputColumn]}>REPS</Text>
          </>
        )}
        <View style={styles.startedCheckColumn}>
          <Ionicons color="#ffffff" name="checkmark" size={16} />
        </View>
      </View>

      {showNote ? (
        <TextInput
          multiline
          onBlur={onCloseEmptyNote}
          onChangeText={onChangeNote}
          placeholder="Write a note"
          placeholderTextColor="#c7c7cc"
          style={styles.startedExerciseNoteInput}
          value={exercise.note}
        />
      ) : null}

      {exercise.sets.map((set) => (
        <View key={set.id}>
          <StartedWorkoutSetRow
            activeRestTimer={activeRestTimer}
            exerciseKey={exercise.key}
            onChangeSet={onChangeSet}
            onComplete={() => onCompleteSet(set)}
            onDelete={() => onDeleteSet(set.id)}
            isCardio={isCardio}
            set={set}
          />
          <StartedRestRow
            activeRestTimer={activeRestTimer}
            exerciseKey={exercise.key}
            onChangeSet={onChangeSet}
            set={set}
          />
        </View>
      ))}

      <Pressable onPress={onAddSet} style={styles.startedAddSetButton}>
        <Text style={styles.startedAddSetText}>
          ADD SET ({formatWorkoutDuration(defaultRestSeconds)})
        </Text>
      </Pressable>
    </View>
  );
}

type StartedWorkoutSetRowProps = {
  set: StartedWorkoutSet;
  exerciseKey: string;
  activeRestTimer: ActiveRestTimer | null;
  onComplete: () => void;
  onDelete: () => void;
  onChangeSet: (
    setId: string,
    changes: Partial<Pick<StartedWorkoutSet, 'duration' | 'weight' | 'reps' | 'restSeconds' | 'completed'>>,
  ) => void;
  isCardio: boolean;
};

function StartedWorkoutSetRow({
  set,
  exerciseKey,
  activeRestTimer,
  isCardio,
  onComplete,
  onDelete,
  onChangeSet,
}: StartedWorkoutSetRowProps) {
  const isActiveRest =
    activeRestTimer?.exerciseKey === exerciseKey && activeRestTimer.setId === set.id;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = translateX.interpolate({
    inputRange: [0, setSwipeDeleteDistance],
    outputRange: [1, 0.25],
    extrapolate: 'clamp',
  });
  const trashOpacity = translateX.interpolate({
    inputRange: [20, setSwipeDeleteDistance],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dx > 12 && Math.abs(gesture.dy) < 18,
        onPanResponderMove: (_event, gesture) => {
          const clamped = Math.max(0, Math.min(gesture.dx, setSwipeDeleteDistance * 1.1));
          translateX.setValue(clamped);
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx >= setSwipeDeleteDistance) {
            Animated.spring(translateX, {
              toValue: setSwipeDeleteDistance * 1.5,
              useNativeDriver: true,
              speed: 40,
              bounciness: 0,
            }).start(() => {
              onDelete();
              translateX.setValue(0);
            });
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              speed: 20,
              bounciness: 8,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            speed: 20,
            bounciness: 8,
          }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onDelete],
  );

  return (
    <View style={styles.startedSetRowWrapper}>
      {/* Red delete backdrop revealed as row slides right */}
      <Animated.View style={[styles.startedSetDeleteBackdrop, { opacity: trashOpacity }]}>
        <Ionicons color="#ffffff" name="trash-outline" size={20} />
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.startedSetRow,
          set.completed ? styles.startedSetRowCompleted : null,
          isActiveRest ? styles.startedSetRowResting : null,
          { transform: [{ translateX }], opacity },
        ]}
      >
        <Text style={[styles.startedSetText, styles.startedSetColumn]}>{set.setNumber}</Text>
        <Text
          numberOfLines={1}
          style={[
            styles.startedPreviousText,
            styles.startedPreviousColumn,
            set.completed ? styles.startedCompletedPreviousText : null,
          ]}
        >
          {isCardio ? formatPreviousCardioSet(set.previousReps) : formatPreviousSet(set.previousWeight, set.previousReps)}
        </Text>
        {isCardio ? (
          <TextInput
            keyboardType="numbers-and-punctuation"
            onBlur={() => {
              const duration = formatCardioDurationInput(set.duration);

              if (duration !== null) {
                onChangeSet(set.id, { duration });
              }
            }}
            onChangeText={(duration) => onChangeSet(set.id, { duration })}
            placeholder="0:00"
            placeholderTextColor="#8e8e93"
            style={[styles.startedSetInput, styles.startedTimeInputColumn]}
            value={set.duration}
          />
        ) : (
          <>
            <TextInput
              keyboardType="numeric"
              onChangeText={(weight) => onChangeSet(set.id, { weight })}
              style={[styles.startedSetInput, styles.startedInputColumn]}
              value={set.weight}
            />
            <TextInput
              keyboardType="number-pad"
              onChangeText={(reps) => onChangeSet(set.id, { reps })}
              style={[styles.startedSetInput, styles.startedInputColumn]}
              value={set.reps}
            />
          </>
        )}
        <Pressable
          onPress={onComplete}
          style={[
            styles.startedCheckButton,
            set.completed ? styles.startedCheckButtonComplete : null,
          ]}
        >
          <Ionicons
            color={set.completed ? '#ffffff' : '#9ca3a6'}
            name="checkmark"
            size={20}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

type StartedRestRowProps = {
  set: StartedWorkoutSet;
  exerciseKey: string;
  activeRestTimer: ActiveRestTimer | null;
  onChangeSet: (
    setId: string,
    changes: Partial<Pick<StartedWorkoutSet, 'restSeconds'>>,
  ) => void;
};

function StartedRestRow({ set, exerciseKey, activeRestTimer, onChangeSet }: StartedRestRowProps) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const isActiveRest =
    activeRestTimer?.exerciseKey === exerciseKey && activeRestTimer.setId === set.id;
  const remainingSeconds = isActiveRest ? activeRestTimer.remaining : set.restSeconds;
  const progress = isActiveRest
    ? Math.max(activeRestTimer.remaining / activeRestTimer.duration, 0)
    : 0;

  if (set.completed && isActiveRest) {
    return (
      <View style={styles.startedRestProgressTrack}>
        <View style={[styles.startedRestProgressFill, { width: `${progress * 100}%` }]} />
        <Text style={styles.startedRestProgressText}>
          {formatWorkoutDuration(remainingSeconds)}
        </Text>
      </View>
    );
  }

  function commitRestSeconds() {
    if (editingValue === null) {
      return;
    }

    const parsedSeconds = parseWorkoutDurationInput(editingValue);

    if (parsedSeconds !== null) {
      onChangeSet(set.id, { restSeconds: parsedSeconds });
    }

    setEditingValue(null);
  }

  return (
    <View style={styles.startedRestLineRow}>
      <View style={styles.startedRestLine} />
      {editingValue !== null && !isActiveRest ? (
        <TextInput
          autoFocus
          keyboardType="number-pad"
          onBlur={commitRestSeconds}
          onChangeText={setEditingValue}
          onSubmitEditing={commitRestSeconds}
          selectTextOnFocus
          style={styles.startedRestLineInput}
          value={editingValue}
        />
      ) : (
        <Pressable
          disabled={isActiveRest}
          onPress={() => setEditingValue(formatWorkoutDuration(set.restSeconds))}
        >
          <Text style={styles.startedRestLineText}>{formatWorkoutDuration(remainingSeconds)}</Text>
        </Pressable>
      )}
      <View style={styles.startedRestLine} />
    </View>
  );
}

type MinimizedStartedWorkoutBarProps = {
  workoutName: string;
  elapsedSeconds: number;
  onExpand: () => void;
};

function MinimizedStartedWorkoutBar({
  workoutName,
  elapsedSeconds,
  onExpand,
}: MinimizedStartedWorkoutBarProps) {
  return (
    <Pressable onPress={onExpand} style={styles.minimizedWorkoutBar}>
      <Text numberOfLines={1} style={styles.minimizedWorkoutTitle}>
        {workoutName}
      </Text>
      <Text style={styles.minimizedWorkoutTime}>{formatWorkoutDuration(elapsedSeconds)}</Text>
    </Pressable>
  );
}

// This prop type passes one folder and all dashboard actions into the memoized folder section.
type FolderSectionProps = {
  folder: FolderWithTemplates;
  expanded: boolean;
  folderMenuOpen: boolean;
  image?: ImageSourcePropType;
  menuTemplateId: number | null;
  onToggleFolder: () => void;
  onToggleFolderMenu: () => void;
  onEmptyPress: () => void;
  onSetFolderRef: (folderId: number, ref: FolderViewRef | null) => void;
  onToggleMenu: (templateId: number) => void;
  onDeleteFolder: () => void;
  onRenameFolder: () => void;
  onCreateWorkout: () => void;
  onDuplicateTemplate: (templateId: number) => void;
  onDeleteTemplate: (templateId: number) => void;
  onOpenWorkout: (templateId: number) => void;
  onDropTemplate: (templateId: number, screenY: number) => void;
};

// This component renders a collapsible folder row and either its workout grid or empty-folder target.
const FolderSection = memo(function FolderSection({
  folder,
  expanded,
  folderMenuOpen,
  image,
  menuTemplateId,
  onToggleFolder,
  onToggleFolderMenu,
  onEmptyPress,
  onSetFolderRef,
  onToggleMenu,
  onDeleteFolder,
  onRenameFolder,
  onCreateWorkout,
  onDuplicateTemplate,
  onDeleteTemplate,
  onOpenWorkout,
  onDropTemplate,
}: FolderSectionProps) {
  // This callback registers the folder row with the parent so drag release positions can be measured.
  const setRef = useCallback(
    (ref: FolderViewRef | null) => {
      onSetFolderRef(folder.id, ref);
    },
    [folder.id, onSetFolderRef],
  );

  return (
    <View ref={setRef} style={styles.folderSection}>
      <View style={styles.folderRow}>
        <Pressable onPress={onToggleFolder} style={styles.folderToggle}>
          {image ? (
            <Image source={image} style={styles.folderIcon} />
          ) : (
            <Text style={styles.folderIconEmoji}>📁</Text>
          )}
          <Text numberOfLines={1} style={styles.folderName}>
            {folder.name}{' '}
            <Text style={styles.folderCount}>({folder.workoutCount})</Text>
          </Text>
        </Pressable>
        <Pressable onPress={onToggleFolderMenu} style={styles.folderMenuButton}>
          <Ionicons color="#a1a1a6" name="ellipsis-horizontal" size={18} />
        </Pressable>
      </View>

      {folderMenuOpen ? (
        <View style={[styles.cardMenu, styles.folderActionMenu]}>
          <Pressable onPress={onRenameFolder} style={styles.cardMenuItem}>
            <Text style={styles.cardMenuText}>Rename</Text>
          </Pressable>
          <Pressable onPress={onCreateWorkout} style={styles.cardMenuItem}>
            <Text style={styles.cardMenuText}>Create Workout</Text>
          </Pressable>
          <Pressable onPress={onDeleteFolder} style={styles.cardMenuItem}>
            <Text style={styles.cardMenuText}>Delete</Text>
          </Pressable>
        </View>
      ) : null}

      {expanded ? (
        folder.workouts.length === 0 ? (
          <Pressable onPress={onEmptyPress} style={styles.emptyFolderCard}>
            <Text style={styles.emptyFolderPrimary}>Tap to Add</Text>
            <Text style={styles.emptyFolderSecondary}>or drag workout here</Text>
          </Pressable>
        ) : (
          <WorkoutCardGrid
            menuTemplateId={menuTemplateId}
            onDeleteTemplate={onDeleteTemplate}
            onDropTemplate={onDropTemplate}
            onDuplicateTemplate={onDuplicateTemplate}
            onOpenWorkout={onOpenWorkout}
            onToggleMenu={onToggleMenu}
            workouts={folder.workouts}
          />
        )
      ) : null}
    </View>
  );
});

// This prop type connects a list of templates to card menu and drag-drop actions from WorkoutScreen.
type WorkoutCardGridProps = {
  workouts: WorkoutTemplate[];
  menuTemplateId: number | null;
  onToggleMenu: (templateId: number) => void;
  onDuplicateTemplate: (templateId: number) => void;
  onDeleteTemplate: (templateId: number) => void;
  onOpenWorkout: (templateId: number) => void;
  onDropTemplate: (templateId: number, screenY: number) => void;
};

// This component wraps workout template cards into the requested two-column grid layout.
const WorkoutCardGrid = memo(function WorkoutCardGrid({
  workouts,
  menuTemplateId,
  onToggleMenu,
  onDuplicateTemplate,
  onDeleteTemplate,
  onOpenWorkout,
  onDropTemplate,
}: WorkoutCardGridProps) {
  if (workouts.length === 0) {
    return null;
  }

  return (
    <View style={styles.cardGrid}>
      {workouts.map((workout) => (
        <WorkoutCard
          key={workout.id}
          menuOpen={menuTemplateId === workout.id}
          onDelete={() => onDeleteTemplate(workout.id)}
          onDrop={(screenY) => onDropTemplate(workout.id, screenY)}
          onDuplicate={() => onDuplicateTemplate(workout.id)}
          onOpen={() => onOpenWorkout(workout.id)}
          onToggleMenu={() => onToggleMenu(workout.id)}
          workout={workout}
        />
      ))}
    </View>
  );
});

// This prop type connects a single template card to menu, duplicate, delete, and drop behavior.
type WorkoutCardProps = {
  workout: WorkoutTemplate;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onDrop: (screenY: number) => void;
};

// This component renders one draggable template card and delegates persistence back to WorkoutScreen.
const WorkoutCard = memo(function WorkoutCard({
  workout,
  menuOpen,
  onToggleMenu,
  onDuplicate,
  onDelete,
  onOpen,
  onDrop,
}: WorkoutCardProps) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [dragging, setDragging] = useState(false);
  // This responder turns card movement into animated drag feedback and reports the release Y coordinate.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8,
        onPanResponderGrant: () => {
          setDragging(true);
        },
        onPanResponderMove: (_event, gesture) => {
          pan.setValue({ x: gesture.dx, y: gesture.dy });
        },
        onPanResponderRelease: (_event, gesture) => {
          setDragging(false);
          pan.setValue({ x: 0, y: 0 });
          onDrop(gesture.moveY);
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          pan.setValue({ x: 0, y: 0 });
        },
      }),
    [onDrop, pan],
  );

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.workoutCard,
        dragging ? styles.draggingCard : null,
        { transform: pan.getTranslateTransform() },
      ]}
    >
      <Pressable onPress={onToggleMenu} style={styles.menuButton}>
        <Ionicons color="#a1a1a6" name="ellipsis-horizontal" size={18} />
      </Pressable>

      {menuOpen ? (
        <View style={styles.cardMenu}>
          <Pressable onPress={onDuplicate} style={styles.cardMenuItem}>
            <Text style={styles.cardMenuText}>Duplicate Workout</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={styles.cardMenuItem}>
            <Text style={styles.cardMenuText}>Delete Workout</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable onPress={onOpen} style={styles.cardPressArea}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {workout.name}
        </Text>
        <Text numberOfLines={2} style={styles.exercisePreview}>
          {getExercisePreview(workout.exerciseNames)}
        </Text>
        <View style={styles.lastPerformedRow}>
          <Text style={styles.lastPerformedLabel}>Last performed</Text>
          <Text style={styles.lastPerformedDate}>{formatLastPerformed(workout.lastPerformed)}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
});

// These local styles define the dashboard layout, folder rows, template cards, modal, and create form.
const styles = StyleSheet.create({
  startedScreen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  startedTopBar: {
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    flexDirection: 'row',
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  startedIconButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  startedElapsed: {
    color: '#e5e5ea',
    flex: 1,
    fontSize: 16,
    textAlign: 'center',
  },
  startedFinishButton: {
    alignItems: 'center',
    minHeight: 34,
    justifyContent: 'center',
  },
  startedFinishText: {
    color: '#3b82f6',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  startedListContent: {
    paddingBottom: 20,
  },
  startedHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  startedTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  startedWorkoutTitle: {
    color: '#ffffff',
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '800',
  },
  startedMenuDots: {
    color: '#3b82f6',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18,
  },
  startedWorkoutSubtitle: {
    color: '#8e8e93',
    fontSize: 16,
    marginTop: 8,
  },
  startedExerciseSection: {
    paddingHorizontal: 16,
    paddingTop: 18,
    position: 'relative',
  },
  startedExerciseHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  startedExerciseTitle: {
    color: '#3b82f6',
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
  },
  startedGraphButton: {
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderColor: '#2c2c2e',
    borderRadius: 6,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 42,
  },
  startedMoreButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  startedMoreText: {
    color: '#3b82f6',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18,
  },
  startedExerciseMenu: {
    backgroundColor: '#1c1c1e',
    borderColor: '#2c2c2e',
    borderRadius: 6,
    borderWidth: 1,
    elevation: 5,
    position: 'absolute',
    right: 16,
    top: 52,
    width: 168,
    zIndex: 8,
  },
  startedExerciseMenuItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  startedExerciseMenuText: {
    color: '#ffffff',
    fontSize: 15,
  },
  destructiveMenuText: {
    color: '#ff453a',
  },
  startedExerciseNoteInput: {
    backgroundColor: '#1c1c1e',
    borderColor: '#3a3a3c',
    borderRadius: 6,
    borderWidth: 1,
    color: '#ffffff',
    fontSize: 18,
    marginBottom: 12,
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 11,
    textAlignVertical: 'top',
  },
  startedSetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginBottom: 6,
  },
  startedSetHeaderText: {
    color: '#a1a1a6',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  startedSetColumn: {
    textAlign: 'center',
    width: 28,
  },
  startedPreviousColumn: {
    flex: 1,
    minWidth: 72,
  },
  startedInputColumn: {
    textAlign: 'center',
    width: 53,
  },
  startedTimeInputColumn: {
    textAlign: 'center',
    width: 111,
  },
  startedCheckColumn: {
    alignItems: 'center',
    width: 34,
  },
  startedSetRow: {
    alignItems: 'center',
    borderRadius: 0,
    flexDirection: 'row',
    gap: 5,
    minHeight: 44,
    paddingVertical: 5,
  },
  startedSetRowCompleted: {
    backgroundColor: '#172554',
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  startedSetRowResting: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  startedSetText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  startedPreviousText: {
    color: '#8e8e93',
    fontSize: 13,
  },
  startedCompletedPreviousText: {
    color: '#c7d2fe',
  },
  startedSetInput: {
    backgroundColor: '#1c1c1e',
    borderColor: '#2c2c2e',
    borderRadius: 6,
    borderWidth: 1,
    color: '#ffffff',
    fontSize: 16,
    minHeight: 36,
    paddingHorizontal: 6,
    textAlign: 'center',
  },
  startedCheckButton: {
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderColor: '#2c2c2e',
    borderRadius: 6,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 34,
  },
  startedCheckButtonComplete: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  startedRestLineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 5,
    minHeight: 22,
  },
  startedRestLine: {
    backgroundColor: '#2c2c2e',
    flex: 1,
    height: 2,
  },
  startedRestLineText: {
    color: '#3b82f6',
    fontSize: 14,
    minWidth: 48,
    textAlign: 'center',
  },
  startedRestLineInput: {
    backgroundColor: '#1c1c1e',
    borderColor: '#3b82f6',
    borderRadius: 6,
    borderWidth: 1,
    color: '#ffffff',
    fontSize: 14,
    minHeight: 30,
    minWidth: 58,
    paddingHorizontal: 6,
    paddingVertical: 2,
    textAlign: 'center',
  },
  startedRestProgressTrack: {
    backgroundColor: '#1c1c1e',
    borderRadius: 6,
    height: 34,
    justifyContent: 'center',
    marginBottom: 5,
    overflow: 'hidden',
  },
  startedRestProgressFill: {
    backgroundColor: '#3b82f6',
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  startedRestProgressText: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
  },
  startedAddSetButton: {
    alignItems: 'center',
    marginTop: 4,
    minHeight: 32,
    justifyContent: 'center',
  },
  startedAddSetText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  startedFooter: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
  },
  startedAddExerciseButton: {
    minHeight: 32,
    justifyContent: 'center',
  },
  startedAddExerciseText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  startedCancelButton: {
    minHeight: 32,
    justifyContent: 'center',
  },
  startedCancelText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 12,
  },
  cardMenu: {
    backgroundColor: '#1c1c1e',
    borderColor: '#3a3a3c',
    borderRadius: 6,
    borderWidth: 1,
    elevation: 4,
    position: 'absolute',
    right: 8,
    top: 36,
    width: 164,
    zIndex: 3,
  },
  cardMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardMenuText: {
    color: '#e5e5ea',
    fontSize: 14,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    paddingRight: 30,
  },
  cardPressArea: {
    flex: 1,
  },
  createContent: {
    padding: 16,
    paddingBottom: 28,
  },
  createFooter: {
    paddingTop: 18,
  },
  createHeader: {
    gap: 12,
    marginBottom: 20,
  },
  createTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderBottomColor: 'rgba(59,130,246,0.08)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 74,
    paddingHorizontal: 24,
    paddingTop: 12,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
  },
  detailActionMenu: {
    backgroundColor: '#1c1c1e',
    borderColor: '#2c2c2e',
    borderRadius: 6,
    borderWidth: 1,
    elevation: 5,
    position: 'absolute',
    right: 12,
    top: 52,
    width: 154,
    zIndex: 8,
  },
  detailActionMenuItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  detailActionMenuText: {
    color: '#ffffff',
    fontSize: 15,
  },
  detailExerciseGroup: {
    color: '#a1a1a6',
    fontSize: 13,
    marginTop: 2,
  },
  detailExerciseName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  detailExerciseRow: {
    alignItems: 'center',
    borderBottomColor: '#1c1c1e',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingVertical: 8,
  },
  detailExerciseText: {
    flex: 1,
  },
  detailExerciseThumb: {
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
    borderRadius: 6,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  detailExerciseThumbText: {
    color: '#e5e5ea',
    fontSize: 13,
    fontWeight: '800',
  },
  detailHeader: {
    paddingBottom: 16,
  },
  detailIconButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  detailListContent: {
    paddingHorizontal: 16,
    paddingBottom: 88,
  },
  detailMenuText: {
    color: '#3b82f6',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 20,
  },
  detailScreen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  detailSubtitle: {
    color: '#8e8e93',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  detailTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  detailTopBar: {
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  draggingCard: {
    elevation: 8,
    opacity: 0.92,
    zIndex: 5,
  },
  emptyFolderCard: {
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderColor: '#3a3a3c',
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 132,
    padding: 18,
  },
  emptyFolderPrimary: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyFolderSecondary: {
    color: '#8e8e93',
    marginTop: 8,
  },
  exerciseName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  exerciseFilterButton: {
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderColor: '#3a3a3c',
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
  },
  exerciseFilterButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  exerciseFilterContent: {
    gap: 8,
    paddingRight: 16,
  },
  exerciseFilterScroller: {
    marginBottom: 8,
    marginTop: 10,
  },
  exerciseFilterText: {
    color: '#a1a1a6',
    fontSize: 13,
    fontWeight: '700',
  },
  exerciseFilterTextActive: {
    color: '#ffffff',
  },
  exercisePickerRow: {
    alignItems: 'center',
    borderBottomColor: '#2c2c2e',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  exercisePreview: {
    color: '#8e8e93',
    lineHeight: 19,
    marginTop: 10,
    minHeight: 38,
  },
  exerciseDetailContent: {
    paddingHorizontal: 24,
  },
  exerciseHelpButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  exerciseHelpText: {
    color: '#3b82f6',
    fontSize: 20,
    fontWeight: '700',
  },
  exerciseText: {
    flex: 1,
  },
  folderCount: {
    color: '#8e8e93',
    fontSize: 16,
  },
  folderActionMenu: {
    right: 0,
    top: 48,
  },
  folderIcon: {
    borderRadius: 4,
    height: 24,
    width: 24,
  },
  folderIconEmoji: {
    fontSize: 20,
    width: 26,
  },
  folderMenuButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  folderMenuButtonText: {
    color: '#a1a1a6',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 18,
  },
  folderName: {
    color: '#ffffff',
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  folderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 14,
  },
  folderSection: {
    borderBottomColor: '#393939ff',
    borderBottomWidth: 1,
    paddingBottom: 14,
  },
  folderToggle: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    minWidth: 86,
  },
  hiddenTabContent: {
    display: 'none',
  },
  lastPerformedDate: {
    color: '#e5e5ea',
    minHeight: 18,
  },
  lastPerformedLabel: {
    color: '#8e8e93',
    fontSize: 12,
    marginBottom: 4,
  },
  lastPerformedRow: {
    marginTop: 12,
  },
  listContent: {
    padding: 16,
    paddingBottom: 30,
  },
  listContentWithMiniWorkout: {
    paddingBottom: 90,
  },
  menuButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    top: 4,
    width: 32,
    zIndex: 4,
  },
  menuButtonText: {
    color: '#a1a1a6',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  confirmationBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalButton: {
    minWidth: 92,
  },
  modalCard: {
    backgroundColor: '#000000',
    borderRadius: 8,
    maxWidth: 420,
    padding: 16,
    width: '100%',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalMessage: {
    color: '#c7c7cc',
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 18,
  },
  minimizedWorkoutBar: {
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderTopColor: '#2c2c2e',
    borderTopWidth: 1,
    bottom: 0,
    elevation: 8,
    justifyContent: 'center',
    left: 0,
    minHeight: 52,
    paddingHorizontal: 72,
    position: 'absolute',
    right: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  minimizedWorkoutTime: {
    color: '#c7c7cc',
    fontSize: 13,
    marginTop: 2,
  },
  minimizedWorkoutTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  myWorkoutsSection: {
    minHeight: 64,
  },
  screen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  selectedExercise: {
    color: '#e5e5ea',
    fontSize: 16,
    paddingVertical: 5,
  },
  startWorkoutBar: {
    backgroundColor: '#000000',
    borderTopColor: '#1c1c1e',
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: 12,
    position: 'absolute',
    right: 0,
  },
  startWorkoutButton: {
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 42,
  },
  startWorkoutButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  templatesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  templatesTitle: {
    color: '#ffffff',
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
  },
  topTabButton: {
    alignItems: 'center',
    borderRadius: 5,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
  },
  topTabButtonActive: {
    backgroundColor: '#3b82f6',
  },
  topTabContent: {
    flex: 1,
  },
  topTabSwitcher: {
    backgroundColor: '#1c1c1e',
    borderRadius: 6,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 3,
  },
  topTabText: {
    color: '#8e8e93',
    fontSize: 15,
    fontWeight: '700',
  },
  topTabTextActive: {
    color: '#fff',
  },
  startedSetRowWrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  startedSetDeleteBackdrop: {
    alignItems: 'center',
    backgroundColor: '#ef4444',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
    width: 72,
  },
  workoutCard: {
    backgroundColor: '#1c1c1e',
    borderColor: '#2c2c2e',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 148,
    padding: 12,
    width: '48%',
  },
});
