import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';

import { getWorkout, getWorkoutSummaries } from '../data/repository';
import type { WorkoutDetail, WorkoutSummary } from '../data/types';
import { sharedStyles } from './sharedStyles';

type RootTabParamList = {
  Workout: { initialTopTab?: 'routines' | 'exercises' } | undefined;
};

type WorkoutMonthGroup = {
  key: string;
  label: string;
  workouts: WorkoutSummary[];
};

function formatHistoryTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  const datePart = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  });
  const timePart = date
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
    .toLowerCase();

  return `${datePart} at ${timePart}`;
}

function formatMonthLabel(timestamp: string) {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'long' });
}

function formatWorkoutDuration(totalSeconds: number | null) {
  if (totalSeconds === null) {
    return '--';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.max(Math.round((totalSeconds % 3600) / 60), 0);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${minutes}m`;
}

function formatTotalWeight(totalWeight: number) {
  const roundedWeight = Math.round(totalWeight);

  return `${roundedWeight.toLocaleString('en-US')} kg`;
}

function getWorkoutTitle(workout: WorkoutSummary | WorkoutDetail) {
  return workout.name?.trim() || `Workout ${workout.id}`;
}

function groupWorkoutsByMonth(workouts: WorkoutSummary[]) {
  const groups: WorkoutMonthGroup[] = [];
  const groupByKey = new Map<string, WorkoutMonthGroup>();

  for (const workout of workouts) {
    const date = new Date(workout.timestamp);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    let group = groupByKey.get(key);

    if (!group) {
      group = {
        key,
        label: formatMonthLabel(workout.timestamp),
        workouts: [],
      };
      groupByKey.set(key, group);
      groups.push(group);
    }

    group.workouts.push(workout);
  }

  return groups;
}

function formatSetValue(
  set: WorkoutDetail['exercises'][number]['sets'][number],
  muscleGroup: WorkoutDetail['exercises'][number]['muscleGroup'],
) {
  if (muscleGroup === 'Cardio' && set.duration) {
    return set.duration;
  }

  return `${formatWeightValue(set.weight)} kg x ${set.reps}`;
}

function formatWeightValue(weight: number) {
  return Number.isInteger(weight) ? String(weight) : String(weight.toFixed(1));
}

function calculateOneRepMax(weight: number, reps: number) {
  return Math.round(weight * (1 + reps / 30));
}

function canShowOneRepMax(exercise: WorkoutDetail['exercises'][number]) {
  return exercise.muscleGroup !== 'Cardio' && exercise.sets.some((set) => set.weight > 0);
}

function getWorkoutTotalWeight(workout: WorkoutDetail) {
  return workout.exercises.reduce(
    (workoutTotal, exercise) =>
      workoutTotal +
      exercise.sets.reduce((exerciseTotal, set) => exerciseTotal + set.weight * set.reps, 0),
    0,
  );
}

// Animated workout row fades in when it first appears.
function AnimatedWorkoutRow({
  workout,
  index,
  onPress,
}: {
  workout: WorkoutSummary;
  index: number;
  onPress: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, index]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Pressable
        onPress={onPress}
        android_ripple={{ color: 'rgba(59,130,246,0.12)' }}
        style={({ pressed }) => [styles.workoutCard, pressed ? styles.workoutCardPressed : null]}
      >
        <Text numberOfLines={1} style={styles.workoutName}>
          {getWorkoutTitle(workout)}
        </Text>
        <Text style={styles.workoutDate}>{formatHistoryTimestamp(workout.timestamp)}</Text>

        <View style={styles.metricRow}>
          <View style={styles.metricItem}>
            <View style={styles.metricIcon}>
              <Ionicons color="#c7c7cc" name="time" size={22} />
            </View>
            <Text style={styles.metricText}>{formatWorkoutDuration(workout.durationSeconds)}</Text>
          </View>

          <View style={styles.metricItem}>
            <View style={styles.metricIcon}>
              <Ionicons color="#c7c7cc" name="barbell" size={22} />
            </View>
            <Text style={styles.metricText}>{formatTotalWeight(workout.totalWeight)}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// This screen reads performed workouts from repository.ts and shows either a list or one workout detail.
export function HistoryScreen() {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null);
  const groupedWorkouts = useMemo(() => groupWorkoutsByMonth(workouts), [workouts]);

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

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (selectedWorkout) {
          setSelectedWorkout(null);
          return true;
        }

        navigation.navigate('Workout', { initialTopTab: 'routines' });
        return true;
      });

      return () => subscription.remove();
    }, [navigation, selectedWorkout]),
  );

  // This handler opens a saved workout by loading its nested exercises and sets from repository.ts.
  async function openWorkout(id: number) {
    setSelectedWorkout(await getWorkout(id));
  }

  // This branch renders the detail view for the selected performed workout.
  if (selectedWorkout) {
    return (
      <ScrollView contentContainerStyle={styles.detailContent} style={styles.screen}>
        <Pressable
          onPress={() => setSelectedWorkout(null)}
          style={styles.detailBackButton}
        >
          <Ionicons color="#ffffff" name="chevron-back" size={24} />
        </Pressable>

        <Text numberOfLines={1} style={styles.detailTitle}>
          {getWorkoutTitle(selectedWorkout)}
        </Text>
        <Text style={styles.detailTimestamp}>{formatHistoryTimestamp(selectedWorkout.timestamp)}</Text>

        <View style={styles.detailExerciseList}>
          {selectedWorkout.exercises.map((exercise) => {
            const showOneRepMax = canShowOneRepMax(exercise);

            return (
              <View key={exercise.id} style={styles.detailExerciseSection}>
                <View style={styles.detailExerciseHeader}>
                  <Text numberOfLines={1} style={styles.exerciseName}>
                    {exercise.exerciseName}
                  </Text>
                  {showOneRepMax ? <Text style={styles.oneRepHeader}>1RM</Text> : null}
                </View>

                {exercise.sets.map((set, index) => (
                  <View key={set.id} style={styles.setRow}>
                    <Text style={styles.setNumber}>{index + 1}</Text>
                    <Text style={styles.setValue}>{formatSetValue(set, exercise.muscleGroup)}</Text>
                    {showOneRepMax ? (
                      <Text style={styles.oneRepValue}>{calculateOneRepMax(set.weight, set.reps)}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        <View style={styles.detailSummaryRow}>
          <View style={styles.detailSummaryItem}>
            <Ionicons color="#a1a1a6" name="time" size={18} />
            <Text style={styles.detailSummaryText}>
              {formatWorkoutDuration(selectedWorkout.durationSeconds)}
            </Text>
          </View>

          <View style={styles.detailSummaryItem}>
            <Ionicons color="#a1a1a6" name="barbell" size={18} />
            <Text style={styles.detailSummaryText}>
              {formatTotalWeight(getWorkoutTotalWeight(selectedWorkout))}
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  // This render section lists performed workout summaries from SQLite.
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {workouts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons color="#3a3a3c" name="barbell-outline" size={48} />
            <Text style={sharedStyles.emptyText}>No workouts saved yet.</Text>
          </View>
        ) : (
          groupedWorkouts.map((group) => (
            <View key={group.key} style={styles.monthSection}>
              <View style={styles.monthHeader}>
                <Text style={styles.monthTitle}>{group.label}</Text>
                <Text style={styles.monthCount}>
                  {group.workouts.length} {group.workouts.length === 1 ? 'workout' : 'workouts'}
                </Text>
              </View>

              {group.workouts.map((workout, index) => (
                <AnimatedWorkoutRow
                  key={workout.id}
                  workout={workout}
                  index={index}
                  onPress={() => openWorkout(workout.id)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// These local styles support the History list and detail rows.
const styles = StyleSheet.create({
  content: {
    paddingBottom: 28,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  detailBackButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    marginBottom: 12,
    marginLeft: -8,
    width: 36,
  },
  detailContent: {
    paddingBottom: 28,
    paddingHorizontal: 16,
    paddingTop: 28,
  },
  detailExerciseHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  detailExerciseList: {
    marginTop: 18,
  },
  detailExerciseSection: {
    marginBottom: 14,
  },
  detailSummaryItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  detailSummaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 28,
    marginTop: 18,
  },
  detailSummaryText: {
    color: '#ffffff',
    fontSize: 18,
  },
  detailTimestamp: {
    color: '#c7c7cc',
    fontSize: 18,
  },
  detailTitle: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '400',
    letterSpacing: 0,
    marginBottom: 34,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 48,
    gap: 8,
  },
  exerciseName: {
    color: '#ffffff',
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#000000',
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
    fontSize: 48,
    fontWeight: '300',
    letterSpacing: 0,
  },
  metricIcon: {
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  metricItem: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 10,
  },
  metricRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 28,
    marginTop: 28,
  },
  metricText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '500',
    letterSpacing: 0,
  },
  monthCount: {
    color: '#a1a1a6',
    fontSize: 20,
  },
  monthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthSection: {
    marginBottom: 26,
  },
  monthTitle: {
    color: '#ffffff',
    flex: 1,
    fontSize: 32,
    fontWeight: '800',
  },
  screen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  oneRepHeader: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
    width: 54,
  },
  oneRepValue: {
    color: '#c7c7cc',
    fontSize: 17,
    textAlign: 'right',
    width: 54,
  },
  setRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingTop: 6,
  },
  setNumber: {
    color: '#c7c7cc',
    fontSize: 17,
    width: 12,
  },
  setValue: {
    color: '#c7c7cc',
    flex: 1,
    fontSize: 17,
  },
  workoutCard: {
    backgroundColor: '#101012',
    borderColor: '#3a3a3c',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  workoutCardPressed: {
    borderColor: '#3b82f6',
  },
  workoutDate: {
    color: '#a1a1a6',
    fontSize: 22,
    marginTop: 12,
  },
  workoutName: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
  },
});
