/**
 * Permission Request Modal
 * Beautiful UI for requesting app permissions
 * Requests permission directly when user clicks "Allow"
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Camera, Bell, Image as ImageIcon } from 'lucide-react-native';
import { Button } from 'react-native-paper';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { requestCameraPermission, requestMediaLibraryPermission, requestNotificationPermission } from '../../services/permissions';

interface PermissionModalProps {
  visible: boolean;
  onClose: () => void;
  onGranted?: () => void; // Called when permission is granted
  onDenied?: () => void;  // Called when permission is denied
  permissionType?: 'camera' | 'photos' | 'notifications'; // 'camera', 'photos', 'notifications'
  title?: string;
  description?: string;
}

const PermissionModal: React.FC<PermissionModalProps> = ({ 
  visible, 
  onClose, 
  onGranted,
  onDenied,
  permissionType = 'photos',
  title,
  description,
}) => {
  const [isRequesting, setIsRequesting] = useState<boolean>(false);
  
  const getPermissionIcon = (): JSX.Element => {
    switch (permissionType) {
      case 'camera':
        return <Camera size={48} color={COLORS.APP_GREEN} strokeWidth={1.5} />;
      case 'photos':
        return <ImageIcon size={48} color={COLORS.APP_GREEN} strokeWidth={1.5} />;
      case 'notifications':
        return <Bell size={48} color={COLORS.APP_GREEN} strokeWidth={1.5} />;
      default:
        return <Camera size={48} color={COLORS.APP_GREEN} strokeWidth={1.5} />;
    }
  };

  const getDefaultContent = (): { title: string; description: string } => {
    switch (permissionType) {
      case 'camera':
        return {
          title: 'Camera Access',
          description: 'Allow Sabito to access your camera to take photos for your profile and business.',
        };
      case 'photos':
        return {
          title: 'Photo Library Access',
          description: 'Allow Sabito to access your photos to upload images for your profile and business.',
        };
      case 'notifications':
        return {
          title: 'Stay Updated',
          description: 'Get notified about new referrals, messages, and important account updates.',
        };
      default:
        return {
          title: 'Permission Required',
          description: 'This feature requires permission to function properly.',
        };
    }
  };

  const content = {
    title: title || getDefaultContent().title,
    description: description || getDefaultContent().description,
  };

  const handleAllow = async (): Promise<void> => {
    setIsRequesting(true);
    
    let granted = false;
    
    try {
      // Request appropriate permission based on type
      switch (permissionType) {
        case 'camera':
          granted = await requestCameraPermission();
          break;
        case 'photos':
          granted = await requestMediaLibraryPermission();
          break;
        case 'notifications':
          granted = await requestNotificationPermission();
          break;
        default:
          granted = false;
      }
      
      if (granted) {
        if (onGranted) onGranted();
        onClose();
      } else {
        if (onDenied) onDenied();
        onClose();
      }
    } catch (error: any) {
      if (onDenied) onDenied();
      onClose();
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            {getPermissionIcon()}
          </View>

          {/* Title */}
          <Text style={styles.title}>{content.title}</Text>

          {/* Description */}
          <Text style={styles.description}>{content.description}</Text>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <Button
              mode="contained"
              onPress={handleAllow}
              loading={isRequesting}
              disabled={isRequesting}
              style={styles.allowButton}
              contentStyle={styles.allowButtonContent}
              labelStyle={styles.allowButtonLabel}
            >
              {isRequesting ? 'Requesting...' : 'Allow'}
            </Button>

            <TouchableOpacity 
              onPress={onClose} 
              style={styles.notNowButton}
              disabled={isRequesting}
            >
              <Text style={[styles.notNowText, isRequesting && { opacity: 0.5 }]}>
                Not Now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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
    padding: SPACING.xl,
  },
  modalContainer: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 16,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
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
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  description: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  buttonContainer: {
    width: '100%',
    gap: SPACING.sm,
  },
  allowButton: {
    borderRadius: 8,
  },
  allowButtonContent: {
    paddingVertical: SPACING.sm,
  },
  allowButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  notNowButton: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  notNowText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    fontWeight: FONT_WEIGHTS.medium,
  },
});

export default PermissionModal;
