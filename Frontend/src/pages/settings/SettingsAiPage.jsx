import SettingsLayout from './SettingsLayout';
import SettingsAiSection from '../../components/settings/sections/SettingsAiSection';

const SettingsAiPage = () => (
  <SettingsLayout
    title="Ayebia / AI"
    description="Workspace Anthropic API key for Ask Ayebia, reports, and automations."
  >
    <SettingsAiSection />
  </SettingsLayout>
);

export default SettingsAiPage;
