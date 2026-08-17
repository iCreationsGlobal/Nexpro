import { useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useCurrency } from '../hooks/useCurrency';
import {
  JOB_CREATE_PAYMENT_METHODS,
  JOB_CREATE_PAYMENT_STATUSES,
} from '../utils/jobCreatePayment';

/**
 * Unpaid / deposit / paid block for job create (and quote-to-job convert).
 * @param {{ form: object, grandTotal?: number }} props
 */
const JobCreatePaymentFields = ({ form, grandTotal = 0 }) => {
  const { formatAmount } = useCurrency();
  const paymentStatus = useWatch({
    control: form.control,
    name: 'paymentStatus',
    defaultValue: 'unpaid',
  }) || 'unpaid';

  useEffect(() => {
    if (paymentStatus === 'paid') {
      form.setValue('paymentAmount', grandTotal > 0 ? grandTotal : '');
    }
  }, [form, grandTotal, paymentStatus]);

  return (
    <div className="space-y-4 border border-border rounded-md p-3">
      <p className="text-sm font-medium">Payment</p>
      <FormField
        control={form.control}
        name="paymentStatus"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Payment status</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || 'unpaid'}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Unpaid" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {JOB_CREATE_PAYMENT_STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {paymentStatus !== 'unpaid' && (
        <>
          {paymentStatus === 'deposit' ? (
            <FormField
              control={form.control}
              name="paymentAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deposit amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  {grandTotal > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Must be less than {formatAmount(grandTotal)}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium">Amount</p>
              <p className="text-sm text-muted-foreground">
                {grandTotal > 0 ? formatAmount(grandTotal) : 'Job total'} (locked to job total)
              </p>
            </div>
          )}

          <FormField
            control={form.control}
            name="paymentMethod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment method</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value || undefined}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {JOB_CREATE_PAYMENT_METHODS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="paymentReference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reference (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Receipt or transfer reference" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="paymentNotes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder="Optional note for this payment"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </div>
  );
};

export default JobCreatePaymentFields;
