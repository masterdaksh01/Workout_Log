import { useCallback, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { deleteExercise, getExercisesByMuscleGroup } from '../data/repository';
import type { Exercise, MuscleGroup } from '../data/types';
import { sharedStyles } from './sharedStyles';

type BodyView = 'front' | 'back';
type CalloutSide = 'left' | 'right';

type MuscleCallout = {
  muscleGroup: MuscleGroup;
  lineLength: number;
  side: CalloutSide;
  top: number;
};

const bodyImages = {
  front: require('../assets/body-front.png'),
  back: require('../assets/body-back.png'),
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
export function ExercisesScreen() {
  const [bodyView, setBodyView] = useState<BodyView>('front');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<MuscleGroup | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseToDelete, setExerciseToDelete] = useState<Exercise | null>(null);

  // This loader queries only exercises assigned to the selected visual muscle group.
  const loadMuscleGroup = useCallback(async (muscleGroup: MuscleGroup) => {
    setExercises(await getExercisesByMuscleGroup(muscleGroup));
  }, []);

  // This focus effect refreshes an open detail view after its exercise data may have changed.
  useFocusEffect(
    useCallback(() => {
      if (selectedMuscleGroup) {
        loadMuscleGroup(selectedMuscleGroup);
      }
    }, [loadMuscleGroup, selectedMuscleGroup]),
  );

  // This handler opens the exercise list for a clicked muscle-group label.
  async function openMuscleGroup(muscleGroup: MuscleGroup) {
    setSelectedMuscleGroup(muscleGroup);
    await loadMuscleGroup(muscleGroup);
  }

  // This handler preserves existing exercise deletion and refreshes the active muscle group.
  async function handleDeleteExercise(id: number) {
    await deleteExercise(id);
    setExerciseToDelete(null);

    if (selectedMuscleGroup) {
      await loadMuscleGroup(selectedMuscleGroup);
    }
  }

  // This branch displays exercises assigned to the label selected in the visual browser.
  if (selectedMuscleGroup) {
    return (
      <>
        <ScrollView contentContainerStyle={styles.detailContent} style={sharedStyles.screen}>
          <Pressable
            onPress={() => setSelectedMuscleGroup(null)}
            style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.backButton]}
          >
            <Text style={sharedStyles.buttonTextSecondary}>Back</Text>
          </Pressable>

          <Text style={sharedStyles.title}>Exercises</Text>
          <Text style={styles.muscleGroupTitle}>{selectedMuscleGroup}</Text>

          {exercises.length === 0 ? (
            <Text style={sharedStyles.emptyText}>No exercises assigned to this muscle group.</Text>
          ) : (
            exercises.map((exercise) => (
              <View key={exercise.id} style={styles.exerciseRow}>
                <View style={styles.exerciseText}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                </View>
                <Pressable
                  onPress={() => setExerciseToDelete(exercise)}
                  style={[sharedStyles.button, sharedStyles.buttonDanger]}
                >
                  <Text style={sharedStyles.buttonText}>Delete</Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>

        <Modal
          animationType="fade"
          onRequestClose={() => setExerciseToDelete(null)}
          transparent
          visible={exerciseToDelete !== null}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.confirmDialog}>
              <Text style={styles.confirmTitle}>Delete exercise?</Text>
              <Text style={styles.confirmMessage}>
                {exerciseToDelete
                  ? `This will permanently remove ${exerciseToDelete.name} from the database.`
                  : 'This will permanently remove this exercise from the database.'}
              </Text>

              <View style={styles.confirmActions}>
                <Pressable
                  onPress={() => setExerciseToDelete(null)}
                  style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.confirmButton]}
                >
                  <Text style={sharedStyles.buttonTextSecondary}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (exerciseToDelete) {
                      handleDeleteExercise(exerciseToDelete.id);
                    }
                  }}
                  style={[sharedStyles.button, sharedStyles.buttonDanger, styles.confirmButton]}
                >
                  <Text style={sharedStyles.buttonText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </>
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
            onPress={openMuscleGroup}
          />
        ))}

        <Pressable
          hitSlop={6}
          onPress={() => openMuscleGroup('Cardio')}
          style={({ pressed }) => [
            styles.labelButton,
            styles.cardioButton,
            pressed ? styles.labelButtonPressed : null,
          ]}
        >
          <Text numberOfLines={1} style={styles.labelText}>
            Cardio
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setBodyView((current) => (current === 'front' ? 'back' : 'front'))}
          style={styles.rotateButton}
        >
          <Text style={styles.rotateButtonText}>Rotate</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

type MuscleGroupCalloutProps = {
  callout: MuscleCallout;
  onPress: (muscleGroup: MuscleGroup) => void;
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

// These styles create the dark visual browser, callout geometry, and selected-group exercise list.
const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
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
    bottom: 8,
    left: 6,
    position: 'absolute',
    zIndex: 3,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmButton: {
    flex: 1,
  },
  confirmDialog: {
    backgroundColor: '#1c1c1e',
    borderColor: '#3a3a3c',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    width: '100%',
  },
  confirmMessage: {
    color: '#a1a1a6',
    lineHeight: 20,
    marginBottom: 18,
  },
  confirmTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
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
  frontBodyImage: {
    transform: [{ scale: 1.05 }],
  },
  labelButton: {
    backgroundColor: '#1c1c1e',
    borderColor: '#3a3a3c',
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
    backgroundColor: '#8e8e93',
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
    backgroundColor: '#8e8e93',
    height: 1,
    position: 'relative',
    width: 22,
  },
  muscleGroupTitle: {
    color: '#8e8e93',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: -8,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  rotateButton: {
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    bottom: 8,
    minHeight: 38,
    paddingHorizontal: 14,
    position: 'absolute',
    right: 6,
    justifyContent: 'center',
    zIndex: 3,
  },
  rotateButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  screen: {
    backgroundColor: '#000000',
    flex: 1,
  },
});
