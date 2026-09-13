import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OVERVIEW_CARD_BORDER, formatOverviewCurrency } from './overviewUtils';

/**
 * Revenue breakdown donut chart.
 */
export default function RevenueByCategoryChart({ data, totalRevenue, onViewFullReport, title = 'Revenue by Category' }) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || totalRevenue || 0;

  return (
    <Card style={OVERVIEW_CARD_BORDER} className="bg-card h-full">
      <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {onViewFullReport && (
          <Button variant="link" className="h-auto p-0 text-xs text-primary" onClick={onViewFullReport}>
            View Full Report
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {data?.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatOverviewCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {data.map((item) => {
                const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0';
                return (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-muted-foreground">{item.name}</span>
                    </div>
                    <span className="font-medium text-foreground">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="py-16 text-center text-sm text-muted-foreground">No category data for this period</div>
        )}
      </CardContent>
    </Card>
  );
}
