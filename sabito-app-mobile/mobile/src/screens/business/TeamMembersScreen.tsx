import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, Mail, Calendar } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { User } from '../../types/api';

type TeamMembersScreenProps = RootStackScreenProps<'TeamMembers'>;

interface TeamMember extends User {
  accountType?: 'business' | 'marketer' | 'admin';
}

const TeamMembersScreen: React.FC<TeamMembersScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async (): Promise<void> => {
    try {
      setIsLoading(true);

      const response = await apiClient.get('/api/business/team-members');

      if (response.data.teamMembers) {
        setTeamMembers(response.data.teamMembers as TeamMember[]);
      }
    } catch (error: any) {
      // If 404, business might not have team members yet - this is OK
      if (error.response?.status === 404) {
        setTeamMembers([]);
      } else {
        setTeamMembers([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Team Members</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading team members...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {teamMembers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Users size={48} color={colors.iconSecondary} strokeWidth={1.5} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Team Members Yet</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Invite team members to collaborate on your business account.
              </Text>
            </View>
          ) : (
            <View style={[styles.membersGroup, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              {teamMembers.map((member, index) => (
                <TouchableOpacity
                  key={member.id || index}
                  style={[
                    styles.memberItem,
                    { borderBottomColor: colors.border },
                    index === teamMembers.length - 1 && styles.lastMemberItem,
                  ]}
                >
                  <View style={styles.memberAvatar}>
                    {member.profileImage ? (
                      <Image source={{ uri: member.profileImage }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>
                          {member.name?.charAt(0)?.toUpperCase() || 'U'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: colors.text }]}>{member.name}</Text>
                    <Text style={[styles.memberEmail, { color: colors.textSecondary }]}>{member.email}</Text>
                    <Text style={[styles.memberRole, { color: colors.textSecondary }]}>
                      {member.accountType === 'business' ? 'Business Owner' : 'Team Member'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
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
  },
  membersGroup: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  lastMemberItem: {
    borderBottomWidth: 0,
  },
  memberAvatar: {
    marginRight: SPACING.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  memberEmail: {
    fontSize: FONT_SIZES.sm,
    marginBottom: 2,
  },
  memberRole: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.APP_GREEN,
    fontWeight: FONT_WEIGHTS.medium,
  },
});

export default TeamMembersScreen;






