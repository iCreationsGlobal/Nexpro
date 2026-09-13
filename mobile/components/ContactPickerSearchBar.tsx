import React from 'react';
import { View, TextInput, Pressable, StyleSheet, Platform } from 'react-native';

import { AppIcon } from '@/components/AppIcon';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  inputBg?: string;
};

export function ContactPickerSearchBar({
  value,
  onChangeText,
  placeholder = 'Search contacts',
  borderColor,
  textColor,
  mutedColor,
  inputBg = '#f9fafb',
}: Props) {
  return (
    <View style={[styles.searchContainer, { borderColor, backgroundColor: inputBg }]}>
      <AppIcon name="search" size={16} color={mutedColor} />
      <TextInput
        style={[styles.searchInput, { color: textColor }]}
        placeholder={placeholder}
        placeholderTextColor={mutedColor}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && Platform.OS === 'android' ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityLabel="Clear search">
          <AppIcon name="times-circle" size={16} color={mutedColor} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
});
