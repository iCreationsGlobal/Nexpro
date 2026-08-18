import { listPartners, getPartner, applyToPartner } from './absMarketer';

export const fetchPublicBusinesses = async (filters: { search?: string; category?: string } = {}) => {
  const businesses = await listPartners({
    search: filters.search,
    category: filters.category,
  });
  return {
    businesses: (businesses || []).map((b) => ({
      id: b.tenantId || b.id,
      businessId: b.tenantId,
      slug: b.slug,
      businessName: b.name,
      industry: b.category,
      location: b.location,
      pitch: b.pitch,
      logo: b.logoUrl,
      firstClientRatePercent: b.firstClientRatePercent,
      returningClientRatePercent: b.returningClientRatePercent,
      slotsLeft: b.slotsLeft,
      applicationsOpen: b.applicationsOpen,
      status: 'approved',
    })),
    pagination: { total: businesses?.length || 0 },
  };
};

export const getBusinessDetails = async (slugOrId: string) => {
  const b = await getPartner(slugOrId);
  return {
    data: {
      id: b.tenantId || b.id,
      businessId: b.tenantId,
      slug: b.slug,
      businessName: b.name,
      industry: b.category,
      location: b.location,
      pitch: b.pitch,
      logo: b.logoUrl,
      firstClientRatePercent: b.firstClientRatePercent,
      returningClientRatePercent: b.returningClientRatePercent,
      slotsLeft: b.slotsLeft,
      applicationsOpen: b.applicationsOpen,
    },
  };
};

export const requestPartnership = async (tenantId: string, pitch?: string) =>
  applyToPartner(tenantId, pitch);

export default {
  fetchPublicBusinesses,
  getBusinessDetails,
  requestPartnership,
};
