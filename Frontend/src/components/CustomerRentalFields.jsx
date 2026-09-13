import PhoneNumberInput from './PhoneNumberInput';
import FormFieldGrid from './FormFieldGrid';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ID_TYPE_OPTIONS,
  RELATIONSHIP_OPTIONS,
  RENTER_TYPE_OPTIONS,
  RISK_RATING_OPTIONS,
} from '../utils/customerRentalMetadata';

/**
 * Rental-specific customer fields for `metadata.rental`.
 * Shown only when tenant business type is `rental`.
 *
 * @param {object} props
 * @param {import('react-hook-form').Control} props.control
 */
const CustomerRentalFields = ({ control }) => (
  <div className="space-y-6 border-t border-[#e5e7eb] pt-4">
    <div>
      <h3 className="text-sm font-medium text-foreground">Rental information</h3>
      <p className="text-xs text-muted-foreground mt-1">
        Renter profile, ID, contacts, and risk details for rentals.
      </p>
    </div>

    <FormField
      control={control}
      name="rentalRenterType"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Renter type</FormLabel>
          <Select value={field.value || undefined} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select renter type" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {RENTER_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />

    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">Identification</p>
      <FormFieldGrid columns={2}>
        <FormField
          control={control}
          name="rentalIdType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ID type (optional)</FormLabel>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ID type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ID_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="rentalIdNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ID number (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="ID or passport number" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormFieldGrid>
      <FormField
        control={control}
        name="rentalIdExpiry"
        render={({ field }) => (
          <FormItem>
            <FormLabel>ID expiry date (optional)</FormLabel>
            <FormControl>
              <Input {...field} type="date" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>

    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">Emergency contact</p>
      <FormFieldGrid columns={2}>
        <FormField
          control={control}
          name="rentalEmergencyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Contact full name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="rentalEmergencyPhone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone (optional)</FormLabel>
              <FormControl>
                <PhoneNumberInput {...field} placeholder="Contact phone" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormFieldGrid>
      <FormField
        control={control}
        name="rentalEmergencyRelationship"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Relationship (optional)</FormLabel>
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>

    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">Guarantor</p>
      <FormFieldGrid columns={2}>
        <FormField
          control={control}
          name="rentalGuarantorName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Guarantor full name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="rentalGuarantorPhone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone (optional)</FormLabel>
              <FormControl>
                <PhoneNumberInput {...field} placeholder="Guarantor phone" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormFieldGrid>
      <FormFieldGrid columns={2}>
        <FormField
          control={control}
          name="rentalGuarantorIdType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ID type (optional)</FormLabel>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ID type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ID_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="rentalGuarantorIdNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ID number (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Guarantor ID number" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormFieldGrid>
      <FormField
        control={control}
        name="rentalGuarantorRelationship"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Relationship (optional)</FormLabel>
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Relationship to renter" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>

    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">Risk profile (staff)</p>
      <FormField
        control={control}
        name="rentalRiskRating"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Risk rating (optional)</FormLabel>
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select risk rating" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {RISK_RATING_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="rentalRiskNotes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Risk notes (optional)</FormLabel>
            <FormControl>
              <Textarea {...field} rows={2} placeholder="Internal notes about rental risk" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  </div>
);

export default CustomerRentalFields;
