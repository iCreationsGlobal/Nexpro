import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING } from '../../constants/sizes';

interface BackButtonProps {
  onPress: () => void;
  style?: ViewStyle;
  iconColor?: string;
  iconSize?: number;
}

const BackButton: React.FC<BackButtonProps> = ({ onPress, style, iconColor, iconSize = 24 }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const finalIconColor = iconColor || colors.text;
  const borderColor = colors.border;
  
  return (
    <TouchableOpacity 
      onPress={onPress} 
      style={[styles.backButton, { borderColor }, style]}
      activeOpacity={0.7}
    >
      <ArrowLeft size={iconSize} color={finalIconColor} strokeWidth={1.5} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  backButton: {
    padding: SPACING.sm,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default BackButton;

