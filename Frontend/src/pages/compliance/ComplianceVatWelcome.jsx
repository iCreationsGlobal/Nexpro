import { Link } from 'react-router-dom';
import {
  ExternalLink,
  FileCog,
  FileSpreadsheet,
  Info,
  LineChart,
  ShieldCheck,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

const FEATURES = [
  {
    icon: FileCog,
    title: 'Manage VAT settings',
    description: 'Set your TIN, levy rates and other VAT preferences.',
  },
  {
    icon: LineChart,
    title: 'Track VAT collections',
    description: "See how much VAT you've collected and what you owe.",
  },
  {
    icon: FileSpreadsheet,
    title: 'Prepare returns',
    description: 'Generate VAT reports and prepare your returns on time.',
  },
  {
    icon: ShieldCheck,
    title: 'Stay compliant',
    description: 'Meet GRA requirements and avoid penalties.',
  },
];

const GRA_VAT_GUIDE = 'https://gra.gov.gh/e-services/e-vat/';

/**
 * Tax-not-enabled empty state for Compliance → VAT (full-page EmptyState pattern).
 */
export default function ComplianceVatWelcome({ onSetup }) {
  return (
    <div className="space-y-6">
      <EmptyState
        icon="Receipt"
        imageKey="INVOICES"
        title="Welcome to VAT"
        description="Configure tax so you can collect, track, and prepare VAT returns in ABS."
        secondaryAction={{
          label: 'Learn more',
          onClick: () => window.open(GRA_VAT_GUIDE, '_blank', 'noopener,noreferrer'),
        }}
        primaryAction={{
          label: 'Set up VAT',
          onClick: onSetup,
        }}
        size="lg"
      />

      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">What you can do with VAT</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="h-9 w-9 rounded-md bg-green-50 flex items-center justify-center mb-3">
                <Icon className="h-4 w-4 text-[#166534]" />
              </div>
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
        <p className="text-muted-foreground flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#166534]" />
          VAT is a tax on the supply of goods and services in Ghana. ABS helps you stay compliant
          with GRA regulations.
        </p>
        <a
          href={GRA_VAT_GUIDE}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#166534] font-medium hover:underline shrink-0 inline-flex items-center gap-1"
        >
          View VAT guide
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <p className="text-xs text-muted-foreground">
        Certified invoicing is under{' '}
        <Link to="/compliance/evat" className="text-[#166534] underline">
          e-VAT
        </Link>
        .
      </p>
    </div>
  );
}
