import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
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
} from '../data/repository';
import type {
  CreateWorkoutTemplateInput,
  Exercise,
  FolderWithTemplates,
  WorkoutDashboardData,
  WorkoutTemplate,
  WorkoutTemplateExercise,
} from '../data/types';
import { ExercisesScreen } from './ExercisesScreen';
import { sharedStyles } from './sharedStyles';

// These local types describe screen-only refs and create-target state used by the Workout dashboard.
type FolderViewRef = ComponentRef<typeof View>;
type WorkoutTopTab = 'routines' | 'exercises';
type CreateTarget = {
  folderId: number | null;
};
type DeleteConfirmation = {
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
};
type RenameTarget = {
  kind: 'folder' | 'workout';
  id: number;
  name: string;
};

// This empty value lets WorkoutScreen render before repository.ts returns dashboard data.
const emptyDashboardData: WorkoutDashboardData = {
  folders: [],
  unassignedWorkouts: [],
};

const folderIcon = require('../assets/folder-icon.png');

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
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
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
  const nestedWorkoutScreenOpen = Boolean(selectedWorkoutId || selectedExercise);

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
        <ExerciseDetailPlaceholderScreen
          exercise={selectedExercise}
          onBack={() => setSelectedExercise(null)}
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
            Alert.alert('Start workout', 'Workout tracking will be added later.');
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
      <Text style={styles.dashboardTitle}>Workout</Text>

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

      <View
        style={[styles.topTabContent, activeTopTab !== 'routines' ? styles.hiddenTabContent : null]}
      >
        <FlatList
          ListFooterComponent={dashboardFooter}
          ListHeaderComponent={dashboardHeader}
          contentContainerStyle={styles.listContent}
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
        <ExercisesScreen isActive={activeTopTab === 'exercises'} />
      </View>
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
              style={[
                sharedStyles.button,
                sharedStyles.buttonDanger,
                styles.modalButton,
              ]}
            >
              <Text style={sharedStyles.buttonText}>Delete</Text>
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

  // This effect loads exercises from repository.ts so templates can reference the exercise catalog.
  useEffect(() => {
    getExercises().then(setExercises);
  }, []);

  // This handler validates the template name and passes the creation payload to WorkoutScreen.
  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Workout name required', 'Enter a workout name before saving it.');
      return;
    }

    await onSave({
      exerciseIds: selectedExerciseIds,
      folderId,
      name,
    });
  }

  // This derived list turns selected exercise IDs into display rows while preserving selection order.
  const selectedExercises = selectedExerciseIds
    .map((exerciseId) => exercises.find((exercise) => exercise.id === exerciseId))
    .filter((exercise): exercise is Exercise => Boolean(exercise));

  // This render section shows the template form, selected exercise order, and available exercises.
  return (
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
        </View>
      }
      contentContainerStyle={styles.createContent}
      data={exercises}
      keyExtractor={(exercise) => String(exercise.id)}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <View style={styles.exercisePickerRow}>
          <View style={styles.exerciseText}>
            <Text style={styles.exerciseName}>{item.name}</Text>
          </View>
          <Pressable
            onPress={() => setSelectedExerciseIds((current) => [...current, item.id])}
            style={sharedStyles.button}
          >
            <Text style={sharedStyles.buttonText}>Add</Text>
          </Pressable>
        </View>
      )}
      style={styles.screen}
    />
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
          <Ionicons color="#ffffff" name="chevron-back" size={30} />
        </Pressable>
        <Pressable onPress={onToggleMenu} style={styles.detailIconButton}>
          <Text style={styles.detailMenuText}>...</Text>
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
              Last performed: {formatLastPerformed(workout.lastPerformed) || '-'}
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

type ExerciseDetailPlaceholderScreenProps = {
  exercise: WorkoutTemplateExercise;
  onBack: () => void;
};

function ExerciseDetailPlaceholderScreen({
  exercise,
  onBack,
}: ExerciseDetailPlaceholderScreenProps) {
  return (
    <View style={styles.detailScreen}>
      <View style={styles.detailTopBar}>
        <Pressable onPress={onBack} style={styles.detailIconButton}>
          <Ionicons color="#ffffff" name="chevron-back" size={30} />
        </Pressable>
      </View>
      <View style={styles.exerciseDetailContent}>
        <Text style={styles.detailTitle}>{exercise.name}</Text>
        <Text style={styles.detailSubtitle}>{exercise.muscleGroup ?? 'Exercise'}</Text>
      </View>
    </View>
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
          <Text style={styles.folderMenuButtonText}>...</Text>
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
        <Text style={styles.menuButtonText}>...</Text>
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
  dashboardTitle: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  detailActionMenu: {
    backgroundColor: '#1c1c1e',
    borderColor: '#2c2c2e',
    borderRadius: 6,
    borderWidth: 1,
    elevation: 5,
    position: 'absolute',
    right: 16,
    top: 64,
    width: 180,
    zIndex: 8,
  },
  detailActionMenuItem: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  detailActionMenuText: {
    color: '#ffffff',
    fontSize: 18,
  },
  detailExerciseGroup: {
    color: '#a1a1a6',
    fontSize: 17,
    marginTop: 3,
  },
  detailExerciseName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  detailExerciseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minHeight: 76,
    paddingVertical: 10,
  },
  detailExerciseText: {
    flex: 1,
  },
  detailExerciseThumb: {
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  detailExerciseThumbText: {
    color: '#e5e5ea',
    fontSize: 16,
    fontWeight: '800',
  },
  detailHeader: {
    paddingBottom: 24,
  },
  detailIconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  detailListContent: {
    paddingHorizontal: 24,
    paddingBottom: 118,
  },
  detailMenuText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 24,
  },
  detailScreen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  detailSubtitle: {
    color: '#a1a1a6',
    fontSize: 20,
    lineHeight: 28,
    marginTop: 12,
  },
  detailTitle: {
    color: '#ffffff',
    fontSize: 42,
    fontWeight: '400',
  },
  detailTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
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
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  exerciseHelpText: {
    color: '#c7c7cc',
    fontSize: 28,
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
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
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
    padding: 16,
    position: 'absolute',
    right: 0,
  },
  startWorkoutButton: {
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 54,
  },
  startWorkoutButtonText: {
    color: '#ffffff',
    fontSize: 18,
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
