/**
 * Business Review Modal
 * For marketers to rate businesses
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Animated,
} from 'react-native';
import { Star, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { submitBusinessRating, getMyBusinessRating } from '../../api/ratings';
import type { Business, ApiResponse } from '../../types/api';

interface RatingData {
  clientHandling: number;
  commissionAccuracy: number;
  workQuality: number;
  overall: number;
}

interface ExistingRating {
  rating?: number;
  ratings?: RatingData;
  review?: string;
}

interface BusinessReviewModalProps {
  business: Business | null;
  visible: boolean;
  onClose: () => void;
  onReviewSubmitted?: () => void;
}

const BusinessReviewModal: React.FC<BusinessReviewModalProps> = ({
  business,
  visible,
  onClose,
  onReviewSubmitted,
}) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [ratings, setRatings] = useState<RatingData>({
    clientHandling: 0,
    commissionAccuracy: 0,
    workQuality: 0,
    overall: 0,
  });
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [existingRating, setExistingRating] = useState<ExistingRating | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const ratingCategories = [
    {
      key: 'clientHandling' as const,
      label: 'Client Handling',
      description: 'How well did the business handle and communicate with the clients I referred?',
    },
    {
      key: 'commissionAccuracy' as const,
      label: 'Commission Accuracy',
      description: 'Did the business pay the correct commission amount as agreed?',
    },
    {
      key: 'workQuality' as const,
      label: 'Work Quality',
      description: 'How satisfied were the clients with the final work delivered?',
    },
    {
      key: 'overall' as const,
      label: 'Overall Partnership',
      description: 'How would you rate your overall experience working with this business?',
    },
  ];

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
      if (business) {
        loadExistingRating();
      }
    } else {
      slideAnim.setValue(0);
    }
  }, [visible, business]);

  const loadExistingRating = async (): Promise<void> => {
    if (!business?.id) return;
    try {
      setLoading(true);
      const response = await getMyBusinessRating(business.id);
      if (response.success && response.data?.rating) {
        setExistingRating(response.data.rating);
        if (response.data.rating.ratings) {
          setRatings(response.data.rating.ratings);
        } else {
          const overallRating = response.data.rating.rating || 0;
          setRatings({
            clientHandling: overallRating,
            commissionAccuracy: overallRating,
            workQuality: overallRating,
            overall: overallRating,
          });
        }
        setMessage(response.data.rating.review || '');
      } else {
        resetForm();
      }
    } catch (error: any) {
      console.error('[BusinessReviewModal] Error loading rating:', error);
      resetForm();
    } finally {
      setLoading(false);
    }
  };

  const resetForm = (): void => {
    setExistingRating(null);
    setRatings({
      clientHandling: 0,
      commissionAccuracy: 0,
      workQuality: 0,
      overall: 0,
    });
    setMessage('');
  };

  const handleRatingChange = (category: keyof RatingData, value: number): void => {
    setRatings((prev) => ({
      ...prev,
      [category]: value,
    }));
  };

  const handleSubmit = async (): Promise<void> => {
    if (ratings.overall === 0) {
      // Show error - need overall rating at minimum
      return;
    }

    if (!business?.id) return;

    try {
      setIsSubmitting(true);
      const ratingData = {
        rating: ratings.overall,
        ratings: ratings,
        review: message.trim() || undefined,
      };

      const response = await submitBusinessRating(business.id, ratingData);
      if (response.success) {
        onReviewSubmitted?.();
        onClose();
      } else {
        console.error('[BusinessReviewModal] Submit error:', response.error);
      }
    } catch (error: any) {
      console.error('[BusinessReviewModal] Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStars = (category: keyof RatingData, currentRating: number): JSX.Element => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => handleRatingChange(category, star)}
            activeOpacity={0.7}
          >
            <Star
              size={28}
              color={star <= currentRating ? '#F59E0B' : colors.border}
              fill={star <= currentRating ? '#F59E0B' : 'transparent'}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  if (!visible || !business) return null;

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
            styles.modalContainer,
            { backgroundColor: colors.cardBackground },
            { transform: [{ translateY }] },
          ]}
        >
          {/* Handle bar */}
          <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              {existingRating ? 'Update Your Review' : 'Rate This Business'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Business Name */}
          <Text style={[styles.businessName, { color: colors.text }]}>
            {business.businessName || business.name}
          </Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
            </View>
          ) : (
            <ScrollView
              style={styles.scrollView}
              showsVerticalScrollIndicator={false}
            >
              {/* Rating Categories */}
              {ratingCategories.map((category) => (
                <View key={category.key} style={styles.categoryContainer}>
                  <Text style={[styles.categoryLabel, { color: colors.text }]}>
                    {category.label}
                  </Text>
                  <Text
                    style={[styles.categoryDescription, { color: colors.textSecondary }]}
                  >
                    {category.description}
                  </Text>
                  {renderStars(category.key, ratings[category.key])}
                </View>
              ))}

              {/* Review Text */}
              <View style={styles.reviewContainer}>
                <Text style={[styles.reviewLabel, { color: colors.text }]}>
                  Your Review (Optional)
                </Text>
                <TextInput
                  style={[
                    styles.reviewInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  placeholder="Share your experience..."
                  placeholderTextColor={colors.inputPlaceholder}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  {
                    backgroundColor:
                      ratings.overall === 0 ? colors.border : COLORS.APP_GREEN,
                  },
                  isSubmitting && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={ratings.overall === 0 || isSubmitting}
                activeOpacity={0.7}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={COLORS.WHITE} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {existingRating ? 'Update Review' : 'Submit Review'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
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
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 20,
    paddingHorizontal: 16,
    maxHeight: '90%',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  businessName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 24,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  categoryContainer: {
    marginBottom: 24,
  },
  categoryLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: FONT_SIZES.sm,
    marginBottom: 12,
    lineHeight: 18,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  reviewContainer: {
    marginBottom: 24,
  },
  reviewLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 8,
  },
  reviewInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 100,
    fontSize: FONT_SIZES.md,
  },
  submitButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default BusinessReviewModal;






