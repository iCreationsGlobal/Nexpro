import React, { useState } from 'react';
import { Text, TextInput, StyleSheet, type TextInputProps } from 'react-native';

import { useScreenColors } from '@/hooks/useScreenColors';
import { FontFamily, FontSize } from '@/constants/typography';
import { TOUCH_TARGET, BORDER_WIDTH } from '@/constants/sizing';

type FormLabelProps = {
  children: string;
  optional?: boolean;
};

export function FormLabel({ children, optional }: FormLabelProps) {
  const { mutedColor } = useScreenColors();
  return (
    <Text style={[styles.label, { color: mutedColor }]}>
      {children}
      {optional ? ' (optional)' : ''}
    </Text>
  );
}

type FormInputProps = TextInputProps & {
  multiline?: boolean;
};

export const FormInput = React.forwardRef<TextInput, FormInputProps>(
  ({ multiline, style, placeholderTextColor, onFocus, onBlur, ...props }, ref) => {
  const { textColor, mutedColor, borderColor, inputBg, colors } = useScreenColors();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      {...props}
      multiline={multiline}
      placeholderTextColor={placeholderTextColor ?? mutedColor}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        multiline && styles.textArea,
        {
          color: textColor,
          borderColor: focused ? colors.tint : borderColor,
          backgroundColor: inputBg,
        },
        style,
      ]}
    />
  );
  }
);

FormInput.displayName = 'FormInput';

const styles = StyleSheet.create({
  label: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.md,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    minHeight: TOUCH_TARGET.standard,
    borderWidth: BORDER_WIDTH.standard,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    marginBottom: 8,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
