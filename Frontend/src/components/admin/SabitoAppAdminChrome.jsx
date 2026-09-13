import { Link, useLocation } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const SABITO_APP_ADMIN_SECTIONS = {
  overview: {
    key: 'overview',
    path: '/admin/sabito-app/overview',
    label: 'Overview',
    title: 'Sabito App overview',
    description: 'Marketer program listings, remittances from businesses, and cashouts ABS pays to marketers.',
    permission: 'overview.view',
    searchPlaceholder: 'Search Sabito App Admin...',
  },
  businesses: {
    key: 'businesses',
    path: '/admin/sabito-app/businesses',
    label: 'Businesses',
    title: 'Business listings',
    description: 'Review tenant submissions. Approve to go live on Sabito App, or reject / suspend a listing.',
    permission: 'tenants.view',
    searchPlaceholder: 'Search businesses, tenants, or slugs...',
  },
  marketers: {
    key: 'marketers',
    path: '/admin/sabito-app/marketers',
    label: 'Marketers',
    title: 'Marketers',
    description: 'Sabito App marketer accounts across businesses.',
    permission: 'tenants.view',
    searchPlaceholder: 'Search marketers by name, email, or phone...',
  },
  referrals: {
    key: 'referrals',
    path: '/admin/sabito-app/referrals',
    label: 'Referrals',
    title: 'Referrals',
    description: 'Leads marketers submitted to partner businesses.',
    permission: 'tenants.view',
    searchPlaceholder: 'Search referrals by client name, email, or phone...',
  },
  collections: {
    key: 'collections',
    path: '/admin/sabito-app/collections',
    label: 'Collections',
    title: 'Collections',
    description: 'Full marketer commissions businesses remitted to ABS. ABS keeps the platform take and pays the rest to marketers.',
    permission: 'billing.view',
    searchPlaceholder: 'Search collections by business name...',
  },
  cashouts: {
    key: 'cashouts',
    path: '/admin/sabito-app/cashouts',
    label: 'Cashouts',
    title: 'Cashouts',
    description: 'Pay marketers their share after the business remittance has been collected.',
    permission: 'billing.view',
    searchPlaceholder: 'Search cashouts by marketer...',
  },
  settings: {
    key: 'settings',
    path: '/admin/sabito-app/settings',
    label: 'Settings',
    title: 'Platform take',
    description: 'Percent of each remitted marketer commission that ABS keeps. The rest is paid to the marketer.',
    permission: 'settings.view',
    searchPlaceholder: 'Search Sabito App settings...',
  },
};

const NAV_ITEMS = [
  SABITO_APP_ADMIN_SECTIONS.overview,
  SABITO_APP_ADMIN_SECTIONS.businesses,
  SABITO_APP_ADMIN_SECTIONS.marketers,
  SABITO_APP_ADMIN_SECTIONS.referrals,
  SABITO_APP_ADMIN_SECTIONS.collections,
  SABITO_APP_ADMIN_SECTIONS.cashouts,
  SABITO_APP_ADMIN_SECTIONS.settings,
];

/**
 * Shared header + section tabs for Sabito App Admin (marketer program).
 */
export default function SabitoAppAdminChrome({ section, actions, children }) {
  const location = useLocation();
  const config = SABITO_APP_ADMIN_SECTIONS[section] || SABITO_APP_ADMIN_SECTIONS.overview;

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-brand" />
              <h2 className="text-2xl font-semibold text-foreground">{config.title}</h2>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">{config.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="w-fit border-brand/30 text-brand">
              Sabito App Admin
            </Badge>
            {actions}
          </div>
        </div>
      </div>

      <div className="mb-2 flex gap-2 overflow-x-auto border-b border-border pb-2">
        {NAV_ITEMS.map((item) => {
          const isActive = section === item.key || location.pathname === item.path;
          return (
            <Button
              key={item.key}
              asChild
              variant={isActive ? 'default' : 'ghost'}
              size="sm"
              className="shrink-0"
            >
              <Link to={item.path}>{item.label}</Link>
            </Button>
          );
        })}
      </div>

      {children}
    </div>
  );
}
