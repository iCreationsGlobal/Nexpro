import { useCallback, useRef, useState } from 'react';
import absLogoIcon from '../../assets/abs-logo-icon.png';
import { devicePinService } from '../../services/devicePin';
import PinPad from './PinPad';

/** Full-screen PIN gate. No typing beyond the 4-digit pad — this is the daily unlock, not a login. */
const PinLockScreen = ({ userId, onUnlock, title = 'Enter your PIN' }) => {
  const [resetSignal, setResetSignal] = useState(0);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const shakeTimeout = useRef(null);

  const handleComplete = useCallback(
    async (pin) => {
      const ok = await devicePinService.verifyPin(userId, pin);
      if (ok) {
        onUnlock();
        return;
      }
      setError(true);
      setShake(true);
      clearTimeout(shakeTimeout.current);
      shakeTimeout.current = setTimeout(() => setShake(false), 220);
      setResetSignal((n) => n + 1);
    },
    [userId, onUnlock]
  );

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0f0f0f] pt-10">
      <img src={absLogoIcon} alt="ABS logo" className="mb-8 h-[84px] w-[84px] object-contain" />
      <div className={`flex flex-col items-center ${shake ? 'animate-pin-shake' : ''}`}>
        <p className="mb-3 text-xl font-semibold text-white">{title}</p>
        {error && <p className="mb-3 text-sm font-medium text-red-400">Wrong PIN, try again</p>}
        <PinPad onComplete={handleComplete} resetSignal={resetSignal} />
      </div>
    </div>
  );
};

export default PinLockScreen;
