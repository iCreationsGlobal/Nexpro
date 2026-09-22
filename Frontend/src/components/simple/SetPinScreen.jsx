import { useCallback, useState } from 'react';
import { devicePinService } from '../../services/devicePin';
import PinPad from './PinPad';

/**
 * First-time PIN setup for Simple Mode — enter, then confirm. Runs once per browser/user;
 * after this, PinLockScreen handles daily unlock.
 */
const SetPinScreen = ({ userId, onDone }) => {
  const [firstPin, setFirstPin] = useState(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [mismatch, setMismatch] = useState(false);

  const handleComplete = useCallback(
    async (pin) => {
      if (!firstPin) {
        setFirstPin(pin);
        setMismatch(false);
        setResetSignal((n) => n + 1);
        return;
      }
      if (pin !== firstPin) {
        setMismatch(true);
        setFirstPin(null);
        setResetSignal((n) => n + 1);
        return;
      }
      await devicePinService.setPin(userId, pin);
      onDone();
    },
    [firstPin, userId, onDone]
  );

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white pt-10">
      <p className="mb-2 text-xl font-semibold text-black">
        {firstPin ? 'Confirm your PIN' : 'Create a 4-digit PIN'}
      </p>
      <p className="mb-6 max-w-xs text-center text-sm text-gray-500">
        {firstPin ? 'Enter the same 4 digits again' : "You'll use this to unlock Simple Mode each day"}
      </p>
      {mismatch && <p className="mb-3 text-sm font-medium text-red-600">PINs did not match — try again</p>}
      <PinPad onComplete={handleComplete} resetSignal={resetSignal} dotColor="#166534" keyColor="#166534" />
    </div>
  );
};

export default SetPinScreen;
