import React, { useState } from 'react';
import { View, StyleSheet, Text, TextInput as RNTextInput, Platform, ViewStyle, TextStyle, TextInputProps } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';

interface CustomTextInputProps extends Omit<RNTextInput['props'], 'style'> {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  helperText?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  secureTextEntry?: boolean;
  style?: ViewStyle;
}

const TextInput: React.FC<CustomTextInputProps> = ({
  label,
  placeholder,
  value,
  onChangeText,
  helperText,
  keyboardType = 'default',
  secureTextEntry = false,
  style,
  ...props
}) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.container}>
      {/* Label */}
      {label && (
        <Text style={[styles.label, { color: colors.text }]}>
          {label}
        </Text>
      )}
      
      {/* Input Field */}
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
          props.multiline && styles.multilineInput,
          style, // Apply style prop to input field
        ]}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        {...props}
      />
      
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
    marginBottom: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.regular,
    minHeight: 48,
  },
  multilineInput: {
    textAlignVertical: 'top',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    minHeight: 100, // Default min height for multiline inputs
  },
  helperText: {
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.sm,
  },
});

export default TextInput;

