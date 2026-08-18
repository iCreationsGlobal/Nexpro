/**
 * Marketer Review Modal
 * For businesses to rate marketers
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
  Alert,
} from 'react-native';
import { Star, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import { submitMarketerRating, getMyMarketerRating } from '../../api/ratings';
import type { Marketer, ApiResponse } from '../../types/api';

interface RatingData {
  referralQuality: number;
  communication: number;
  professionalism: number;
  overall: number;
}

interface ExistingRating {
  rating?: number;
  ratingsData?: RatingData | string;
  referralQuality?: number;
  communication?: number;
  professionalism?: number;
  overall?: number;
  review?: string;
}

interface MarketerReviewModalProps {
  marketer: Marketer | { id?: string; marketer?: Marketer; name?: string } | null;
  visible: boolean;
  onClose: () => void;
  onReviewSubmitted?: () => void;
}

const MarketerReviewModal: React.FC<MarketerReviewModalProps> = ({
  marketer,
  visible,
  onClose,
  onReviewSubmitted,
}) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [ratings, setRatings] = useState<RatingData>({
    referralQuality: 0,
    communication: 0,
    professionalism: 0,
    overall: 0,
  });
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [existingRating, setExistingRating] = useState<ExistingRating | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const ratingCategories = [
    {
      key: 'referralQuality' as const,
      label: 'Referral Quality',
      description: 'How good are the clients the marketer refers? Do they convert well and meet your requirements?',
    },
    {
      key: 'communication' as const,
      label: 'Communication',
      description: 'How well does the marketer communicate? Are they responsive, clear, and professional?',
    },
    {
      key: 'professionalism' as const,
      label: 'Professionalism',
      description: 'How professional is the marketer? Are they reliable, trustworthy, and follow through on commitments?',
    },
    {
      key: 'overall' as const,
      label: 'Overall Partnership',
      description: 'How would you rate your overall experience working with this marketer?',
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
      if (marketer) {
        loadExistingRating();
      }
    } else {
      slideAnim.setValue(0);
    }
  }, [visible, marketer]);

  const loadExistingRating = async (): Promise<void> => {
    const marketerId = (marketer as any)?.id || (marketer as any)?.marketer?.id;
    if (!marketerId) return;
    try {
      setLoading(true);
      const response = await getMyMarketerRating(marketerId);
      if (response.success && response.data?.rating) {
        setExistingRating(response.data.rating);
        if (response.data.rating.ratingsData) {
          const ratingsData =
            typeof response.data.rating.ratingsData === 'string'
              ? JSON.parse(response.data.rating.ratingsData)
              : response.data.rating.ratingsData;
          setRatings({
            referralQuality:
              ratingsData.referralQuality ||
              response.data.rating.referralQuality ||
              0,
            communication:
              ratingsData.communication || response.data.rating.communication || 0,
            professionalism:
              ratingsData.professionalism ||
              response.data.rating.professionalism ||
              0,
            overall: ratingsData.overall || response.data.rating.overall || 0,
          });
        } else {
          const overallRating = response.data.rating.rating || 0;
          setRatings({
            referralQuality: overallRating,
            communication: overallRating,
            professionalism: overallRating,
            overall: overallRating,
          });
        }
        setMessage(response.data.rating.review || '');
      } else {
        resetForm();
      }
    } catch (error: any) {
      console.error('[MarketerReviewModal] Error loading rating:', error);
      resetForm();
    } finally {
      setLoading(false);
    }
  };

  const resetForm = (): void => {
    setExistingRating(null);
    setRatings({
      referralQuality: 0,
      communication: 0,
      professionalism: 0,
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
      Alert.alert(
        'Rating Required',
        'Please provide an overall rating before submitting.',
        [{ text: 'OK' }]
      );
      return;
    }

    const marketerId = (marketer as any)?.id || (marketer as any)?.marketer?.id;
    if (!marketerId) {
      Alert.alert(
        'Error',
        'Marketer information is missing. Please try again.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const ratingData = {
        rating: ratings.overall,
        ratings: ratings,
        review: message.trim() || undefined,
      };

      console.log('[MarketerReviewModal] Submitting rating:', {
        marketerId: marketerId,
        marketer: marketer,
        ratingData,
      });

      const response = await submitMarketerRating(marketerId, ratingData);
      
      if (response.success) {
        Alert.alert(
          'Success',
          'Your rating has been submitted successfully!',
          [
            {
              text: 'OK',
              onPress: () => {
                onReviewSubmitted?.();
                onClose();
              }
            }
          ]
        );
      } else {
        const errorMessage = response.error || 'Failed to submit rating. Please try again.';
        console.error('[MarketerReviewModal] Submit error:', errorMessage);
        Alert.alert(
          'Error',
          errorMessage,
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      console.error('[MarketerReviewModal] Submit error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'An unexpected error occurred. Please try again.';
      Alert.alert(
        'Error',
        errorMessage,
        [{ text: 'OK' }]
      );
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

  if (!visible || !marketer) return null;

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
              {existingRating ? 'Update Your Review' : 'Rate This Marketer'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Marketer Name */}
          <Text style={[styles.marketerName, { color: colors.text }]}>
            {(marketer as any)?.name || (marketer as any)?.marketer?.name || 'Marketer'}
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
  marketerName: {
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

export default MarketerReviewModal;






