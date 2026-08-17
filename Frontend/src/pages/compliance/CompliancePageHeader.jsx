/**
 * Shared Compliance page header — matches Reports Overview / Settings chrome.
 * @param {{ title: string, subtitle?: string, breadcrumb?: string, badge?: React.ReactNode, actions?: React.ReactNode }} props
 */
export default function CompliancePageHeader({
  title,
  subtitle,
  breadcrumb = null,
  badge = null,
  actions = null,
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
      <div className="min-w-0">
        {breadcrumb && (
          <p className="text-xs text-muted-foreground mb-1">{breadcrumb}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{subtitle}</p>
        )}
      </div>
      {actions ? (
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto shrink-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
