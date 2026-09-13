/**
 * Decide which overview APIs a tenant should load.
 * Rental workspaces use the invoice financial path plus rental ops — never product-sales.
 *
 * @param {{ businessType?: string }} opts
 * @returns {{
 *   isRental: boolean,
 *   isShopOrPharmacy: boolean,
 *   fetchRentalOverview: boolean,
 *   includeProductSales: boolean,
 *   endpoints: string[],
 * }}
 */
export function getReportsOverviewFetchPlan({ businessType } = {}) {
  const type = businessType || 'printing_press';
  const isRental = type === 'rental';
  const isShopOrPharmacy = type === 'shop' || type === 'pharmacy';

  return {
    isRental,
    isShopOrPharmacy,
    fetchRentalOverview: isRental,
    includeProductSales: isShopOrPharmacy,
    endpoints: [
      '/reports/overview/phase1',
      ...(isRental ? ['/reports/rental/overview'] : []),
    ],
  };
}
