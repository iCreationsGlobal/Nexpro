import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { FilterChipRow } from '@/components/FilterChip';
import { FormInput, FormLabel } from '@/components/FormField';
import { FormSheetModal } from '@/components/FormSheetModal';
import { ListErrorState } from '@/components/ListScreenStates';
import { ScreenShell } from '@/components/ScreenShell';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useScreenColors } from '@/hooks/useScreenColors';
import { watchService } from '@/services/watchService';
import { formatInteger } from '@/utils/formatCurrency';
import { getApiErrorMessage, parseApiListResponse } from '@/utils/parseApiListResponse';
import { QUERY_STALE } from '@/utils/queryInvalidation';
import {
  formatWatchConfidence,
  formatWatchTime,
  parseWatchClipSource,
  watchDayParam,
  watchIncidentParams,
  WATCH_INCIDENT_FILTERS,
  WATCH_INCIDENT_STATUSES,
  WATCH_KIND_LABELS,
  WATCH_REVIEW_DECISIONS,
  WATCH_STATUS_LABELS,
  type WatchIncident,
  type WatchIncidentFilter,
  type WatchReviewDecision,
} from '@/utils/watch';

type WatchSummary = {
  visitors?: number;
  counterInteractions?: number;
  recordedSales?: number;
  unmatchedInteractions?: number;
  cameraMisses?: number;
  attentionRequired?: number;
};

type WatchCamera = { id: string; name?: string; role?: string };

const DAY_OPTIONS = [
  { value: '0', label: 'Today' },
  { value: '1', label: 'Yesterday' },
];

const CAMERA_ROLE_LABELS: Record<string, string> = {
  counter: 'Counter',
  entrance: 'Entrance',
  floor: 'Shop floor',
  exit: 'Exit',
};

const AMBER = '#b45309';

function saleLabel(incident: WatchIncident): string {
  if (incident.sale?.saleNumber) return incident.sale.saleNumber;
  return incident.saleId ? 'Sale recorded' : 'No sale found';
}

/**
 * ABS Watch: shop activity compared with recorded sales for a day, and the incidents a manager
 * reviews. Cameras, till zones and clip detection run from the web app / shop PC.
 */
export default function WatchScreen() {
  const { activeTenantId, hasFeature, isManager } = useAuth();
  const { activeShopId, scopeReady } = useWorkspaceScope();
  const { colors, cardBg, borderColor, textColor, mutedColor } = useScreenColors();
  const queryClient = useQueryClient();
  const enabled = !!activeTenantId && scopeReady && hasFeature('watch');

  const [daysAgo, setDaysAgo] = useState('0');
  const [filter, setFilter] = useState<WatchIncidentFilter>('attention');
  const [reviewing, setReviewing] = useState<WatchIncident | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const date = useMemo(() => watchDayParam(Number(daysAgo)), [daysAgo]);

  const summaryQuery = useQuery({
    queryKey: ['watch', 'summary', activeTenantId, activeShopId, date],
    queryFn: () => watchService.getSummary({ date }),
    enabled,
    staleTime: QUERY_STALE.TRANSACTIONAL,
  });

  const incidentsQuery = useQuery({
    queryKey: ['watch', 'incidents', activeTenantId, activeShopId, date, filter],
    queryFn: () => watchService.listIncidents({ date, ...watchIncidentParams(filter) }),
    enabled,
    staleTime: QUERY_STALE.TRANSACTIONAL,
  });

  const camerasQuery = useQuery({
    queryKey: ['watch', 'cameras', activeTenantId, activeShopId],
    queryFn: () => watchService.listCameras(),
    enabled,
    staleTime: QUERY_STALE.METADATA,
  });

  const summary = ((summaryQuery.data as { data?: WatchSummary } | undefined)?.data ?? {}) as WatchSummary;
  const incidents = useMemo(() => parseApiListResponse<WatchIncident>(incidentsQuery.data), [incidentsQuery.data]);
  const cameras = useMemo(() => parseApiListResponse<WatchCamera>(camerasQuery.data), [camerasQuery.data]);

  const invalidateWatch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['watch'] });
  }, [queryClient]);

  const reconcileMutation = useMutation({
    mutationFn: () => watchService.reconcile({ date }),
    onSuccess: invalidateWatch,
    onError: (e: unknown) => Alert.alert('Could not re-check sales', getApiErrorMessage(e, 'Try again in a moment.')),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: WatchReviewDecision; note?: string }) =>
      watchService.reviewIncident(id, { decision, note }),
    onSuccess: () => {
      setReviewing(null);
      setReviewNote('');
      invalidateWatch();
    },
    onError: (e: unknown) => Alert.alert('Could not save review', getApiErrorMessage(e, 'Try again in a moment.')),
  });

  const openReview = useCallback((incident: WatchIncident) => {
    setReviewing(incident);
    setReviewNote(incident.reviewNote || '');
  }, []);

  const saveReview = useCallback(
    (decision: WatchReviewDecision) => {
      if (!reviewing) return;
      reviewMutation.mutate({ id: reviewing.id, decision, note: reviewNote.trim() || undefined });
    },
    [reviewMutation, reviewNote, reviewing]
  );

  const openClip = useCallback((incident: WatchIncident) => {
    const source = parseWatchClipSource(incident);
    if (source.type === 'none') return;
    WebBrowser.openBrowserAsync(source.url).catch(() => {
      Alert.alert('Could not open clip', source.url);
    });
  }, []);

  const refreshing = summaryQuery.isRefetching || incidentsQuery.isRefetching || camerasQuery.isRefetching;
  const onRefresh = useCallback(() => {
    void summaryQuery.refetch();
    void incidentsQuery.refetch();
    void camerasQuery.refetch();
  }, [camerasQuery, incidentsQuery, summaryQuery]);

  const cards = useMemo<{ label: string; value?: number; icon: AppIconName; color?: string }[]>(
    () => [
      { label: 'Visitors', value: summary.visitors, icon: 'users' },
      { label: 'Counter interactions', value: summary.counterInteractions, icon: 'eye' },
      { label: 'Recorded sales', value: summary.recordedSales, icon: 'shopping-cart' },
      { label: 'Needs review', value: summary.unmatchedInteractions, icon: 'exclamation-triangle', color: AMBER },
      { label: 'Camera misses', value: summary.cameraMisses, icon: 'camera' },
    ],
    [summary]
  );

  if (!hasFeature('watch')) {
    return <FeatureAccessDenied message="ABS Watch is not included in this workspace." />;
  }

  if (summaryQuery.isError && incidentsQuery.isError) {
    return (
      <ListErrorState
        title="Failed to load Watch"
        message={getApiErrorMessage(summaryQuery.error, 'Could not load shop activity.')}
        onRetry={onRefresh}
      />
    );
  }

  const unmatched = summary.unmatchedInteractions || 0;
  const misses = summary.cameraMisses || 0;
  const reviewClip = parseWatchClipSource(reviewing);

  return (
    <ScreenShell style={styles.container}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
      >
        <Text style={[styles.intro, { color: mutedColor }]}>
          Shop activity compared with recorded sales. Review the gaps — Watch doesn't accuse staff.
        </Text>

        <View style={styles.toolbar}>
          <View style={styles.flex}>
            <FilterChipRow options={DAY_OPTIONS} value={daysAgo} onChange={setDaysAgo} />
          </View>
          {isManager ? (
            <Pressable
              onPress={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Re-check sales"
              style={({ pressed }) => [
                styles.recheckBtn,
                { borderColor, opacity: pressed || reconcileMutation.isPending ? 0.85 : 1 },
              ]}
            >
              {reconcileMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <AppIcon name="refresh" size={16} color={colors.tint} />
              )}
              <Text style={[styles.recheckText, { color: colors.tint }]}>Re-check sales</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.statsGrid}>
          {cards.map((card) => (
            <View key={card.label} style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.statHeader}>
                <Text style={[styles.statLabel, { color: mutedColor }]}>{card.label}</Text>
                <AppIcon name={card.icon} size={16} color={mutedColor} />
              </View>
              <Text style={[styles.statValue, { color: card.color || textColor }]}>
                {summaryQuery.isLoading ? '...' : formatInteger(card.value ?? 0)}
              </Text>
            </View>
          ))}
        </View>

        {(summary.attentionRequired || 0) > 0 ? (
          <View style={[styles.alertCard, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
            <AppIcon name="exclamation-triangle" size={18} color={AMBER} />
            <Text style={styles.alertText}>
              {unmatched} customer interaction{unmatched === 1 ? '' : 's'} may not have a matching sale.
              {misses > 0 ? ` ${misses} recorded sale${misses === 1 ? '' : 's'} had no matching camera activity.` : ''}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: textColor }]}>Incidents</Text>
        <FilterChipRow
          options={WATCH_INCIDENT_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          value={filter}
          onChange={(value) => setFilter(value as WatchIncidentFilter)}
        />

        <View style={styles.list}>
          {incidentsQuery.isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : incidentsQuery.isError ? (
            <View style={[styles.stateCard, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
              <Text style={[styles.stateText, { color: mutedColor }]}>
                {getApiErrorMessage(incidentsQuery.error, 'Could not load incidents. Pull to refresh.')}
              </Text>
            </View>
          ) : incidents.length === 0 ? (
            <View style={[styles.stateCard, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
              <AppIcon name="eye" size={22} color={mutedColor} />
              <Text style={[styles.stateTitle, { color: textColor }]}>
                {filter === 'attention' || filter === 'all' ? 'Nothing to review' : 'No matching incidents'}
              </Text>
              <Text style={[styles.stateText, { color: mutedColor }]}>
                {filter === 'attention' || filter === 'all'
                  ? 'Counter activity from your cameras is compared with recorded sales and shows up here.'
                  : 'Try another filter or day.'}
              </Text>
            </View>
          ) : (
            incidents.map((incident) => {
              const hasClip = parseWatchClipSource(incident).type !== 'none';
              const canReview = isManager && incident.status === WATCH_INCIDENT_STATUSES.PENDING;
              return (
                <View key={incident.id} style={[styles.incidentCard, { backgroundColor: cardBg, borderColor }]}>
                  <View style={styles.incidentTop}>
                    <Text style={[styles.incidentTime, { color: mutedColor }]}>{formatWatchTime(incident.startedAt)}</Text>
                    <View style={[styles.pill, { borderColor }]}>
                      <Text style={[styles.pillText, { color: textColor }]}>
                        {WATCH_STATUS_LABELS[incident.status || ''] || incident.status || '—'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.incidentKind, { color: textColor }]}>
                    {WATCH_KIND_LABELS[incident.kind || ''] || incident.kind || 'Activity'}
                  </Text>
                  {incident.copy ? (
                    <Text style={[styles.incidentCopy, { color: mutedColor }]}>{incident.copy}</Text>
                  ) : null}
                  <View style={styles.metaRow}>
                    <Text style={[styles.meta, { color: mutedColor }]}>ABS sale: {saleLabel(incident)}</Text>
                    <Text style={[styles.meta, { color: mutedColor }]}>
                      Confidence: {formatWatchConfidence(incident.confidence)}
                    </Text>
                  </View>
                  {hasClip || canReview ? (
                    <View style={styles.actionsRow}>
                      {hasClip ? (
                        <Pressable
                          onPress={() => openClip(incident)}
                          style={({ pressed }) => [styles.secondaryBtn, { borderColor, opacity: pressed ? 0.85 : 1 }]}
                        >
                          <AppIcon name="eye" size={16} color={colors.tint} />
                          <Text style={[styles.secondaryText, { color: colors.tint }]}>Watch clip</Text>
                        </Pressable>
                      ) : null}
                      {canReview ? (
                        <Pressable
                          onPress={() => openReview(incident)}
                          style={({ pressed }) => [
                            styles.primaryBtn,
                            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
                          ]}
                        >
                          <Text style={styles.primaryText}>Review</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: textColor }]}>Cameras</Text>
        <View style={[styles.menuCard, { backgroundColor: cardBg, borderColor }]}>
          {cameras.length === 0 ? (
            <Text style={[styles.cameraEmpty, { color: mutedColor }]}>No cameras yet.</Text>
          ) : (
            cameras.map((camera, index) => (
              <View
                key={camera.id}
                style={[
                  styles.cameraRow,
                  index < cameras.length - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor },
                ]}
              >
                <AppIcon name="camera" size={18} color={colors.tint} />
                <Text style={[styles.cameraName, { color: textColor }]} numberOfLines={1}>
                  {camera.name || 'Camera'}
                </Text>
                <Text style={[styles.cameraRole, { color: mutedColor }]}>
                  {CAMERA_ROLE_LABELS[camera.role || ''] || camera.role || ''}
                </Text>
              </View>
            ))
          )}
        </View>
        <Text style={[styles.hint, { color: mutedColor }]}>
          Add cameras and draw the till zone on the web app. Detection runs on a shop PC — ABS keeps events and
          short clips, not a live video feed.
        </Text>
      </ScrollView>

      <FormSheetModal
        visible={!!reviewing}
        title="Review incident"
        onClose={() => setReviewing(null)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <View style={styles.sheetFooter}>
            <Pressable
              onPress={() => saveReview(WATCH_REVIEW_DECISIONS.CONFIRM)}
              disabled={reviewMutation.isPending}
              style={({ pressed }) => [
                styles.sheetPrimary,
                { backgroundColor: colors.tint, opacity: pressed || reviewMutation.isPending ? 0.85 : 1 },
              ]}
            >
              {reviewMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Confirm</Text>
              )}
            </Pressable>
            <View style={styles.sheetSecondaryRow}>
              <Pressable
                onPress={() => saveReview(WATCH_REVIEW_DECISIONS.NEEDS_CONTEXT)}
                disabled={reviewMutation.isPending}
                style={({ pressed }) => [styles.sheetSecondary, { borderColor, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.secondaryText, { color: textColor }]}>Needs more context</Text>
              </Pressable>
              <Pressable
                onPress={() => saveReview(WATCH_REVIEW_DECISIONS.DISMISS)}
                disabled={reviewMutation.isPending}
                style={({ pressed }) => [styles.sheetSecondary, { borderColor, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.secondaryText, { color: textColor }]}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        }
      >
        {reviewing ? (
          <View style={styles.sheetBody}>
            <Text style={[styles.incidentKind, { color: textColor }]}>
              {WATCH_KIND_LABELS[reviewing.kind || ''] || reviewing.kind || 'Activity'}
            </Text>
            {reviewing.copy ? <Text style={[styles.sheetCopy, { color: textColor }]}>{reviewing.copy}</Text> : null}
            <Text style={[styles.meta, { color: mutedColor }]}>
              {formatWatchTime(reviewing.startedAt)} · ABS sale: {saleLabel(reviewing)}
            </Text>
            {reviewClip.type !== 'none' ? (
              <Pressable
                onPress={() => openClip(reviewing)}
                style={({ pressed }) => [styles.secondaryBtn, { borderColor, opacity: pressed ? 0.85 : 1 }]}
              >
                <AppIcon name="eye" size={16} color={colors.tint} />
                <Text style={[styles.secondaryText, { color: colors.tint }]}>Watch clip</Text>
              </Pressable>
            ) : (
              <Text style={[styles.meta, { color: mutedColor }]}>No clip attached to this incident.</Text>
            )}
            <View>
              <FormLabel>Note (optional)</FormLabel>
              <FormInput
                value={reviewNote}
                onChangeText={setReviewNote}
                placeholder="What you saw in the clip"
                multiline
              />
            </View>
          </View>
        ) : null}
      </FormSheetModal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  recheckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  recheckText: { fontSize: 13, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statCard: { width: '48.5%', borderWidth: 1, borderRadius: 12, padding: 14 },
  statHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statLabel: { fontSize: 12, marginBottom: 6, flexShrink: 1 },
  statValue: { fontSize: 22, fontWeight: '700' },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  alertText: { flex: 1, fontSize: 13, lineHeight: 18, color: '#92400e' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  list: { marginTop: 12, marginBottom: 8, gap: 10 },
  stateCard: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 22, borderRadius: 12 },
  stateTitle: { fontSize: 15, fontWeight: '700' },
  stateText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  incidentCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  incidentTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  incidentTime: { fontSize: 12 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '600' },
  incidentKind: { fontSize: 15, fontWeight: '700' },
  incidentCopy: { fontSize: 13, lineHeight: 18 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2 },
  meta: { fontSize: 12 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  secondaryText: { fontSize: 14, fontWeight: '600' },
  primaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  menuCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  cameraRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  cameraName: { flex: 1, fontSize: 15, fontWeight: '500' },
  cameraRole: { fontSize: 13 },
  cameraEmpty: { fontSize: 14, padding: 14 },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  sheetBody: { gap: 12 },
  sheetCopy: { fontSize: 15, lineHeight: 21 },
  sheetFooter: { gap: 8 },
  sheetPrimary: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, minHeight: 50 },
  sheetSecondaryRow: { flexDirection: 'row', gap: 8 },
  sheetSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 8,
  },
});
