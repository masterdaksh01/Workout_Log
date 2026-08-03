import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { getWorkout, getWorkoutSummaries } from '../data/repository';
import type { WorkoutDetail, WorkoutSummary } from '../data/types';
import { sharedStyles } from './sharedStyles';

// This formatter turns repository timestamps into display text for the History list and detail views.
function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

// This screen reads performed workouts from repository.ts and shows either a list or one workout detail.
export function HistoryScreen() {
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null);

  // This loader fetches non-template workout summaries from repository.ts for the History tab.
  const loadWorkouts = useCallback(async () => {
    setWorkouts(await getWorkoutSummaries());
  }, []);

  // This focus effect refreshes History whenever the tab is opened after workouts may have changed.
  useFocusEffect(
    useCallback(() => {
      loadWorkouts();
    }, [loadWorkouts]),
  );

  // This handler opens a saved workout by loading its nested exercises and sets from repository.ts.
  async function openWorkout(id: number) {
    setSelectedWorkout(await getWorkout(id));
  }

  // This branch renders the detail view for the selected performed workout.
  if (selectedWorkout) {
    return (
      <ScrollView contentContainerStyle={styles.content} style={sharedStyles.screen}>
        <Pressable
          onPress={() => setSelectedWorkout(null)}
          style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.backButton]}
        >
          <Text style={sharedStyles.buttonTextSecondary}>Back</Text>
        </Pressable>

        <Text style={sharedStyles.title}>{formatTimestamp(selectedWorkout.timestamp)}</Text>

        {selectedWorkout.exercises.map((exercise) => (
          <View key={exercise.id} style={sharedStyles.section}>
            <Text style={styles.exerciseName}>{exercise.exerciseName}</Text>

            {exercise.sets.map((set, index) => (
              <View key={set.id} style={styles.setRow}>
                <Text style={styles.setText}>Set {index + 1}</Text>
                <Text style={styles.setText}>{set.weight} x {set.reps}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    );
  }

  // This render section lists performed workout summaries from SQLite.
  return (
    <ScrollView contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <Text style={sharedStyles.title}>History</Text>

      {workouts.length === 0 ? (
        <Text style={sharedStyles.emptyText}>No workouts saved yet.</Text>
      ) : (
        workouts.map((workout) => (
          <Pressable
            key={workout.id}
            onPress={() => openWorkout(workout.id)}
            style={styles.workoutRow}
          >
            <Text style={styles.workoutDate}>{formatTimestamp(workout.timestamp)}</Text>
            <Text style={sharedStyles.smallText}>
              {workout.exerciseCount} exercises, {workout.setCount} sets
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

// These local styles support the History list and detail rows.
const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  content: {
    paddingBottom: 24,
  },
  exerciseName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  setText: {
    color: '#e5e5ea',
    fontSize: 16,
  },
  workoutDate: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  workoutRow: {
    borderBottomColor: '#2c2c2e',
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
});
