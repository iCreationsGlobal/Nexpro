import { StyleSheet } from 'react-native';
import { TOUCH_TARGET, BORDER_WIDTH } from '@/constants/sizing';

/** Stretch a lone action button to the full container width on mobile. */
export const standaloneFullWidth = {
  alignSelf: 'stretch' as const,
  width: '100%' as const,
};

export const standaloneButtonStyles = StyleSheet.create({
  outline: {
    ...standaloneFullWidth,
    minHeight: TOUCH_TARGET.standard,
    borderWidth: BORDER_WIDTH.standard,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primary: {
    ...standaloneFullWidth,
    minHeight: TOUCH_TARGET.standard,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textLink: {
    ...standaloneFullWidth,
    minHeight: TOUCH_TARGET.standard,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
