import BillingPeriodCalendar, { type BillingPeriodCalendarProps } from '../BillingPeriodCalendar';
export type { BillingPeriodCalendarProps } from '../BillingPeriodCalendar';
export default function PreviewBillingPeriodCalendar(props: BillingPeriodCalendarProps) {
  return <BillingPeriodCalendar {...props} className="pp-billing-calendar" />;
}
