import { useCallback, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';

import {
  addProfileMetricEntry,
  getProfileMetricEntries,
  getProfileSettings,
  saveProfileSettings,
} from '../data/repository';
import type { ProfileMetricEntry, ProfileMetricKey, ProfileSettings } from '../data/types';

type RootTabParamList = {
  Workout: { initialTopTab?: 'routines' | 'exercises' } | undefined;
};

const emptyProfileSettings: ProfileSettings = {
  name: '',
  age: '',
  weight: '',
  bodyFatPercentage: '',
  calorieIntake: '',
  theme: 'dark',
  timerSound: 'david',
  soundEffectsEnabled: false,
};

const themeOptions = ['dark', 'light'] as const;
type ThemeOption = (typeof themeOptions)[number];

const metricLabels: Record<ProfileMetricKey, string> = {
  weight: 'Weight',
  bodyFatPercentage: 'Body fat%',
  calorieIntake: 'Caloric intake',
};

const metricUnits: Record<ProfileMetricKey, string> = {
  weight: 'kg',
  bodyFatPercentage: '%',
  calorieIntake: 'kcal',
};

// This settings screen keeps profile fields intentionally simple so more fields can be added later.
export function ProfileScreen() {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const [settings, setSettings] = useState<ProfileSettings>(emptyProfileSettings);
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [isLightThemeWindowVisible, setIsLightThemeWindowVisible] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<ProfileMetricKey | null>(null);
  const [metricEntries, setMetricEntries] = useState<ProfileMetricEntry[]>([]);
  const [isMetricEntryVisible, setIsMetricEntryVisible] = useState(false);
  const [metricEntryDate, setMetricEntryDate] = useState(formatDateInputValue(new Date()));
  const [metricEntryValue, setMetricEntryValue] = useState('');

  const loadSettings = useCallback(async () => {
    const savedSettings = await getProfileSettings();
    const nextSettings = { ...savedSettings, theme: normalizeTheme(savedSettings.theme) };

    setSettings(nextSettings);
    if (savedSettings.theme !== nextSettings.theme) {
      await saveProfileSettings(nextSettings);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings]),
  );

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isMetricEntryVisible) {
          setIsMetricEntryVisible(false);
          return true;
        }

        if (selectedMetric) {
          setSelectedMetric(null);
          return true;
        }

        if (isLightThemeWindowVisible) {
          setIsLightThemeWindowVisible(false);
          return true;
        }

        navigation.navigate('Workout', { initialTopTab: 'routines' });
        return true;
      });

      return () => subscription.remove();
    }, [isLightThemeWindowVisible, isMetricEntryVisible, navigation, selectedMetric]),
  );

  function updateSetting<Key extends keyof ProfileSettings>(key: Key, value: ProfileSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function persistSetting<Key extends keyof ProfileSettings>(
    key: Key,
    value: ProfileSettings[Key],
  ) {
    const nextSettings = { ...settings, [key]: value };

    setSettings(nextSettings);
    await saveProfileSettings(nextSettings);
  }

  function selectTheme(theme: ThemeOption) {
    setIsThemeDropdownOpen(false);

    if (theme === 'light') {
      setSettings((current) => ({ ...current, theme: 'dark' }));
      setIsLightThemeWindowVisible(true);
      return;
    }

    persistSetting('theme', theme);
  }

  async function openMetric(metric: ProfileMetricKey) {
    setSelectedMetric(metric);
    setIsMetricEntryVisible(false);
    setMetricEntryDate(formatDateInputValue(new Date()));
    setMetricEntryValue('');
    setMetricEntries(await getProfileMetricEntries(metric));
  }

  function openMetricEntryWindow() {
    setMetricEntryDate(formatDateInputValue(new Date()));
    setMetricEntryValue('');
    setIsMetricEntryVisible(true);
  }

  async function saveMetricEntry() {
    if (!selectedMetric) {
      return;
    }

    const trimmedValue = metricEntryValue.trim();

    if (!trimmedValue) {
      return;
    }

    const nextSettings = { ...settings, [selectedMetric]: trimmedValue };
    const entry = await addProfileMetricEntry(selectedMetric, trimmedValue, metricEntryDate);

    if (entry) {
      setSettings(nextSettings);
      await saveProfileSettings(nextSettings);
      setMetricEntries((current) => [entry, ...current]);
      setMetricEntryValue('');
      setIsMetricEntryVisible(false);
    }
  }

  if (selectedMetric) {
    return (
      <>
        <MetricDetailScreen
          entries={metricEntries}
          metric={selectedMetric}
          onAdd={openMetricEntryWindow}
          onBack={() => setSelectedMetric(null)}
        />
        <MetricEntryWindow
          date={metricEntryDate}
          isVisible={isMetricEntryVisible}
          metric={selectedMetric}
          onChangeDate={setMetricEntryDate}
          onChangeValue={setMetricEntryValue}
          onClose={() => setIsMetricEntryVisible(false)}
          onSave={saveMetricEntry}
          value={metricEntryValue}
        />
      </>
    );
  }

  if (isLightThemeWindowVisible) {
    return (
      <View style={styles.lightThemeWindow}>
        <Text style={styles.lightThemeText}>Balright boomer</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsLightThemeWindowVisible(false)}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <SettingsInputRow
            label="Name"
            onBlur={() => saveProfileSettings(settings)}
            onChangeText={(value) => updateSetting('name', value)}
            placeholder="Add name"
            value={settings.name}
          />
          <SettingsInputRow
            keyboardType="number-pad"
            label="Age"
            onBlur={() => saveProfileSettings(settings)}
            onChangeText={(value) => updateSetting('age', value)}
            placeholder="Add age"
            value={settings.age}
          />
          <MetricSummaryRow
            metric="weight"
            onPress={() => openMetric('weight')}
            value={settings.weight}
          />
          <MetricSummaryRow
            metric="bodyFatPercentage"
            onPress={() => openMetric('bodyFatPercentage')}
            value={settings.bodyFatPercentage}
          />
          <MetricSummaryRow
            metric="calorieIntake"
            onPress={() => openMetric('calorieIntake')}
            value={settings.calorieIntake}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <ThemeDropdownRow
            label="Theme"
            isOpen={isThemeDropdownOpen}
            onSelect={selectTheme}
            onToggle={() => setIsThemeDropdownOpen((isOpen) => !isOpen)}
            value={normalizeTheme(settings.theme)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workout</Text>
          <SettingsInputRow
            label="Timer sound"
            onBlur={() => saveProfileSettings(settings)}
            onChangeText={(value) => updateSetting('timerSound', value)}
            placeholder="david"
            value={settings.timerSound}
          />
          <Text style={styles.rowSubtext}>Import a timer sound file</Text>
          <SettingsSwitchRow
            enabled={settings.soundEffectsEnabled}
            label="Sound Effects"
            onChange={(enabled) => persistSetting('soundEffectsEnabled', enabled)}
            sublabel="Doesn't include the rest timer alert"
          />
        </View>
      </ScrollView>
    </View>
  );
}

type MetricSummaryRowProps = {
  metric: ProfileMetricKey;
  value: string;
  onPress: () => void;
};

function MetricSummaryRow({ metric, value, onPress }: MetricSummaryRowProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.metricSummaryRow}>
      <Text style={styles.metricSummaryLabel}>{metricLabels[metric]}</Text>
      <Text numberOfLines={1} style={styles.metricSummaryValue}>
        {formatMetricValue(metric, value)}
      </Text>
    </Pressable>
  );
}

type MetricDetailScreenProps = {
  metric: ProfileMetricKey;
  entries: ProfileMetricEntry[];
  onAdd: () => void;
  onBack: () => void;
};

function MetricDetailScreen({ metric, entries, onAdd, onBack }: MetricDetailScreenProps) {
  return (
    <View style={styles.metricScreen}>
      <View style={styles.metricHeader}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.metricBackButton}>
          <Ionicons color="#ffffff" name="chevron-back" size={34} />
        </Pressable>
        <Text style={styles.metricTitle}>{metricLabels[metric]}</Text>
      </View>

      <View style={styles.metricChartCard}>
        <Text style={styles.metricChartTitle}>{metricLabels[metric]}</Text>
        <View style={styles.metricChartBody}>
          {entries.length === 0 ? (
            <Text style={styles.metricChartText}>No entries yet</Text>
          ) : (
            <MetricTrendChart entries={entries} metric={metric} />
          )}
        </View>
      </View>

      <View style={styles.metricHistoryHeader}>
        <Text style={styles.metricHistoryTitle}>HISTORY</Text>
        <Pressable accessibilityRole="button" onPress={onAdd} hitSlop={12}>
          <Text style={styles.metricAddText}>+</Text>
        </Pressable>
      </View>

      {entries.length === 0 ? (
        <Text style={styles.metricEmptyText}>No entries yet</Text>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={styles.metricHistoryRow}>
            <Text style={styles.metricHistoryDate}>{formatEntryTimestamp(entry.timestamp)}</Text>
            <Text style={styles.metricHistoryValue}>
              {formatMetricValue(metric, entry.value)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

type MetricTrendChartProps = {
  metric: ProfileMetricKey;
  entries: ProfileMetricEntry[];
};

function MetricTrendChart({ metric, entries }: MetricTrendChartProps) {
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [plotSize, setPlotSize] = useState({ width: 0, height: 0 });
  const chartData = buildMetricChartData(entries);

  if (!chartData) {
    return <Text style={styles.metricChartText}>No numeric values yet</Text>;
  }

  const selectedPoint =
    chartData.points.find((point) => point.id === selectedPointId) ??
    chartData.points[chartData.points.length - 1];
  const lineSegments =
    plotSize.width > 0 && plotSize.height > 0
      ? chartData.points.slice(1).map((point, index) => {
          const previousPoint = chartData.points[index];
          const x1 = (previousPoint.left / 100) * plotSize.width;
          const y1 = (previousPoint.top / 100) * plotSize.height;
          const x2 = (point.left / 100) * plotSize.width;
          const y2 = (point.top / 100) * plotSize.height;
          const deltaX = x2 - x1;
          const deltaY = y2 - y1;

          return {
            id: `${previousPoint.id}-${point.id}`,
            angle: `${Math.atan2(deltaY, deltaX)}rad`,
            left: (x1 + x2 - Math.sqrt(deltaX * deltaX + deltaY * deltaY)) / 2,
            length: Math.sqrt(deltaX * deltaX + deltaY * deltaY),
            top: (y1 + y2) / 2,
          };
        })
      : [];

  function updatePlotSize(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setPlotSize({ width, height });
  }

  return (
    <View style={styles.metricChart}>
      <View style={styles.metricChartFrame}>
        <View style={styles.metricPlotArea} onLayout={updatePlotSize}>
          <View style={[styles.metricGridLine, styles.metricGridLineTop]} />
          <View style={[styles.metricGridLine, styles.metricGridLineMiddle]} />
          <View style={[styles.metricGridLine, styles.metricGridLineBottom]} />
          {lineSegments.map((segment) => (
            <View
              key={segment.id}
              style={[
                styles.metricLineSegment,
                {
                  left: segment.left,
                  top: segment.top,
                  transform: [{ rotateZ: segment.angle }],
                  width: segment.length,
                },
              ]}
            />
          ))}
          {selectedPoint ? (
            <>
              <View
                style={[
                  styles.metricSelectedGuide,
                  { left: `${selectedPoint.left}%` },
                ]}
              />
              <View
                style={[
                  styles.metricValueCallout,
                  selectedPoint.left > 62 ? styles.metricValueCalloutLeft : null,
                  {
                    left: `${selectedPoint.left}%`,
                    top: `${Math.max(selectedPoint.top - 20, 4)}%`,
                  },
                ]}
              >
                <Text style={styles.metricValueCalloutValue}>
                  {formatMetricValue(metric, selectedPoint.rawValue)}
                </Text>
                <Text style={styles.metricValueCalloutDate}>{selectedPoint.dateLabel}</Text>
              </View>
            </>
          ) : null}
          {chartData.points.map((point) => (
            <Pressable
              accessibilityLabel={`${metricLabels[metric]} ${formatMetricValue(metric, point.rawValue)} on ${point.dateLabel}`}
              accessibilityRole="button"
              hitSlop={14}
              key={point.id}
              onPress={() => setSelectedPointId(point.id)}
              style={[
                styles.metricChartPoint,
                { left: `${point.left}%`, top: `${point.top}%` },
              ]}
            >
              <View
                style={[
                  styles.metricPointDot,
                  point.id === selectedPoint?.id ? styles.metricPointDotSelected : null,
                ]}
              />
            </Pressable>
          ))}
        </View>
        <View style={styles.metricXAxis}>
          {chartData.xLabels.map((label, index) => (
            <Text key={`${label}-${index}`} numberOfLines={1} style={styles.metricAxisLabel}>
              {label}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.metricYAxis}>
        {chartData.yLabels.map((label, index) => (
          <Text key={`${label}-${index}`} numberOfLines={1} style={styles.metricAxisLabel}>
            {label} {metricUnits[metric]}
          </Text>
        ))}
      </View>
    </View>
  );
}

function buildMetricChartData(entries: ProfileMetricEntry[]) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const validEntries = entries
    .map((entry) => ({
      ...entry,
      numericValue: Number.parseFloat(entry.value),
      timestampValue: new Date(entry.timestamp).getTime(),
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.numericValue) &&
        Number.isFinite(entry.timestampValue) &&
        entry.timestampValue >= sixMonthsAgo.getTime(),
    )
    .sort((first, second) => first.timestampValue - second.timestampValue)
    .slice(-10);

  if (validEntries.length === 0) {
    return null;
  }

  const values = validEntries.map((entry) => entry.numericValue);
  const minimumValue = Math.min(...values);
  const maximumValue = Math.max(...values);
  const valuePadding =
    minimumValue === maximumValue
      ? Math.max(Math.abs(maximumValue) * 0.1, 1)
      : (maximumValue - minimumValue) * 0.12;
  const chartMinimum = minimumValue - valuePadding;
  const chartMaximum = maximumValue + valuePadding;
  const chartRange = chartMaximum - chartMinimum || 1;
  const xLabels = buildXAxisLabels(validEntries.map((entry) => entry.timestamp));

  return {
    points: validEntries.map((entry, index) => ({
      dateLabel: formatEntryChartDate(entry.timestamp),
      id: entry.id,
      left: validEntries.length === 1 ? 50 : (index / (validEntries.length - 1)) * 100,
      rawValue: entry.value,
      top: ((chartMaximum - entry.numericValue) / chartRange) * 78 + 8,
    })),
    xLabels,
    yLabels: [
      formatAxisValue(chartMaximum),
      formatAxisValue((chartMaximum + chartMinimum) / 2),
      formatAxisValue(chartMinimum),
    ],
  };
}

function buildXAxisLabels(timestamps: string[]) {
  if (timestamps.length === 1) {
    return [formatEntryMonth(timestamps[0])];
  }

  const firstTimestamp = timestamps[0];
  const middleTimestamp = timestamps[Math.floor(timestamps.length / 2)];
  const lastTimestamp = timestamps[timestamps.length - 1];

  return [firstTimestamp, middleTimestamp, lastTimestamp].map(formatEntryMonth);
}

function formatAxisValue(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function formatEntryMonth(timestamp: string) {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

function formatEntryChartDate(timestamp: string) {
  const date = new Date(timestamp);

  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(
    2,
    '0',
  )}/${date.getFullYear()}`;
}

function formatDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

type MetricEntryScreenProps = {
  date: string;
  isVisible: boolean;
  metric: ProfileMetricKey;
  value: string;
  onChangeDate: (date: string) => void;
  onChangeValue: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

function MetricEntryWindow({
  date,
  isVisible,
  metric,
  value,
  onChangeDate,
  onChangeValue,
  onClose,
  onSave,
}: MetricEntryScreenProps) {
  const hasSavedRef = useRef(false);
  const canSave = value.trim().length > 0;

  function saveOnce() {
    if (!canSave) {
      return;
    }

    if (hasSavedRef.current) {
      return;
    }

    hasSavedRef.current = true;
    onSave();
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={isVisible}
    >
      <View style={styles.metricEntryOverlay}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.metricEntryBackdrop} />
        <View style={styles.metricEntryWindow}>
          <View style={styles.metricEntryHeader}>
            <View>
              <Text style={styles.metricEntryTitle}>Add {metricLabels[metric]}</Text>
              <Text style={styles.metricEntryHint}>Enter value in {metricUnits[metric]}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
              <Text style={styles.metricEntryCloseText}>x</Text>
            </Pressable>
          </View>
          <Text style={styles.metricEntryLabel}>Value</Text>
          <TextInput
            autoFocus
            keyboardType="decimal-pad"
            onChangeText={(nextValue) => {
              hasSavedRef.current = false;
              onChangeValue(nextValue);
            }}
            onSubmitEditing={saveOnce}
            placeholder="0"
            placeholderTextColor="#8e8e93"
            returnKeyType="done"
            style={styles.metricEntryInput}
            value={value}
          />
          <Text style={[styles.metricEntryLabel, styles.metricEntryDateLabel]}>Date</Text>
          <TextInput
            keyboardType="numbers-and-punctuation"
            onChangeText={onChangeDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#8e8e93"
            returnKeyType="done"
            style={styles.metricEntryInput}
            value={date}
          />
          <View style={styles.metricEntryActions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.metricEntryCancelButton}>
              <Text style={styles.metricEntryCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!canSave}
              onPress={saveOnce}
              style={[styles.metricEntrySaveButton, !canSave ? styles.metricEntrySaveButtonDisabled : null]}
            >
              <Text style={[styles.metricEntrySaveText, !canSave ? styles.metricEntrySaveTextDisabled : null]}>
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatMetricValue(metric: ProfileMetricKey, value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return `Add ${metricUnits[metric]}`;
  }

  return metric === 'bodyFatPercentage'
    ? `${trimmedValue}${metricUnits[metric]}`
    : `${trimmedValue} ${metricUnits[metric]}`;
}

function formatEntryTimestamp(timestamp: string) {
  const date = new Date(timestamp);

  return `${date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })} ${date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).toLowerCase()}`;
}

function normalizeTheme(_theme: string): ThemeOption {
  return 'dark';
}

type SettingsInputRowProps = {
  label: string;
  placeholder: string;
  value: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  onBlur: () => void;
  onChangeText: (value: string) => void;
};

function SettingsInputRow({
  label,
  placeholder,
  value,
  keyboardType = 'default',
  onBlur,
  onChangeText,
}: SettingsInputRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        onBlur={onBlur}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8e8e93"
        style={styles.rowInput}
        value={value}
      />
    </View>
  );
}

type ThemeDropdownRowProps = {
  label: string;
  value: ThemeOption;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (theme: ThemeOption) => void;
};

function ThemeDropdownRow({ label, value, isOpen, onToggle, onSelect }: ThemeDropdownRowProps) {
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.dropdownRow}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.dropdownValue}>
          <Text style={styles.dropdownValueText}>{formatThemeLabel(value)}</Text>
          <Text style={styles.dropdownChevron}>{isOpen ? '^' : 'v'}</Text>
        </View>
      </Pressable>
      {isOpen ? (
        <View style={styles.dropdownMenu}>
          {themeOptions.map((theme) => (
            <Pressable
              accessibilityRole="button"
              key={theme}
              onPress={() => onSelect(theme)}
              style={[
                styles.dropdownOption,
                theme === value ? styles.dropdownOptionSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.dropdownOptionText,
                  theme === value ? styles.dropdownOptionTextSelected : null,
                ]}
              >
                {formatThemeLabel(theme)}
              </Text>
              {theme === value ? <Text style={styles.dropdownSelectedText}>Active</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function formatThemeLabel(theme: ThemeOption) {
  return theme === 'dark' ? 'Dark' : 'Light';
}

type SettingsSwitchRowProps = {
  label: string;
  sublabel: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

function SettingsSwitchRow({ label, sublabel, enabled, onChange }: SettingsSwitchRowProps) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowSubtext}>{sublabel}</Text>
      </View>
      <Switch
        onValueChange={onChange}
        thumbColor={enabled ? '#3b82f6' : '#c7c7cc'}
        trackColor={{ false: '#636366', true: '#1d4f7a' }}
        value={enabled}
      />
    </View>
  );
}

// These styles mirror the app's existing black, dark gray, gray text, and blue accent palette.
const styles = StyleSheet.create({
  content: {
    paddingBottom: 28,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    flexDirection: 'row',
    gap: 12,
    minHeight: 74,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    marginTop: 24,
    minWidth: 112,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  dropdownChevron: {
    color: '#d1d5db',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
    width: 18,
  },
  dropdownMenu: {
    alignSelf: 'flex-end',
    backgroundColor: '#202124',
    borderColor: '#3a3a3c',
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 8,
    minWidth: 174,
    overflow: 'hidden',
  },
  dropdownOption: {
    alignItems: 'center',
    borderBottomColor: '#303236',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  dropdownOptionSelected: {
    backgroundColor: '#172033',
  },
  dropdownOptionText: {
    color: '#e5e5ea',
    fontSize: 18,
  },
  dropdownOptionTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  dropdownRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  dropdownSelectedText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownValue: {
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
    borderColor: '#3a3a3c',
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 42,
    minWidth: 132,
    paddingHorizontal: 12,
  },
  dropdownValueText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'right',
    width: 74,
  },
  lightThemeText: {
    color: '#000000',
    fontSize: 28,
    fontWeight: '800',
  },
  lightThemeWindow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  metricAddText: {
    color: '#3b82f6',
    fontSize: 38,
    fontWeight: '300',
    lineHeight: 42,
  },
  metricBackButton: {
    justifyContent: 'center',
    minHeight: 50,
    width: 52,
  },
  metricChartBody: {
    borderColor: '#3a3a3c',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 268,
    marginTop: 18,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  metricChartCard: {
    backgroundColor: '#1c1c1e',
    borderColor: '#2c2c2e',
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 24,
    marginTop: 22,
    padding: 20,
  },
  metricChartText: {
    color: '#c9c9ce',
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  metricChartTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  metricChart: {
    flexDirection: 'row',
    minHeight: 236,
  },
  metricChartFrame: {
    flex: 1,
    minHeight: 236,
  },
  metricChartPoint: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    marginLeft: -17,
    marginTop: -17,
    position: 'absolute',
    width: 34,
  },
  metricGridLine: {
    backgroundColor: '#303236',
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  metricGridLineBottom: {
    bottom: 32,
  },
  metricGridLineMiddle: {
    top: '48%',
  },
  metricGridLineTop: {
    top: 8,
  },
  metricAxisLabel: {
    color: '#8e8e93',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  metricPlotArea: {
    flex: 1,
    marginRight: 8,
    minHeight: 200,
    position: 'relative',
  },
  metricLineSegment: {
    backgroundColor: '#3b82f6',
    height: 2,
    position: 'absolute',
  },
  metricPointDot: {
    backgroundColor: '#1c1c1e',
    borderColor: '#3b82f6',
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    width: 12,
  },
  metricPointDotSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#93c5fd',
    height: 14,
    width: 14,
  },
  metricSelectedGuide: {
    backgroundColor: '#60a5fa',
    bottom: 0,
    opacity: 0.72,
    position: 'absolute',
    top: 0,
    width: 1,
  },
  metricValueCallout: {
    alignItems: 'center',
    backgroundColor: '#202124',
    borderRadius: 8,
    marginLeft: -58,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    width: 116,
    zIndex: 2,
  },
  metricValueCalloutDate: {
    color: '#c9c9ce',
    fontSize: 14,
    marginTop: 2,
  },
  metricValueCalloutLeft: {
    marginLeft: -104,
  },
  metricValueCalloutValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  metricXAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginRight: 8,
    marginTop: 10,
  },
  metricYAxis: {
    justifyContent: 'space-between',
    paddingBottom: 28,
    width: 58,
  },
  metricEntryInput: {
    borderBottomColor: '#3a3a3c',
    borderBottomWidth: 1,
    color: '#ffffff',
    fontSize: 28,
    marginTop: 18,
    minHeight: 56,
    paddingVertical: 8,
  },
  metricEntryActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 28,
  },
  metricEntryBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  metricEntryCancelButton: {
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
    borderRadius: 6,
    minWidth: 92,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  metricEntryCancelText: {
    color: '#e5e5ea',
    fontSize: 16,
    fontWeight: '700',
  },
  metricEntryCloseText: {
    color: '#d1d5db',
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 30,
  },
  metricEntryHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  metricEntryHint: {
    color: '#a1a1a6',
    fontSize: 16,
    marginTop: 6,
  },
  metricEntryLabel: {
    color: '#a1a1a6',
    fontSize: 16,
    fontWeight: '700',
  },
  metricEntryDateLabel: {
    marginTop: 22,
  },
  metricEntryOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  metricEntrySaveButton: {
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    minWidth: 92,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  metricEntrySaveButtonDisabled: {
    backgroundColor: '#1f2937',
  },
  metricEntrySaveText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  metricEntrySaveTextDisabled: {
    color: '#8e8e93',
  },
  metricEntryTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  metricEntryWindow: {
    backgroundColor: '#1c1c1e',
    borderColor: '#3a3a3c',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 420,
    padding: 24,
    width: '100%',
  },
  metricEmptyText: {
    color: '#a1a1a6',
    fontSize: 18,
    marginHorizontal: 24,
    marginTop: 24,
  },
  metricHeader: {
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 22,
  },
  metricHistoryDate: {
    color: '#ffffff',
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
  },
  metricHistoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 24,
    marginTop: 58,
  },
  metricHistoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    marginHorizontal: 24,
    marginTop: 28,
  },
  metricHistoryTitle: {
    color: '#d1d1d6',
    fontSize: 20,
    letterSpacing: 0,
  },
  metricHistoryValue: {
    color: '#d1d1d6',
    fontSize: 22,
    fontWeight: '800',
  },
  metricScreen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  metricSummaryLabel: {
    color: '#ffffff',
    flex: 1,
    fontSize: 22,
  },
  metricSummaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  metricSummaryValue: {
    color: '#c9c9ce',
    flex: 1,
    fontSize: 20,
    textAlign: 'right',
  },
  metricTitle: {
    color: '#ffffff',
    flex: 1,
    fontSize: 24,
    fontWeight: '400',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  rowLabel: {
    color: '#ffffff',
    flex: 1,
    fontSize: 22,
  },
  rowSubtext: {
    color: '#a1a1a6',
    fontSize: 18,
    lineHeight: 24,
  },
  rowInput: {
    color: '#a1a1a6',
    flex: 1,
    fontSize: 20,
    minHeight: 44,
    paddingVertical: 6,
    textAlign: 'right',
  },
  screen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  section: {
    borderBottomColor: '#2c2c2e',
    borderBottomWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 14,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 78,
    paddingTop: 16,
  },
  switchText: {
    flex: 1,
  },
});
