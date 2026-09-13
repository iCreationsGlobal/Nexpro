import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { CalendarClock, ExternalLink, Loader2 } from 'lucide-react';
import DrawerSectionCard from './DrawerSectionCard';
import StatusChip from './StatusChip';
import rentalService from '../services/rentalService';
import { Button } from '@/components/ui/button';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { formatAmount } from '../utils/formatNumber';
import {
  ID_TYPE_OPTIONS,
  RELATIONSHIP_OPTIONS,
  RENTER_TYPE_OPTIONS,
  getOptionLabel,
  hasRentalHistorySummary,
  hasRentalProfileData,
} from '../utils/customerRentalMetadata';

const displayText = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
};

const formatDate = (value) => {
  if (!value) return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('MMM DD, YYYY') : displayText(value);
};

/**
 * Read-only rental profile and history panel for customer detail views.
 *
 * @param {object} props
 * @param {Record<string, unknown>|null|undefined} props.customer
 */
const CustomerRentalProfile = ({ customer }) => {
  const navigate = useNavigate();
  const rental = customer?.metadata?.rental || {};
  const identification = rental.identification || {};
  const emergencyContact = rental.emergencyContact || {};
  const guarantor = rental.guarantor || {};
  const deposit = rental.deposit || {};
  const downPayment = rental.downPayment || {};
  const riskProfile = rental.riskProfile || {};
  const history = rental.history || {};

  const [recentRentals, setRecentRentals] = useState([]);
  const [loadingRentals, setLoadingRentals] = useState(false);

  useEffect(() => {
    if (!customer?.id) {
      setRecentRentals([]);
      return undefined;
    }

    let cancelled = false;
    setLoadingRentals(true);

    rentalService
      .getRentals({ customerId: customer.id })
      .then((response) => {
        if (cancelled) return;
        const list = Array.isArray(response?.data) ? response.data : [];
        const sorted = [...list].sort((a, b) => {
          const aDate = a.startDate || a.createdAt || '';
          const bDate = b.startDate || b.createdAt || '';
          return new Date(bDate) - new Date(aDate);
        });
        setRecentRentals(sorted.slice(0, 3));
      })
      .catch((error) => {
        console.error('Failed to load customer rentals:', error);
        if (!cancelled) setRecentRentals([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRentals(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customer?.id]);

  const handleViewRentals = useCallback(() => {
    if (!customer?.id) return;
    navigate(`/rentals?customerId=${customer.id}`);
  }, [customer?.id, navigate]);

  const showProfile = useMemo(() => hasRentalProfileData(rental), [rental]);
  const showHistorySummary = useMemo(() => hasRentalHistorySummary(history), [history]);
  const riskRating = riskProfile.riskRating;

  return (
    <div className="space-y-6">
      <DrawerSectionCard title="Rental profile">
        {showProfile ? (
          <Descriptions column={1} className="space-y-0">
            <DescriptionItem label="Renter type">
              <span className="text-foreground">
                {getOptionLabel(RENTER_TYPE_OPTIONS, rental.renterType) || '—'}
              </span>
            </DescriptionItem>
            <DescriptionItem label="ID type">
              <span className="text-foreground">
                {getOptionLabel(ID_TYPE_OPTIONS, identification.idType) || '—'}
              </span>
            </DescriptionItem>
            <DescriptionItem label="ID number">
              <span className="text-foreground">{displayText(identification.idNumber)}</span>
            </DescriptionItem>
            <DescriptionItem label="ID expiry">
              <span className="text-foreground">{formatDate(identification.idExpiry)}</span>
            </DescriptionItem>
            <DescriptionItem label="Emergency contact">
              <span className="text-foreground">
                {emergencyContact.name
                  ? `${emergencyContact.name}${emergencyContact.phone ? ` · ${emergencyContact.phone}` : ''}`
                  : '—'}
              </span>
            </DescriptionItem>
            <DescriptionItem label="Emergency relationship">
              <span className="text-foreground">
                {getOptionLabel(RELATIONSHIP_OPTIONS, emergencyContact.relationship) || '—'}
              </span>
            </DescriptionItem>
            <DescriptionItem label="Guarantor">
              <span className="text-foreground">
                {guarantor.name
                  ? `${guarantor.name}${guarantor.phone ? ` · ${guarantor.phone}` : ''}`
                  : '—'}
              </span>
            </DescriptionItem>
            <DescriptionItem label="Guarantor ID">
              <span className="text-foreground">
                {guarantor.idNumber
                  ? `${getOptionLabel(ID_TYPE_OPTIONS, guarantor.idType) || 'ID'}: ${guarantor.idNumber}`
                  : '—'}
              </span>
            </DescriptionItem>
            {deposit.standardDepositAmount != null ? (
              <DescriptionItem label="Standard deposit">
                <span className="text-foreground">
                  {formatAmount(deposit.standardDepositAmount)}
                </span>
              </DescriptionItem>
            ) : null}
            {deposit.depositPaid === true || deposit.depositPaid === false ? (
              <DescriptionItem label="Deposit paid">
                <StatusChip status={deposit.depositPaid === true ? 'completed' : 'pending'} />
              </DescriptionItem>
            ) : null}
            {downPayment.amount != null ? (
              <DescriptionItem label="Down payment">
                <span className="text-foreground">
                  {`${formatAmount(downPayment.amount)}${downPayment.date ? ` · ${formatDate(downPayment.date)}` : ''}`}
                </span>
              </DescriptionItem>
            ) : null}
            <DescriptionItem label="Risk rating">
              {riskRating ? <StatusChip status={riskRating} /> : <span className="text-foreground">—</span>}
            </DescriptionItem>
            {riskProfile.riskNotes ? (
              <DescriptionItem label="Risk notes">
                <span className="text-foreground">{riskProfile.riskNotes}</span>
              </DescriptionItem>
            ) : null}
          </Descriptions>
        ) : (
          <p className="text-sm text-muted-foreground">
            No rental profile on file. Edit the customer to add ID, contacts, and risk details.
          </p>
        )}
      </DrawerSectionCard>

      <DrawerSectionCard
        title="Rental history"
        extra={
          customer?.id ? (
            <Button variant="outline" size="sm" onClick={handleViewRentals}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              View rentals
            </Button>
          ) : null
        }
      >
        <div className="space-y-4">
          {showHistorySummary ? (
            <Descriptions column={1} className="space-y-0">
              <DescriptionItem label="Total rentals">
                <span className="text-foreground">{history.totalRentals ?? 0}</span>
              </DescriptionItem>
              <DescriptionItem label="Last rental">
                <span className="text-foreground">{formatDate(history.lastRentalDate)}</span>
              </DescriptionItem>
              <DescriptionItem label="Risk rating">
                {riskRating ? <StatusChip status={riskRating} /> : <span className="text-foreground">—</span>}
              </DescriptionItem>
            </Descriptions>
          ) : (
            <p className="text-sm text-muted-foreground">
              No rental history recorded yet. History will appear after the customer&apos;s first rental.
            </p>
          )}

          {loadingRentals ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading recent rentals…
            </div>
          ) : recentRentals.length > 0 ? (
            <div className="space-y-3 border-t border-[#e5e7eb] pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Recent rentals
              </p>
              {recentRentals.map((rentalRow) => {
                const productNames = (rentalRow.items || [])
                  .map((item) => item?.product?.name)
                  .filter(Boolean)
                  .join(', ');
                return (
                  <div
                    key={rentalRow.id}
                    className="flex items-start justify-between gap-4 border-b border-[#e5e7eb] pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {productNames || 'Rental'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {rentalRow.startDate && rentalRow.endDate
                          ? `${formatDate(rentalRow.startDate)} – ${formatDate(rentalRow.endDate)}`
                          : formatDate(rentalRow.startDate || rentalRow.createdAt)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusChip status={rentalRow.status || 'pending'} />
                      <span className="text-sm font-medium text-foreground">
                        {formatAmount(rentalRow.totalDue ?? rentalRow.amount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !loadingRentals && !showHistorySummary ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground border-t border-[#e5e7eb] pt-4">
              <CalendarClock className="h-4 w-4 shrink-0" />
              <span>No rentals found for this customer yet.</span>
            </div>
          ) : null}
        </div>
      </DrawerSectionCard>
    </div>
  );
};

export default CustomerRentalProfile;
