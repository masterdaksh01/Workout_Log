import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';

import { getExercises, getExercisesByMuscleGroup } from '../data/repository';
import type { Exercise, MuscleGroup } from '../data/types';
import { sharedStyles } from './sharedStyles';

type BodyView = 'front' | 'back';
type CalloutSide = 'left' | 'right';
type ExerciseListFilter = MuscleGroup | 'All';

type MuscleCallout = {
  muscleGroup: MuscleGroup;
  lineLength: number;
  side: CalloutSide;
  top: number;
};
type ExerciseInfo = Pick<Exercise, 'muscleGroup' | 'name' | 'note' | 'personalBestReps' | 'personalBestWeight'>;
type RestTimerSettings = {
  workSet: number;
};
type ExercisesScreenProps = {
  isActive?: boolean;
  onNestedOpenChange?: (isOpen: boolean) => void;
};

const bodyImages = {
  front: require('../assets/body-front.png'),
  back: require('../assets/body-back.png'),
};
const defaultRestTimerSettings: RestTimerSettings = {
  workSet: 75,
};

// These front-view callouts position every requested label beside its approximate body region.
const frontCallouts: MuscleCallout[] = [
  { muscleGroup: 'Shoulders', lineLength: 27, side: 'left', top: 20 },
  { muscleGroup: 'Chest', lineLength: 80, side: 'right', top: 23.5 },
  { muscleGroup: 'Biceps', lineLength: 40, side: 'left', top: 30 },
  { muscleGroup: 'Abs', lineLength: 115, side: 'right', top: 32 },
  { muscleGroup: 'Forearms', lineLength: 10, side: 'left', top: 40 },
  { muscleGroup: 'Quads', lineLength: 75, side: 'right', top: 55 },
  { muscleGroup: 'Adductors', lineLength: 70, side: 'left', top: 55 },
];

// These back-view callouts position every requested label beside its approximate body region.
const backCallouts: MuscleCallout[] = [
  { muscleGroup: 'Neck', lineLength: 100, side: 'right', top: 12 },
  { muscleGroup: 'Traps', lineLength: 90, side: 'left', top: 18 },
  { muscleGroup: 'Triceps', lineLength: 35, side: 'right', top: 25 },
  { muscleGroup: 'Lats', lineLength: 90, side: 'left', top: 28 },
  { muscleGroup: 'Lower Back', lineLength: 70, side: 'right', top: 36 },
  { muscleGroup: 'Glutes', lineLength: 80, side: 'left', top: 43 },
  { muscleGroup: 'Hamstrings', lineLength: 40, side: 'right', top: 53 },
  { muscleGroup: 'Calves', lineLength: 65, side: 'left', top: 70 },
];

// This screen switches between a visual body browser and the selected muscle group's exercise list.
export function ExercisesScreen({
  isActive = true,
  onNestedOpenChange,
}: ExercisesScreenProps) {
  const [bodyView, setBodyView] = useState<BodyView>('front');
  const [selectedFilter, setSelectedFilter] = useState<ExerciseListFilter | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  // This loader queries either every exercise or the selected visual muscle group.
  const loadExercises = useCallback(async (filter: ExerciseListFilter) => {
    setExercises(filter === 'All' ? await getExercises() : await getExercisesByMuscleGroup(filter));
  }, []);

  // This focus effect refreshes an open detail view after its exercise data may have changed.
  useFocusEffect(
    useCallback(() => {
      if (selectedFilter) {
        loadExercises(selectedFilter);
      }
    }, [loadExercises, selectedFilter]),
  );

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!isActive) {
          return false;
        }

        if (selectedExercise) {
          setSelectedExercise(null);
          return true;
        }

        if (selectedFilter) {
          setSelectedFilter(null);
          return true;
        }

        return false;
      });

      return () => subscription.remove();
    }, [isActive, selectedExercise, selectedFilter]),
  );

  useEffect(() => {
    onNestedOpenChange?.(Boolean(selectedExercise));

    return () => {
      if (selectedExercise) {
        onNestedOpenChange?.(false);
      }
    };
  }, [onNestedOpenChange, selectedExercise]);

  // This handler opens the exercise list for a clicked filter label.
  async function openExerciseList(filter: ExerciseListFilter) {
    setSelectedFilter(filter);
    await loadExercises(filter);
  }

  // This branch displays exercises assigned to the label selected in the visual browser.
  if (selectedFilter) {
    if (selectedExercise) {
      return (
        <ExerciseInfoScreen
          exercise={selectedExercise}
          onBack={() => setSelectedExercise(null)}
        />
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.detailContent} style={sharedStyles.screen}>
        <Pressable
          onPress={() => setSelectedFilter(null)}
          style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.backButton]}
        >
          <Text style={sharedStyles.buttonTextSecondary}>Back</Text>
        </Pressable>

        <Text style={sharedStyles.title}>Exercises</Text>
        <Text style={styles.muscleGroupTitle}>{selectedFilter}</Text>

        {exercises.length === 0 ? (
          <Text style={sharedStyles.emptyText}>No exercises assigned to this muscle group.</Text>
        ) : (
          exercises.map((exercise) => (
            <Pressable
              key={exercise.id}
              android_ripple={{ color: 'rgba(255,255,255,0.06)' }}
              style={styles.exerciseRow}
            >
              <View style={styles.exerciseText}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
              </View>
              <Pressable
                accessibilityLabel={`Show info for ${exercise.name}`}
                onPress={() => setSelectedExercise(exercise)}
                style={({ pressed }) => [styles.infoButton, pressed ? styles.infoButtonPressed : null]}
              >
                <Ionicons color="#ffffff" name="information" size={19} />
              </Pressable>
            </Pressable>
          ))
        )}
      </ScrollView>
    );
  }

  const callouts = bodyView === 'front' ? frontCallouts : backCallouts;

  // This render section layers native clickable labels and leader lines around a non-clickable body image.
  return (
    <ScrollView contentContainerStyle={styles.browserContent} style={styles.screen}>
      <Text style={sharedStyles.title}>Exercises</Text>

      <View style={styles.diagram}>
        <Image
          accessible={false}
          resizeMode="contain"
          source={bodyImages[bodyView]}
          style={[styles.bodyImage, bodyView === 'front' ? styles.frontBodyImage : null]}
        />

        {callouts.map((callout) => (
          <MuscleGroupCallout
            key={`${bodyView}-${callout.muscleGroup}`}
            callout={callout}
            onPress={openExerciseList}
          />
        ))}

        <Pressable
          hitSlop={6}
          onPress={() => openExerciseList('All')}
          style={({ pressed }) => [styles.allButton, pressed ? styles.actionButtonPressed : null]}
        >
          <Ionicons color="#ffffff" name="list" size={14} />
          <Text numberOfLines={1} style={styles.actionButtonText}>
            All
          </Text>
        </Pressable>

        <Pressable
          hitSlop={6}
          onPress={() => openExerciseList('Cardio')}
          style={({ pressed }) => [styles.cardioButton, pressed ? styles.actionButtonPressed : null]}
        >
          <Ionicons color="#ffffff" name="bicycle" size={14} />
          <Text numberOfLines={1} style={styles.actionButtonText}>
            Cardio
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setBodyView((current) => (current === 'front' ? 'back' : 'front'))}
          style={styles.rotateButton}
        >
          <Ionicons color="#ffffff" name="sync" size={16} />
          <Text style={styles.rotateButtonText}>Rotate</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

type ExerciseInfoScreenProps = {
  exercise: ExerciseInfo;
  onBack: () => void;
};

export function ExerciseInfoScreen({ exercise, onBack }: ExerciseInfoScreenProps) {
  const [showRestTimerSettings, setShowRestTimerSettings] = useState(false);
  const [restTimerSettings, setRestTimerSettings] = useState(defaultRestTimerSettings);

  return (
    <>
      <ScrollView contentContainerStyle={styles.exerciseDetailContent} style={styles.exerciseDetailScreen}>
        <View style={styles.exerciseDetailHeader}>
          <Pressable
            accessibilityLabel="Back to exercises"
            hitSlop={10}
            onPress={onBack}
            style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}
          >
            <Ionicons color="#ffffff" name="chevron-back" size={34} />
          </Pressable>

          <Text numberOfLines={1} style={styles.exerciseDetailTitle}>
            {exercise.name}
          </Text>

        </View>

        <View style={styles.aboutContent}>
          <Text style={styles.aboutHeading}>BODY PART</Text>
          <Text style={styles.aboutValue}>{exercise.muscleGroup ?? 'Unassigned'}</Text>

          <Text style={styles.aboutHeading}>CATEGORY</Text>
          <Text style={styles.aboutValue}>
            {exercise.muscleGroup === 'Cardio' ? 'Duration' : 'Weight and reps'}
          </Text>

          <Text style={styles.aboutHeading}>PERSONAL BEST</Text>
          {exercise.personalBestWeight !== null && exercise.personalBestReps !== null ? (
            <View style={styles.personalBestRow}>
              <View style={styles.personalBestMetric}>
                <Text style={styles.personalBestValue}>{formatWeightValue(exercise.personalBestWeight)}</Text>
                <Text style={styles.personalBestLabel}>weight</Text>
              </View>
              <View style={styles.personalBestMetric}>
                <Text style={styles.personalBestValue}>{exercise.personalBestReps}</Text>
                <Text style={styles.personalBestLabel}>reps</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.aboutValue}>No sets yet</Text>
          )}

          {exercise.note.trim() ? (
            <>
              <Text style={styles.aboutHeading}>NOTE</Text>
              <Text style={styles.exerciseNote}>{exercise.note}</Text>
            </>
          ) : null}

          <Text style={styles.aboutHeading}>PREFERENCES</Text>
          <Pressable
            onPress={() => setShowRestTimerSettings(true)}
            style={({ pressed }) => [styles.preferenceRow, pressed ? styles.preferenceRowPressed : null]}
          >
            <View style={styles.preferenceTextGroup}>
              <Text style={styles.preferenceText}>Rest Timer Settings</Text>
              <Text style={styles.preferenceSummary}>
                Work set {formatRestTimerValue(restTimerSettings.workSet)}
              </Text>
            </View>
            <Ionicons color="#8e8e93" name="chevron-forward" size={20} />
          </Pressable>
        </View>
      </ScrollView>

      <RestTimerSettingsModal
        exerciseName={exercise.name}
        onClose={() => setShowRestTimerSettings(false)}
        onSave={(settings) => {
          setRestTimerSettings(settings);
          setShowRestTimerSettings(false);
        }}
        settings={restTimerSettings}
        visible={showRestTimerSettings}
      />
    </>
  );
}

type MuscleGroupCalloutProps = {
  callout: MuscleCallout;
  onPress: (filter: ExerciseListFilter) => void;
};

// This component joins one clickable label to the body with a horizontal leader line and endpoint dot.
function MuscleGroupCallout({ callout, onPress }: MuscleGroupCalloutProps) {
  const label = (
    <Pressable
      hitSlop={6}
      onPress={() => onPress(callout.muscleGroup)}
      style={({ pressed }) => [styles.labelButton, pressed ? styles.labelButtonPressed : null]}
    >
      <Text numberOfLines={1} style={styles.labelText}>
        {callout.muscleGroup}
      </Text>
    </Pressable>
  );
  const line = (
    <View style={[styles.leaderLine, { width: callout.lineLength }]}>
      <View
        style={[
          styles.leaderDot,
          callout.side === 'left' ? styles.leaderDotRight : styles.leaderDotLeft,
        ]}
      />
    </View>
  );

  return (
    <View
      style={[
        styles.callout,
        callout.side === 'left' ? styles.calloutLeft : styles.calloutRight,
        { top: `${callout.top}%` },
      ]}
    >
      {callout.side === 'left' ? (
        <>
          {label}
          {line}
        </>
      ) : (
        <>
          {line}
          {label}
        </>
      )}
    </View>
  );
}

type RestTimerSettingsModalProps = {
  exerciseName: string;
  onClose: () => void;
  onSave: (settings: RestTimerSettings) => void;
  settings: RestTimerSettings;
  visible: boolean;
};

function RestTimerSettingsModal({
  exerciseName,
  onClose,
  onSave,
  settings,
  visible,
}: RestTimerSettingsModalProps) {
  const [draftSettings, setDraftSettings] = useState(settings);

  useEffect(() => {
    if (visible) {
      setDraftSettings(settings);
    }
  }, [settings, visible]);

  function changeTimerValue(direction: -1 | 1) {
    setDraftSettings((current) => {
      const nextValue = Math.max(15, current.workSet + direction * 15);

      return {
        ...current,
        workSet: nextValue,
      };
    });
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <BlurView intensity={35} style={styles.modalOverlay} tint="dark">
        <View style={styles.restTimerDialog}>
          <Text style={styles.restTimerTitle}>Rest Timer Settings</Text>
          <Text style={styles.restTimerMessage}>
            When a new set is added, rest timers will be added automatically according to the settings below.
          </Text>

          <View style={styles.timerRows}>
            <TimerSettingRow
              label="Work set"
              onDecrease={() => changeTimerValue(-1)}
              onIncrease={() => changeTimerValue(1)}
              value={draftSettings.workSet}
            />
          </View>

          <Pressable
            onPress={() => onSave(draftSettings)}
            style={({ pressed }) => [styles.saveTimerButton, pressed ? styles.infoButtonPressed : null]}
          >
            <Text style={styles.saveTimerButtonText}>SAVE SETTINGS FOR EXERCISE</Text>
          </Pressable>

          <Text style={styles.restTimerFootnote}>
            Default rest timer durations can be changed in Strong settings for {exerciseName}.
          </Text>
        </View>
      </BlurView>
    </Modal>
  );
}

function TimerSettingRow({
  label,
  onDecrease,
  onIncrease,
  value,
}: {
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
  value: number | null;
}) {
  return (
    <View style={styles.timerRow}>
      <Text style={styles.timerLabel}>{label}</Text>
      <View style={styles.timerControls}>
        <Pressable
          accessibilityLabel={`Decrease ${label} rest timer`}
          onPress={onDecrease}
          style={({ pressed }) => [styles.timerAdjustButton, pressed ? styles.iconButtonPressed : null]}
        >
          <Ionicons color="#ffffff" name="remove" size={18} />
        </Pressable>
        <View style={styles.timerValuePill}>
          <Text style={styles.timerValue}>{formatRestTimerValue(value)}</Text>
        </View>
        <Pressable
          accessibilityLabel={`Increase ${label} rest timer`}
          onPress={onIncrease}
          style={({ pressed }) => [styles.timerAdjustButton, pressed ? styles.iconButtonPressed : null]}
        >
          <Ionicons color="#ffffff" name="add" size={18} />
        </Pressable>
      </View>
    </View>
  );
}

function formatRestTimerValue(seconds: number | null) {
  if (seconds === null) {
    return 'None';
  }

  return formatWorkoutDuration(seconds);
}

function formatWorkoutDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatWeightValue(weight: number) {
  return Number.isInteger(weight) ? `${weight}` : `${weight.toFixed(1)}`;
}

// These styles create the dark visual browser, callout geometry, and selected-group exercise list.
const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
    marginTop: 5,
  },
  bodyImage: {
    height: '100%',
    left: 0,
    position: 'absolute',
    top: 0,
    width: '100%',
  },
  browserContent: {
    padding: 16,
    paddingBottom: 28,
  },
  callout: {
    alignItems: 'center',
    flexDirection: 'row',
    position: 'absolute',
    zIndex: 2,
  },
  calloutLeft: {
    left: 0,
  },
  calloutRight: {
    right: 0,
  },
  cardioButton: {
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    bottom: 8,
    flexDirection: 'row',
    gap: 4,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 10,
    position: 'absolute',
    right: 125,
    width: 78,
    zIndex: 3,
  },
  allButton: {
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    bottom: 8,
    flexDirection: 'row',
    gap: 4,
    height: 38,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 10,
    position: 'absolute',
    right: 0,
    width: 78,
    zIndex: 3,
  },
  actionButtonPressed: {
    backgroundColor: '#2563eb',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  confirmButton: {
    minWidth: 92,
  },
  confirmDialog: {
    backgroundColor: '#000000',
    borderRadius: 8,
    maxWidth: 420,
    padding: 16,
    width: '100%',
  },
  confirmMessage: {
    color: '#c7c7cc',
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 18,
  },
  confirmTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  detailContent: {
    paddingBottom: 24,
  },
  diagram: {
    alignSelf: 'center',
    height: 620,
    maxWidth: 480,
    position: 'relative',
    width: '100%',
  },
  exerciseName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  exerciseRow: {
    alignItems: 'center',
    borderBottomColor: '#2c2c2e',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  exerciseText: {
    flex: 1,
  },
  aboutContent: {
    padding: 16,
  },
  aboutHeading: {
    color: '#a1a1a6',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 18,
    textTransform: 'uppercase',
  },
  aboutValue: {
    color: '#ffffff',
    fontSize: 20,
    marginBottom: 16,
  },
  exerciseNote: {
    backgroundColor: '#1c1c1e',
    borderColor: '#3a3a3c',
    borderRadius: 6,
    borderWidth: 1,
    color: '#ffffff',
    fontSize: 17,
    lineHeight: 24,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  exerciseDetailContent: {
    paddingBottom: 28,
  },
  exerciseDetailHeader: {
    alignItems: 'center',
    backgroundColor: '#000000',
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 8,
    paddingTop: 9,
  },
  exerciseDetailScreen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  exerciseDetailTitle: {
    color: '#ffffff',
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
  },
  frontBodyImage: {
    transform: [{ scale: 1.05 }],
  },
  iconButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  iconButtonPressed: {
    opacity: 0.7,
  },
  infoButton: {
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  infoButtonPressed: {
    backgroundColor: '#2563eb',
  },
  labelButton: {
    backgroundColor: '#1c1c1e',
    borderColor: '#3a3a3c',
    borderLeftColor: '#3b82f6',
    borderLeftWidth: 2,
    borderRadius: 5,
    borderWidth: 1,
    maxWidth: 96,
    minHeight: 30,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  labelButtonPressed: {
    backgroundColor: '#2c2c2e',
  },
  labelText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  leaderDot: {
    backgroundColor: '#3b82f6',
    borderRadius: 3,
    height: 5,
    position: 'absolute',
    top: -2,
    width: 5,
  },
  leaderDotLeft: {
    left: -2,
  },
  leaderDotRight: {
    right: -2,
  },
  leaderLine: {
    backgroundColor: '#3b82f6',
    height: 1,
    position: 'relative',
    width: 22,
  },
  muscleGroupTitle: {
    color: '#3b82f6',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: -8,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  personalBestLabel: {
    color: '#8e8e93',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  personalBestMetric: {
    backgroundColor: '#1c1c1e',
    borderColor: '#3a3a3c',
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minHeight: 76,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  personalBestRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  personalBestValue: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  preferenceRow: {
    alignItems: 'center',
    borderRadius: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    minHeight: 48,
    width: '100%',
    paddingVertical: 6,
  },
  preferenceRowPressed: {
    opacity: 0.75,
  },
  preferenceText: {
    color: '#ffffff',
    fontSize: 18,
  },
  preferenceTextGroup: {
    flex: 1,
    gap: 4,
  },
  preferenceSummary: {
    color: '#8e8e93',
    fontSize: 14,
  },
  restTimerDialog: {
    backgroundColor: '#1c1c1e',
    borderColor: '#3a3a3c',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 420,
    padding: 20,
    width: '100%',
  },
  restTimerFootnote: {
    color: '#c7c7cc',
    fontSize: 16,
    lineHeight: 22,
    marginTop: 24,
  },
  restTimerMessage: {
    color: '#ffffff',
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 26,
  },
  restTimerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
  },
  rotateButton: {
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    bottom: 8,
    flexDirection: 'row',
    gap: 4,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 10,
    position: 'absolute',
    right: 6,
    width: 78,
    zIndex: 3,
  },
  rotateButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  screen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  saveTimerButton: {
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 5,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  saveTimerButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
  },
  timerLabel: {
    color: '#ffffff',
    flex: 1,
    fontSize: 18,
  },
  timerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    minHeight: 56,
  },
  timerRows: {
    gap: 8,
  },
  timerAdjustButton: {
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
    borderColor: '#3a3a3c',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  timerControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  timerValue: {
    color: '#d8d8dc',
    fontSize: 18,
  },
  timerValuePill: {
    alignItems: 'center',
    backgroundColor: '#252525',
    borderRadius: 8,
    minWidth: 118,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
});
