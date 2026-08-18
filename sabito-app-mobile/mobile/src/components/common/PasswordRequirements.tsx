import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Check } from 'lucide-react-native';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';

interface PasswordRequirementsProps {
  password?: string;
}

interface Requirement {
  id: string;
  label: string;
  met: boolean;
}

/**
 * Password Requirements Checklist
 * Shows validation status for password requirements
 */
const PasswordRequirements: React.FC<PasswordRequirementsProps> = ({ password = '' }) => {
  const requirements: Requirement[] = [
    {
      id: 'length',
      label: 'Minimum of 8 characters',
      met: password.length >= 8,
    },
    {
      id: 'special',
      label: 'A special character',
      met: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    },
    {
      id: 'uppercase',
      label: 'An uppercase letter',
      met: /[A-Z]/.test(password),
    },
    {
      id: 'number',
      label: 'A number',
      met: /[0-9]/.test(password),
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Password must include:</Text>
      {requirements.map((req) => (
        <View key={req.id} style={styles.requirement}>
          <View style={[
            styles.circle,
            req.met && styles.circleMet,
          ]}>
            {req.met && (
              <Check size={12} color={COLORS.APP_GREEN} strokeWidth={3} />
            )}
          </View>
          <Text style={[styles.requirementText, req.met && styles.requirementMet]}>
            {req.label}
          </Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.BLACK,
    marginBottom: SPACING.sm,
  },
  requirement: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#F4F4F4',  // Light gray stroke when empty
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  circleMet: {
    borderColor: COLORS.APP_GREEN,  // Green stroke when met
    backgroundColor: COLORS.WHITE,
  },
  requirementText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
  requirementMet: {
    color: COLORS.APP_GREEN,  // Primary green when met
    fontWeight: FONT_WEIGHTS.medium,
  },
});

export default PasswordRequirements;

