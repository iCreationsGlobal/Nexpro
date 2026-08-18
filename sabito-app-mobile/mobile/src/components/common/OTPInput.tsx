import React, { useRef, useState } from 'react';
import { View, StyleSheet, TextInput, Platform, TextInput as RNTextInput } from 'react-native';
import COLORS from '../../constants/colors';
import { SPACING } from '../../constants/sizes';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';

interface OTPInputProps {
  onComplete?: (otp: string) => void;
  onChangeOTP?: (otp: string) => void;
}

const OTPInput: React.FC<OTPInputProps> = ({ onComplete, onChangeOTP }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(RNTextInput | null)[]>([]);

  const handleChange = (text: string, index: number) => {
    // Only allow numbers
    if (text && !/^\d+$/.test(text)) return;

    const newOtp = [...otp];
    newOtp[index] = text.slice(-1); // Take only last character
    setOtp(newOtp);

    // Call parent callback
    if (onChangeOTP) {
      onChangeOTP(newOtp.join(''));
    }

    // Auto-focus next input
    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Call onComplete if all 6 digits entered
    if (newOtp.every(digit => digit !== '') && onComplete) {
      onComplete(newOtp.join(''));
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    // Handle backspace
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.container}>
      {otp.map((digit, index) => (
        <TextInput
          key={index}
          ref={ref => (inputRefs.current[index] = ref)}
          style={[
            styles.input,
            {
              backgroundColor: colors.cardBackground || colors.background,
              borderColor: colors.border,
              color: colors.text,
            },
            digit && {
              borderColor: COLORS.APP_GREEN,
              backgroundColor: isDark ? 'rgba(31, 185, 0, 0.15)' : '#F9FFF7',
              color: COLORS.APP_GREEN,
            },
          ]}
          value={digit}
          onChangeText={(text) => handleChange(text, index)}
          onKeyPress={(e) => handleKeyPress(e, index)}
          keyboardType="number-pad"
          maxLength={1}
          selectTextOnFocus
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  input: {
    flex: 1,
    aspectRatio: 1, // Square boxes
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    textAlignVertical: 'center', // Center vertically on Android
    fontSize: Platform.select({
      ios: 28,
      android: 24,
      default: 24,
    }),
    fontWeight: '700',
    padding: 0, // Remove default padding for perfect centering
  },
});

export default OTPInput;

