import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  CornerDownLeft,
  Lightbulb,
  LogOut,
  Settings,
  Link as LinkIcon,
  User,
  ChevronDown,
  Lock,
  Search,
  Sparkles,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useSmartSearch } from '@/context/SmartSearchContext';
import { IBIS_ASK_LABEL } from '@/constants/ibis';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useResponsive, useSafeAreaInsets } from '@/hooks/useResponsive';
import { RESPONSIVE } from '@/constants';
import { resolveImageUrl } from '@/utils/fileUtils';
import { isSabitoStoreEnabled } from '@/utils/sabitoStoreFeature';
import NotificationBell from '@/components/NotificationBell';
import TourButton from '@/components/tour/TourButton';
import { useSimpleMode } from '@/hooks/useSimpleMode';
import { lockSimpleMode } from '@/components/simple/SimpleModePinGate';
import { MobileSidebar } from './Sidebar';
import { cn } from '@/lib/utils';

export function Header() {
  const navigate = useNavigate();
  const { user, logout, activeTenant, isManager, isDriver } = useAuth();
  const simpleMode = useSimpleMode();
  const { hintMode, toggleHintMode } = useHintMode();
  const {
    placeholder,
    scope,
    searchValue,
    setSearchValue,
    recentSearches,
    saveRecentSearch,
    clearRecentSearches,
  } = useSmartSearch();
  const { isMobile, isTablet } = useResponsive();
  const safeAreaInsets = useSafeAreaInsets();
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isSearchSuggestionsOpen, setIsSearchSuggestionsOpen] = useState(false);
  const [activeRecentIndex, setActiveRecentIndex] = useState(-1);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);

  const handleNavigateToSabito = () => {
    const token = localStorage.getItem('token');
    // Default to production Sabito app when env var is not set
    const sabitoUrl = import.meta.env.VITE_SABITO_URL || 'https://myapp.sabito.app';
    const url = token ? `${sabitoUrl}?nexproToken=${token}` : sabitoUrl;
    window.location.href = url;
  };

  // Handle search expansion on mobile
  const handleSearchIconClick = () => {
    if (isMobile) {
      setIsSearchExpanded(true);
    }
  };

  const handleSearchClose = () => {
    setIsSearchExpanded(false);
    setIsSearchSuggestionsOpen(false);
    setActiveRecentIndex(-1);
    // Optionally clear search on close
    // setSearchValue('');
  };

  const handleHardRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  // Auto-focus input when expanded
  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      // Small delay to ensure transition completes
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isSearchExpanded]);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        (isSearchExpanded || isSearchSuggestionsOpen) &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target) &&
        !searchInputRef.current?.contains(event.target)
      ) {
        if (isSearchExpanded) {
          handleSearchClose();
        } else {
          setIsSearchSuggestionsOpen(false);
          setActiveRecentIndex(-1);
        }
      }
    };

    if (isSearchExpanded || isSearchSuggestionsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isSearchExpanded, isSearchSuggestionsOpen]);

  // Close search on blur if empty
  const handleSearchBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      // Delay to allow click events to fire first.
      window.setTimeout(() => {
        if (!searchValue) {
          handleSearchClose();
        }
        setIsSearchSuggestionsOpen(false);
        setActiveRecentIndex(-1);
      }, 200);
    }
  };

  const closeMenu = () => setUserMenuOpen(false);

  const recentSearchOptions = useMemo(() => {
    const term = searchValue.trim().toLowerCase();
    return (recentSearches || []).filter((recentTerm) => {
      const normalized = String(recentTerm || '').trim().toLowerCase();
      if (!normalized) return false;
      return !term || normalized.includes(term);
    });
  }, [recentSearches, searchValue]);

  const hasSearchValue = searchValue.trim().length > 0;
  const shouldShowRecentSearches = isSearchSuggestionsOpen && recentSearchOptions.length > 0;

  const commitSearchTerm = useCallback((term) => {
    const nextTerm = String(term || '').trim();
    if (!nextTerm) return;

    setSearchValue(nextTerm);
    saveRecentSearch(nextTerm);
    setIsSearchSuggestionsOpen(false);
    setActiveRecentIndex(-1);
    searchInputRef.current?.focus();
  }, [saveRecentSearch, setSearchValue]);

  const handleSearchChange = useCallback((event) => {
    setSearchValue(event.target.value);
    setIsSearchSuggestionsOpen(true);
    setActiveRecentIndex(-1);
  }, [setSearchValue]);

  const handleSearchFocus = useCallback(() => {
    setIsSearchSuggestionsOpen(true);
  }, []);

  const handleSearchKeyDown = useCallback((event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const selectedTerm = activeRecentIndex >= 0 ? recentSearchOptions[activeRecentIndex] : searchValue;
      commitSearchTerm(selectedTerm);
      return;
    }

    if (event.key === 'Escape') {
      setIsSearchSuggestionsOpen(false);
      setActiveRecentIndex(-1);
      return;
    }

    if (!recentSearchOptions.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsSearchSuggestionsOpen(true);
      setActiveRecentIndex((current) => (current + 1) % recentSearchOptions.length);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsSearchSuggestionsOpen(true);
      setActiveRecentIndex((current) => (
        current <= 0 ? recentSearchOptions.length - 1 : current - 1
      ));
    }
  }, [activeRecentIndex, commitSearchTerm, recentSearchOptions, searchValue]);

  const renderRecentSearches = () => {
    if (!shouldShowRecentSearches) return null;

    return (
      <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Recent searches
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => clearRecentSearches()}
          >
            Clear
          </Button>
        </div>
        <div className="py-1">
          {recentSearchOptions.map((recentTerm, index) => (
            <button
              key={`${scope}-${recentTerm}`}
              type="button"
              className={cn(
                'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors',
                activeRecentIndex === index ? 'bg-muted text-foreground' : 'hover:bg-muted/70'
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commitSearchTerm(recentTerm)}
            >
              <span className="truncate">{recentTerm}</span>
              <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
        {hasSearchValue ? (
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Press Enter to search for "{searchValue.trim()}".
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <header 
      className="sticky top-0 z-40 w-full border-b border-border bg-card"
      style={{
        paddingTop: safeAreaInsets.top > 0 ? `${safeAreaInsets.top}px` : undefined,
      }}
    >
      <div 
        ref={searchContainerRef}
        className={cn(
          "flex h-16 items-center justify-between gap-1.5 md:gap-2 lg:gap-4 transition-all duration-300",
          // Responsive horizontal padding: compact on very small devices
          "px-4 sm:px-6 lg:px-10",
          // When search is expanded on mobile, keep consistent padding
          isMobile && isSearchExpanded && "px-4"
        )}
        style={{
          paddingLeft: safeAreaInsets.left > 0 
            ? `calc(1.5rem + ${safeAreaInsets.left}px)` 
            : undefined,
          paddingRight: safeAreaInsets.right > 0 
            ? `calc(1.5rem + ${safeAreaInsets.right}px)` 
            : undefined,
        }}
      >
        {/* Left side: Mobile sidebar and Search */}
        <div className={cn(
          "flex items-center gap-1.5 md:gap-2 lg:gap-4 flex-1 min-w-0 transition-all duration-300",
          // When search expanded on mobile, hide sidebar and other elements
          isMobile && isSearchExpanded && "gap-0"
        )}>
          {/* Mobile Sidebar - Hide when search is expanded */}
          {(!isMobile || !isSearchExpanded) && <MobileSidebar />}
          
          {/* Search - Icon only on mobile when collapsed, full input when expanded (hidden in Simple Mode) */}
          {simpleMode.isRestricted ? null : isMobile ? (
            isSearchExpanded ? (
              // Expanded search on mobile
              <div className="relative flex-1 w-full flex items-center gap-2" data-tour="header-search">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                  <Input
                    ref={searchInputRef}
                    key={scope}
                    type="search"
                    placeholder={placeholder}
                    value={searchValue}
                    onChange={handleSearchChange}
                    onFocus={handleSearchFocus}
                    onKeyDown={handleSearchKeyDown}
                    onBlur={handleSearchBlur}
                    className="pl-10 pr-10 w-full min-h-[44px]"
                    style={{ borderRadius: '32px' }}
                  />
                  {searchValue && (
                    <button
                      onClick={() => setSearchValue('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                    >
                      <X className="h-6 w-6 text-muted-foreground" />
                    </button>
                  )}
                  {renderRecentSearches()}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSearchClose}
                  className="min-h-[44px] min-w-[44px] flex-shrink-0"
                >
                  <X className="h-6 w-6" />
                </Button>
              </div>
            ) : (
              // Collapsed search icon on mobile
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSearchIconClick}
                className="min-h-[44px] min-w-[44px] flex-shrink-0"
              >
                <Search className="h-5 w-5" />
              </Button>
            )
          ) : (
            // Desktop/Tablet: Always show full search
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative flex-1 max-w-md" data-tour="header-search">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                key={scope}
                type="search"
                placeholder={placeholder}
                value={searchValue}
                onChange={handleSearchChange}
                onFocus={handleSearchFocus}
                onKeyDown={handleSearchKeyDown}
                onBlur={handleSearchBlur}
                className="pl-10 w-full"
                style={{ borderRadius: '32px' }}
              />
                  {renderRecentSearches()}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">Quick search across customers, products, sales, and more</TooltipContent>
            </Tooltip>
          )}
        </div>
        
        {/* Right side: Upgrade button, Notifications, User menu - Hide when search expanded on mobile */}
        {(!isMobile || !isSearchExpanded) && (
          <div className="flex items-center gap-1.5 md:gap-2 lg:gap-3 flex-shrink-0">
            {/* Upgrade to Pro button hidden for now.
            {isManager && activeTenant && activeTenant.plan === 'trial' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size={isMobile ? "icon" : "sm"}
                    onClick={() => navigate('/checkout')}
                    className={cn(
                      "bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white",
                      isMobile ? "h-11 w-11" : "hidden sm:flex",
                      "min-h-[44px] min-w-[44px]"
                    )}
                    style={{ borderRadius: '32px' }}
                  >
                    <Crown className={cn("h-4 w-4", !isMobile && "mr-2")} />
                    {!isMobile && <span>Upgrade Plan</span>}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Upgrade your plan for more features and capacity</TooltipContent>
              </Tooltip>
            )}
            */}
            
            {/* Hard refresh */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleHardRefresh}
                  aria-label="Hard refresh"
                  title="Hard refresh"
                  className={cn(
                    isMobile ? 'min-h-[44px] min-w-[44px]' : 'h-9 w-9',
                    'border-border'
                  )}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Hard refresh</TooltipContent>
            </Tooltip>

            {/* Ask iBIS — staff+ (read-only analysis); drivers and Simple Mode excluded */}
            {!isDriver && !simpleMode.isSimple && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size={isMobile ? 'icon' : 'sm'}
                    onClick={() => navigate('/ask-ai')}
                    className={cn(
                      isMobile ? 'min-h-[44px] min-w-[44px]' : 'h-9',
                      'border-border'
                    )}
                  >
                    <Sparkles className={cn('h-4 w-4', !isMobile && 'mr-2')} />
                    {!isMobile && <span>{IBIS_ASK_LABEL}</span>}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open {IBIS_ASK_LABEL}</TooltipContent>
              </Tooltip>
            )}

            {/* Notification Bell (Simple Mode: no notifications or alerts) */}
            {!simpleMode.isSimple && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div data-tour="header-notifications" className="inline-flex">
                    <NotificationBell />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">View order updates, low stock alerts, and other notifications</TooltipContent>
              </Tooltip>
            )}

            {/* Simple Mode: lock the app until the PIN is entered again */}
            {simpleMode.isSimple && (
              <Button
                variant="outline"
                size={isMobile ? 'icon' : 'sm'}
                onClick={lockSimpleMode}
                aria-label="Lock"
                className={cn(isMobile ? 'min-h-[44px] min-w-[44px]' : 'h-9', 'border-border')}
              >
                <Lock className={cn('h-4 w-4', !isMobile && 'mr-2')} />
                {!isMobile && <span>Lock</span>}
              </Button>
            )}
            
            {/* User Profile Dropdown */}
            <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className={cn(
                    "flex items-center gap-2 h-auto hover:bg-muted rounded-[32px] bg-muted",
                    // Keep touch target and use 3px horizontal padding.
                    isMobile ? "px-[3px] py-0 min-h-[44px] min-w-[44px]" : "px-[3px] py-0"
                  )}
                >
                  <Avatar className={cn("h-8 w-8", isMobile ? "!rounded-md" : "")}>
                    <AvatarImage src={resolveImageUrl(user?.profilePicture || '') || undefined} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn(
                    "text-sm text-foreground font-medium",
                    isMobile ? "hidden" : "hidden sm:inline"
                  )}>
                    {user?.name || 'User'}
                  </span>
                  <ChevronDown className={cn(
                    "h-4 w-4 text-muted-foreground",
                    isMobile ? "hidden" : "hidden sm:inline"
                  )} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-0">
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
                    logout();
                    navigate('/login');
                  }}
                  className="min-h-[44px]"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </header>
  );
}
