import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettingsOnboardingBanner } from '../../hooks/useSettingsOnboardingBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  getSettingsCardHref,
  getVisibleSettingsCards,
  groupSettingsCards,
} from '../../utils/settingsRoutes';

/**
 * Settings hub card grid grouped by You / Business / Channels.
 */
const SettingsHub = () => {
  const navigate = useNavigate();
  const { isManager, hasFeature, activeTenant } = useAuth();
  const { showOnboardingBanner } = useSettingsOnboardingBanner();

  const visibleCards = useMemo(
    () => getVisibleSettingsCards({
      isManager,
      hasFeature,
      businessType: activeTenant?.businessType,
    }),
    [isManager, hasFeature, activeTenant?.businessType]
  );

  const groups = useMemo(() => groupSettingsCards(visibleCards), [visibleCards]);

  return (
    <div className="px-0 md:px-0">
      <div className="mb-4 md:mb-6">
        <h2 className="text-xl md:text-2xl font-semibold mb-1 md:mb-2">Settings</h2>
        <p className="text-xs md:text-sm text-muted-foreground">
          Manage your account, workspace, billing, and communication channels.
        </p>
      </div>

      {showOnboardingBanner && (
        <Card className="mb-3 md:mb-6 border-0 md:border border-brand bg-green-50">
          <CardContent className="p-2 md:p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-base md:text-lg font-semibold text-foreground mb-0.5 md:mb-1">Complete onboarding</h3>
                <p className="text-xs md:text-sm text-gray-600">
                  Finish setting up your business to get the most out of African Business Suite.
                </p>
              </div>
              <Button
                onClick={() => navigate('/onboarding')}
                className="shrink-0 bg-brand text-primary-foreground hover:bg-brand-dark border border-brand"
              >
                Complete onboarding
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6 md:space-y-8">
        {groups.map(({ key, label, cards }) => (
          <section key={key}>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {label}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {cards.map((card) => {
                const href = getSettingsCardHref(card);
                const isDisabled = card.comingSoon;

                if (isDisabled) {
                  return (
                    <div
                      key={card.slug}
                      className="flex items-center justify-between rounded-lg border border-gray-200 p-4 bg-muted/30 opacity-60 cursor-not-allowed"
                    >
                      <div className="min-w-0 pr-3">
                        <p className="font-medium text-sm md:text-base">{card.title}</p>
                        <p className="text-xs md:text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {card.subtitle}
                        </p>
                        <Badge variant="outline" className="mt-2 text-xs">Coming soon</Badge>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                  );
                }

                return (
                  <Link
                    key={card.slug}
                    to={href}
                    className="flex items-center justify-between rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="font-medium text-sm md:text-base">{card.title}</p>
                      <p className="text-xs md:text-sm text-muted-foreground mt-0.5 line-clamp-2">
                        {card.subtitle}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default SettingsHub;
