import SettingsLayout from './SettingsLayout';
import SettingsRentalSection from '../../components/settings/sections/SettingsRentalSection';

const SettingsRentalPage = () => (
  <SettingsLayout
    title="Rentals"
    description="Late fees, grace period, default deposits, and pre-booking defaults for your rental workspace."
  >
    <SettingsRentalSection />
  </SettingsLayout>
);

export default SettingsRentalPage;
