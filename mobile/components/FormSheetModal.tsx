import React from 'react';

import {
  AppBottomSheet,
  APP_SHEET_HEIGHT_TALL,
  type AppBottomSheetProps,
} from '@/components/AppBottomSheet';

export const FORM_SHEET_HEIGHT = APP_SHEET_HEIGHT_TALL;

export type FormSheetModalProps = Omit<AppBottomSheetProps, 'height' | 'hideHandle'> & {
  keyboardVerticalOffset?: number;
};

/**
 * Form bottom sheet — Menu-style chrome via AppBottomSheet (tall, scrollable, footer).
 */
export function FormSheetModal({
  visible,
  title,
  onClose,
  children,
  footer,
  keyboardVerticalOffset = 0,
  scrollable = true,
  cardBg,
  borderColor,
  textColor,
  mutedColor,
  contentContainerStyle,
}: FormSheetModalProps) {
  return (
    <AppBottomSheet
      visible={visible}
      title={title}
      onClose={onClose}
      footer={footer}
      height={APP_SHEET_HEIGHT_TALL}
      scrollable={scrollable}
      keyboardVerticalOffset={keyboardVerticalOffset}
      cardBg={cardBg}
      borderColor={borderColor}
      textColor={textColor}
      mutedColor={mutedColor}
      contentContainerStyle={[{ padding: 20, paddingHorizontal: 20 }, contentContainerStyle]}
    >
      {children}
    </AppBottomSheet>
  );
}
