import { useState, useEffect } from 'react';
import { useResponsive } from '@/hooks/useResponsive';
import { Pencil, Trash2, Printer, CheckCircle, Download, X, FileText, Share2, Archive, Loader2, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription,
  SheetFooter
} from '@/components/ui/sheet';
import { 
  Tabs, 
  TabsList, 
  TabsTrigger, 
  TabsContent 
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import DrawerSectionCard from '@/components/DrawerSectionCard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { releaseBodyInteractionLocks } from '@/utils/releaseBodyInteractionLocks';

/**
 * Reusable Details Drawer Component using shadcn/ui
 * @param {Boolean} open - Whether the drawer is visible
 * @param {Function} onClose - Callback function when drawer is closed
 * @param {Function} onOpenChange - Callback with (open: boolean) when drawer open state changes (e.g. setDrawerVisible)
 * @param {String} title - Drawer title
 * @param {String} description - Drawer subtitle (default: 'View and manage details')
 * @param {Array} fields - Array of field objects with { label, value, span, render }
 * @param {Array} tabs - Array of tab objects with { key, label, content } (optional)
 * @param {React.ReactNode} children - Optional custom content; when provided, rendered instead of fields/tabs
 * @param {Number} width - Drawer width (default: 600)
 * @param {Function} onEdit - Callback function when edit button is clicked
 * @param {Function} onDelete - Callback function when delete is confirmed
 * @param {Function} onPrint - Callback function when print button is clicked
 * @param {Boolean} printDisabled - When true, disables the View PDF button (e.g. while loading)
 * @param {Boolean} showActions - Whether to show edit/delete actions (default: true)
 * @param {String} deleteConfirmTitle - Custom delete confirmation title (default: 'Archive this item?')
 * @param {String} deleteConfirmText - Custom delete confirmation description
 * @param {String} deleteButtonLabel - Custom delete button label (default: 'Archive')
 * @param {String} cancelButtonLabel - Custom cancel button label (default: 'Cancel')
 * @param {Object} primaryAction - When set with moreMenuItems, footer shows only primary button + More dropdown. { label, onClick, disabled, icon }
 * @param {Object} secondaryAction - Optional outline button rendered before primaryAction. { label, onClick, disabled, icon }
 * @param {Array} moreMenuItems - When set with primaryAction, items for the More dropdown. [{ label, onClick, icon?, destructive? }]
 * @param {Boolean} moreMenuLoading - Shows a loading state on the More dropdown trigger
 * @param {String} moreMenuLoadingLabel - Custom loading label for the More dropdown trigger
 * @param {String} moreMenuLabel - Custom label for the More dropdown trigger (desktop)
 */
const DetailsDrawer = ({ 
  open, 
  onClose,
  onOpenChange,
  title,
  description = 'View and manage details',
  fields = [], 
  tabs = null,
  children = null,
  width = 600,
  onEdit,
  onDelete,
  onPrint,
  onDownload,
  onMarkPaid,
  printDisabled = false,
  extraActions = [],
  extra = null,
  showActions = true,
  deleteConfirmTitle = 'Archive this item?',
  deleteConfirmText = 'You can restore it anytime from filters.',
  deleteButtonLabel = 'Archive',
  cancelButtonLabel = 'Cancel',
  primaryAction = null,
  secondaryAction = null,
  moreMenuItems = [],
  moreMenuLoading = false,
  moreMenuLoadingLabel = 'Updating...',
  moreMenuLabel = 'More'
}) => {
  const { isMobile } = useResponsive();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(null);

  // Reset active tab when tabs change or drawer opens
  useEffect(() => {
    if (tabs && tabs.length > 0) {
      setActiveTab(tabs[0]?.key);
    } else {
      setActiveTab(null);
    }
  }, [tabs, open]);

  // If this drawer unmounts while still open (e.g. "View Invoice" navigates away),
  // clear leftover Radix body locks so the sidebar keeps working.
  useEffect(() => () => {
    releaseBodyInteractionLocks();
  }, []);

  const renderFields = (fieldsToRender) => (
    <Descriptions column={1} className="space-y-4">
      {fieldsToRender.map((field, index) => (
        <DescriptionItem 
          key={index} 
          label={field.label}
        >
          {field.render ? field.render(field.value) : field.value || '-'}
        </DescriptionItem>
      ))}
    </Descriptions>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose?.();
          onOpenChange?.(false);
        }
      }}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={cn(
            'shadow-none flex flex-col overflow-x-hidden p-0',
            isMobile
              ? 'inset-x-0 bottom-0 top-auto h-[94dvh] max-h-[94dvh] w-full max-w-full rounded-t-2xl rounded-b-none border-t'
              : 'rounded-lg w-full max-w-[calc(100vw-16px)]'
          )}
          style={
            isMobile
              ? undefined
              : {
                  width: typeof width === 'string' ? width : `${width}px`,
                  minWidth: '30vw',
                  maxWidth: 'calc(90vw - 16px)',
                  marginLeft: '8px',
                  marginRight: '8px',
                  marginTop: '8px',
                  marginBottom: '8px',
                  borderRadius: '8px',
                  height: 'calc(100dvh - 16px)',
                  maxHeight: 'calc(100dvh - 16px)',
                }
          }
        >
          {isMobile && (
            <div className="flex shrink-0 justify-center pt-3 pb-1" aria-hidden>
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>
          )}
          <div className="flex-shrink-0">
            <div className={cn('px-4 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-6', isMobile && 'pr-14')}>
              <SheetHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-left">
                    <SheetTitle className={cn(isMobile && 'text-xl')}>{title}</SheetTitle>
                    <SheetDescription className="mt-1 text-left">{description}</SheetDescription>
                  </div>
                  {extra && <div className="flex flex-wrap gap-2">{extra}</div>}
                </div>
              </SheetHeader>
            </div>
            <div className="border-b border-gray-200 w-full" aria-hidden />
          </div>

          <div className="overflow-y-auto overflow-x-hidden flex-1" style={{ minHeight: 0 }}>
            {children != null && children !== false ? (
              <div className={cn(
                isMobile ? 'p-0' : 'px-6 py-6',
                '[&_[role=separator]]:-mx-6 [&_[role=separator]]:w-[calc(100%+3rem)] [&_[role=separator]]:min-w-[calc(100%+3rem)] [&_hr]:-mx-6 [&_hr]:w-[calc(100%+3rem)] [&_hr]:min-w-[calc(100%+3rem)]'
              )}>{children}</div>
            ) : tabs && tabs.length > 0 ? (
              <Tabs value={activeTab || tabs[0]?.key} onValueChange={setActiveTab} className="w-full" key={tabs.map(t => t.key).join('-')}>
                <div className="px-6">
                  {isMobile ? (
                    <div className="mb-4">
                      <Select
                        value={activeTab || tabs[0]?.key}
                        onValueChange={setActiveTab}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select section" />
                        </SelectTrigger>
                        <SelectContent>
                          {tabs.map((tab) => (
                            <SelectItem key={tab.key} value={tab.key}>
                              {tab.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <TabsList className="mb-4 w-full">
                      {tabs.map(tab => (
                        <TabsTrigger key={tab.key} value={tab.key} className="flex-1">
                          {tab.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  )}
                </div>
                <div className="border-b border-gray-200 w-full" aria-hidden />
                {tabs.map(tab => (
                  <TabsContent key={tab.key} value={tab.key} className="px-6 pb-6 w-full">
                    {tab.content}
                  </TabsContent>
                ))}
              </Tabs>
            ) : (
              <div className="px-6 py-6 space-y-6">
                <DrawerSectionCard title="Details">
                  {renderFields(fields)}
                </DrawerSectionCard>
              </div>
            )}
          </div>

          {showActions && (primaryAction || secondaryAction || moreMenuItems.length > 0) ? (
            <div className="flex-shrink-0 border-t border-border bg-background">
              <div
                className={cn(
                  'flex gap-3',
                  isMobile ? 'flex-row p-4' : 'flex-wrap justify-end gap-2 p-6'
                )}
              >
                {moreMenuItems.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SecondaryButton
                        disabled={moreMenuLoading}
                        aria-busy={moreMenuLoading}
                        className={cn(
                          isMobile && 'min-h-[44px] flex-1 touch-manipulation',
                          moreMenuLoading && 'animate-pulse border-primary/40 bg-primary/5 text-primary'
                        )}
                      >
                        {moreMenuLoading ? (
                          <Loader2 className="h-4 w-4 mr-2 shrink-0 animate-spin" />
                        ) : (
                          <MoreVertical className="h-4 w-4 mr-2 shrink-0" />
                        )}
                        {moreMenuLoading ? moreMenuLoadingLabel : (isMobile ? 'More Actions' : moreMenuLabel)}
                      </SecondaryButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {moreMenuItems.map((item, index) => {
                        const opensDeleteDialog =
                          (item.key === 'archive' || item.key === 'delete') && onDelete;
                        const handleClick = opensDeleteDialog
                          ? () => setDeleteDialogOpen(true)
                          : item.disabled
                            ? undefined
                            : item.onClick;
                        return (
                          <DropdownMenuItem
                            key={item.key || index}
                            onClick={handleClick}
                            disabled={item.disabled}
                            className={cn(
                              'flex items-center gap-2',
                              item.destructive && 'text-destructive focus:text-destructive',
                              item.className
                            )}
                          >
                            {item.icon && item.icon}
                            {item.label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {secondaryAction && (
                  <SecondaryButton
                    onClick={secondaryAction.onClick}
                    disabled={secondaryAction.disabled}
                    className={cn(
                      isMobile && 'min-h-[44px] flex-1 touch-manipulation',
                      secondaryAction.className
                    )}
                  >
                    {secondaryAction.icon && <span className="mr-2 shrink-0">{secondaryAction.icon}</span>}
                    {secondaryAction.label}
                  </SecondaryButton>
                )}
                {primaryAction && (
                  <Button
                    onClick={primaryAction.onClick}
                    disabled={primaryAction.disabled}
                    className={cn(
                      isMobile && 'min-h-[44px] flex-1 touch-manipulation bg-brand hover:bg-brand-dark'
                    )}
                  >
                    {primaryAction.icon && <span className="mr-2 shrink-0">{primaryAction.icon}</span>}
                    {primaryAction.label}
                  </Button>
                )}
              </div>
            </div>
          ) : null}
          {showActions && (primaryAction || moreMenuItems.length > 0) && onDelete && (
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{deleteConfirmTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {deleteConfirmText}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{cancelButtonLabel}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      onDelete();
                      setDeleteDialogOpen(false);
                    }}
                    className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
                  >
                    {deleteButtonLabel}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {showActions && !primaryAction && moreMenuItems.length === 0 && (onEdit || onDelete || onDownload || onPrint || onMarkPaid || extraActions.length > 0) && (
            <div className="flex-shrink-0 bg-background border-t border-border">
              <div className="p-6 flex flex-wrap gap-2 justify-end">
                {onDownload && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SecondaryButton onClick={onDownload}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </SecondaryButton>
                    </TooltipTrigger>
                    <TooltipContent>Save or download this to your phone</TooltipContent>
                  </Tooltip>
                )}
                {onPrint && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" onClick={onPrint} disabled={printDisabled}>
                        {printDisabled ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <FileText className="h-4 w-4 mr-2" />
                            View PDF
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open printable receipt or invoice</TooltipContent>
                  </Tooltip>
                )}
                {onMarkPaid && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={onMarkPaid}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Mark as Paid
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Record that customer has paid</TooltipContent>
                  </Tooltip>
                )}
                {extraActions
                  ?.filter(Boolean)
                  .map((action, index) => (
                    <Button
                      key={action.key || index}
                      variant={action.variant === 'secondary' ? 'secondaryStroke' : (action.variant || 'default')}
                      onClick={action.onClick}
                      disabled={action.disabled}
                    >
                      {action.icon && <span className="mr-2">{action.icon}</span>}
                      {action.label}
                    </Button>
                  ))}
                {onEdit && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SecondaryButton onClick={onEdit}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </SecondaryButton>
                    </TooltipTrigger>
                    <TooltipContent>Change details</TooltipContent>
                  </Tooltip>
                )}
                {onDelete && (
                  <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <SecondaryButton>
                            <Archive className="h-4 w-4 mr-2" />
                            {deleteButtonLabel}
                          </SecondaryButton>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Hide from list</TooltipContent>
                    </Tooltip>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{deleteConfirmTitle}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {deleteConfirmText}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{cancelButtonLabel}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            onDelete();
                            setDeleteDialogOpen(false);
                          }}
                          className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
                        >
                          {deleteButtonLabel}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export default DetailsDrawer;
