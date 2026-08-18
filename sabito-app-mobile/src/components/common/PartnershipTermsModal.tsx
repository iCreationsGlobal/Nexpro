import React, { useState, useRef } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, StatusBar } from 'react-native';
import { Modal, Portal, Text, IconButton, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

const { height } = Dimensions.get('window');

interface PartnershipTermsModalProps {
  visible: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

const PartnershipTermsModal: React.FC<PartnershipTermsModalProps> = ({ visible, onAccept, onDismiss }) => {
  const [scrolledToBottom, setScrolledToBottom] = useState<boolean>(false);
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollPosition = contentOffset.y;
    const scrollViewHeight = layoutMeasurement.height;
    const contentHeight = contentSize.height;
    
    // Calculate progress (0 to 1)
    const maxScroll = contentHeight - scrollViewHeight;
    const progress = maxScroll > 0 ? Math.min(scrollPosition / maxScroll, 1) : 1;
    setScrollProgress(progress);
    
    // Check if near bottom (within 50px)
    const isAtBottom = scrollPosition + scrollViewHeight >= contentHeight - 50;
    if (isAtBottom && !scrolledToBottom) {
      setScrolledToBottom(true);
    }
  };

  const handleAccept = (): void => {
    if (scrolledToBottom) {
      onAccept();
      // Reset state for next time
      setScrolledToBottom(false);
      setScrollProgress(0);
    }
  };

  const handleClose = (): void => {
    // Reset state
    setScrolledToBottom(false);
    setScrollProgress(0);
    onDismiss();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleClose}
        contentContainerStyle={styles.modalContainer}
        dismissable={false}
      >
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.WHITE} />
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Header with progress bar */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Partnership Agreement</Text>
          <IconButton
            icon="close"
            size={24}
            iconColor={COLORS.GRAY}
            onPress={handleClose}
            style={styles.closeButton}
          />
          {/* Progress bar */}
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${scrollProgress * 100}%` }]} />
          </View>
        </View>

        {/* Scrollable Content */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={true}
        >
          <Text style={styles.versionText}>Last Updated: October 16, 2024 • Version 1.0</Text>

          <Text style={styles.introText}>
            This Partnership Agreement governs the relationship between Marketers (Referral Partners), 
            Businesses (Service Providers), and Sabito (Platform Provider).
          </Text>

          {/* Section 1 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. MARKETER OBLIGATIONS</Text>
            <Text style={styles.bulletPoint}>✓ Provide accurate client information</Text>
            <Text style={styles.bulletPoint}>✓ Only refer genuine, qualified leads</Text>
            <Text style={styles.bulletPoint}>✓ Maintain accepted partnership status</Text>
            <Text style={styles.bulletPoint}>✓ Respect business commission terms</Text>
            <Text style={styles.bulletPoint}>✓ Not misrepresent business services</Text>
          </View>

          {/* Section 2 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. BUSINESS OBLIGATIONS</Text>
            <Text style={styles.bulletPoint}>✓ Review referrals within 48 hours</Text>
            <Text style={styles.bulletPoint}>✓ Record accurate project revenue</Text>
            <Text style={styles.bulletPoint}>✓ Pay commissions on all revenue received</Text>
            <Text style={styles.bulletPoint}>✓ Record client payments within 7 days of receipt</Text>
            <Text style={styles.bulletPoint}>✓ Provide clear commission rates upfront</Text>
            <Text style={styles.bulletPoint}>✓ Honor commission agreements</Text>
          </View>

          {/* Section 3 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. SABITO OBLIGATIONS</Text>
            <Text style={styles.bulletPoint}>✓ Maintain secure platform</Text>
            <Text style={styles.bulletPoint}>✓ Calculate commissions accurately</Text>
            <Text style={styles.bulletPoint}>✓ Process cashouts within 7 business days</Text>
            <Text style={styles.bulletPoint}>✓ Provide transparent fee structure</Text>
            <Text style={styles.bulletPoint}>✓ Offer dispute resolution support</Text>
            <Text style={styles.bulletPoint}>✓ Protect user data</Text>
          </View>

          {/* Section 4 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. COMMISSION & REVENUE TERMS</Text>
            <Text style={styles.bodyText}>
              • <Text style={styles.bold}>Commissions calculated on actual revenue received</Text>
            </Text>
            <Text style={styles.bodyText}>
              • <Text style={styles.bold}>Different rates for new vs returning clients:</Text>
            </Text>
            <Text style={styles.indentedText}>- New Client: Business sets rate (typically 10-25%)</Text>
            <Text style={styles.indentedText}>- Returning Client: Business sets rate (typically 5-15%)</Text>
            <Text style={styles.bodyText}>
              • <Text style={styles.bold}>Revenue</Text> = Total payments from client to business
            </Text>
            <Text style={styles.bodyText}>
              • <Text style={styles.bold}>Commission</Text> = Revenue × Commission Rate
            </Text>
            <Text style={styles.bodyText}>
              • Commissions earned when payment status = "paid"
            </Text>
          </View>

          {/* Section 5 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. PLATFORM FEES (Sabito's Share)</Text>
            <Text style={styles.bodyText}>Sabito charges businesses a platform fee on revenue:</Text>
            
            <Text style={styles.subheading}>NEW CLIENTS:</Text>
            <Text style={styles.bulletPoint}>• Free Plan: 3% of revenue</Text>
            <Text style={styles.bulletPoint}>• Starter Plan: 2% of revenue</Text>
            <Text style={styles.bulletPoint}>• Pro Plan: 1% of revenue</Text>
            <Text style={styles.bulletPoint}>• VIP Plan: 0.5% of revenue</Text>
            
            <Text style={styles.subheading}>RETURNING CLIENTS:</Text>
            <Text style={styles.bulletPoint}>• Free Plan: 1% of revenue</Text>
            <Text style={styles.bulletPoint}>• Starter Plan: 0.5% of revenue</Text>
            <Text style={styles.bulletPoint}>• Pro Plan: 0.25% of revenue</Text>
            <Text style={styles.bulletPoint}>• VIP Plan: 0.1% of revenue</Text>
            
            <View style={styles.exampleBox}>
              <Text style={styles.exampleTitle}>Example:</Text>
              <Text style={styles.exampleText}>
                GH₵1,000 project, 15% commission, Pro plan, new client:
              </Text>
              <Text style={styles.exampleText}>- Business pays marketer: GH₵150 (15%)</Text>
              <Text style={styles.exampleText}>- Business pays Sabito: GH₵10 (1%)</Text>
              <Text style={styles.exampleText}>- Business keeps: GH₵840 (84%)</Text>
            </View>
          </View>

          {/* Section 6 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. PAYMENT TERMS</Text>
            <Text style={styles.bulletPoint}>• Businesses record payments when received from clients</Text>
            <Text style={styles.bulletPoint}>• Commissions calculated on recorded payments</Text>
            <Text style={styles.bulletPoint}>• Marketers request cashouts via dashboard</Text>
            <Text style={styles.bulletPoint}>• Sabito processes approved cashouts within 7 business days</Text>
            <Text style={styles.bulletPoint}>• Minimum cashout amount: GH₵50</Text>
          </View>

          {/* Section 7 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. DISPUTE RESOLUTION</Text>
            <Text style={styles.bulletPoint}>• Report disputes within 14 days of occurrence</Text>
            <Text style={styles.bulletPoint}>• Sabito reviews evidence from both parties</Text>
            <Text style={styles.bulletPoint}>• Platform maintains transaction records for verification</Text>
            <Text style={styles.bulletPoint}>• Decisions based on documented evidence</Text>
            <Text style={styles.bulletPoint}>• Final decision by Sabito admin team</Text>
          </View>

          {/* Section 8 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>8. TERMINATION</Text>
            <Text style={styles.bulletPoint}>• Either party may terminate partnership at any time</Text>
            <Text style={styles.bulletPoint}>• Existing commissions must be honored and paid</Text>
            <Text style={styles.bulletPoint}>• No commission on referrals after termination date</Text>
            <Text style={styles.bulletPoint}>• 30-day notice period recommended</Text>
          </View>

          {/* Section 9 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>9. LIABILITY</Text>
            <Text style={styles.bulletPoint}>• Sabito is a platform facilitator only</Text>
            <Text style={styles.bulletPoint}>• Business-marketer relationship is independent</Text>
            <Text style={styles.bulletPoint}>• Each party responsible for own actions</Text>
            <Text style={styles.bulletPoint}>• Sabito not liable for commission disputes</Text>
            <Text style={styles.bulletPoint}>• Platform accuracy not guaranteed</Text>
          </View>

          {/* Section 10 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>10. UPDATES TO TERMS</Text>
            <Text style={styles.bulletPoint}>• Sabito may update terms with 30 days notice</Text>
            <Text style={styles.bulletPoint}>• Continued use constitutes acceptance of new terms</Text>
            <Text style={styles.bulletPoint}>• Major changes require re-acceptance</Text>
            <Text style={styles.bulletPoint}>• You will be notified of any changes via email</Text>
          </View>

          <View style={styles.endSpacer} />
        </ScrollView>

        {/* Footer with button */}
        <View style={styles.footer}>
          {!scrolledToBottom && (
            <Text style={styles.scrollHint}>
              Scroll to the bottom to continue
            </Text>
          )}

          <Button
            mode="contained"
            onPress={handleAccept}
            disabled={!scrolledToBottom}
            style={styles.acceptButton}
            buttonColor={scrolledToBottom ? COLORS.APP_GREEN : COLORS.GRAY}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
          >
            Accept & Continue
          </Button>
        </View>
        </SafeAreaView>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: COLORS.WHITE,
    marginHorizontal: 0,
    marginVertical: 0,
    borderRadius: 0,
    height: height,
    width: '100%',
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
    backgroundColor: COLORS.WHITE,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  closeButton: {
    position: 'absolute',
    right: SPACING.xs,
    top: SPACING.xs,
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: COLORS.STROKE_COLOR,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: SPACING.sm,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  versionText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  introText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.BLACK,
    lineHeight: 22,
    marginBottom: SPACING.lg,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.sm,
  },
  bulletPoint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.BLACK,
    lineHeight: 22,
    marginBottom: SPACING.xs,
  },
  bodyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.BLACK,
    lineHeight: 22,
    marginBottom: SPACING.xs,
  },
  bold: {
    fontWeight: FONT_WEIGHTS.semibold,
  },
  indentedText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.BLACK,
    lineHeight: 22,
    marginLeft: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  subheading: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  exampleBox: {
    backgroundColor: '#F0FDF4',
    padding: SPACING.md,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.APP_GREEN,
    marginTop: SPACING.sm,
  },
  exampleTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.APP_GREEN,
    marginBottom: SPACING.xs,
  },
  exampleText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.BLACK,
    lineHeight: 20,
  },
  endSpacer: {
    height: SPACING.xl,
  },
  footer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: COLORS.STROKE_COLOR,
    backgroundColor: COLORS.WHITE,
  },
  scrollHint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.APP_GREEN,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  acceptButton: {
    width: '100%',
  },
  buttonContent: {
    paddingVertical: SPACING.xs,
  },
  buttonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default PartnershipTermsModal;






