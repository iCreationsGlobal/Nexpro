/**
 * POSConnectionStatus — online/offline indicator. Desktop sales are online-only; on phones/tablets
 * (savesOffline) sales are kept on the device and synced later.
 */
import { Wifi, WifiOff } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ONLINE_REQUIRED_MESSAGE } from '@/utils/onlineRequired';

/**
 * @param {Object} props
 * @param {boolean} props.isOnline
 * @param {boolean} [props.savesOffline] - Offline sales are saved on this device
 * @param {string} [props.className]
 */
const POSConnectionStatus = ({ isOnline, savesOffline = false, className = '' }) => {
  const config = isOnline
    ? {
        icon: Wifi,
        label: 'Online',
        description: 'Connected',
        bgColor: 'bg-green-50',
        textColor: 'text-green-700',
        borderColor: 'border-green-200',
      }
    : savesOffline
      ? {
          icon: WifiOff,
          label: 'Offline',
          description: "Sales are saved on this device and sync when you're back online.",
          bgColor: 'bg-amber-50',
          textColor: 'text-amber-800',
          borderColor: 'border-amber-200',
        }
      : {
          icon: WifiOff,
          label: 'Offline',
          description: ONLINE_REQUIRED_MESSAGE,
          bgColor: 'bg-red-50',
          textColor: 'text-red-700',
          borderColor: 'border-red-200',
        };

  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-full border
              ${config.bgColor} ${config.borderColor}
              ${className}
            `}
          >
            <Icon className={`h-4 w-4 ${config.textColor}`} />
            <span className={`text-sm font-medium ${config.textColor}`}>{config.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const POSConnectionStatusCompact = ({ isOnline }) => {
  if (!isOnline) {
    return <WifiOff className="h-4 w-4 text-red-600" />;
  }
  return <Wifi className="h-4 w-4 text-green-600" />;
};

export default POSConnectionStatus;
