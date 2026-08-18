import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ReviewSnippet } from '@/components/ReviewSnippet';
import { ServiceCard } from '@/components/services/ServiceCard';
import { EmptyState, Screen, SectionTitle } from '@/components/ui';
import { BRAND } from '@/constants';
import { marketplaceApi, type MarketplaceService } from '@/services/marketplaceApi';
import { analytics } from '@/utils/analytics';
import { resolveImageUrl } from '@/utils/format';

export default function StudioScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['studio', slug],
    queryFn: () => marketplaceApi.getStudioHome(slug),
    enabled: Boolean(slug),
  });

  const payload = data?.data;
  const studio = payload?.studio;

  if (isLoading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={BRAND.primary} />
      </Screen>
    );
  }

  if (!studio) {
    return (
      <Screen style={styles.center}>
        <EmptyState title="Studio not found" message="This provider may not be published yet." />
      </Screen>
    );
  }

  const banner = resolveImageUrl(studio.bannerImageUrl);
  const logo = resolveImageUrl(studio.logoUrl);

  const openService = (service: MarketplaceService) => {
    analytics.track('service_view', { serviceId: service.id, studioSlug: slug || '' });
    router.push(`/service/${slug}/${service.slug}`);
  };

  const servicesByCategory = (payload?.services || []).reduce<Map<string, MarketplaceService[]>>((map, service) => {
    const key = service.category || 'Services';
    const list = map.get(key) || [];
    list.push(service);
    map.set(key, list);
    return map;
  }, new Map());

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {banner ? <Image source={{ uri: banner }} style={styles.banner} contentFit="cover" /> : <View style={[styles.banner, styles.placeholder]} />}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            {logo ? <Image source={{ uri: logo }} style={styles.logo} contentFit="cover" /> : null}
            <View style={styles.meta}>
              <Text style={styles.title}>{studio.displayName || slug}</Text>
              {studio.category ? <Text style={styles.category}>{studio.category}</Text> : null}
              {[studio.city, studio.country].filter(Boolean).length ? (
                <Text style={styles.location}>{[studio.city, studio.country].filter(Boolean).join(', ')}</Text>
              ) : null}
              <ReviewSnippet
                rating={studio.reviewSummary?.rating ?? studio.rating}
                reviewsCount={studio.reviewSummary?.reviewsCount ?? studio.reviewsCount}
              />
            </View>
          </View>
          {studio.description ? <Text style={styles.desc}>{studio.description}</Text> : null}
          <View style={styles.badges}>
            {studio.serviceCount ? <Text style={styles.badge}>{studio.serviceCount} services</Text> : null}
            <Text style={styles.badge}>Verified Sabito provider</Text>
          </View>
          {studio.contactPhone ? <Text style={styles.contact}>Phone: {studio.contactPhone}</Text> : null}
        </View>

        {payload?.featuredServices?.length ? (
          <View style={styles.section}>
            <SectionTitle title="Featured services" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {payload.featuredServices.map((service) => (
                <ServiceCard key={service.id} service={service} onPress={() => openService(service)} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {[...servicesByCategory.entries()].map(([category, services]) => (
          <View key={category} style={styles.section}>
            <SectionTitle title={category} />
            {services.map((service) => (
              <Pressable key={service.id} style={styles.serviceRow} onPress={() => openService(service)}>
                <View style={styles.serviceBody}>
                  <Text style={styles.serviceTitle}>{service.title}</Text>
                  {service.shortDescription ? <Text style={styles.serviceDesc} numberOfLines={2}>{service.shortDescription}</Text> : null}
                  <ReviewSnippet rating={service.rating} reviewsCount={service.reviewsCount} compact />
                </View>
                <Text style={styles.serviceCta}>{service.canBookOnline ? 'Book' : 'Request'}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 24 },
  banner: { width: '100%', height: 160 },
  placeholder: { backgroundColor: '#dcfce7' },
  header: { padding: 16, gap: 10 },
  headerRow: { flexDirection: 'row', gap: 12 },
  logo: { width: 64, height: 64, borderRadius: 14 },
  meta: { flex: 1, gap: 4 },
  title: { fontSize: 24, fontWeight: '900', color: BRAND.text },
  category: { color: BRAND.primary, fontWeight: '700' },
  location: { color: BRAND.muted },
  desc: { color: BRAND.muted, lineHeight: 22 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: BRAND.text,
    fontSize: 12,
    fontWeight: '600',
  },
  contact: { color: BRAND.text, fontWeight: '600' },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  row: { paddingBottom: 4 },
  serviceRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  serviceBody: { flex: 1, gap: 4 },
  serviceTitle: { fontWeight: '800', color: BRAND.text, fontSize: 16 },
  serviceDesc: { color: BRAND.muted },
  serviceCta: { color: BRAND.primary, fontWeight: '800' },
});
