import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import absLogoIcon from '../../assets/abs-logo-icon.png';
import { useAuth } from '../../context/AuthContext';
import { devicePinService } from '../../services/devicePin';
import { markSimpleModeEscaped } from '../../utils/simpleModeEscape';
import PinPad from './PinPad';

const LONG_PRESS_MS = 900;

/**
 * Long-press the logo to leave Simple Mode. Deliberately not a visible button — a cashier
 * brushing the screen shouldn't land in Settings/Reports. Requires the same PIN as the lock
 * screen, so it never leaks who is literate enough to want out.
 */
const SimpleHeader = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showEscape, setShowEscape] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [error, setError] = useState(false);
  const pressTimer = useRef(null);

  const startPress = useCallback(() => {
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      setError(false);
      setShowEscape(true);
    }, LONG_PRESS_MS);
  }, []);

  const cancelPress = useCallback(() => {
    clearTimeout(pressTimer.current);
  }, []);

  const handlePin = useCallback(
    async (pin) => {
      if (!user?.id) return;
      const ok = await devicePinService.verifyPin(user.id, pin);
      if (ok) {
        setShowEscape(false);
        markSimpleModeEscaped();
        navigate('/dashboard', { replace: true });
        return;
      }
      setError(true);
      setResetSignal((n) => n + 1);
    },
    [user?.id, navigate]
  );

  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-2">
      <button
        type="button"
        aria-label="ABS logo"
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        className="select-none"
      >
        <img src={absLogoIcon} alt="" className="h-10 w-10 object-contain" draggable={false} />
      </button>
      <div className="flex items-center gap-2">{children}</div>

      {showEscape && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/85">
          <div className="relative flex w-full flex-col items-center pt-6">
            <button
              type="button"
              aria-label="Cancel"
              onClick={() => setShowEscape(false)}
              className="absolute -top-14 right-6 p-3 text-white"
            >
              <X size={24} />
            </button>
            <p className="mb-3 text-xl font-semibold text-white">Enter PIN for Full Mode</p>
            {error && <p className="mb-3 text-sm font-medium text-red-400">Wrong PIN, try again</p>}
            <PinPad onComplete={handlePin} resetSignal={resetSignal} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleHeader;
