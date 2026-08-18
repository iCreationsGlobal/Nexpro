import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
  Pressable,
  Animated,
  Easing,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserPlus, Mail, Clock, CheckCircle, XCircle, X, RefreshCw, ChevronDown } from 'lucide-react-native';
import { Button, TextInput } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import { getStatusColor } from '../../utils/statusColors';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import EmptyState from '../../components/common/EmptyState';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { Invite } from '../../types/api';

type InvitesScreenProps = RootStackScreenProps<'Invites'>;

interface RoleOption {
  value: 'employee' | 'manager';
  label: string;
}

const InvitesScreen: React.FC<InvitesScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showInviteForm, setShowInviteForm] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<'employee' | 'manager'>('employee');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState<boolean>(false);

  // Animation ref for floating icon
  const iconFloatY = useRef(new Animated.Value(0)).current;

  const roleOptions: RoleOption[] = [
    { value: 'employee', label: 'Employee' },
    { value: 'manager', label: 'Manager' },
  ];

  useEffect(() => {
    fetchInvites();
  }, []);

  const fetchInvites = async (): Promise<void> => {
    try {
      setIsLoading(true);

      const response = await apiClient.get('/api/business/invites');

      if (response.data.invites) {
        setInvites(response.data.invites as Invite[]);
      }
    } catch (error: any) {
      // If 404, business might not have any invites yet - this is OK
      if (error.response?.status === 404) {
        setInvites([]);
      } else {
        setInvites([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendInvite = async (): Promise<void> => {
    if (!inviteEmail.trim()) {
      showDialog({
        title: 'Error',
        message: 'Please enter an email address',
        buttons: [{ text: 'OK' }]
      });
      return;
    }

    try {
      setIsSending(true);

      await apiClient.post('/api/business/invites', { email: inviteEmail, role: inviteRole });

      showDialog({
        title: 'Success',
        message: 'Invitation sent successfully!',
        buttons: [{ text: 'OK' }]
      });
      setInviteEmail('');
      setInviteRole('employee');
      setShowInviteForm(false);
      fetchInvites();
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: error.response?.data?.message || 'Failed to send invitation',
        buttons: [{ text: 'OK' }]
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleResendInvite = async (inviteId: string): Promise<void> => {
    try {
      await apiClient.post('/api/invites/resend', { inviteId });

      showDialog({
        title: 'Success',
        message: 'Invitation resent successfully!',
        buttons: [{ text: 'OK' }]
      });
      fetchInvites();
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: 'Failed to resend invitation',
        buttons: [{ text: 'OK' }]
      });
    }
  };

  const handleCancelInvite = async (inviteId: string): Promise<void> => {
    showDialog({
      title: 'Cancel Invitation',
      message: 'Are you sure you want to cancel this invitation?',
      buttons: [
        { 
          text: 'No', 
          style: 'cancel',
          onPress: () => hideDialog()
        },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.post('/api/invites/revoke', { inviteId });

              showDialog({
                title: 'Success',
                message: 'Invitation cancelled successfully!',
                buttons: [{ text: 'OK' }]
              });
              fetchInvites();
            } catch (error: any) {
              showDialog({
                title: 'Error',
                message: 'Failed to cancel invitation',
                buttons: [{ text: 'OK' }]
              });
            }
          },
        },
      ]
    });
  };

  const getStatusIcon = (status?: string): React.ReactElement => {
    switch (status) {
      case 'accepted':
        return <CheckCircle size={16} color="#10B981" strokeWidth={2} />;
      case 'declined':
        return <XCircle size={16} color={COLORS.ERROR} strokeWidth={2} />;
      default:
        return <Clock size={16} color="#F59E0B" strokeWidth={2} />;
    }
  };

  const getInviteStatusColor = (status?: string): string => {
    const statusColors = getStatusColor(status || 'pending', 'invite');
    return statusColors.text;
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <>
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Team Invites</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading invites...</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView 
            style={styles.scrollView} 
            contentContainerStyle={{ paddingBottom: 150 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
          {/* Invite Form */}
          {showInviteForm && (
            <View style={[styles.inviteForm, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Invite Team Member</Text>
              <Text style={[styles.formDescription, { color: colors.textSecondary }]}>
                Send an invitation to add a new team member to your business.
              </Text>
              
              <TextInput
                label="Email Address"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                mode="outlined"
                style={[styles.input, { backgroundColor: colors.cardBackground }]}
                outlineColor={colors.border}
                activeOutlineColor={COLORS.APP_GREEN}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="Enter email address"
                placeholderTextColor={colors.inputPlaceholder}
                textColor={colors.text}
              />

              {/* Role Selector */}
              <View style={styles.roleContainer}>
                <Text style={[styles.roleLabel, { color: colors.text }]}>Role</Text>
                <TouchableOpacity
                  style={[styles.roleSelector, { 
                    borderColor: colors.border,
                    backgroundColor: colors.cardBackground
                  }]}
                  onPress={() => setShowRoleDropdown(!showRoleDropdown)}
                >
                  <Text style={[styles.roleSelectorText, { color: colors.text }]}>
                    {roleOptions.find(r => r.value === inviteRole)?.label}
                  </Text>
                  <ChevronDown size={20} color={colors.iconSecondary} strokeWidth={1.5} />
                </TouchableOpacity>

                {showRoleDropdown && (
                  <View style={[styles.roleDropdown, { 
                    borderColor: colors.border,
                    backgroundColor: colors.cardBackground
                  }]}>
                    {roleOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.roleOption,
                          { borderBottomColor: colors.border },
                          inviteRole === option.value && [styles.roleOptionSelected, { 
                            backgroundColor: isDark ? colors.backgroundSecondary : '#F0FDF4' 
                          }],
                        ]}
                        onPress={() => {
                          setInviteRole(option.value);
                          setShowRoleDropdown(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.roleOptionText,
                            { color: colors.text },
                            inviteRole === option.value && styles.roleOptionTextSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                        {inviteRole === option.value && (
                          <CheckCircle size={16} color={COLORS.APP_GREEN} strokeWidth={2} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.formActions}>
                <Button
                  mode="outlined"
                  onPress={() => {
                    setShowInviteForm(false);
                    setInviteEmail('');
                    setInviteRole('employee');
                    setShowRoleDropdown(false);
                  }}
                  style={[styles.cancelButton, { borderColor: colors.border }]}
                  labelStyle={[styles.cancelButtonLabel, { color: colors.textSecondary }]}
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSendInvite}
                  loading={isSending}
                  disabled={isSending}
                  style={styles.sendButton}
                  labelStyle={styles.sendButtonLabel}
                >
                  Send Invite
                </Button>
              </View>
            </View>
          )}

          {/* Invites List */}
          {invites.length === 0 ? (
            <EmptyState 
              icon={UserPlus}
              title="No Invitations"
              subtitle="Start building your team by inviting team members and collaborators to work with your business."
              actionLabel={!showInviteForm ? "Invite Team Member" : undefined}
              onAction={!showInviteForm ? () => setShowInviteForm(true) : undefined}
            />
          ) : (
            <View style={styles.invitesSection}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Active Invitations ({invites.length})
              </Text>
              <View style={[styles.invitesGroup, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                {invites.map((invite, index) => (
                  <View
                    key={invite.id || index}
                    style={[
                      styles.inviteItem,
                      { borderBottomColor: colors.border },
                      index === invites.length - 1 && styles.lastInviteItem,
                    ]}
                  >
                    {/* Invite Info */}
                    <View style={styles.inviteInfo}>
                      <Text style={[styles.inviteEmail, { color: colors.text }]}>{invite.email || 'Unknown Email'}</Text>
                      <View style={styles.inviteMeta}>
                        <Text style={[styles.inviteMetaText, { color: colors.textSecondary }]}>
                          Role: <Text style={[styles.inviteMetaBold, { color: colors.text }]}>{invite.role || 'Team Member'}</Text>
                        </Text>
                        <Text style={[styles.inviteMetaDivider, { color: colors.textSecondary }]}>•</Text>
                        <View style={styles.statusContainer}>
                          {getStatusIcon(invite.status)}
                          <Text style={[styles.statusText, { color: getInviteStatusColor(invite.status) }]}>
                            {invite.status || 'Pending'}
                          </Text>
                        </View>
                        <Text style={[styles.inviteMetaDivider, { color: colors.textSecondary }]}>•</Text>
                        <Text style={[styles.inviteMetaText, { color: colors.textSecondary }]}>
                          Sent: {formatDate(invite.createdAt)}
                        </Text>
                      </View>
                    </View>

                    {/* Action Buttons */}
                    {invite.status !== 'accepted' && (
                      <View style={styles.inviteActions}>
                        <TouchableOpacity
                          style={[styles.actionButtonCancel, { 
                            backgroundColor: isDark ? colors.backgroundSecondary : '#FEE2E2' 
                          }]}
                          onPress={() => handleCancelInvite(invite.id)}
                        >
                          <XCircle size={16} color={COLORS.ERROR} strokeWidth={2} />
                          <Text style={styles.actionButtonCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionButtonResend, { 
                            backgroundColor: isDark ? colors.backgroundSecondary : '#F0FDF4' 
                          }]}
                          onPress={() => handleResendInvite(invite.id)}
                        >
                          <RefreshCw size={16} color={COLORS.APP_GREEN} strokeWidth={2} />
                          <Text style={styles.actionButtonResendText}>Resend</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>

    {/* Custom Dialog */}
    <CustomDialog
      visible={dialog.visible}
      title={dialog.title}
      message={dialog.message}
      buttons={dialog.buttons}
      onClose={hideDialog}
    />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  addButton: {
    padding: SPACING.xs,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl * 3,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  emptyButton: {
    backgroundColor: COLORS.APP_GREEN,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  inviteForm: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: 12,
    padding: SPACING.lg,
    borderWidth: 1,
  },
  formTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
  },
  formDescription: {
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  input: {
    marginBottom: SPACING.md,
  },
  roleContainer: {
    marginBottom: SPACING.md,
  },
  roleLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: SPACING.xs,
  },
  roleSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  roleSelectorText: {
    fontSize: FONT_SIZES.md,
  },
  roleDropdown: {
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
  },
  roleOptionSelected: {
  },
  roleOptionText: {
    fontSize: FONT_SIZES.md,
  },
  roleOptionTextSelected: {
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  formActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  cancelButton: {
    flex: 1,
  },
  cancelButtonLabel: {
    fontSize: FONT_SIZES.sm,
  },
  sendButton: {
    flex: 1,
    backgroundColor: COLORS.APP_GREEN,
  },
  sendButtonLabel: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.sm,
  },
  invitesSection: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
  },
  invitesGroup: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  inviteItem: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
  },
  lastInviteItem: {
    borderBottomWidth: 0,
  },
  inviteInfo: {
    marginBottom: SPACING.sm,
  },
  inviteEmail: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  inviteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  inviteMetaText: {
    fontSize: FONT_SIZES.xs,
  },
  inviteMetaBold: {
    fontWeight: FONT_WEIGHTS.medium,
    textTransform: 'capitalize',
  },
  inviteMetaDivider: {
    fontSize: FONT_SIZES.xs,
    marginHorizontal: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.medium,
    textTransform: 'capitalize',
  },
  inviteActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionButtonCancel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.ERROR,
  },
  actionButtonCancelText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.ERROR,
  },
  actionButtonResend: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.APP_GREEN,
  },
  actionButtonResendText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.APP_GREEN,
  },
});

export default InvitesScreen;






