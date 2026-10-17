import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Lightbulb,
  Link as LinkIcon,
  LogOut,
  Settings,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/context/AuthContext';
import { useHintMode } from '@/context/HintModeContext';
import { resolveImageUrl } from '@/utils/fileUtils';
import { isSabitoStoreEnabled } from '@/utils/sabitoStoreFeature';
import TourButton from '@/components/tour/TourButton';
import { useSimpleMode } from '@/hooks/useSimpleMode';
import { useSignOut } from '@/hooks/useSignOut';
import SignOutPendingDialog from './SignOutPendingDialog';

/**
 * Avatar button with the account menu (tour, hint mode, profile, settings, Sabito, logout).
 * @param {object} props
 * @param {boolean} [props.compact] - Avatar only (app-shell header); otherwise shows the user's name
 */
export default function UserMenu({ compact = false }) {
  const navigate = useNavigate();
  const { user, isManager } = useAuth();
  const { requestSignOut, pendingCheck, confirmSignOut, cancelSignOut } = useSignOut();
  const simpleMode = useSimpleMode();
  const { hintMode, toggleHintMode } = useHintMode();
  const [open, setOpen] = useState(false);
  const closeMenu = () => setOpen(false);

  const handleNavigateToSabito = () => {
    const token = localStorage.getItem('token');
    // Default to production Sabito app when env var is not set
    const sabitoUrl = import.meta.env.VITE_SABITO_URL || 'https://myapp.sabito.app';
    const url = token ? `${sabitoUrl}?nexproToken=${token}` : sabitoUrl;
    window.location.href = url;
  };

  return (
    <>
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <button
            type="button"
            className="flex h-11 w-11 min-h-0 min-w-0 shrink-0 items-center justify-center rounded-full p-0"
            aria-label="Account menu"
          >
            <Avatar className="h-9 w-9 border border-border">
              <AvatarImage src={resolveImageUrl(user?.profilePicture || '') || undefined} />
              <AvatarFallback>
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          </button>
        ) : (
          <Button
            variant="ghost"
            className="flex items-center gap-2 h-auto hover:bg-muted rounded-[32px] bg-muted px-[3px] py-0"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={resolveImageUrl(user?.profilePicture || '') || undefined} />
              <AvatarFallback>
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-foreground font-medium hidden sm:inline">
              {user?.name || 'User'}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:inline" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-0">
        {compact && user?.name ? (
          <>
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
              {user.email ? <p className="truncate text-xs text-muted-foreground">{user.email}</p> : null}
            </div>
            <DropdownMenuSeparator className="mx-0 my-0" />
          </>
        ) : null}
        {!simpleMode.isSimple && (
          <>
            <div
              className="p-0"
              onClick={closeMenu}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeMenu(); }}
              role="presentation"
            >
              <TourButton
                variant="ghost"
                className="w-full justify-start min-h-[44px] rounded-sm px-2"
              />
            </div>
            <DropdownMenuSeparator className="mx-0 my-0" />
          </>
        )}
        <div className="flex items-center justify-between gap-3 px-2 py-2 min-h-[44px]">
          <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium flex-1">Hint Mode</span>
          <Switch
            checked={hintMode}
            onCheckedChange={(checked) => {
              toggleHintMode(checked);
              closeMenu();
            }}
          />
        </div>
        <DropdownMenuSeparator className="mx-0 my-0" />
        <DropdownMenuItem
          onClick={() => {
            closeMenu();
            navigate('/profile');
          }}
          className="min-h-[44px]"
        >
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        {isManager && (
          <DropdownMenuItem
            onClick={() => {
              closeMenu();
              navigate('/settings');
            }}
            className="min-h-[44px]"
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator className="mx-0 my-0" />
        {isSabitoStoreEnabled() ? (
          <DropdownMenuItem
            onClick={() => {
              closeMenu();
              handleNavigateToSabito();
            }}
            className="min-h-[44px]"
          >
            <LinkIcon className="mr-2 h-4 w-4" />
            <span>Open Sabito</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onClick={() => {
            closeMenu();
            requestSignOut();
          }}
          className="min-h-[44px]"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <SignOutPendingDialog pendingCheck={pendingCheck} onConfirm={confirmSignOut} onCancel={cancelSignOut} />
    </>
  );
}
