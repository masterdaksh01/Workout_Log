import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';

import { getWorkout, getWorkoutSummaries } from '../data/repository';
import type { WorkoutDetail, WorkoutSummary } from '../data/types';
import { sharedStyles } from './sharedStyles';

type RootTabParamList = {
  Workout: { initialTopTab?: 'routines' | 'exercises' } | undefined;
};

// This formatter turns repository timestamps into display text for the History list and detail views.
function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString();
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
        style={styles.workoutRow}
      >
        <View style={styles.workoutRowContent}>
          <View style={styles.workoutRowText}>
            <Text style={styles.workoutDate}>{formatTimestamp(workout.timestamp)}</Text>
            <Text style={sharedStyles.smallText}>
              {workout.exerciseCount} exercises, {workout.setCount} sets
            </Text>
          </View>
          <Ionicons color="#3a3a3c" name="chevron-forward" size={18} />
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
      <ScrollView contentContainerStyle={styles.content} style={sharedStyles.screen}>
        <Pressable
          onPress={() => setSelectedWorkout(null)}
          style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.backButton]}
        >
          <View style={styles.backButtonInner}>
            <Ionicons color="#e5e5ea" name="chevron-back" size={18} />
            <Text style={sharedStyles.buttonTextSecondary}>Back</Text>
          </View>
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
          workouts.map((workout, index) => (
            <AnimatedWorkoutRow
              key={workout.id}
              workout={workout}
              index={index}
              onPress={() => openWorkout(workout.id)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// These local styles support the History list and detail rows.
const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  backButtonInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  content: {
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 48,
    gap: 8,
  },
  exerciseName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
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
    letterSpacing: 0.3,
  },
  screen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  setRow: {
    borderBottomColor: '#1c1c1e',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  setText: {
    color: '#e5e5ea',
    fontSize: 17,
    letterSpacing: 0.2,
  },
  workoutDate: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  workoutRow: {
    borderBottomColor: '#2c2c2e',
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  workoutRowContent: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  workoutRowText: {
    flex: 1,
  },
});
