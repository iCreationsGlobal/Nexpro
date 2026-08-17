import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import FormFieldGrid from './FormFieldGrid';

/**
 * Customer-form GRA e-VAT block: TIN/Ghana Card only after e-VAT is on.
 * Managers can turn it on here; staff see a callout until a manager does.
 *
 * @param {object} props
 * @param {import('react-hook-form').Control} props.control
 * @param {boolean} props.evatEnabled
 * @param {boolean} props.isLoading
 * @param {boolean} props.isManager
 * @param {() => void} props.onTurnOn
 * @param {boolean} props.turningOn
 */
const CustomerEvatFields = ({
  control,
  evatEnabled,
  isLoading,
  isManager,
  onTurnOn,
  turningOn,
}) => {
  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        Checking e-VAT…
      </p>
    );
  }

  if (evatEnabled) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          e-VAT is on
          {isManager ? (
            <>
              .{' '}
              <Link to="/compliance/evat" className="text-[#166534] hover:underline">
                Connection settings
              </Link>
            </>
          ) : (
            '.'
          )}
        </p>
        <FormFieldGrid columns={2}>
          <FormField
            control={control}
            name="taxId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>TIN (optional)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Customer TIN for e-VAT" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="ghanaCardPin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ghana Card PIN (optional)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="For GRA e-VAT invoices" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormFieldGrid>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-4">
      <p className="text-sm text-foreground">
        GRA e-VAT needs buyer TIN on invoices. Turn it on to collect that here.
      </p>
      <p className="text-xs text-muted-foreground">
        Data may be sent to GRA when invoices are stamped.
      </p>
      {isManager ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/compliance/evat" className="text-sm text-[#166534] hover:underline">
            API key and live mode
          </Link>
          <Button type="button" onClick={onTurnOn} loading={turningOn}>
            Turn on e-VAT
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Ask a manager to turn on e-VAT</p>
      )}
    </div>
  );
};

export default CustomerEvatFields;
