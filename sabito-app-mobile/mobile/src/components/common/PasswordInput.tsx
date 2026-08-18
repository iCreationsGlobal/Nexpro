import React, { useState } from 'react';
import { View, StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, Platform, ViewStyle, TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';

interface PasswordInputProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  helperText?: string;
  style?: ViewStyle;
}

const PasswordInput: React.FC<PasswordInputProps> = ({
  label,
  placeholder,
  value,
  onChangeText,
  helperText,
  style,
  ...props
}) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View style={[styles.container, style]}>
      {/* Label */}
      {label && <Text style={[styles.label, { color: colors.text }]}>{label}</Text>}
      
      {/* Input Field with Toggle */}
      <View style={styles.inputWrapper}>
        <RNTextInput
          style={[
            styles.input,
            { 
              backgroundColor: colors.cardBackground,
              borderColor: colors.border,
              color: colors.text,
            },
            isFocused && { 
              borderColor: COLORS.APP_GREEN,
              backgroundColor: isDark ? colors.cardBackground : '#F9FFF7',
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!showPassword}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        
        {/* Show/Hide Toggle */}
        <TouchableOpacity
          onPress={() => setShowPassword(!showPassword)}
          style={styles.toggleButton}
        >
          {showPassword ? (
            <EyeOff size={20} color={colors.iconSecondary} strokeWidth={1.5} />
          ) : (
            <Eye size={20} color={colors.iconSecondary} strokeWidth={1.5} />
          )}
        </TouchableOpacity>
      </View>
      
      {/* Helper Text */}
      {helperText && <Text style={[styles.helperText, { color: colors.textSecondary }]}>{helperText}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.BLACK,
    marginBottom: SPACING.sm,
  },
  inputWrapper: {
    position: 'relative',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.STROKE_COLOR,
    borderRadius: 8,
    padding: 16,
    paddingRight: 48, // Space for eye icon
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    backgroundColor: COLORS.WHITE,
  },
  inputFocused: {
    borderColor: COLORS.APP_GREEN,
    backgroundColor: '#F9FFF7',
    color: COLORS.APP_GREEN,
  },
  toggleButton: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  helperText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    marginTop: SPACING.sm,
  },
});

export default PasswordInput;

