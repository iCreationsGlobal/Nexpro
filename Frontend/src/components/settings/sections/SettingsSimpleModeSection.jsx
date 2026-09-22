import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanEye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '../../../context/AuthContext';
import settingsService from '../../../services/settingsService';
import { clearSimpleModeEscape } from '../../../utils/simpleModeEscape';
import { showError } from '../../../utils/toast';

/**
 * Toggle for the photo-and-number Sell/Stock experience — mirrors mobile's Simple Mode
 * switch in mobile/app/settings.tsx. A personal, per-membership preference: shown to every
 * user regardless of role, same as mobile.
 */
const SettingsSimpleModeSection = () => {
  const { interfaceMode, refreshAuthState } = useAuth();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);

  const handleToggle = useCallback(
    async (enabled) => {
      const next = enabled ? 'simple' : 'full';
      setSwitching(true);
      try {
        await settingsService.updateInterfaceMode(next);
        clearSimpleModeEscape();
        await refreshAuthState();
        if (enabled) {
          navigate('/simple');
        }
      } catch (err) {
        showError(err, 'Could not update your interface preference.');
      } finally {
        setSwitching(false);
      }
    },
    [refreshAuthState, navigate]
  );

  return (
    <Card className="border border-gray-200">
      <CardHeader>
        <CardTitle className="text-base md:text-2xl">Simple Mode</CardTitle>
        <CardDescription className="text-xs md:text-sm">
          A photo-and-number screen for Sell and Stock — no reading required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between py-1 md:py-0">
          <div className="flex items-center gap-3">
            <ScanEye className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="font-medium text-sm md:text-base">Use Simple Mode</p>
              <p className="text-xs md:text-sm text-muted-foreground">
                Unlocks daily with a 4-digit PIN; long-press the logo and enter it again to come
                back here.
              </p>
            </div>
          </div>
          <Switch
            checked={interfaceMode === 'simple'}
            disabled={switching}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default SettingsSimpleModeSection;
