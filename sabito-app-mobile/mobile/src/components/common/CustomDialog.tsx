import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  StatusBar,
  Animated,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';

interface DialogButton {
  text: string;
  onPress: () => void;
  style?: 'default' | 'destructive' | 'cancel';
}

interface CustomDialogProps {
  visible: boolean;
  title?: string;
  message?: string;
  buttons?: DialogButton[];
  onClose?: () => void;
}

const CustomDialog: React.FC<CustomDialogProps> = ({
  visible,
  title,
  message,
  buttons = [],
  onClose,
}) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible, slideAnim]);

  // If no buttons provided, add default OK button
  const dialogButtons: DialogButton[] = buttons.length > 0 ? buttons : [
    { text: 'OK', onPress: onClose || (() => {}), style: 'default' }
  ];

  // Separate cancel button from other buttons (iOS 15 style)
  const actionButtons = dialogButtons.filter(btn => btn.style !== 'cancel');
  const cancelButton = dialogButtons.find(btn => btn.style === 'cancel');

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  if (!visible) {
    return null;
  }

  const getButtonStyle = (buttonStyle?: string) => {
    if (buttonStyle === 'destructive') {
      return [styles.destructiveButton, { backgroundColor: colors.error || COLORS.RED }];
    }
    return [styles.defaultButton, { backgroundColor: colors.primary || COLORS.APP_GREEN }];
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <StatusBar
          backgroundColor="rgba(0, 0, 0, 0.4)"
          barStyle={isDark ? 'light-content' : 'dark-content'}
        />
        
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <Animated.View
          style={[
            styles.dialogContainer,
            { backgroundColor: colors.cardBackground },
            { transform: [{ translateY }] },
          ]}
        >
          {/* Handle bar (iOS 15 style) */}
          <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
          
          {/* Title */}
          {title && (
            <Text style={[styles.title, { color: colors.text }]}>
              {title}
            </Text>
          )}
          
          {/* Message */}
          {message && (
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              {message}
            </Text>
          )}
          
          {/* Action Buttons */}
          {actionButtons.length > 0 && (
            <View style={styles.actionsContainer}>
              {actionButtons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    ...getButtonStyle(button.style),
                    actionButtons.length > 1 && styles.multipleButton,
                  ]}
                  onPress={() => {
                    if (button.onPress) {
                      button.onPress();
                    }
                    if (onClose) {
                      onClose();
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      button.style === 'destructive' && styles.destructiveButtonText,
                    ]}
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Cancel Button (separated at bottom) */}
          {cancelButton && (
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={() => {
                if (cancelButton.onPress) {
                  cancelButton.onPress();
                }
                if (onClose) {
                  onClose();
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>
                {cancelButton.text}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    flex: 1,
  },
  dialogContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.xl,
    paddingBottom: SPACING.xxl,
    maxHeight: '90%',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  message: {
    fontSize: FONT_SIZES.md,
    lineHeight: 22,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  defaultButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  destructiveButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  multipleButton: {
    flex: 1,
  },
  buttonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.WHITE,
  },
  destructiveButtonText: {
    color: COLORS.WHITE,
  },
  cancelButton: {
    paddingVertical: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default CustomDialog;

