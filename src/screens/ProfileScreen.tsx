import { StyleSheet, Text, View } from 'react-native';

// This placeholder screen is connected to the Profile bottom tab and intentionally renders only its title.
export function ProfileScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Profile</Text>
    </View>
  );
}

// These styles position the single Profile title without adding any placeholder functionality.
const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#000000',
    flex: 1,
    padding: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
});
