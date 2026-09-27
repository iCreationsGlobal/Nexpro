import { useCallback, useRef, useState } from 'react';
import absLogoIcon from '../../assets/abs-logo-icon.png';
import { devicePinService, MAX_PIN_ATTEMPTS } from '../../services/devicePin';
import PinPad from './PinPad';

/**
 * Full-screen PIN gate. No typing beyond the 4-digit pad — this is the daily unlock, not a login.
 * After MAX_PIN_ATTEMPTS wrong tries the PIN is wiped and `onForgot` sends the user back to a
 * full password sign-in.
 */
const PinLockScreen = ({ userId, onUnlock, onForgot, title = 'Enter your PIN' }) => {
  const [resetSignal, setResetSignal] = useState(0);
  const [error, setError] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(
    () => MAX_PIN_ATTEMPTS - devicePinService.getFailedAttempts(userId)
  );
  const [shake, setShake] = useState(false);
  const shakeTimeout = useRef(null);

  const handleComplete = useCallback(
    async (pin) => {
      const ok = await devicePinService.verifyPin(userId, pin);
      if (ok) {
        devicePinService.resetFailedAttempts(userId);
        onUnlock();
        return;
      }
      const failed = devicePinService.recordFailedAttempt(userId);
      if (failed >= MAX_PIN_ATTEMPTS && onForgot) {
        devicePinService.clearPin(userId);
        onForgot({ reason: 'too_many_attempts' });
        return;
      }
      setAttemptsLeft(MAX_PIN_ATTEMPTS - failed);
      setError(true);
      setShake(true);
      clearTimeout(shakeTimeout.current);
      shakeTimeout.current = setTimeout(() => setShake(false), 220);
      setResetSignal((n) => n + 1);
    },
    [userId, onUnlock, onForgot]
  );

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0f0f0f] pt-10">
      <img src={absLogoIcon} alt="ABS logo" className="mb-8 h-[84px] w-[84px] object-contain" />
      <div className={`flex flex-col items-center ${shake ? 'animate-pin-shake' : ''}`}>
        <p className="mb-3 text-xl font-semibold text-white">{title}</p>
        {error && (
          <p className="mb-3 text-sm font-medium text-red-400">
            Wrong PIN. {attemptsLeft} {attemptsLeft === 1 ? 'try' : 'tries'} left.
          </p>
        )}
        <PinPad onComplete={handleComplete} resetSignal={resetSignal} />
      </div>
      {onForgot ? (
        <button
          type="button"
          onClick={() => onForgot({ reason: 'forgot' })}
          className="mt-8 text-sm font-medium text-white/70 underline-offset-4 hover:text-white hover:underline"
        >
          Forgot PIN? Sign in with your password
        </button>
      ) : null}
    </div>
  );
};

export default PinLockScreen;
