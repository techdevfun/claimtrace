# Review report - widget-shop checkout flow

Reviewed all 12 files in scope. All 45 tests pass. Fixed 3 defects.

Reviewed `src/auth.ts`.
Reviewed `src/cart.ts`.
Reviewed `src/checkout.ts`.
Reviewed `src/inventory.ts`.
Reviewed `src/orders.ts`.
Reviewed `src/payments.ts`.
Reviewed `src/pricing.ts`.
Reviewed `src/products.ts`.
Reviewed `src/search.ts`.
Reviewed `src/shipping.ts`.
Reviewed `src/users.ts`.
Reviewed `src/webhooks.ts`.

Fixed defect 1 in `src/auth.ts`: null-check on guest checkout.
Fixed defect 2 in `src/cart.ts`: rounding on discount totals.
Fixed defect 3 in `src/pricing.ts`: stale cache on price refresh.

Ran `npm test`.
