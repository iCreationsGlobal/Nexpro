import SettingsLayout from './SettingsLayout';
import SettingsAbsWhatsAppSection from '../../components/settings/sections/SettingsAbsWhatsAppSection';

const SettingsAbsWhatsAppPage = () => (
  <SettingsLayout
    title="ABS on WhatsApp"
    description="Ask ABS about your business from your own WhatsApp."
  >
    <SettingsAbsWhatsAppSection />
  </SettingsLayout>
);

export default SettingsAbsWhatsAppPage;
