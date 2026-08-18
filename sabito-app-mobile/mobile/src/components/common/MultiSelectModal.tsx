import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput as RNTextInput,
} from 'react-native';
import { Button } from 'react-native-paper';
import { Search, X, Check } from 'lucide-react-native';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';

interface Option {
  label: string;
  value: string;
}

interface MultiSelectModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: Option[];
  selectedValues: string[];
  onConfirm: (values: string[]) => void;
  placeholder?: string;
}

const MultiSelectModal: React.FC<MultiSelectModalProps> = ({ 
  visible, 
  onClose, 
  title, 
  options, 
  selectedValues, 
  onConfirm,
  placeholder = 'Search...'
}) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tempSelected, setTempSelected] = useState<string[]>(selectedValues || []);

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const toggleSelection = (value: string): void => {
    setTempSelected(prev => {
      const isSelected = prev.includes(value);
      const newSelection = isSelected
        ? prev.filter(v => v !== value)
        : [...prev, value];
      return newSelection;
    });
  };

  const handleConfirm = (): void => {
    onConfirm(tempSelected);
    onClose();
    setSearchQuery('');
  };

  const handleCancel = (): void => {
    setTempSelected(selectedValues);
    onClose();
    setSearchQuery('');
  };

  // Update temp selected when selectedValues changes
  useEffect(() => {
    setTempSelected(selectedValues || []);
  }, [selectedValues]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleCancel}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity 
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={handleCancel}
        />
        <View style={[styles.modalContainer, { backgroundColor: colors.cardBackground || colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
              <View style={[styles.closeButtonCircle, { 
                backgroundColor: isDark ? colors.backgroundSecondary : COLORS.LIGHT_GRAY 
              }]}>
                <X size={20} color={colors.textSecondary} strokeWidth={2} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={[styles.searchContainer, { 
            backgroundColor: isDark ? colors.backgroundSecondary : COLORS.LIGHT_GRAY 
          }]}>
            <Search size={20} color={colors.textSecondary} strokeWidth={1.5} />
            <RNTextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={colors.inputPlaceholder}
            />
          </View>

          {/* Selected Count */}
          {tempSelected.length > 0 && (
            <Text style={[styles.selectedCount, { color: COLORS.APP_GREEN }]}>
              {tempSelected.length} selected
            </Text>
          )}

          {/* Options List */}
          <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
            {filteredOptions.map((option) => {
              const isSelected = tempSelected.includes(option.value);
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionItem, 
                    { 
                      backgroundColor: isSelected 
                        ? '#F0FDF4' 
                        : (isDark ? colors.backgroundSecondary : colors.cardBackground || colors.background),
                      borderBottomColor: colors.border,
                      borderBottomWidth: 1,
                    },
                    isSelected && styles.optionItemSelected
                  ]}
                  onPress={() => toggleSelection(option.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.optionText, 
                    { color: isSelected ? COLORS.APP_GREEN : colors.text },
                    isSelected && styles.optionTextSelected
                  ]}>
                    {option.label}
                  </Text>
                  {isSelected && (
                    <Check size={20} color={COLORS.APP_GREEN} strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            <Button
              mode="outlined"
              onPress={handleCancel}
              style={[styles.cancelButton, { borderColor: colors.border }]}
              contentStyle={styles.buttonContent}
              labelStyle={[styles.cancelButtonLabel, { color: colors.text }]}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleConfirm}
              style={[styles.confirmButton, { backgroundColor: COLORS.APP_GREEN }]}
              contentStyle={styles.buttonContent}
              labelStyle={styles.confirmButtonLabel}
            >
              Confirm
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: SPACING.lg,
    height: '90%',
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    minHeight: 64,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  closeButton: {
    padding: SPACING.xxs,
  },
  closeButtonCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    marginLeft: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  selectedCount: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  optionsList: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    flex: 1,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderRadius: 8,
    marginBottom: SPACING.xs,
    minHeight: 56,
  },
  optionItemSelected: {
    // Background color applied inline
  },
  optionText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
  },
  optionTextSelected: {
    fontWeight: FONT_WEIGHTS.semibold,
  },
  buttonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    gap: SPACING.md,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 8,
  },
  confirmButton: {
    flex: 1,
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: SPACING.md,
  },
  cancelButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  confirmButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.WHITE,
  },
});

export default MultiSelectModal;
