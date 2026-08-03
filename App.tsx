import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initDatabase } from './src/data/database';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { WorkoutScreen } from './src/screens/WorkoutScreen';

// This tab type defines the only routes App.tsx exposes to the screen files.
type RootTabParamList = {
  History: undefined;
  Workout: { initialTopTab?: 'routines' | 'exercises' } | undefined;
  Profile: undefined;
};

// This navigator instance connects React Navigation to the three imported screen components.
const Tab = createBottomTabNavigator<RootTabParamList>();

// The root app initializes SQLite through the data layer before rendering navigation.
export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // This startup effect runs the schema setup from src/data/database before any screen queries data.
  useEffect(() => {
    initDatabase()
      .then(() => setIsReady(true))
      .catch((databaseError: unknown) => {
        setError(databaseError instanceof Error ? databaseError.message : 'Database failed to initialize.');
      });
  }, []);

  // This error branch keeps database initialization failures visible before navigation mounts.
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Unable to start app</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // This loading branch prevents screens from calling repository functions before SQLite is ready.
  if (!isReady) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Loading workout data...</Text>
      </View>
    );
  }

  // This navigation tree connects the three V3 bottom tabs and opens on Workout by default.
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          initialRouteName="Workout"
          screenOptions={{
            headerShown: false,
            tabBarLabelPosition: 'below-icon',
            tabBarActiveTintColor: '#3b82f6',
            tabBarInactiveTintColor: '#8e8e93',
            tabBarStyle: {
              backgroundColor: '#1c1c1e',
              borderTopColor: '#2c2c2e',
            },
          }}
        >
          <Tab.Screen name="History" component={HistoryScreen} />
          <Tab.Screen name="Workout" component={WorkoutScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// These styles support the root loading and error states before screen-level styles take over.
const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: '#991b1b',
    marginTop: 8,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#991b1b',
    fontSize: 18,
    fontWeight: '700',
  },
  loadingText: {
    color: '#555',
    marginTop: 12,
  },
});
