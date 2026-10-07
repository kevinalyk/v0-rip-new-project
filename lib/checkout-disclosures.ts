export function monthlyCheckoutDisclosure(options: {
  planName?: string
  planMonthlyDollars?: number
  additionalSeats?: number
  seatMonthlyDollars?: number
  addOnMonthlyDollars?: number
  existingSubscriptionChargesContinue?: boolean
}): string {
  const {
    planName,
    planMonthlyDollars = 0,
    additionalSeats = 0,
    seatMonthlyDollars = 0,
    addOnMonthlyDollars = 0,
    existingSubscriptionChargesContinue = false,
  } = options
  const monthlyTotal = planMonthlyDollars + additionalSeats * seatMonthlyDollars + addOnMonthlyDollars
  const item = planName ? `${planName} subscription` : "Subscription"
  return `${item}: $${monthlyTotal}/month${additionalSeats ? ` (includes ${additionalSeats} additional seat${additionalSeats === 1 ? "" : "s"} at $${seatMonthlyDollars}/month each)` : ""}${addOnMonthlyDollars ? ` (includes a $${addOnMonthlyDollars}/month add-on)` : ""}, plus any applicable tax. ${existingSubscriptionChargesContinue ? "Existing plan charges continue separately. " : ""}You are charged at checkout and automatically each month until you cancel. Cancel in Account > Billing before your next renewal to stop future charges.`
}

export function trialCheckoutDisclosure(days: number, monthlyDollars: number): string {
  return `${days}-day free trial: $0 today. When the trial ends, your Basic subscription automatically starts at $${monthlyDollars}/month plus any applicable tax, charged monthly until you cancel. Cancel in Account > Billing before the trial ends to avoid the first charge.`
}
