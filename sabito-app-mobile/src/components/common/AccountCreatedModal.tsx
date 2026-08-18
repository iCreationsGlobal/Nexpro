import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { Button } from 'react-native-paper';
import { CheckCircle2 } from 'lucide-react-native';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AccountCreatedModalProps {
  visible: boolean;
  onLoginPress: () => void;
}

const AccountCreatedModal: React.FC<AccountCreatedModalProps> = ({ visible, onLoginPress }) => {
  // Animation values
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Animate modal appearance
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // After modal appears, animate the success icon
        Animated.spring(iconScale, {
          toValue: 1,
          tension: 40,
          friction: 5,
          useNativeDriver: true,
        }).start();
      });
    } else {
      // Reset animations
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
      iconScale.setValue(0);
    }
  }, [visible]);

  const getMessage = (): string =>
    'Your marketer account has been successfully created and is ready to use.';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Success Icon */}
          <Animated.View
            style={[
              styles.iconContainer,
              {
                transform: [{ scale: iconScale }],
              },
            ]}
          >
            <CheckCircle2 size={64} color={COLORS.APP_GREEN} strokeWidth={2} />
          </Animated.View>

          {/* Title */}
          <Text style={styles.title}>
            🎉 Account Created{'\n'}Successfully!
          </Text>

          {/* Message */}
          <Text style={styles.message}>
            Welcome to <Text style={styles.brandName}>Sabito</Text>! {getMessage()}
          </Text>

          {/* Action Button */}
          <Button
            mode="contained"
            onPress={onLoginPress}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
          >
            Continue
          </Button>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  modalContainer: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 16,
    padding: SPACING.xl,
    width: SCREEN_WIDTH - (SPACING.xl * 2),
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F0FDF4', // Light green background
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    textAlign: 'center',
    marginBottom: SPACING.md,
    lineHeight: 32,
  },
  message: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
  },
  brandName: {
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
  },
  button: {
    width: '100%',
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: SPACING.sm,
  },
  buttonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default AccountCreatedModal;
