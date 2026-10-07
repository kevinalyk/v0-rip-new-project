import test from "node:test"
import assert from "node:assert/strict"
import { monthlyCheckoutDisclosure, trialCheckoutDisclosure } from "../checkout-disclosures"

test("Basic Checkout states recurring price and cancellation", () => {
  const text = monthlyCheckoutDisclosure({ planName: "Basic", planMonthlyDollars: 50 })
  assert.match(text, /Basic subscription: \$50\/month/)
  assert.match(text, /automatically each month until you cancel/)
  assert.match(text, /Account > Billing before your next renewal/)
  assert.ok(text.length <= 500)
})

test("Professional Checkout includes seats in the monthly total", () => {
  const text = monthlyCheckoutDisclosure({
    planName: "Professional",
    planMonthlyDollars: 300,
    additionalSeats: 2,
    seatMonthlyDollars: 50,
  })
  assert.match(text, /\$400\/month/)
  assert.match(text, /2 additional seats at \$50\/month each/)
  assert.ok(text.length <= 500)
})

test("legacy add-on Checkout discloses its recurring cost alongside existing charges", () => {
  const text = monthlyCheckoutDisclosure({ addOnMonthlyDollars: 500, existingSubscriptionChargesContinue: true })
  assert.match(text, /\$500\/month/)
  assert.match(text, /\$500\/month add-on/)
  assert.match(text, /Existing plan charges continue separately/)
})

test("trial Checkout discloses the post-trial renewal price", () => {
  const text = trialCheckoutDisclosure(14, 50)
  assert.match(text, /14-day free trial: \$0 today/)
  assert.match(text, /\$50\/month/)
  assert.match(text, /before the trial ends to avoid the first charge/)
  assert.ok(text.length <= 500)
})
