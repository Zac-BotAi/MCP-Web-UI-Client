# Admin Interface - Conceptual Design & Features

This document outlines the conceptual design for an administrative interface for the MCP Viral System. This interface would provide tools for user management, payment monitoring, system health checks, and configuration.

## I. Core Design Principles

*   **Role-Based Access Control (RBAC):** Different admin roles (e.g., Super Admin, Support Agent, Content Moderator) should have varying levels of access to data and actions.
*   **Security:** Admin interface access must be strictly controlled via a separate login mechanism or by elevating specific user accounts to admin roles with strong authentication (e.g., MFA). All admin actions should be logged for auditing.
*   **Clarity & Efficiency:** The interface should present data clearly and allow for efficient execution of administrative tasks. Dashboards for at-a-glance overviews are crucial.
*   **Search & Filtering:** Robust search and filtering capabilities are essential for all list views (users, payments, logs).

## II. Key Admin Interface Features

### A. User Management

#### 1. User List View
*   **Display:** Paginated list of all users.
    *   Columns: User ID (UUID), Email, Full Name, Subscription Status, Current Plan ID, Subscription Expires At, Created At.
*   **Search:** By User ID, Email, Full Name, Solana Wallet Address.
*   **Filters:**
    *   Subscription Status (free, active_monthly, active_annual, payment_failed, active_grace_period, cancelled, expired).
    *   Current Plan ID.
    *   Auto-Renew status.
*   **Actions (Bulk or on selected users if applicable):**
    *   (Conceptual) Send bulk email/notification.

#### 2. Individual User View (Accessed by clicking a user from the list)
*   **Tab 1: Profile & Authentication Details**
    *   Display: All fields from `public.users` table (ID, email, full name, avatar URL, wallet, created/updated timestamps).
    *   Display: Key fields from `auth.users` (Last sign-in, email confirmed status).
    *   **Actions:**
        *   Edit `public.users` fields (full name, avatar URL, wallet address).
        *   Manually verify email (if Supabase admin SDK allows).
        *   (Super Admin) Ban/Unban user (requires Supabase admin actions, e.g., `supabase.auth.admin.updateUserById(userId, { ban_duration: 'none' | '876000h' })`).
        *   (Super Admin) Delete user (with all associated data - cascade delete from schema should handle this, but needs careful implementation).
        *   View user's raw JSON from `auth.users` and `public.users`.

*   **Tab 2: Subscription & Payment Management**
    *   Display: Current `subscription_status`, `current_plan_id`, `subscription_started_at`, `subscription_expires_at`, `grace_period_expires_at`, `auto_renew` status.
    *   Display: Paginated list of payments from `public.payments` table for this user (Transaction ID, Amount, Currency, Status, Payment Method, Created At).
    *   **Actions:**
        *   Manually grant/change subscription plan:
            *   Select a new `plan_id` from `subscription_plans`.
            *   Set a new `subscription_expires_at` date/time.
            *   Update `subscription_status` and `current_plan_id`.
            *   Optionally set `auto_renew` status.
            *   Log this manual change with admin ID and reason.
        *   Toggle `auto_renew` for the user.
        *   View details of individual payments.
        *   (Conceptual) Initiate a refund process (might involve external PSP actions and then updating payment status here).

*   **Tab 3: Service Preferences**
    *   Display: List of user's service preferences from `user_service_preferences` (Service Type, Service ID, Priority).
    *   **Actions:**
        *   (Conceptual) View/Edit/Delete individual preferences (though user should manage this primarily).

*   **Tab 4: Activity Log (Conceptual)**
    *   Display: Log of significant user activities (e.g., logins, content generation requests, subscription changes, API key generation if applicable). Requires a dedicated activity logging table.

*   **Tab 5: User-Specific Error Log (Conceptual)**
    *   If errors are logged with `user_id`, display a filtered view of errors specifically related to this user's actions or background processes.

### B. Payment & Subscription Management

#### 1. Payments List View
*   **Display:** Paginated list of all transactions from `public.payments` table.
    *   Columns: Payment ID, User ID (link to user), External Transaction ID (e.g., Solana Tx Sig), Amount, Currency, Status, Payment Method, Subscription Months, Created At.
*   **Search:** By Payment ID, User ID/Email, External Transaction ID.
*   **Filters:** Payment Status, Payment Method, Currency, Date Range.
*   **Actions:**
    *   View individual payment details.

#### 2. Individual Payment View
*   **Display:** All fields from the selected `payments` record, including `metadata` JSONB.
*   **Actions:**
    *   Manually update payment `status` (e.g., from `pending_processor_confirm` to `completed` if webhook failed but payment is verified externally, or to `refunded` after an external refund). Requires careful logging of manual overrides.

#### 3. Subscription Overview Dashboard (Conceptual)
*   **Display Key Metrics:**
    *   Total Active Subscriptions (count).
    *   Breakdown by plan (`monthly_49`, `annual_490`).
    *   Monthly Recurring Revenue (MRR) / Annual Recurring Revenue (ARR) (calculated).
    *   New subscriptions this month/week.
    *   Churn rate (conceptual, needs historical data).
*   **Lists:**
    *   Subscriptions expiring soon (e.g., next 7 days, next 30 days).
    *   Users with `payment_failed` status.
    *   Users in `active_grace_period`.

### C. Content & Service Monitoring

#### 1. Admin Notifications Log View
*   **Display:** Paginated view of `admin_notifications_log` table.
    *   Columns: Event Type, Message, Details (preview or link to full JSON), Sent At, Status (of notification send).
*   **Search:** By Event Type, Message content.
*   **Filters:** Event Type, Status, Date Range.

#### 2. Content Workflow Log (Conceptual - Requires New Table)
*   If a table `content_creation_log` were created: `(id, user_id, topic, aspect_ratio, status TEXT, started_at, completed_at, error_message TEXT, result_drive_link TEXT, result_social_posts JSONB, services_used JSONB)`.
*   **Display:** Paginated list of `/mcp/viral-content` requests.
*   **Search:** User ID/Email, Topic, Status.
*   **Filters:** Status (e.g., 'processing', 'completed', 'failed'), Date Range.
*   **Actions:** View details, (Conceptual) retry failed workflows.

#### 3. Service Health Dashboard (Conceptual)
*   **Display:**
    *   Error rates per service (requires logging service errors with service ID).
    *   Average processing times per service.
    *   (If external services have status pages/APIs) Integration to show current status of dependent external services.
*   **Actions:**
    *   (Conceptual) Temporarily disable a service in `serviceRegistry` if it's causing widespread issues.

### D. Application Configuration (Conceptual - Highly Sensitive)

This section would require strict Super Admin access.

#### 1. Subscription Plan Management
*   Interface to manage records in the `subscription_plans` table.
*   **Actions:** Add new plans, edit existing plan details (name, price, duration, features), deactivate old plans. (Changing `plan_id` of existing plans would be problematic for users already on them).

#### 2. Default Service Preferences
*   Interface to set system-wide default service preferences for each `functional_type` if a user has no specific preferences.

#### 3. Feature Flags
*   Interface to manage application-level feature flags (if such a system is implemented).

### E. Admin Access Control (Conceptual)

*   **Admin Login:** Separate from regular user login, or a mechanism to elevate specific `auth.users` to admin roles.
*   **Admin Role Management:** (Super Admin only) Interface to assign roles (e.g., 'super_admin', 'support_agent', 'moderator') to admin users. Role permissions would be enforced in backend API logic.

## III. Suggested Admin API Endpoint Structure (`/api/admin/...`)

All admin endpoints MUST be protected by a robust admin-only authentication and authorization middleware.

### User Management
*   `GET /api/admin/users`: List users with pagination, search, filters.
*   `GET /api/admin/users/:userId`: Get detailed user information (profile, auth, subscription, payments).
*   `PUT /api/admin/users/:userId/profile`: Update user's `public.users` profile data.
*   `POST /api/admin/users/:userId/verify_email`: Manually mark email as verified.
*   `POST /api/admin/users/:userId/ban`: Ban a user.
*   `POST /api/admin/users/:userId/unban`: Unban a user.
*   `PUT /api/admin/users/:userId/subscription`: Manually update/grant a subscription plan, set expiry, status.
    *   Request Body: `{ planId: "...", expiresAt: "...", status: "...", autoRenew: true/false }`
*   `DELETE /api/admin/users/:userId`: (Super Admin) Delete a user.

### Payment & Subscription Management
*   `GET /api/admin/payments`: List payments with pagination, search, filters.
*   `GET /api/admin/payments/:paymentId`: Get details of a specific payment.
*   `PUT /api/admin/payments/:paymentId/status`: Manually update payment status.
    *   Request Body: `{ status: "...", notes: "Manual override by admin X" }`
*   `GET /api/admin/subscriptions/overview`: Data for the subscription overview dashboard.
*   (Conceptual) `POST /api/admin/users/:userId/subscription/cancel`: Admin cancels a user's auto-renewal.

### Content & Service Monitoring
*   `GET /api/admin/notifications_log`: List admin notifications with pagination, search, filters.
*   (Conceptual) `GET /api/admin/content_logs`: List content creation workflow logs.
*   (Conceptual) `GET /api/admin/service_health`: Data for service health dashboard.

### Application Configuration (Super Admin Only)
*   `GET /api/admin/config/subscription_plans`: List all subscription plans.
*   `POST /api/admin/config/subscription_plans`: Create a new subscription plan.
*   `PUT /api/admin/config/subscription_plans/:planId`: Update an existing plan.
*   (Conceptual) `GET /api/admin/config/default_preferences`: Get system default service preferences.
*   (Conceptual) `PUT /api/admin/config/default_preferences`: Set system default service preferences.

This detailed design provides a comprehensive starting point for building an admin interface. Each feature and endpoint would require careful implementation of backend logic and secure frontend components.
```
