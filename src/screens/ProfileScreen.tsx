import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

// This settings screen keeps profile fields intentionally simple so more fields can be added later.
export function ProfileScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.backText}>{'<'}</Text>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <SettingsRow label="Name" value="Add name" />
          <SettingsRow label="Age" value="Add age" />
          <SettingsRow label="Weight" value="Add weight" />
          <SettingsRow label="Body fat %" value="Add body fat" />
          <Text style={styles.editText}>Edit</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <SettingsRow label="Theme" value="Auto dark" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workout</Text>
          <SettingsRow label="Timer sound" value="david" />
          <Text style={styles.rowSubtext}>Import a timer sound file</Text>
          <SettingsSwitchRow
            enabled={false}
            label="Sound Effects"
            sublabel="Doesn't include the rest timer alert"
          />
        </View>
      </ScrollView>
    </View>
  );
}

type SettingsRowProps = {
  label: string;
  value: string;
};

function SettingsRow({ label, value }: SettingsRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

type SettingsSwitchRowProps = {
  label: string;
  sublabel: string;
  enabled: boolean;
};

function SettingsSwitchRow({ label, sublabel, enabled }: SettingsSwitchRowProps) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowSubtext}>{sublabel}</Text>
      </View>
      <Switch
        thumbColor={enabled ? '#3b82f6' : '#c7c7cc'}
        trackColor={{ false: '#636366', true: '#1d4f7a' }}
        value={enabled}
      />
    </View>
  );
}

// These styles mirror the app's existing black, dark gray, gray text, and blue accent palette.
const styles = StyleSheet.create({
  backText: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 32,
    width: 44,
  },
  content: {
    paddingBottom: 28,
  },
  editText: {
    color: '#ffffff',
    fontSize: 22,
    paddingTop: 4,
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
  rowValue: {
    color: '#a1a1a6',
    flex: 1,
    fontSize: 20,
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
