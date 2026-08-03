import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { getExercises, saveWorkout } from '../data/repository';
import type { Exercise, SaveWorkoutExercise } from '../data/types';
import { sharedStyles } from './sharedStyles';

// This draft type stores editable set fields before repository.ts persists a performed workout.
type DraftSet = {
  localId: string;
  weight: string;
  reps: string;
};

// This draft type groups a selected exercise with the sets entered for the unsaved workout.
type DraftExercise = {
  localId: string;
  exercise: Exercise;
  sets: DraftSet[];
};

// This helper creates local-only keys for React rendering before SQLite assigns real IDs.
function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// This helper creates an empty set row for the legacy V1 workout entry flow.
function createDraftSet(): DraftSet {
  return {
    localId: createLocalId(),
    reps: '',
    weight: '',
  };
}

// This legacy V1 screen still connects getExercises and saveWorkout even though V2 navigation no longer routes to it.
export function NewWorkoutScreen() {
  const [isWorkoutStarted, setIsWorkoutStarted] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [draftExercises, setDraftExercises] = useState<DraftExercise[]>([]);

  // This loader fetches the exercise catalog from repository.ts for workout entry.
  const loadExercises = useCallback(async () => {
    setExercises(await getExercises());
  }, []);

  // This focus effect refreshes exercises whenever the screen becomes active.
  useFocusEffect(
    useCallback(() => {
      loadExercises();
    }, [loadExercises]),
  );

  // This handler resets local draft state before starting a new performed workout.
  function startWorkout() {
    setDraftExercises([]);
    setIsWorkoutStarted(true);
  }

  // This handler adds one selected exercise and an initial set to the unsaved workout draft.
  function addExercise(exercise: Exercise) {
    setDraftExercises((current) => [
      ...current,
      {
        exercise,
        localId: createLocalId(),
        sets: [createDraftSet()],
      },
    ]);
  }

  // This handler appends a new editable set row to a draft exercise.
  function addSet(draftExerciseId: string) {
    setDraftExercises((current) =>
      current.map((draftExercise) =>
        draftExercise.localId === draftExerciseId
          ? { ...draftExercise, sets: [...draftExercise.sets, createDraftSet()] }
          : draftExercise,
      ),
    );
  }

  // This handler removes a draft set before the workout is saved through repository.ts.
  function removeSet(draftExerciseId: string, setId: string) {
    setDraftExercises((current) =>
      current.map((draftExercise) =>
        draftExercise.localId === draftExerciseId
          ? {
              ...draftExercise,
              sets: draftExercise.sets.filter((set) => set.localId !== setId),
            }
          : draftExercise,
      ),
    );
  }

  // This handler updates local text fields before buildWorkoutPayload validates numeric values.
  function updateSet(
    draftExerciseId: string,
    setId: string,
    field: 'weight' | 'reps',
    value: string,
  ) {
    setDraftExercises((current) =>
      current.map((draftExercise) =>
        draftExercise.localId === draftExerciseId
          ? {
              ...draftExercise,
              sets: draftExercise.sets.map((set) =>
                set.localId === setId ? { ...set, [field]: value } : set,
              ),
            }
          : draftExercise,
      ),
    );
  }

  // This function converts draft UI state into SaveWorkoutExercise data for repository.ts.
  function buildWorkoutPayload(): SaveWorkoutExercise[] | null {
    const payload: SaveWorkoutExercise[] = [];

    for (const draftExercise of draftExercises) {
      if (draftExercise.sets.length === 0) {
        continue;
      }

      const sets = draftExercise.sets.map((set) => {
        const weight = Number.parseFloat(set.weight);
        const reps = Number.parseInt(set.reps, 10);

        if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps <= 0) {
          return null;
        }

        return { reps, weight };
      });

      if (sets.some((set) => set === null)) {
        Alert.alert(
          'Invalid set',
          `Enter a weight of 0 or more and reps above 0 for ${draftExercise.exercise.name}.`,
        );
        return null;
      }

      payload.push({
        exerciseId: draftExercise.exercise.id,
        sets: sets as SaveWorkoutExercise['sets'],
      });
    }

    if (payload.length === 0) {
      Alert.alert('No sets added', 'Add at least one exercise set before saving the workout.');
      return null;
    }

    return payload;
  }

  // This handler persists the performed workout through repository.ts and clears local draft state.
  async function finishWorkout() {
    const payload = buildWorkoutPayload();

    if (!payload) {
      return;
    }

    await saveWorkout(payload);
    setDraftExercises([]);
    setIsWorkoutStarted(false);
    Alert.alert('Workout saved', 'Your workout was saved to history.');
  }

  // This branch shows the minimal start screen before any performed workout draft exists.
  if (!isWorkoutStarted) {
    return (
      <View style={sharedStyles.screen}>
        <Text style={sharedStyles.title}>New Workout</Text>
        <Pressable onPress={startWorkout} style={sharedStyles.button}>
          <Text style={sharedStyles.buttonText}>Start Workout</Text>
        </Pressable>
      </View>
    );
  }

  // This render section shows exercise selection, editable set rows, and the save action.
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={sharedStyles.screen}
    >
      <Text style={sharedStyles.title}>New Workout</Text>

      <View style={sharedStyles.section}>
        <Text style={styles.sectionTitle}>Add Exercise</Text>
        {exercises.length === 0 ? (
          <Text style={sharedStyles.emptyText}>Create an exercise first on the Exercises tab.</Text>
        ) : (
          exercises.map((exercise) => (
            <View key={exercise.id} style={styles.exercisePickerRow}>
              <View style={styles.exerciseText}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
              </View>
              <Pressable onPress={() => addExercise(exercise)} style={sharedStyles.button}>
                <Text style={sharedStyles.buttonText}>Add</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      {draftExercises.length === 0 ? (
        <Text style={sharedStyles.emptyText}>No exercises added to this workout.</Text>
      ) : (
        draftExercises.map((draftExercise) => (
          <View key={draftExercise.localId} style={sharedStyles.section}>
            <Text style={styles.sectionTitle}>{draftExercise.exercise.name}</Text>

            {draftExercise.sets.length === 0 ? (
              <Text style={sharedStyles.emptyText}>No sets for this exercise.</Text>
            ) : (
              draftExercise.sets.map((set, index) => (
                <View key={set.localId} style={styles.setRow}>
                  <Text style={styles.setNumber}>{index + 1}</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    onChangeText={(value) =>
                      updateSet(draftExercise.localId, set.localId, 'weight', value)
                    }
                    placeholder="Weight"
                    style={[sharedStyles.input, styles.setInput]}
                    value={set.weight}
                  />
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={(value) =>
                      updateSet(draftExercise.localId, set.localId, 'reps', value)
                    }
                    placeholder="Reps"
                    style={[sharedStyles.input, styles.setInput]}
                    value={set.reps}
                  />
                  <Pressable
                    onPress={() => removeSet(draftExercise.localId, set.localId)}
                    style={[sharedStyles.button, sharedStyles.buttonDanger, styles.compactButton]}
                  >
                    <Text style={sharedStyles.buttonText}>Remove</Text>
                  </Pressable>
                </View>
              ))
            )}

            <Pressable
              onPress={() => addSet(draftExercise.localId)}
              style={[sharedStyles.button, sharedStyles.buttonSecondary]}
            >
              <Text style={sharedStyles.buttonTextSecondary}>Add Set</Text>
            </Pressable>
          </View>
        ))
      )}

      <Pressable onPress={finishWorkout} style={sharedStyles.button}>
        <Text style={sharedStyles.buttonText}>Save Workout</Text>
      </Pressable>
    </ScrollView>
  );
}

// These local styles support the legacy workout-entry form layout.
const styles = StyleSheet.create({
  compactButton: {
    paddingHorizontal: 10,
  },
  content: {
    paddingBottom: 24,
  },
  exerciseName: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  exercisePickerRow: {
    alignItems: 'center',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  exerciseText: {
    flex: 1,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  setInput: {
    flex: 1,
    marginBottom: 0,
  },
  setNumber: {
    color: '#374151',
    fontWeight: '700',
    width: 22,
  },
  setRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
});
