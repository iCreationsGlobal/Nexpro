import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { SimpleCartProvider } from '../../context/SimpleCartContext';
import AppLoader from '../../components/AppLoader';
import PinLockScreen from '../../components/simple/PinLockScreen';
import SetPinScreen from '../../components/simple/SetPinScreen';
import { devicePinService } from '../../services/devicePin';
import { clearSimpleModeEscape } from '../../utils/simpleModeEscape';

/**
 * Gate for the whole /simple route tree. Renders the lock (or first-run PIN setup) in place
 * of the child routes rather than as a separate route, so there's nothing to navigate past.
 * Mirrors mobile/app/simple/_layout.tsx.
 */
const SimpleLayout = () => {
  const { user, interfaceMode, loading } = useAuth();
  const [pinChecked, setPinChecked] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    setPinChecked(true);
  }, [user?.id]);

  if (loading || interfaceMode !== 'simple' || !user?.id) {
    if (!loading && interfaceMode !== 'simple') {
      return <Navigate to="/dashboard" replace />;
    }
    return <AppLoader />;
  }

  const needsSetup = pinChecked && !devicePinService.hasPin(user.id);

  const handleUnlocked = () => {
    clearSimpleModeEscape();
    setUnlocked(true);
  };

  if (needsSetup) {
    return <SetPinScreen userId={user.id} onDone={handleUnlocked} />;
  }

  if (!unlocked) {
    return <PinLockScreen userId={user.id} onUnlock={handleUnlocked} />;
  }

  return (
    <div className="min-h-screen bg-white">
      <SimpleCartProvider>
        <Outlet />
      </SimpleCartProvider>
    </div>
  );
};

export default SimpleLayout;
