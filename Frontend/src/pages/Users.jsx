import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../hooks/useDebounce';
import { useResponsive } from '../hooks/useResponsive';
import { useSmartSearch } from '../context/SmartSearchContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { showSuccess, showError, showInfo, handleApiError } from '../utils/toast';
import { isPricingUiEnabled } from '../utils/showPricing';
import { Button } from '@/components/ui/button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar as ShadcnAvatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const profileSchema = z.object({
  name: z.string().min(1, 'Enter your name'),
  email: z.string().email('Enter a valid email'),
  profilePicture: z.string().optional(),
});

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email'),
  role: z.enum(['admin', 'manager', 'staff', 'driver']),
  studioLocationIds: z.array(z.string()).optional(),
  shopIds: z.array(z.string()).optional(),
});
import {
  Trash2,
  User,
  Users as UsersIcon,
  Crown,
  Settings,
  Upload as UploadIcon,
  Unlock,
  Rocket,
  Mail,
  Phone,
  Calendar,
  Link,
  Copy,
  Filter,
  RefreshCw,
  Shield,
  Truck,
  Loader2
} from 'lucide-react';
import dayjs from 'dayjs';
import userService from '../services/userService';
import inviteService from '../services/inviteService';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import SeatUsageCard from '../components/SeatUsageCard';
import { useStudioLocationOptional } from '../context/StudioLocationContext';
import { useShopOptional } from '../context/ShopContext';
import shopService from '../services/shopService';
import { STUDIO_LIKE_TYPES } from '../constants';
import ActionColumn from '../components/ActionColumn';
import DetailsDrawer from '../components/DetailsDrawer';
import DashboardTable from '../components/DashboardTable';
import DashboardStatsCard from '../components/DashboardStatsCard';
import WelcomeSection from '../components/WelcomeSection';
import { EMPTY_STATES } from '../constants/microcopy';
import { getEmptyStateProps } from '../components/ui/empty-state';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SEARCH_PLACEHOLDERS, DEBOUNCE_DELAYS, ROLE_CHIP_CLASSES, STATUS_CHIP_DEFAULT_CLASS } from '../constants';
import { WORKSPACE_INVITE_ROLES, WORKSPACE_ROLE_DEFINITIONS } from '../constants/workspaceRoles';
import WorkspaceRoleDescription from '../components/WorkspaceRoleDescription';
import StatusChip from '../components/StatusChip';
import { resolveImageUrl } from '../utils/fileUtils';

const ADMIN_LIKE_ROLES = ['owner', 'admin'];

const getMemberRole = (record) => {
  const membership = Array.isArray(record?.tenantMemberships) ? record.tenantMemberships[0] : null;
  return membership?.role || record?.role || '';
};

const isAdminLikeRole = (role) => ADMIN_LIKE_ROLES.includes(role);

const Users = () => {
  const navigate = useNavigate();
  const { searchValue, setSearchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const { isMobile } = useResponsive();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  });
  const [filters, setFilters] = useState({
    role: 'all',
    isActive: 'all'
  });
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [viewingUser, setViewingUser] = useState(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [seatLimitDialogOpen, setSeatLimitDialogOpen] = useState(false);
  const [seatUsage, setSeatUsage] = useState(null);
  const [seatUsageLoading, setSeatUsageLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState(null);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [inviteShops, setInviteShops] = useState([]);
  const [loadingInviteShops, setLoadingInviteShops] = useState(false);
  /** Bumps when a new invite is sent so overlapping polls cancel */
  const inviteEmailPollGenRef = useRef(0);
  /** Sync lock — React state alone allows a double-click race before re-render */
  const inviteSubmitLockRef = useRef(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(null);
  const [refreshingUsers, setRefreshingUsers] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const { user, isAdmin, isManager, activeTenantId, activeTenant, hasFeature } = useAuth();
  const queryClient = useQueryClient();
  const studioLocationCtx = useStudioLocationOptional();
  const shopCtx = useShopOptional();
  const isStudioWorkspace = STUDIO_LIKE_TYPES.includes(activeTenant?.businessType);
  const isShopWorkspace = activeTenant?.businessType === 'shop';
  const [assignmentShopIds, setAssignmentShopIds] = useState([]);
  const [loadingShopAssignments, setLoadingShopAssignments] = useState(false);
  const [savingShopAssignments, setSavingShopAssignments] = useState(false);
  const showStudioLocationInvite =
    isStudioWorkspace &&
    hasFeature('studioLocationsModule') &&
    (studioLocationCtx?.locations?.length ?? 0) > 0;
  const showShopInvite =
    isShopWorkspace &&
    hasFeature('shopsModule') &&
    inviteShops.length > 0;

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      email: '',
      profilePicture: '',
    },
  });

  const inviteForm = useForm({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'staff',
      studioLocationIds: [],
      shopIds: [],
    },
  });

  const inviteRole = inviteForm.watch('role');

  const fetchInviteShops = useCallback(async () => {
    if (!isShopWorkspace || !hasFeature('shopsModule')) {
      setInviteShops([]);
      return;
    }
    try {
      setLoadingInviteShops(true);
      const response = await api.get('/shops', { params: { limit: 100, page: 1 } });
      const shopsData = Array.isArray(response?.data)
        ? response.data
        : (response?.data?.data || response?.data?.shops || []);
      setInviteShops(
        (Array.isArray(shopsData) ? shopsData : []).filter((s) => s.isActive !== false)
      );
    } catch {
      setInviteShops([]);
    } finally {
      setLoadingInviteShops(false);
    }
  }, [isShopWorkspace, hasFeature]);

  useEffect(() => {
    if (inviteModalVisible) {
      void fetchInviteShops();
    }
  }, [inviteModalVisible, fetchInviteShops]);

  const fetchPendingInvites = useCallback(async () => {
    try {
      setLoadingInvites(true);
      const response = await inviteService.getAllInvites({ used: 'false' });
      const data = response.data?.data ?? response.data ?? [];
      setPendingInvites(Array.isArray(data) ? data : []);
    } catch (error) {
      handleApiError(error, { context: 'fetch pending invites' });
      setPendingInvites([]);
    } finally {
      setLoadingInvites(false);
    }
  }, []);

  /**
   * Backend sends invite email asynchronously after POST returns; `emailStatus` becomes `sent` in DB only after send completes.
   * Poll so the Pending Invites table updates without a full page refresh.
   * @param {string} invitedEmail - Normalized email for the row to watch
   */
  const pollInviteEmailStatusUntilSettled = useCallback(
    async (invitedEmail) => {
      const normalized = (invitedEmail || '').trim().toLowerCase();
      if (!normalized) return;
      const pollGen = ++inviteEmailPollGenRef.current;
      const maxAttempts = 30;
      const intervalMs = 2000;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise((r) => setTimeout(r, intervalMs));
        if (pollGen !== inviteEmailPollGenRef.current) return;

        try {
          const response = await inviteService.getAllInvites({ used: 'false' });
          const data = response.data?.data ?? response.data ?? [];
          const list = Array.isArray(data) ? data : [];
          if (pollGen !== inviteEmailPollGenRef.current) return;
          setPendingInvites(list);

          const row = list.find((inv) => (inv.email || '').toLowerCase() === normalized);
          if (row && row.emailStatus && row.emailStatus !== 'pending') {
            return;
          }
        } catch {
          break;
        }
      }
    },
    []
  );

  useEffect(() => {
    setPageSearchConfig({ scope: 'users', placeholder: SEARCH_PLACEHOLDERS.USERS });
    return () => setPageSearchConfig(null);
  }, [setPageSearchConfig]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [searchValue]);

  useEffect(() => {
    if (!activeTenantId) return;
    fetchUsers();
  }, [activeTenantId, pagination.current, pagination.pageSize, filters.role, filters.isActive, debouncedSearch]);

  useEffect(() => {
    if (!activeTenantId || !isAdmin) return;
    fetchPendingInvites();
  }, [activeTenantId, isAdmin, fetchPendingInvites]);

  // Calculate stats whenever users data changes
  useEffect(() => {
    if (users && users.length > 0) {
      const totalUsers = users.length;
      const activeUsers = users.filter(u => u.isActive).length;
      const adminUsers = users.filter(u => u.role === 'admin').length;
      const managerUsers = users.filter(u => u.role === 'manager').length;
      const staffUsers = users.filter(u => u.role === 'staff').length;
      
      setStats({
        totalUsers,
        activeUsers,
        adminUsers,
        managerUsers,
        staffUsers
      });
    }
  }, [users]);

  const fetchUsers = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshingUsers(true);
      } else {
        setLoading(true);
      }
      const params = {
        page: pagination.current,
        limit: pagination.pageSize, // Backend pagination
      };
      
      if (filters.role !== 'all') {
        params.role = filters.role;
      }
      if (filters.isActive !== 'all') {
        params.isActive = filters.isActive === 'true';
      }
      if (debouncedSearch) params.search = debouncedSearch;

      const response = await userService.getAll(params);
      const list = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.data?.data)
          ? response.data.data
          : [];
      setUsers(list);
      setPagination((prev) => ({
        ...prev,
        total: response?.count ?? list.length,
      }));
    } catch (error) {
      handleApiError(error, { context: 'fetch users' });
      setUsers([]);
      setPagination((prev) => ({ ...prev, total: 0 }));
    } finally {
      if (isRefresh) {
        setRefreshingUsers(false);
      } else {
        setLoading(false);
      }
    }
  };

  // Calculate summary stats (current page; totals use pagination.total in cards where needed)
  const calculatedStats = useMemo(() => {
    const adminUsers = users.filter((u) => u.role === 'admin').length;
    const managerUsers = users.filter((u) => u.role === 'manager').length;
    const staffUsers = users.filter((u) => u.role === 'staff').length;
    const driverUsers = users.filter((u) => u.role === 'driver').length;

    return {
      totals: {
        totalUsers: pagination.total || users.length,
        adminUsers,
        managerUsers,
        staffUsers,
        driverUsers,
      },
    };
  }, [users, pagination.total]);

  const fetchSeatUsage = useCallback(async () => {
    if (!activeTenantId || !isManager) return;
    try {
      setSeatUsageLoading(true);
      const response = await inviteService.getSeatUsage();
      if (response?.success) {
        setSeatUsage(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch seat usage:', error);
    } finally {
      setSeatUsageLoading(false);
    }
  }, [activeTenantId, isManager]);

  useEffect(() => {
    void fetchSeatUsage();
  }, [fetchSeatUsage]);

  const handleUpgradePlan = useCallback(() => {
    setSeatLimitDialogOpen(false);
    navigate('/settings?tab=subscription');
  }, [navigate]);

  const handleInviteUser = useCallback(() => {
    if (seatUsage && !seatUsage.isUnlimited && !seatUsage.canAddMore) {
      setSeatLimitDialogOpen(true);
      return;
    }
    inviteForm.reset({
      email: '',
      role: 'staff',
    });
    setInviteModalVisible(true);
  }, [seatUsage, inviteForm]);

  const getInviteUrl = (token) => {
    return `${window.location.origin}/signup?token=${token}`;
  };

  const handleCopyPendingInviteLink = (invite) => {
    const url = getInviteUrl(invite.token);
    navigator.clipboard.writeText(url);
    showSuccess('Invite link copied to clipboard!');
  };

  const handleRevokeInvite = useCallback(async (id) => {
    try {
      setRevokingInviteId(id);
      await inviteService.revokeInvite(id);
      showSuccess('Invite revoked successfully');
      await fetchPendingInvites();
    } catch (error) {
      handleApiError(error, { context: 'revoke invite' });
    } finally {
      setRevokingInviteId(null);
    }
  }, [fetchPendingInvites]);

  const handleView = useCallback((user) => {
    setViewingUser(user);
    setDrawerVisible(true);
  }, []);

  useEffect(() => {
    if (!drawerVisible || !viewingUser?.id || !isShopWorkspace || !isAdmin) {
      setAssignmentShopIds([]);
      return;
    }
    const load = async () => {
      try {
        setLoadingShopAssignments(true);
        const res = await shopService.getUserAssignments(viewingUser.id);
        const data = res?.data ?? res;
        setAssignmentShopIds(Array.isArray(data?.shopIds) ? data.shopIds : []);
      } catch {
        setAssignmentShopIds([]);
      } finally {
        setLoadingShopAssignments(false);
      }
    };
    void load();
  }, [drawerVisible, viewingUser?.id, isShopWorkspace, isAdmin]);

  const handleSaveShopAssignments = useCallback(async () => {
    if (!viewingUser?.id) return;
    try {
      setSavingShopAssignments(true);
      await shopService.setUserAssignments(viewingUser.id, assignmentShopIds);
      showSuccess(
        assignmentShopIds.length
          ? 'Shop assignments updated. The user may need to refresh the app to see their shops.'
          : 'Shop assignments cleared.'
      );
    } catch (error) {
      handleApiError(error, { context: 'update shop assignments' });
    } finally {
      setSavingShopAssignments(false);
    }
  }, [viewingUser?.id, assignmentShopIds]);

  const handleCloseDrawer = useCallback(() => {
    setDrawerVisible(false);
    setViewingUser(null);
  }, []);

  const adminLikeCountOnPage = useMemo(
    () => users.filter((member) => isAdminLikeRole(getMemberRole(member))).length,
    [users]
  );

  const canRemoveMember = useCallback((record) => {
    if (!isAdmin || !record?.id) return false;
    if (user?.id && String(record.id) === String(user.id)) return false;
    const role = getMemberRole(record);
    const fullListLoaded = pagination.total === users.length;
    if (isAdminLikeRole(role) && fullListLoaded && adminLikeCountOnPage <= 1) {
      return false;
    }
    return true;
  }, [isAdmin, user?.id, pagination.total, users.length, adminLikeCountOnPage]);

  const cannotRemoveReason = useCallback((record) => {
    if (!record?.id) return '';
    if (user?.id && String(record.id) === String(user.id)) {
      return 'You cannot remove yourself from this workspace.';
    }
    const role = getMemberRole(record);
    const fullListLoaded = pagination.total === users.length;
    if (isAdminLikeRole(role) && fullListLoaded && adminLikeCountOnPage <= 1) {
      return 'This is the last remaining owner or admin. Assign another admin before removing them.';
    }
    return '';
  }, [user?.id, pagination.total, users.length, adminLikeCountOnPage]);

  const openRemoveMemberDialog = useCallback((record) => {
    if (!canRemoveMember(record)) return;
    setMemberToRemove(record);
    setDeleteDialogOpen(true);
  }, [canRemoveMember]);

  const handleDelete = useCallback(async () => {
    if (!memberToRemove?.id) return;
    try {
      setDeletingUser(true);
      await userService.delete(memberToRemove.id);
      showSuccess('Team member removed from this workspace');
      setDeleteDialogOpen(false);
      setMemberToRemove(null);
      if (viewingUser?.id === memberToRemove.id) {
        handleCloseDrawer();
      }
      await fetchUsers();
      void fetchSeatUsage();
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (error) {
      handleApiError(error, { context: 'remove team member' });
    } finally {
      setDeletingUser(false);
    }
  }, [memberToRemove, viewingUser?.id, fetchSeatUsage, handleCloseDrawer, queryClient]);

  const handleToggleStatus = useCallback(async (id) => {
    try {
      setTogglingStatus(id);
      await userService.toggleStatus(id);
      showSuccess('User status updated successfully');
      await fetchUsers();
      void fetchSeatUsage();
    } catch (error) {
      handleApiError(error, { context: 'update user status' });
    } finally {
      setTogglingStatus(null);
    }
  }, [fetchSeatUsage]);

  const onProfileSubmit = async (values) => {
    try {
      await userService.update(viewingUser.id, values);
      showSuccess('Profile updated successfully');
      setProfileModalVisible(false);
      fetchUsers();
    } catch (error) {
      showError(null, 'Failed to update profile');
    }
  };

  const onInviteSubmit = async (values) => {
    if (inviteSubmitLockRef.current) return;
    inviteSubmitLockRef.current = true;
    const invitedEmail = (values.email || '').trim().toLowerCase();
    try {
      setSubmittingInvite(true);
      await inviteService.generateInvite(values);
      showSuccess('Invite created. The user should receive an email shortly; delivery status updates below in a few seconds.');
      setInviteModalVisible(false);
      inviteForm.reset({ email: '', role: 'staff', studioLocationIds: [], shopIds: [] });
      await fetchPendingInvites();
      void fetchSeatUsage();
      void pollInviteEmailStatusUntilSettled(invitedEmail);
    } catch (error) {
      if (error?.response?.data?.code === 'SEAT_LIMIT_EXCEEDED') {
        setInviteModalVisible(false);
        setSeatLimitDialogOpen(true);
        void fetchSeatUsage();
        return;
      }
      if (error?.response?.data?.code === 'EMAIL_VERIFICATION_REQUIRED') {
        showError(error?.response?.data?.message || 'Verify your email to invite team members.');
        return;
      }
      if (error?.response?.data?.message?.includes('already exists') ||
          error?.response?.data?.message?.includes('already invited') ||
          error?.response?.data?.data?.inviteUrl) {
        showInfo('User already has an active invite. You can copy the link from the Pending Invites table.');
      } else {
        handleApiError(error, { context: 'generate invite' });
      }
    } finally {
      inviteSubmitLockRef.current = false;
      setSubmittingInvite(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setPagination(prev => ({
      ...prev,
      current: 1
    }));
  };

  const handleProfileUpdate = (user) => {
    setViewingUser(user);
    profileForm.reset({
      name: user.name,
      email: user.email,
      profilePicture: user.profilePicture || '',
    });
    setProfileModalVisible(true);
  };

  // Table columns for DashboardTable
  const tableColumns = useMemo(() => [
    {
      key: 'avatar',
      label: 'Avatar',
      render: (_, record) => {
        const picUrl = resolveImageUrl(record?.profilePicture || '') || '';
        return (
          <ShadcnAvatar className={cn('h-10 w-10 aspect-square rounded-full', picUrl ? 'cursor-pointer' : '')}>
            {picUrl ? (
              <button
                type="button"
                onClick={() => setImagePreviewUrl(picUrl)}
                className="w-full h-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset rounded-full"
              >
                <AvatarImage src={picUrl} />
              </button>
            ) : (
              <>
                <AvatarImage src={undefined} />
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </>
            )}
          </ShadcnAvatar>
        );
      }
    },
    {
      key: 'name',
      label: 'Name',
      render: (_, record) => (
        <div>
          <div className="font-bold text-foreground">{record?.name || '—'}</div>
          {record?.email && (
            <div className="text-muted-foreground text-xs">{record.email}</div>
          )}
        </div>
      )
    },
    {
      key: 'role',
      label: 'Role',
      render: (_, record) => {
        const roleIcons = {
          admin: <Crown className="h-3 w-3 mr-1" />,
          manager: <Settings className="h-3 w-3 mr-1" />,
          staff: <User className="h-3 w-3 mr-1" />,
          driver: <Truck className="h-3 w-3 mr-1" />,
          employee: <User className="h-3 w-3 mr-1" />
        };
        return (
          <Badge
            variant="outline"
            className={ROLE_CHIP_CLASSES[record?.role] ?? STATUS_CHIP_DEFAULT_CLASS}
          >
            {roleIcons[record?.role]}
            {record?.role?.toUpperCase() || '—'}
          </Badge>
        );
      }
    },
    {
      key: 'isActive',
      label: 'Status',
      mobileDashboardPlacement: 'headerEnd',
      render: (_, record) => isAdmin ? (
        <Switch
          checked={record?.isActive}
          onCheckedChange={() => handleToggleStatus(record.id)}
          disabled={togglingStatus === record.id}
        />
      ) : (
        <StatusChip status={record?.isActive ? 'active_flag' : 'inactive_flag'} />
      )
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (_, record) => <span className="text-foreground">{record?.createdAt ? dayjs(record.createdAt).format('MMM DD, YYYY') : '—'}</span>
    },
    {
      key: 'lastLogin',
      label: 'Last Login',
      render: (_, record) => <span className="text-foreground">{record?.lastLogin ? dayjs(record.lastLogin).format('MMM DD, YYYY') : 'Never'}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => {
        const blockedReason = cannotRemoveReason(record);
        const showRemove = isAdmin;
        const removeDisabled = !canRemoveMember(record);
        return (
          <div className="flex items-center gap-2">
            <SecondaryButton
              size="sm"
              onClick={() => handleView(record)}
            >
              View
            </SecondaryButton>
            {showRemove && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={removeDisabled}
                      onClick={() => openRemoveMemberDialog(record)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </span>
                </TooltipTrigger>
                {removeDisabled && blockedReason ? (
                  <TooltipContent>{blockedReason}</TooltipContent>
                ) : (
                  <TooltipContent>Remove this person from the workspace</TooltipContent>
                )}
              </Tooltip>
            )}
          </div>
        );
      }
    }
  ], [isAdmin, user, handleView, handleToggleStatus, canRemoveMember, cannotRemoveReason, openRemoveMemberDialog]);

  const roleOptions = useMemo(() => {
    const roleIcons = {
      admin: <Crown className="h-4 w-4" />,
      manager: <Settings className="h-4 w-4" />,
      staff: <User className="h-4 w-4" />,
      driver: <Truck className="h-4 w-4" />,
    };
    return WORKSPACE_INVITE_ROLES.map((value) => ({
      value,
      label: WORKSPACE_ROLE_DEFINITIONS[value]?.label || value,
      icon: roleIcons[value],
    }));
  }, []);

  const statusOptions = [
    { value: 'true', label: 'Active' },
    { value: 'false', label: 'Inactive' }
  ];

  const handleClearFilters = useCallback(() => {
    setFilters({
      role: 'all',
      isActive: 'all'
    });
    setSearchValue('');
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [setSearchValue]);

  const hasActiveFilters =
    filters.role !== 'all' ||
    filters.isActive !== 'all' ||
    debouncedSearch.trim();

  const usersEmptyState = useMemo(() => {
    if (hasActiveFilters) {
      return getEmptyStateProps(EMPTY_STATES.USERS_FILTERED, {
        primary: handleClearFilters,
      });
    }

    return getEmptyStateProps(EMPTY_STATES.USERS, {
      ...(isAdmin ? { primary: handleInviteUser } : {}),
    });
  }, [hasActiveFilters, handleClearFilters, isAdmin, handleInviteUser]);

  const getEmailStatusBadge = (status) => {
    if (status === 'sent') return <StatusChip status="sent" />;
    if (status === 'failed') return <StatusChip status="failed" />;
    return <StatusChip status="pending" />;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <WelcomeSection
          welcomeMessage="Users Management"
          subText={
            isAdmin
              ? 'Manage user accounts, roles, and permissions.'
              : 'View workspace members. Only a workspace administrator can invite users, manage invites, or change roles and status.'
          }
        />
        {isManager && (
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <SecondaryButton onClick={() => setFilterDrawerOpen(true)} size={isMobile ? "icon" : "default"}>
                  <Filter className="h-4 w-4" />
                  {!isMobile && <span className="ml-2">Filter</span>}
                </SecondaryButton>
              </TooltipTrigger>
              <TooltipContent>Filter users by role or status</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <SecondaryButton onClick={() => fetchUsers(true)} disabled={refreshingUsers} size={isMobile ? "icon" : "default"}>
                  {refreshingUsers ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </SecondaryButton>
              </TooltipTrigger>
              <TooltipContent>Refresh users list</TooltipContent>
            </Tooltip>
            {isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleInviteUser}>
                    <Link className="h-4 w-4 mr-2" />
                    Invite User
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Invite a new user to your workspace</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <DashboardStatsCard
          tooltip="Total number of users in your workspace"
          title="Total Users"
          value={calculatedStats?.totals?.totalUsers || 0}
          icon={UsersIcon}
          iconBgColor="rgba(22, 101, 52, 0.1)"
          iconColor="#166534"
        />
        <DashboardStatsCard
          tooltip="Users with admin role"
          title="Admins"
          value={calculatedStats?.totals?.adminUsers || 0}
          icon={Crown}
          iconBgColor="rgba(239, 68, 68, 0.1)"
          iconColor="#ef4444"
        />
        <DashboardStatsCard
          tooltip="Users with manager role"
          title="Managers"
          value={calculatedStats?.totals?.managerUsers || 0}
          icon={Settings}
          iconBgColor="rgba(139, 92, 246, 0.1)"
          iconColor="#8b5cf6"
        />
        <DashboardStatsCard
          tooltip="Users with staff role"
          title="Staff"
          value={calculatedStats?.totals?.staffUsers || 0}
          icon={Shield}
          iconBgColor="rgba(132, 204, 22, 0.1)"
          iconColor="#84cc16"
        />
        <DashboardStatsCard
          tooltip="Users with driver role"
          title="Drivers"
          value={calculatedStats?.totals?.driverUsers || 0}
          icon={Truck}
          iconBgColor="rgba(245, 158, 11, 0.1)"
          iconColor="#d97706"
        />
      </div>

      {/* Pending Invites – only show when there are invites or still loading */}
      {isAdmin && (loadingInvites || pendingInvites.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Invites
            </CardTitle>
            <CardDescription>
              Invited users who have not signed up yet. Delivery shows when the invite email has finished sending—the list may show Pending for a few seconds right after you invite while the server sends the message.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingInvites ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="md:hidden divide-y divide-gray-100">
                  {pendingInvites.map((invite) => (
                    <div key={invite.id} className="p-3 space-y-2">
                      <p className="text-sm font-medium break-all">{invite.email}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={ROLE_CHIP_CLASSES[invite.role] ?? STATUS_CHIP_DEFAULT_CLASS}>
                          {invite.role?.toUpperCase() ?? '—'}
                        </Badge>
                        {getEmailStatusBadge(invite.emailStatus)}
                      </div>
                      {invite.emailStatus === 'failed' && invite.emailLastError ? (
                        <p className="text-xs text-red-600 break-words">{invite.emailLastError}</p>
                      ) : null}
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>Invited: {invite.createdAt ? dayjs(invite.createdAt).format('MMM DD, YYYY') : '—'}</p>
                        <p>Expires: {invite.expiresAt ? dayjs(invite.expiresAt).format('MMM DD, YYYY') : '—'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <SecondaryButton
                          size="sm"
                          onClick={() => handleCopyPendingInviteLink(invite)}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </SecondaryButton>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRevokeInvite(invite.id)}
                          disabled={revokingInviteId === invite.id}
                        >
                          {revokingInviteId === invite.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-1" />
                          )}
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <table className="hidden md:table w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left font-medium py-3 px-4">Email</th>
                      <th className="text-left font-medium py-3 px-4">Role</th>
                      <th className="text-left font-medium py-3 px-4">Delivery</th>
                      <th className="text-left font-medium py-3 px-4">Invited</th>
                      <th className="text-left font-medium py-3 px-4">Expires</th>
                      <th className="text-right font-medium py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvites.map((invite) => (
                      <tr key={invite.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-3 px-4">{invite.email}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className={ROLE_CHIP_CLASSES[invite.role] ?? STATUS_CHIP_DEFAULT_CLASS}>
                            {invite.role?.toUpperCase() ?? '—'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {getEmailStatusBadge(invite.emailStatus)}
                            {invite.emailStatus === 'failed' && invite.emailLastError && (
                              <p className="text-xs text-red-600 max-w-[280px] truncate" title={invite.emailLastError}>
                                {invite.emailLastError}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {invite.createdAt ? dayjs(invite.createdAt).format('MMM DD, YYYY') : '—'}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {invite.expiresAt ? dayjs(invite.expiresAt).format('MMM DD, YYYY') : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <SecondaryButton
                              size="sm"
                              onClick={() => handleCopyPendingInviteLink(invite)}
                            >
                              <Copy className="h-4 w-4 mr-1" />
                              Copy link
                            </SecondaryButton>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleRevokeInvite(invite.id)}
                              disabled={revokingInviteId === invite.id}
                            >
                              {revokingInviteId === invite.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 mr-1" />
                              )}
                              Revoke
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Users Table */}
      <DashboardTable
        data={users}
        columns={tableColumns}
        loading={loading}
        title={null}
        emptyState={usersEmptyState}
        pageSize={pagination.pageSize}
        onPageChange={(newPagination) => {
          setPagination(newPagination);
        }}
        externalPagination={{
          current: pagination.current,
          total: pagination.total,
        }}
      />

      {/* Filter Drawer */}
      <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[400px] md:w-[540px] overflow-y-auto"
          style={{ top: 8, bottom: 8, right: 8, height: 'calc(100dvh - 16px)', borderRadius: 8 }}
        >
          <SheetHeader className="pb-4 border-b">
            <SheetTitle>Filter Users</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={filters.role}
                onValueChange={(value) => setFilters({ ...filters, role: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roleOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={filters.isActive}
                onValueChange={(value) => setFilters({ ...filters, isActive: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <SecondaryButton onClick={handleClearFilters} className="w-full">
                Clear Filters
              </SecondaryButton>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Remove team member confirmation */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deletingUser) return;
          setDeleteDialogOpen(open);
          if (!open) setMemberToRemove(null);
        }}
      >
        <DialogContent className="sm:w-[var(--modal-w)] sm:min-h-0">
          <DialogHeader>
            <DialogTitle>Remove team member</DialogTitle>
            <DialogDescription>
              This permanently removes them from this workspace. They will lose access to this business, including shops and studio locations assigned here. Their account is not deleted if they belong to other workspaces.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-foreground">
              Remove{' '}
              <span className="font-medium">
                {memberToRemove?.name || memberToRemove?.email || 'this team member'}
              </span>
              {memberToRemove?.email && memberToRemove?.name ? (
                <span className="text-muted-foreground"> ({memberToRemove.email})</span>
              ) : null}
              {' '}from this workspace?
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (deletingUser) return;
                setDeleteDialogOpen(false);
                setMemberToRemove(null);
              }}
              disabled={deletingUser}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deletingUser}
            >
              {deletingUser ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Drawer */}
      <DetailsDrawer
        open={drawerVisible}
        onClose={handleCloseDrawer}
        title="User Details"
        width={720}
        onEdit={null}
        onDelete={null}
        deleteConfirmText="Are you sure you want to remove this team member from the workspace?"
        extraActions={
          isAdmin && viewingUser
            ? [{
                key: 'remove-member',
                label: 'Remove from workspace',
                icon: <Trash2 className="h-4 w-4" />,
                variant: 'destructive',
                disabled: !canRemoveMember(viewingUser),
                onClick: () => openRemoveMemberDialog(viewingUser),
              }]
            : []
        }
        fields={viewingUser ? [
          { 
            label: 'Avatar', 
            value: viewingUser.profilePicture,
            render: (picture) => {
              const picUrl = resolveImageUrl(picture || '') || '';
              return (
                <ShadcnAvatar className="h-20 w-20 aspect-square rounded-full">
                  {picUrl ? (
                    <button
                      type="button"
                      onClick={() => setImagePreviewUrl(picUrl)}
                      className="w-full h-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset rounded-full"
                    >
                      <AvatarImage src={picUrl} />
                    </button>
                  ) : (
                    <>
                      <AvatarImage src={undefined} />
                      <AvatarFallback>
                        <User className="h-10 w-10" />
                      </AvatarFallback>
                    </>
                  )}
                </ShadcnAvatar>
              );
            }
          },
          { label: 'Full Name', value: viewingUser.name },
          { label: 'Email', value: viewingUser.email },
          { 
            label: 'Role', 
            value: viewingUser.role,
            render: (role) => {
              const icons = {
                admin: <Crown className="h-3 w-3 mr-1" />,
                manager: <Settings className="h-3 w-3 mr-1" />,
                staff: <User className="h-3 w-3 mr-1" />,
                driver: <Truck className="h-3 w-3 mr-1" />,
              };
              return (
                <Badge variant="secondary" className="gap-1">
                  {icons[role]}
                  {role?.toUpperCase() || '—'}
                </Badge>
              );
            }
          },
          { 
            label: 'Status', 
            value: viewingUser.isActive,
            render: (isActive) => (
              <StatusChip status={isActive ? 'active_flag' : 'inactive_flag'} />
            )
          },
          { 
            label: 'Created At', 
            value: viewingUser.createdAt,
            render: (date) => dayjs(date).format('MMMM DD, YYYY HH:mm')
          },
          { 
            label: 'Last Updated', 
            value: viewingUser.updatedAt,
            render: (date) => dayjs(date).format('MMMM DD, YYYY HH:mm')
          },
          { 
            label: 'Last Login', 
            value: viewingUser.lastLogin,
            render: (date) => date ? dayjs(date).format('MMMM DD, YYYY HH:mm') : 'Never'
          },
          ...(isShopWorkspace && isAdmin && (viewingUser.role === 'manager' || viewingUser.role === 'staff')
            ? [{
                label: 'Assigned shops',
                value: assignmentShopIds,
                render: () => (
                  <div className="space-y-3">
                    {loadingShopAssignments ? (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading shops…
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          This user only sees data for the shops you select.
                        </p>
                        <div className="space-y-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                          {(shopCtx?.shops?.length ? shopCtx.shops : inviteShops).map((shop) => {
                            const checked = assignmentShopIds.includes(shop.id);
                            return (
                              <label key={shop.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    setAssignmentShopIds((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(shop.id);
                                      else next.delete(shop.id);
                                      return [...next];
                                    });
                                  }}
                                  className="rounded border-border accent-primary"
                                />
                                {shop.name}
                                {shop.isDefault ? (
                                  <span className="text-muted-foreground text-xs">(main)</span>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                        <SecondaryButton
                          type="button"
                          size="sm"
                          onClick={handleSaveShopAssignments}
                          disabled={savingShopAssignments}
                        >
                          {savingShopAssignments ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          Save shop assignments
                        </SecondaryButton>
                      </>
                    )}
                  </div>
                ),
              }]
            : []),
        ] : []}
      />

      {isManager && (
        <SeatUsageCard
          size="wide"
          seatUsage={seatUsage}
          loading={seatUsageLoading}
          showUpgradeButton={isPricingUiEnabled()}
          onUpgradePlan={handleUpgradePlan}
        />
      )}

      <AlertDialog open={seatLimitDialogOpen} onOpenChange={setSeatLimitDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Seat limit reached</AlertDialogTitle>
            <AlertDialogDescription>
              {seatUsage?.planName ? (
                <>
                  Your <strong>{seatUsage.planName}</strong> plan includes{' '}
                  <strong>
                    {seatUsage.limit} seat{seatUsage.limit === 1 ? '' : 's'}
                  </strong>
                  . You have <strong>{seatUsage.current}</strong> active user
                  {seatUsage.current === 1 ? '' : 's'}, so you cannot invite more team members
                  {isPricingUiEnabled()
                    ? ' until you upgrade your plan.'
                    : '. Contact support if you need more seats.'}
                </>
              ) : (
                <>
                  You have reached your plan&apos;s seat limit.
                  {isPricingUiEnabled()
                    ? ' Upgrade your plan to invite more team members.'
                    : ' Contact support if you need more seats.'}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {isPricingUiEnabled() && (
              <AlertDialogAction onClick={handleUpgradePlan}>
                <Rocket className="h-4 w-4 mr-2" />
                Upgrade Plan
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite User Dialog */}
      <Dialog open={inviteModalVisible} onOpenChange={(open) => {
        if (!open) {
          setInviteModalVisible(false);
        }
      }}>
        <DialogContent className="sm:w-[var(--modal-w-lg)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)]">
          <DialogHeader>
            <DialogTitle>Invite New User</DialogTitle>
            <DialogDescription>
              Generate an invite link to share with a new user
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Form {...inviteForm}>
              <form onSubmit={inviteForm.handleSubmit(onInviteSubmit)} className="space-y-4">
                <FormField
                  control={inviteForm.control}
              name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                            type="email"
                placeholder="user@example.com"
                            className="pl-9"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={inviteForm.control}
              name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                {roleOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              <span className="flex items-center gap-2">
                    {option.icon} {option.label}
                              </span>
                            </SelectItem>
                ))}
                        </SelectContent>
              </Select>
                      {inviteRole ? <WorkspaceRoleDescription role={inviteRole} /> : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {showStudioLocationInvite && inviteRole !== 'admin' && (
                  <FormField
                    control={inviteForm.control}
                    name="studioLocationIds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Studio locations</FormLabel>
                        <p className="text-sm text-muted-foreground mb-2">
                          Staff, drivers, and managers only see data for the studios you select.
                        </p>
                        <div className="space-y-2 border rounded-lg p-3 max-h-40 overflow-y-auto">
                          {(studioLocationCtx?.locations || []).map((loc) => {
                            const checked = (field.value || []).includes(loc.id);
                            return (
                              <label key={loc.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(field.value || []);
                                    if (e.target.checked) next.add(loc.id);
                                    else next.delete(loc.id);
                                    field.onChange([...next]);
                                  }}
                                  className="rounded border-border"
                                />
                                {loc.name}
                              </label>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {showShopInvite && inviteRole !== 'admin' && (
                  <FormField
                    control={inviteForm.control}
                    name="shopIds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shops</FormLabel>
                        <p className="text-sm text-muted-foreground mb-2">
                          Staff, drivers, and managers only see data for the shops you select.
                        </p>
                        {loadingInviteShops ? (
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading shops…
                          </p>
                        ) : (
                          <div className="space-y-2 border rounded-lg p-3 max-h-40 overflow-y-auto">
                            {inviteShops.map((shop) => {
                              const checked = (field.value || []).includes(shop.id);
                              return (
                                <label key={shop.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      const next = new Set(field.value || []);
                                      if (e.target.checked) next.add(shop.id);
                                      else next.delete(shop.id);
                                      field.onChange([...next]);
                                    }}
                                    className="rounded border-border accent-primary"
                                  />
                                  <span>
                                    {shop.name}
                                    {shop.isDefault ? (
                                      <span className="text-muted-foreground ml-1">(main)</span>
                                    ) : null}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <Alert>
                  <AlertTitle>How It Works</AlertTitle>
                  <AlertDescription>
                    We will email an invite link directly to the user. You can still copy links later from the Pending Invites table.
                  </AlertDescription>
                </Alert>
                <DialogFooter>
                  <SecondaryButton type="button" onClick={() => {
                  setInviteModalVisible(false);
                }} disabled={submittingInvite}>
                  Cancel
                </SecondaryButton>
                  <Button type="submit" loading={submittingInvite}>
                    Send Invite
                  </Button>
                </DialogFooter>
              </form>
          </Form>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={!!imagePreviewUrl} onOpenChange={(open) => !open && setImagePreviewUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Image preview</DialogTitle>
          </DialogHeader>
          {imagePreviewUrl && (
            <img
              src={imagePreviewUrl}
              alt="Profile preview"
              className="w-full h-auto max-h-[85vh] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;


