import { memo, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, getEmptyStateProps } from '@/components/ui/empty-state';
import { EMPTY_STATES } from '../constants/microcopy';
import { getSearchNoResultsEmptyStateProps } from '../utils/searchEmptyState';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import TableSkeleton from './TableSkeleton';
import { useResponsive } from '../hooks/useResponsive';
import dayjs from 'dayjs';

/**
 * DashboardJobsTable - Reusable jobs/sales table component for dashboard
 * @param {Array} jobs - Array of job or sale objects
 * @param {boolean} loading - Loading state
 * @param {string} title - Table title (e.g., "Jobs In Progress" or "Recent Sales")
 * @param {Function} getDueDateStatus - Function to get due date status (color, label, formatted)
 * @param {number} pageSize - Number of items per page (default: 5)
 * @param {boolean} isSalesTable - Whether this is showing sales data (different columns)
 * @param {boolean} isRentalTable - Whether this is showing rental activity
 * @param {Function} onAddProduct - Callback when "Add Product" button is clicked (shown when no sales and isSalesTable)
 * @param {Function} onOpenPOS - Callback to open point of sale (shown when no sales but products exist)
 * @param {boolean} hasProducts - Whether the tenant has any products (to show appropriate empty message)
 * @param {boolean} productsLoading - Whether product availability is still loading
 * @param {boolean} isSearchFiltered - Whether header search is active with no matches
 * @param {string} searchQuery - Active header search query (for empty state copy)
 * @param {Function} onClearSearch - Clears header search
 */
const DashboardJobsTable = memo(({
  jobs = [],
  loading = false,
  title = 'Jobs In Progress',
  getDueDateStatus,
  pageSize = 5,
  isSalesTable = false,
  isRentalTable = false,
  onAddProduct,
  onOpenPOS,
  hasProducts = true,
  productsLoading = false,
  isSearchFiltered = false,
  searchQuery = '',
  onClearSearch,
}) => {
  const { isMobile } = useResponsive();
  const [pagination, setPagination] = useState({ current: 1, pageSize });

  const totalJobs = useMemo(() => jobs.length, [jobs]);
  const totalPages = useMemo(() => Math.ceil(totalJobs / pagination.pageSize), [totalJobs, pagination.pageSize]);
  const startIndex = useMemo(() => (pagination.current - 1) * pagination.pageSize + 1, [pagination.current, pagination.pageSize]);
  const endIndex = useMemo(() => Math.min(pagination.current * pagination.pageSize, totalJobs), [pagination.current, pagination.pageSize, totalJobs]);
  const paginatedJobs = useMemo(() => jobs.slice(
    (pagination.current - 1) * pagination.pageSize,
    pagination.current * pagination.pageSize
  ), [jobs, pagination.current, pagination.pageSize]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          {!isSalesTable && (
            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
              In Progress
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} cols={5} />
          </div>
        ) : paginatedJobs.length === 0 ? (
          <div className="flex items-center justify-center p-6 sm:p-8 w-full">
            {isSearchFiltered && onClearSearch ? (
              <EmptyState
                {...getSearchNoResultsEmptyStateProps(searchQuery, onClearSearch)}
                size="sm"
                className="w-full max-w-md py-6"
              />
            ) : isRentalTable && !hasProducts && !productsLoading && onAddProduct ? (
              <EmptyState
                {...getEmptyStateProps(EMPTY_STATES.RENTAL_NO_PRODUCTS, {
                  primary: onAddProduct,
                })}
                size="sm"
                className="w-full max-w-md py-6"
              />
            ) : isRentalTable ? (
              <EmptyState
                {...getEmptyStateProps(EMPTY_STATES.RENTALS, {
                  primary: onAddProduct,
                })}
                size="sm"
                className="w-full max-w-md py-6"
              />
            ) : isSalesTable && !hasProducts && !productsLoading && onAddProduct ? (
              <EmptyState
                {...getEmptyStateProps(EMPTY_STATES.SALES_NO_PRODUCTS, {
                  primary: onAddProduct,
                })}
                size="sm"
                className="w-full max-w-md py-6"
              />
            ) : isSalesTable ? (
              <EmptyState
                {...getEmptyStateProps(EMPTY_STATES.SALES, {
                  ...(onOpenPOS ? { primary: onOpenPOS } : {}),
                })}
                size="sm"
                className="w-full max-w-md py-6"
              />
            ) : (
              <EmptyState
                {...getEmptyStateProps(EMPTY_STATES.JOBS)}
                size="sm"
                className="w-full max-w-md py-6"
              />
            )}
          </div>
        ) : isMobile ? (
          <>
            <div className="p-4 space-y-3 border-t">
              {paginatedJobs.map((job) => (
                <Card key={job.id} className="border">
                  <CardContent className="p-4">
                    {isSalesTable ? (
                      <>
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{job.jobNumber}</p>
                            <p className="text-muted-foreground text-sm truncate">{job.customer?.name || 'Walk-in'}</p>
                          </div>
                          <p className="font-medium text-sm shrink-0">{job.title}</p>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t">
                          <Badge variant="outline" className="capitalize text-xs">
                            {job.paymentMethod?.replace('_', ' ') || 'Cash'}
                          </Badge>
                          <span className="text-muted-foreground text-xs">{dayjs(job.createdAt).format('MMM DD, YYYY')}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{job.title || 'N/A'}</p>
                          </div>
                        </div>
                        <p className="text-muted-foreground text-sm truncate mt-1">{job.customer?.name || 'N/A'}</p>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t">
                          <span className="text-muted-foreground text-xs">{dayjs(job.createdAt).format('MMM DD, YYYY')}</span>
                          {getDueDateStatus ? (() => {
                            const { color, label, formatted } = getDueDateStatus(job.dueDate);
                            return (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-xs">{formatted}</span>
                                {label && (
                                  <Badge
                                    variant="outline"
                                    className={`w-fit text-xs ${
                                      color === 'red' ? 'bg-red-100 text-red-800 border-red-200' :
                                      color === 'orange' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                      color === 'green' ? 'bg-green-100 text-green-800 border-green-200' :
                                      'bg-muted text-foreground border-border'
                                    }`}
                                  >
                                    {label}
                                  </Badge>
                                )}
                              </div>
                            );
                          })() : (
                            <span className="text-xs">{job.dueDate ? dayjs(job.dueDate).format('MMM DD, YYYY') : '—'}</span>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            {totalJobs > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {startIndex}–{endIndex} of {totalJobs} {isSalesTable ? 'sales' : 'jobs'}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, current: prev.current - 1 }))}
                    disabled={pagination.current === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">{pagination.current} / {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, current: prev.current + 1 }))}
                    disabled={pagination.current === totalPages || loading}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="border-t border-b overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-b">
                    {isSalesTable ? (
                      <>
                        <TableHead>Sale Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Date</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>Title</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Due Date</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedJobs.map((job) => {
                    if (isSalesTable) {
                      return (
                        <TableRow key={job.id} className="border-b last:border-b-0">
                          <TableCell className="font-medium">{job.jobNumber}</TableCell>
                          <TableCell>{job.customer?.name || 'Walk-in'}</TableCell>
                          <TableCell className="font-medium">{job.title}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {job.paymentMethod?.replace('_', ' ') || 'Cash'}
                            </Badge>
                          </TableCell>
                          <TableCell>{dayjs(job.createdAt).format('MMM DD, YYYY')}</TableCell>
                        </TableRow>
                      );
                    }
                    
                    const { color, label, formatted } = getDueDateStatus ? getDueDateStatus(job.dueDate) : {
                      color: 'default',
                      label: null,
                      formatted: job.dueDate ? dayjs(job.dueDate).format('MMM DD, YYYY') : '—'
                    };
                    return (
                      <TableRow key={job.id} className="border-b last:border-b-0">
                        <TableCell>{job.title || 'N/A'}</TableCell>
                        <TableCell>{job.customer?.name || 'N/A'}</TableCell>
                        <TableCell>{dayjs(job.createdAt).format('MMM DD, YYYY')}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span>{formatted}</span>
                            {label && (
                              <Badge
                                variant="outline"
                                className={
                                  `w-fit ${
                                    color === 'red' ? 'bg-red-100 text-red-800 border-red-200' :
                                    color === 'orange' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                    color === 'green' ? 'bg-green-100 text-green-800 border-green-200' :
                                    'bg-muted text-foreground border-border'
                                  }`
                                }
                              >
                                {label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalJobs > 0 && (
              <div className="flex items-center justify-between py-3 rounded-b-md" style={{ paddingLeft: '16px', paddingRight: '16px' }}>
                <div className="text-sm text-muted-foreground">
                  Showing {startIndex} to {endIndex} of {totalJobs} {isSalesTable ? 'sales' : 'jobs'}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, current: prev.current - 1 }))}
                    disabled={pagination.current === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="text-sm">
                    Page {pagination.current} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, current: prev.current + 1 }))}
                    disabled={pagination.current === totalPages || loading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
});

DashboardJobsTable.displayName = 'DashboardJobsTable';

export default DashboardJobsTable;
