import React from 'react';
import { Text } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import {
  AppBottomSheet,
  APP_SHEET_HEIGHT_COMPACT,
  SheetMenuRow,
  SheetSectionLabel,
} from '@/components/AppBottomSheet';
import { IBIS_CHAT_PERIOD_OPTIONS, type IbisChatPeriodKey } from '@/utils/ibisChatPreferences';

type IbisMoreSheetProps = {
  visible: boolean;
  onClose: () => void;
  loading?: boolean;
  onNewChat: () => void;
  defaultPeriod: IbisChatPeriodKey;
  onDefaultPeriodChange: (key: IbisChatPeriodKey) => void;
  showSuggestionChips: boolean;
  onShowSuggestionChipsChange: (value: boolean) => void;
};

/**
 * Mobile iBIS More sheet — New chat plus local chat preferences.
 */
export function IbisMoreSheet({
  visible,
  onClose,
  loading = false,
  onNewChat,
  defaultPeriod,
  onDefaultPeriodChange,
  showSuggestionChips,
  onShowSuggestionChipsChange,
}: IbisMoreSheetProps) {
  return (
    <AppBottomSheet
      visible={visible}
      title="Ayebia"
      onClose={onClose}
      height={APP_SHEET_HEIGHT_COMPACT}
    >
      <SheetMenuRow
        label="New chat"
        icon={<AppIcon name="plus" size={18} color={loading ? '#9ca3af' : '#166534'} />}
        disabled={loading}
        onPress={() => {
          onNewChat();
          onClose();
        }}
      />

      <SheetSectionLabel>Default period</SheetSectionLabel>
      {IBIS_CHAT_PERIOD_OPTIONS.map((option) => (
        <SheetMenuRow
          key={option.key}
          label={option.label}
          active={defaultPeriod === option.key}
          onPress={() => onDefaultPeriodChange(option.key)}
          trailing={
            defaultPeriod === option.key ? (
              <AppIcon name="check" size={16} color="#fff" />
            ) : null
          }
        />
      ))}

      <SheetSectionLabel>Suggestions</SheetSectionLabel>
      <SheetMenuRow
        label="Suggestion chips"
        active={showSuggestionChips}
        onPress={() => onShowSuggestionChipsChange(!showSuggestionChips)}
        trailing={
          <Text style={{ color: showSuggestionChips ? '#fff' : '#6b7280', fontSize: 13, fontWeight: '600' }}>
            {showSuggestionChips ? 'On' : 'Off'}
          </Text>
        }
      />
    </AppBottomSheet>
  );
}
