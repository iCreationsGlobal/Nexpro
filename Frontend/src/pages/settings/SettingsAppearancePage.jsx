import SettingsLayout from './SettingsLayout';
import SettingsAppearanceSection from '../../components/settings/sections/SettingsAppearanceSection';
import SettingsSimpleModeSection from '../../components/settings/sections/SettingsSimpleModeSection';

const SettingsAppearancePage = () => (
  <SettingsLayout
    title="Appearance"
    description="Dark mode, hints, and sidebar menu visibility."
  >
    <div className="space-y-4 md:space-y-6">
      <SettingsSimpleModeSection />
      <SettingsAppearanceSection />
    </div>
  </SettingsLayout>
);

export default SettingsAppearancePage;
