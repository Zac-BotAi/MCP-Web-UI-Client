# Refined Payment and Subscription System Design (Conceptual)

This document details the refined logic for handling payments (with Solana Pay as an example), subscriptions, and status checking within the MCP Viral System.

## 1. Payment States & Webhook Payload

### 1.1. Refined `payments.status` States:

The `payments` table `status` column should support the following states to accurately track the lifecycle of a payment:

*   `pending_user_action`: Initial state after `/api/payments/initiate_subscription` is called. The system has generated parameters for Solana Pay, and is awaiting user action in their wallet.
*   `pending_onchain_confirm`: (Optional, if using a listener that reports this intermediate state) User has submitted the transaction, but it's not yet confirmed/finalized on the Solana blockchain.
*   `pending_processor_confirm`: (Optional, if using a 3rd party processor) On-chain transaction is confirmed, but awaiting final confirmation or fraud checks from a payment processor.
*   `completed`: Payment successfully confirmed on-chain and by any processor; funds received. Subscription should be active.
*   `failed_onchain`: Transaction failed on the Solana blockchain (e.g., insufficient funds, network error).
*   `failed_processor`: Transaction was confirmed on-chain but rejected by a payment processor (e.g., fraud, compliance).
*   `refund_pending`: A refund has been initiated but not yet completed.
*   `refunded`: Payment has been successfully refunded.
*   `chargeback`: A chargeback was initiated by the user.

### 1.2. Expected Webhook Payload (`/api/payments/webhook/solana_confirmation` & Renewals)

A Solana payment processor or a custom blockchain listener service would call this webhook.

**Essential Fields:**

*   `event_id`: A unique ID for this webhook event from the processor (for idempotency).
*   `event_type`: Type of event (e.g., `payment.succeeded`, `payment.failed`, `subscription.renewed`, `subscription.payment_failed`).
*   `reference_id`: Our internal `paymentReference` (e.g., `MCP-xxxxxxxx-timestamp`) generated during initiation. This is crucial for matching.
*   `transaction_signature`: The on-chain Solana transaction signature (string).
*   `payer_wallet`: The Solana wallet address of the user who made the payment (string).
*   `recipient_wallet`: The Solana wallet address of the merchant (string, for verification).
*   `amount_sol_paid`: The actual amount of SOL paid (number or string, needs careful parsing).
*   `token_mint`: (Optional) The mint address of the SPL token used if not native SOL (e.g., USDC mint address). Null or absent for native SOL.
*   `amount_token_paid`: (Optional) If an SPL token was used, the amount of that token paid.
*   `timestamp_onchain`: The Unix timestamp (or ISO 8601 string) of when the transaction was confirmed/finalized on-chain.
*   `processor_status`: (Optional) Status from the payment processor, if one is used (e.g., `succeeded`, `failed_fraud_check`).

**Optional but Useful Fields:**

*   `customer_details`: (e.g., email if collected by processor, though we have it via `user_id`).
*   `raw_event_data`: The full event object from the processor/listener for auditing.

### 1.3. Advanced Webhook Verification:

*   **Signature Verification:** If the payment processor signs its webhook payloads (e.g., using HMAC-SHA256 with a shared secret, or asymmetric cryptography), our backend *must* verify this signature before processing the payload. This ensures the webhook is genuinely from the trusted processor. The `X-Webhook-Secret` header used in the stub is a simpler form of this.
*   **IP Whitelisting:** If the processor has static IPs for sending webhooks, whitelist them.

## 2. Subscription Tier Management & User Profile

### 2.1. SQL Schema Additions/Refinements (Conceptual for `schema.sql`):

**`public.users` table:**

*   `id UUID PRIMARY KEY REFERENCES auth.users(id)`
*   `email TEXT`
*   `full_name TEXT`
*   `avatar_url TEXT`
*   `subscription_status TEXT DEFAULT 'free' NOT NULL` (Values: `free`, `active_monthly`, `active_annual`, `payment_failed`, `active_grace_period`, `cancelled`, `expired`)
*   `current_plan_id TEXT` (e.g., 'monthly_49', 'annual_490', 'free_tier') - References a defined set of plans.
*   `subscription_id_processor TEXT` (Optional) If using a payment processor like Stripe that manages subscription objects, store their ID.
*   `subscription_started_at TIMESTAMPTZ`
*   `subscription_expires_at TIMESTAMPTZ`
*   `grace_period_expires_at TIMESTAMPTZ` (For users whose renewal failed but are given some time).
*   `auto_renew BOOLEAN DEFAULT true NOT NULL` (User can toggle this in their settings).
*   `solana_wallet_address TEXT`
*   `created_at TIMESTAMPTZ DEFAULT now() NOT NULL`
*   `updated_at TIMESTAMPTZ DEFAULT now() NOT NULL`

**`public.subscription_plans` table (New - for better plan management):**

*   `plan_id TEXT PRIMARY KEY` (e.g., 'free_tier', 'monthly_49', 'annual_490')
*   `name TEXT NOT NULL` (e.g., "Free Tier", "Monthly Unlimited", "Annual Unlimited")
*   `price_usd DECIMAL(10, 2) NOT NULL`
*   `price_sol DECIMAL(12, 6)` (Optional: fixed SOL price, or null if always dynamic)
*   `duration_months INTEGER NOT NULL` (e.g., 0 for free, 1 for monthly, 12 for annual)
*   `features JSONB` (e.g., `{"generations_per_month": 100, "priority_support": false}`)
*   `is_active BOOLEAN DEFAULT true NOT NULL` (To deprecate old plans)
*   `display_order INTEGER`

### 2.2. Subscription Lifecycle Logic:

*   **New Subscription (from webhook confirmation):**
    1.  Update `payments` record: status to `completed`, store `transaction_signature`.
    2.  Fetch the `plan_id` and `duration_months` from the associated `payments.metadata` or by joining with `subscription_plans` via a plan identifier stored during initiation.
    3.  Update `users` table:
        *   `subscription_status`: `active_monthly` or `active_annual` (derived from `plan_id`).
        *   `current_plan_id`: The new `plan_id`.
        *   `subscription_started_at`: `now()`.
        *   `subscription_expires_at`: `now()` + `duration_months`.
        *   `auto_renew`: `true` (default).
        *   `grace_period_expires_at`: `NULL`.
    4.  Send admin/user notifications.

*   **Subscription Upgrade (e.g., Monthly to Annual):**
    *   **Policy Decision:**
        *   *Simpler:* New plan starts immediately. `subscription_expires_at` is `now()` + new plan's duration. No proration or refund for the unused part of the old plan. User effectively pays full price for the new plan.
        *   *Complex (Proration):* Calculate remaining value of the current plan. Apply as a discount to the new plan's price. New plan starts immediately, expiry is `now()` + new duration. This requires more complex pricing logic and potentially a more sophisticated payment processor.
    *   **Implementation (Simpler Approach):** When user initiates an upgrade, the `/api/payments/initiate_subscription` flow is used. The webhook confirmation updates the `users` table as if it's a new subscription, overriding the previous `current_plan_id`, `subscription_status`, and `subscription_expires_at`.

*   **Subscription Downgrade (e.g., Annual to Monthly):**
    *   **Policy:** Downgrade should take effect at the *end* of the current active paid term.
    *   **Implementation:**
        1.  User chooses to downgrade. Client calls a new endpoint like `/api/user/subscription/change_plan`.
        2.  Backend updates `users.auto_renew = false` for the current plan.
        3.  Backend could store the desired new `plan_id` in a field like `users.next_plan_id_on_renewal`.
        4.  When the current `subscription_expires_at` is reached, a scheduled task (or user action if they need to re-confirm payment for the new, lower-priced plan) would set `current_plan_id` to `next_plan_id_on_renewal`, set `auto_renew = true`, and potentially trigger a new payment initiation for the downgraded plan if payment details are not on file for automatic renewal.
        *   *Simpler for user:* User's current plan expires. They then re-subscribe to the new, lower-tier plan manually. This avoids needing `next_plan_id_on_renewal`. `auto_renew` is set to `false` for the current high-tier plan.

*   **Subscription Cancellation:**
    1.  User chooses to cancel. Client calls `/api/user/subscription/cancel`.
    2.  Backend sets `users.auto_renew = false`.
    3.  The `subscription_status` remains `active_...` until `subscription_expires_at`.
    4.  After `subscription_expires_at`, a scheduled task (or the `checkSubscriptionMiddleware`) would change `subscription_status` to `expired` (or `cancelled_expired`). If they re-subscribe, it's a new subscription.

## 3. `checkSubscriptionMiddleware` Design

This middleware runs *after* `authMiddleware` (so `req.user` is available).

```javascript
// server.js (conceptual placement)
const checkSubscriptionMiddleware = async (req, res, next) => {
  if (!req.user || !req.user.id) {
    // Should not happen if authMiddleware ran correctly
    return res.status(401).json({ error: 'User not authenticated.' });
  }
  if (!supabase) {
    return res.status(503).json({ error: 'Subscription check unavailable.' });
  }

  const userId = req.user.id;
  try {
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('subscription_status, subscription_expires_at, current_plan_id, grace_period_expires_at')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error(`[SubCheck][${userId}] Error fetching user profile for subscription check:`, profileError.message);
      // Default to inactive if profile can't be fetched, or handle as per security policy
      req.subscription = { isActive: false, plan: 'unknown', message: 'Error fetching subscription.' };
      return next(); // Or return 500 if subscription status is critical for all downstream
    }

    if (!userProfile) {
        req.subscription = { isActive: false, plan: 'free', message: 'No profile found, defaulting to free.' };
        return next();
    }

    let isActive = false;
    const now = new Date();

    if (userProfile.subscription_status && userProfile.subscription_status.startsWith('active_')) {
      if (userProfile.subscription_expires_at && new Date(userProfile.subscription_expires_at) > now) {
        isActive = true;
      } else {
        // Subscription has expired based on time
        if (userProfile.grace_period_expires_at && new Date(userProfile.grace_period_expires_at) > now) {
          // Still in grace period (e.g., after a failed renewal)
          isActive = true; // Or a specific status like 'grace_period'
          console.log(`[SubCheck][${userId}] User subscription expired but in grace period until ${userProfile.grace_period_expires_at}.`);
          // Consider updating status to 'active_grace_period' here if not done by webhook
        } else {
          // Truly expired, or past grace period
          console.log(`[SubCheck][${userId}] User subscription expired on ${userProfile.subscription_expires_at}.`);
          // Consider updating status to 'expired' here if not done by a cron job
          // await supabase.from('users').update({ subscription_status: 'expired' }).eq('id', userId);
        }
      }
    } else if (userProfile.subscription_status === 'free') {
        // Free users are "active" in the sense they can use free features.
        // Route handlers will decide if 'free' is sufficient.
        // For this middleware, isActive might mean "has any valid access level".
        // Let's define isActive as "has a non-expired, non-problematic subscription OR is on free plan"
        isActive = true;
    }
    // Other statuses like 'payment_failed', 'cancelled' would result in isActive = false (unless in grace period)

    req.subscription = {
      isActive,
      plan: userProfile.current_plan_id || 'free', // Use current_plan_id
      status: userProfile.subscription_status,
      expiresAt: userProfile.subscription_expires_at,
      gracePeriodEndsAt: userProfile.grace_period_expires_at
    };

    // console.log(`[SubCheck][${userId}] Subscription status:`, req.subscription);
    next();

  } catch (error) {
    console.error(`[SubCheck][${userId}] Exception during subscription check:`, error.message, error.stack);
    req.subscription = { isActive: false, plan: 'unknown', message: 'Exception during subscription check.' };
    next(); // Allow request to proceed but with inactive subscription; route can then decide
  }
};
```

**Applying `checkSubscriptionMiddleware`:**

This middleware would be added to routes that require specific subscription levels. For example, `/mcp/viral-content`:

```javascript
app.post('/mcp/viral-content', authMiddleware, checkSubscriptionMiddleware, async (req, res) => {
  if (!req.subscription.isActive || req.subscription.plan === 'free') { // Example: Block free users
    return res.status(403).json({ error: 'Access denied. Active paid subscription required for this feature.' });
  }
  // ... rest of the logic ...
});
```

## 4. Recurring Payments Webhooks

Need two new webhook endpoints, similar in structure to `/api/payments/webhook/solana_confirmation` but for renewals.

*   **`POST /api/payments/webhook/solana_renewal_success`**:
    *   **Trigger:** Payment processor successfully charges user for a renewal period.
    *   **Payload:** Similar to initial confirmation, but may include `subscription_id_processor`.
    *   **Logic:**
        1.  Idempotency check (based on `event_id` or `transaction_signature`).
        2.  Verify webhook secret.
        3.  Find user by `user_id` or `subscription_id_processor`.
        4.  Create a new `payments` record for this renewal transaction (status `completed`).
        5.  Update `users` table:
            *   `subscription_expires_at`: Extend from *current* `subscription_expires_at` by plan's `duration_months`. (Important: extend from current expiry, not `now()`, to handle early renewals correctly).
            *   `subscription_status`: Ensure it's `active_...`.
            *   `grace_period_expires_at`: `NULL`.
        6.  Send admin/user notifications.

*   **`POST /api/payments/webhook/solana_renewal_failure`**:
    *   **Trigger:** Payment processor fails to charge user for renewal.
    *   **Payload:** Similar, but indicates failure, includes `reason_for_failure`.
    *   **Logic:**
        1.  Idempotency check.
        2.  Verify webhook secret.
        3.  Find user.
        4.  Create/Update `payments` record for this failed attempt (status `failed_processor` or similar).
        5.  Update `users` table:
            *   `subscription_status`: `payment_failed`.
            *   `grace_period_expires_at`: `now()` + (e.g., 3-7 days grace period).
        6.  Send "Payment Failed" notification to user (instructing to update payment method).
        7.  Send admin notification.

## 5. Idempotency for Webhooks

All webhook handlers (`.../solana_confirmation`, `.../solana_renewal_success`, `.../solana_renewal_failure`) must be idempotent.

*   **Strategy:**
    1.  Extract a unique identifier for the event from the webhook payload (e.g., `event_id` from processor, or `transaction_signature` if it's guaranteed to be unique per event attempt).
    2.  Before processing, check if an event with this ID has already been successfully processed. This could involve:
        *   Looking up the `external_transaction_id` in the `payments` table to see if it's already marked `completed` or `failed` with this signature.
        *   Maintaining a separate `webhook_event_log` table: `(id, event_id_processor TEXT UNIQUE, received_at, status TEXT, processing_notes TEXT)`.
    3.  If already processed, return a `200 OK` immediately to acknowledge receipt and prevent the processor from retrying.
    4.  If not processed, proceed with business logic. Ensure that database updates are atomic where possible (e.g., using PL/pgSQL functions for complex updates if not using a full ORM with transaction support).

This refined design provides a more robust framework for handling subscriptions and payments.
```
