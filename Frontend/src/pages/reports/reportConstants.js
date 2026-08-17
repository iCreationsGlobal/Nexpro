/**
 * Reports page constants and terminology helpers.
 * Extracted from Reports.jsx for maintainability.
 */
import { z } from 'zod';
import { CHART_COLORS } from '../../constants';

/** Same palette as global CHART_COLORS (tenant brand + neutrals) */
export const REPORT_CHART_COLORS = CHART_COLORS;

export const createReportSchema = z.object({
  reportTitle: z.string().min(1, 'Please enter report title'),
  durationType: z.string().optional(),
  year: z.number().optional(),
  month: z.string().optional(),
  /** Free-text “Describe with AI” prompt (optional; required only in free_text mode at submit). */
  userPrompt: z.string().optional(),
});

/** Studio types that use Jobs (printing_press, mechanic, barber, salon) */
export const STUDIO_TYPES = ['printing_press', 'mechanic', 'barber', 'salon'];

/**
 * Business type terminology helper - supports studio types, shop, pharmacy.
 * @param {string} businessType
 * @param {{ studioType?: string, shopType?: string }} metadata
 * @returns {Record<string, string>}
 */
export function getBusinessTerminology(businessType, metadata = {}) {
  const studioType = metadata?.studioType || businessType;
  const shopType = metadata?.shopType;

  const terms = {
    printing_press: {
      analytics: 'Service Analytics',
      items: 'Services',
      sales: 'Jobs',
      salesLabel: 'Total Jobs',
      salesValueLabel: 'Total Job Value',
      rateLabel: 'Completion Rate',
      trendLabel: 'Jobs Trend',
      incomingLabel: 'Incoming jobs',
      completedLabel: 'Completed jobs',
      salesByTypeLabel: 'Sales by Job Type',
      typeColumnLabel: 'Job Type',
      countColumnLabel: 'Jobs',
      reportLabel: 'Jobs Report',
      categories: 'Service Categories',
      units: 'Units',
      revenue: 'Service Revenue',
      analyticsTitle: 'Service Analytics Summary',
      analyticsDescription: 'An overview of the performance of your services and their revenue.',
      topRevenueLabel: 'Top 5 Revenue Sources',
      topCategoryInsightLabel: 'service category'
    },
    mechanic: {
      analytics: 'Repair Analytics',
      items: 'Repairs',
      sales: 'Repairs',
      salesLabel: 'Total Repairs',
      salesValueLabel: 'Total Repair Value',
      rateLabel: 'Completion Rate',
      trendLabel: 'Repairs Trend',
      incomingLabel: 'Incoming repairs',
      completedLabel: 'Completed repairs',
      salesByTypeLabel: 'Sales by Service Category',
      typeColumnLabel: 'Service Type',
      countColumnLabel: 'Repairs',
      reportLabel: 'Repairs Report',
      categories: 'Service Categories',
      units: 'Repairs',
      revenue: 'Repair Revenue',
      analyticsTitle: 'Repair Analytics Summary',
      analyticsDescription: 'An overview of the performance of your repair services and their revenue.',
      topRevenueLabel: 'Top 5 Revenue Sources',
      topCategoryInsightLabel: 'repair category'
    },
    barber: {
      analytics: 'Service Analytics',
      items: 'Services',
      sales: 'Appointments',
      salesLabel: 'Total Appointments',
      salesValueLabel: 'Total Appointment Value',
      rateLabel: 'Completion Rate',
      trendLabel: 'Appointments Trend',
      incomingLabel: 'Incoming',
      completedLabel: 'Completed',
      salesByTypeLabel: 'Sales by Service',
      typeColumnLabel: 'Service',
      countColumnLabel: 'Appointments',
      reportLabel: 'Appointments Report',
      categories: 'Service Categories',
      units: 'Appointments',
      revenue: 'Service Revenue',
      analyticsTitle: 'Service Analytics Summary',
      analyticsDescription: 'An overview of the performance of your services and their revenue.',
      topRevenueLabel: 'Top 5 Revenue Sources',
      topCategoryInsightLabel: 'service'
    },
    salon: {
      analytics: 'Service Analytics',
      items: 'Services',
      sales: 'Appointments',
      salesLabel: 'Total Appointments',
      salesValueLabel: 'Total Appointment Value',
      rateLabel: 'Completion Rate',
      trendLabel: 'Appointments Trend',
      incomingLabel: 'Incoming',
      completedLabel: 'Completed',
      salesByTypeLabel: 'Sales by Service',
      typeColumnLabel: 'Service',
      countColumnLabel: 'Appointments',
      reportLabel: 'Appointments Report',
      categories: 'Service Categories',
      units: 'Appointments',
      revenue: 'Service Revenue',
      analyticsTitle: 'Service Analytics Summary',
      analyticsDescription: 'An overview of the performance of your services and their revenue.',
      topRevenueLabel: 'Top 5 Revenue Sources',
      topCategoryInsightLabel: 'service'
    },
    shop: {
      analytics: 'Product Analytics',
      items: 'Products',
      sales: 'Sales',
      salesLabel: 'Total Sales',
      salesValueLabel: 'Total Sales Value',
      rateLabel: 'Cash Sales Rate',
      trendLabel: 'Sales Trend',
      incomingLabel: 'Incoming',
      completedLabel: 'Completed',
      salesByTypeLabel: 'Sales by Category',
      typeColumnLabel: 'Category',
      countColumnLabel: 'Sales',
      reportLabel: 'Sales Report',
      categories: 'Product Categories',
      units: 'Units Sold',
      revenue: 'Product Revenue',
      analyticsTitle: 'Product Analytics Summary',
      analyticsDescription: 'A detailed summary of all products and their sales status.',
      topRevenueLabel: 'Top 5 Products',
      topCategoryInsightLabel: 'product'
    },
    pharmacy: {
      analytics: 'Drug Analytics',
      items: 'Drugs',
      sales: 'Prescriptions',
      salesLabel: 'Total Prescriptions',
      salesValueLabel: 'Total Sales Value',
      rateLabel: 'Fulfillment Rate',
      trendLabel: 'Sales Trend',
      incomingLabel: 'Incoming',
      completedLabel: 'Completed',
      salesByTypeLabel: 'Sales by Category',
      typeColumnLabel: 'Category',
      countColumnLabel: 'Prescriptions',
      reportLabel: 'Sales Report',
      categories: 'Drug Categories',
      units: 'Dispensed',
      revenue: 'Prescription Revenue',
      analyticsTitle: 'Drug Analytics Summary',
      analyticsDescription: 'A detailed summary of all drugs and their prescription status.',
      topRevenueLabel: 'Top 5 Products',
      topCategoryInsightLabel: 'drug'
    }
  };

  const effectiveType = STUDIO_TYPES.includes(businessType) ? businessType : businessType === 'studio' ? studioType : businessType;
  return terms[effectiveType] || terms.printing_press;
}
