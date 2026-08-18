import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing, TouchableOpacity } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { Button } from 'react-native-paper';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';

interface PartnershipSuccessModalProps {
  visible: boolean;
  onClose: () => void;
  businessName?: string;
}

const PartnershipSuccessModal: React.FC<PartnershipSuccessModalProps> = ({ visible, onClose, businessName }) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const iconScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Modal entrance animation
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(150),
          Animated.spring(iconScaleAnim, {
            toValue: 1,
            tension: 100,
            friction: 5,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      iconScaleAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity 
          style={styles.overlayTouchable} 
          activeOpacity={1} 
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.modalCard,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Success Icon */}
          <Animated.View
            style={[
              styles.iconContainer,
              {
                transform: [{ scale: iconScaleAnim }],
              },
            ]}
          >
            <CheckCircle2 size={48} color={COLORS.APP_GREEN} strokeWidth={2} />
          </Animated.View>

          {/* Title */}
          <Text style={styles.title}>Application Sent!</Text>

          {/* Message */}
          <Text style={styles.message}>
            Your partnership request to <Text style={styles.boldText}>{businessName}</Text> has been sent successfully!
          </Text>
          <Text style={styles.subMessage}>
            You will be notified once the business reviews and responds to your application.
          </Text>

          {/* Done Button */}
          <Button
            mode="contained"
            onPress={onClose}
            style={styles.doneButton}
            contentStyle={styles.doneButtonContent}
            labelStyle={styles.doneButtonLabel}
          >
            Done
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
    padding: 20,
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 20,
    padding: 32,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#111827',
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  message: {
    fontSize: FONT_SIZES.md,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.sm,
  },
  boldText: {
    fontWeight: FONT_WEIGHTS.bold,
    color: '#111827',
  },
  subMessage: {
    fontSize: FONT_SIZES.sm,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  doneButton: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 12,
    width: '100%',
  },
  doneButtonContent: {
    paddingVertical: 8,
  },
  doneButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.5,
  },
});

export default PartnershipSuccessModal;






