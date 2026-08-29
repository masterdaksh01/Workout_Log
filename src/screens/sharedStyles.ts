import { StyleSheet } from 'react-native';

// These shared styles keep repeated form, button, and screen primitives consistent across screen files.
export const sharedStyles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonDanger: {
    // Distinct dark-red so destructive actions are visually separate from primary blue
    backgroundColor: '#991b1b',
  },
  buttonSecondary: {
    backgroundColor: '#2c2c2e',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  buttonTextSecondary: {
    color: '#e5e5ea',
    fontWeight: '700',
  },
  emptyText: {
    color: '#8e8e93',
    lineHeight: 22,
    marginTop: 12,
    textAlign: 'center',
  },
  input: {
    borderColor: '#3a3a3c',
    borderRadius: 6,
    borderWidth: 1,
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  label: {
    color: '#a1a1a6',
    fontWeight: '700',
    marginBottom: 6,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  screen: {
    backgroundColor: '#000000',
    flex: 1,
    padding: 16,
  },
  section: {
    borderBottomColor: '#2c2c2e',
    borderBottomWidth: 1,
    marginBottom: 18,
    paddingBottom: 18,
  },
  smallText: {
    color: '#8e8e93',
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 16,
    marginTop: 5,
  },
});
