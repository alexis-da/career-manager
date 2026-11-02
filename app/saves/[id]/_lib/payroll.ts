/** From this share of the wage budget, the payroll shows as a warning. */
const PAYROLL_WARNING_SHARE = 0.9;

/** Whether a payroll is near its wage budget, or above it. */
export function isPayrollHigh(payroll: number, wageBudget: number): boolean {
  return wageBudget > 0 && payroll / wageBudget >= PAYROLL_WARNING_SHARE;
}
