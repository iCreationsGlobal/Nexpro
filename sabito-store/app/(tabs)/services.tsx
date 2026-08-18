import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ServiceCard } from '@/components/services/ServiceCard';
import { ServiceCategoryChip } from '@/components/services/ServiceCategoryChip';
import { ServiceSection } from '@/components/services/ServiceSection';
import { StudioCard } from '@/components/services/StudioCard';
import { EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { BRAND } from '@/constants';
import { marketplaceApi, type MarketplaceService } from '@/services/marketplaceApi';
import { analytics } from '@/utils/analytics';

export default function ServicesTabScreen() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['services-home'],
    queryFn: () => marketplaceApi.getServicesHome(),
  });

  useEffect(() => {
    analytics.track('service_home_view');
  }, []);

  const payload = data?.data;

  const filteredFeatured = useMemo(() => {
    if (!payload || !activeCategory) return payload?.featuredServices || [];
    return payload.featuredServices.filter((service) => service.category === activeCategory);
  }, [payload, activeCategory]);

  const openService = (service: MarketplaceService) => {
    const studioSlug = service.studio?.slug;
    if (!studioSlug || !service.slug) return;
    analytics.track('service_view', { serviceId: service.id, studioSlug });
    router.push(`/service/${studioSlug}/${service.slug}`);
  };

  if (isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading services..." />
      </Screen>
    );
  }

  if (isError || !payload) {
    return (
      <Screen>
        <ErrorState message="We could not load services right now." onRetry={() => refetch()} />
      </Screen>
    );
  }

  if (!payload.hasProviders) {
    return (
      <Screen>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{payload.hero.eyebrow}</Text>
          <Text style={styles.title}>{payload.hero.title}</Text>
          <Text style={styles.subtitle}>{payload.hero.description}</Text>
        </View>
        <EmptyState
          title="No service providers yet"
          message="Studios and service listings will appear here once providers launch on Sabito Store."
          actionLabel="Browse products"
          onAction={() => router.push('/(tabs)/store')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BRAND.primary} />}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{payload.hero.eyebrow}</Text>
          <Text style={styles.title}>{payload.hero.title}</Text>
          <Text style={styles.subtitle}>{payload.hero.description}</Text>
          <Pressable style={styles.searchBtn} onPress={() => router.push({ pathname: '/search', params: { mode: 'services' } })}>
            <Text style={styles.searchBtnText}>Search services and studios</Text>
          </Pressable>
        </View>

        {payload.categories?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <ServiceCategoryChip label="All" active={!activeCategory} onPress={() => setActiveCategory(null)} />
            {payload.categories.map((category) => (
              <ServiceCategoryChip
                key={category.name}
                label={category.name}
                active={activeCategory === category.name}
                onPress={() => {
                  analytics.track('category_select', { category: category.name, scope: 'services' });
                  setActiveCategory(category.name);
                }}
              />
            ))}
          </ScrollView>
        ) : null}

        {payload.popularStudios?.length ? (
          <ServiceSection title="Popular studios" subtitle="Trusted local providers">
            {payload.popularStudios.map((studio) => (
              <StudioCard key={studio.slug} studio={studio} onPress={() => router.push(`/studio/${studio.slug}`)} />
            ))}
          </ServiceSection>
        ) : null}

        {filteredFeatured.length ? (
          <ServiceSection title="Featured services">
            {filteredFeatured.map((service) => (
              <ServiceCard key={service.id} service={service} onPress={() => openService(service)} />
            ))}
          </ServiceSection>
        ) : null}

        {payload.bookableServices?.length ? (
          <ServiceSection title="Book online" subtitle="Pay securely when booking is enabled">
            {payload.bookableServices.map((service) => (
              <ServiceCard key={`book-${service.id}`} service={service} onPress={() => openService(service)} />
            ))}
          </ServiceSection>
        ) : null}

        {payload.quoteServices?.length ? (
          <ServiceSection title="Request a quote" subtitle="Send details and get a custom response">
            {payload.quoteServices.map((service) => (
              <ServiceCard key={`quote-${service.id}`} service={service} onPress={() => openService(service)} />
            ))}
          </ServiceSection>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    gap: 6,
  },
  eyebrow: { color: BRAND.primary, fontWeight: '800', textTransform: 'uppercase', fontSize: 12 },
  title: { color: BRAND.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: BRAND.muted, lineHeight: 20 },
  searchBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  searchBtnText: { color: BRAND.primary, fontWeight: '700' },
  filters: { paddingHorizontal: 16, paddingBottom: 8 },
});
