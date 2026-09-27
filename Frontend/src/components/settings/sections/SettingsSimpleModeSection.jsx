import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LayoutList, Lock, ScanEye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '../../../context/AuthContext';
import { useSimpleMode } from '../../../hooks/useSimpleMode';
import settingsService from '../../../services/settingsService';
import { devicePinService } from '../../../services/devicePin';
import { lockSimpleMode } from '../../simple/SimpleModePinGate';
import { showError, showSuccess } from '../../../utils/toast';

const SettingRow = ({ icon: Icon, title, description, children }) => (
  <div className="flex items-center justify-between gap-4 py-3">
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium md:text-base">{title}</p>
        <p className="text-xs text-muted-foreground md:text-sm">{description}</p>
      </div>
    </div>
    {children}
  </div>
);

/**
 * Simple Mode: the main app trimmed to the essentials, unlocked with a 4-digit PIN on this
 * device. A personal preference for this member (not the whole workspace); anyone can change it.
 */
const SettingsSimpleModeSection = () => {
  const { user, interfaceMode, refreshAuthState } = useAuth();
  const { config, isSimple, showAdvanced } = useSimpleMode();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const handleToggle = useCallback(async (enabled) => {
    setSaving(true);
    try {
      await settingsService.updateInterfaceMode(enabled ? 'simple' : 'full');
      await refreshAuthState();
      if (enabled) navigate('/dashboard');
    } catch (err) {
      showError(err, 'Could not update your interface preference.');
    } finally {
      setSaving(false);
    }
  }, [refreshAuthState, navigate]);

  const handleShowAdvanced = useCallback(async (enabled) => {
    setSaving(true);
    try {
      await settingsService.updateSimpleModeShowAdvanced(enabled);
      await refreshAuthState();
    } catch (err) {
      showError(err, 'Could not update your menu preference.');
    } finally {
      setSaving(false);
    }
  }, [refreshAuthState]);

  const handleChangePin = useCallback(() => {
    devicePinService.clearPin(user?.id);
    showSuccess('Choose a new 4-digit PIN');
    lockSimpleMode();
  }, [user?.id]);

  return (
    <Card className="border border-gray-200">
      <CardHeader>
        <CardTitle className="text-base md:text-2xl">Simple Mode</CardTitle>
        <CardDescription className="text-xs md:text-sm">
          Only the essentials: Dashboard, Sales, Expenses, Customers, Products and Reports. No AI,
          notifications or alerts. Unlock with a 4-digit PIN on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        <SettingRow
          icon={ScanEye}
          title="Use Simple Mode"
          description={config
            ? 'Only changes the app for you, not for others in this workspace.'
            : 'Simple Mode is available for shops for now.'}
        >
          <Switch
            checked={interfaceMode === 'simple'}
            disabled={saving || (!config && interfaceMode !== 'simple')}
            onCheckedChange={handleToggle}
          />
        </SettingRow>

        {isSimple ? (
          <>
            <SettingRow
              icon={LayoutList}
              title="Show advanced features"
              description="Bring back the full menu (invoices, marketing, reports and more) while keeping PIN unlock."
            >
              <Switch checked={showAdvanced} disabled={saving} onCheckedChange={handleShowAdvanced} />
            </SettingRow>
            <SettingRow icon={KeyRound} title="Change PIN" description="Set a new 4-digit PIN for this device.">
              <Button type="button" variant="outline" size="sm" onClick={handleChangePin}>Change</Button>
            </SettingRow>
            <SettingRow icon={Lock} title="Lock now" description="Ask for the PIN before anyone uses ABS again.">
              <Button type="button" variant="outline" size="sm" onClick={lockSimpleMode}>Lock</Button>
            </SettingRow>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default SettingsSimpleModeSection;
