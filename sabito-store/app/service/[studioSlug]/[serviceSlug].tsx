import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BookingSummaryCard } from '@/components/services/BookingSummaryCard';
import { ReviewSnippet } from '@/components/ReviewSnippet';
import { ReviewList } from '@/components/ReviewList';
import { ErrorState, PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND } from '@/constants';
import { marketplaceApi } from '@/services/marketplaceApi';
import { reviewsApi } from '@/services/ordersApi';
import { formatCurrency, resolveImageUrl } from '@/utils/format';
import { analytics } from '@/utils/analytics';

export default function ServiceDetailScreen() {
  const { studioSlug, serviceSlug } = useLocalSearchParams<{ studioSlug: string; serviceSlug: string }>();
  const { customer, isAuthenticated } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [activeImage, setActiveImage] = useState(0);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['service', studioSlug, serviceSlug],
    queryFn: () => marketplaceApi.getService(studioSlug, serviceSlug),
    enabled: Boolean(studioSlug && serviceSlug),
  });

  const payload = data?.data;
  const service = payload?.service;
  const studio = payload?.studio;

  const reviewsQuery = useQuery({
    queryKey: ['service-reviews', service?.id],
    queryFn: () => reviewsApi.getServiceReviews(service!.id),
    enabled: Boolean(service?.id),
  });

  const requestMutation = useMutation({
    mutationFn: () =>
      marketplaceApi.submitServiceRequest({
        studioSlug,
        serviceSlug,
        serviceListingId: service?.id,
        name,
        email,
        phone,
        message,
        preferredDate: preferredDate || undefined,
        preferredTime: preferredTime || undefined,
      }),
    onSuccess: () => {
      analytics.track('service_request_sent', { serviceId: service?.id || '', studioSlug: studioSlug || '' });
      Alert.alert('Request sent', 'The studio will contact you soon.');
    },
    onError: (err: { message?: string }) => Alert.alert('Failed', err.message || 'Could not send request'),
  });

  const payMutation = useMutation({
    mutationFn: () =>
      marketplaceApi.initializeServicePaystack({
        studioSlug: studioSlug || '',
        serviceSlug: serviceSlug || '',
        serviceListingId: service?.id,
        preferredDate: preferredDate || undefined,
        preferredTime: preferredTime || undefined,
        message,
      }),
    onSuccess: (res) => {
      const url = res?.data?.authorization_url;
      const reference = res?.data?.reference;
      const jobId = res?.data?.booking?.jobId;
      if (!url || !reference || !jobId) {
        Alert.alert('Payment error', 'Could not start Paystack checkout.');
        return;
      }
      analytics.track('service_paystack_start', { serviceId: service?.id || '', studioSlug: studioSlug || '' });
      router.push({
        pathname: '/service/booking/paystack',
        params: { url, reference, jobId },
      });
    },
    onError: (err: { message?: string }) => Alert.alert('Booking failed', err.message || 'Try again'),
  });

  useEffect(() => {
    if (!customer) return;
    setName(customer.name || '');
    setEmail(customer.email || '');
    setPhone(customer.phone || '');
  }, [customer]);

  const images = useMemo(
    () => (service?.images || []).map((entry) => resolveImageUrl(entry)).filter(Boolean) as string[],
    [service?.images],
  );

  const validateContactDetails = () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter your name before sending this request.');
      return false;
    }
    if (!email.trim() && !phone.trim()) {
      Alert.alert('Contact required', 'Enter an email or phone number so the provider can reach you.');
      return false;
    }
    return true;
  };

  if (isLoading) {
    return (
      <Screen style={styles.center}>
        <Text>Loading service...</Text>
      </Screen>
    );
  }

  if (isError || !service) {
    return (
      <Screen>
        <ErrorState message="Service not found or unavailable." onRetry={() => refetch()} />
      </Screen>
    );
  }

  const requiresAppointment = service.ctaType === 'book_service';

  const submitRequest = () => {
    if (!validateContactDetails()) return;
    requestMutation.mutate();
  };

  const startPaidBooking = () => {
    if (requiresAppointment && (!preferredDate.trim() || !preferredTime.trim())) {
      Alert.alert('Appointment required', 'Choose a preferred date and time for this service before paying.');
      return;
    }
    payMutation.mutate();
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {images.length ? (
        <>
          <Image source={{ uri: images[activeImage] }} style={styles.hero} contentFit="cover" />
          {images.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
              {images.map((uri, index) => (
                <Pressable key={uri} onPress={() => setActiveImage(index)}>
                  <Image source={{ uri }} style={[styles.thumb, activeImage === index && styles.thumbActive]} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </>
      ) : (
        <View style={[styles.hero, styles.placeholder]} />
      )}

      <View style={styles.body}>
        <Text style={styles.title}>{service.title}</Text>
        {studio?.displayName ? (
          <Pressable onPress={() => router.push(`/studio/${studio.slug}`)}>
            <Text style={styles.studio}>{studio.displayName}</Text>
          </Pressable>
        ) : null}
        {service.startingPrice ? (
          <Text style={styles.price}>From {formatCurrency(service.startingPrice, service.currency || 'GHS')}</Text>
        ) : (
          <Text style={styles.price}>Quote on request</Text>
        )}
        <ReviewSnippet rating={service.rating} reviewsCount={service.reviewsCount} />
        {service.durationMinutes ? <Text style={styles.meta}>Duration: {service.durationMinutes} min</Text> : null}
        {service.turnaroundLabel ? <Text style={styles.meta}>{service.turnaroundLabel}</Text> : null}
        {service.shortDescription ? <Text style={styles.desc}>{service.shortDescription}</Text> : null}
        {service.description ? <Text style={styles.desc}>{service.description}</Text> : null}

        <BookingSummaryCard service={service} preferredDate={preferredDate} preferredTime={preferredTime} />

        <Text style={styles.section}>Your details</Text>
        {[
          { label: 'Name', value: name, set: setName },
          { label: 'Email', value: email, set: setEmail },
          { label: 'Phone', value: phone, set: setPhone },
        ].map((field) => (
          <TextInput key={field.label} style={styles.input} placeholder={field.label} value={field.value} onChangeText={field.set} />
        ))}

        {requiresAppointment || service.canBookOnline ? (
          <>
            <Text style={styles.section}>
              {requiresAppointment ? 'Preferred appointment' : 'Preferred appointment (optional)'}
            </Text>
            <TextInput style={styles.input} placeholder="Preferred date (YYYY-MM-DD)" value={preferredDate} onChangeText={setPreferredDate} />
            <TextInput style={styles.input} placeholder="Preferred time (HH:MM)" value={preferredTime} onChangeText={setPreferredTime} />
          </>
        ) : null}

        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Tell them what you need"
          value={message}
          onChangeText={setMessage}
          multiline
        />

        {service.canBookOnline ? (
          isAuthenticated ? (
            <PrimaryButton
              label="Book and pay with Paystack"
              onPress={startPaidBooking}
              loading={payMutation.isPending}
            />
          ) : (
            <PrimaryButton label="Sign in to book online" onPress={() => router.push('/login')} />
          )
        ) : null}

        {service.canRequestQuote || !service.canBookOnline ? (
          <SecondaryButton label={requestMutation.isPending ? 'Sending...' : 'Send request'} onPress={submitRequest} />
        ) : null}

        <ReviewList reviews={(reviewsQuery.data?.data?.reviews as never[]) || []} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 32 },
  hero: { width: '100%', height: 220 },
  placeholder: { backgroundColor: '#e2e8f0' },
  thumbs: { paddingHorizontal: 16, paddingTop: 10 },
  thumb: { width: 64, height: 64, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: BRAND.border },
  thumbActive: { borderColor: BRAND.primary, borderWidth: 2 },
  body: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '800', color: BRAND.text },
  studio: { color: BRAND.primary, fontWeight: '700' },
  price: { fontSize: 20, fontWeight: '800', color: BRAND.primary },
  meta: { color: BRAND.muted },
  desc: { color: BRAND.muted, lineHeight: 22 },
  section: { marginTop: 8, fontWeight: '700', fontSize: 18, color: BRAND.text },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
});
