# ADMIN PANEL REVIEW — Current Implementation

**Generated:** 2026-05-23
**Project:** C:\GramBankProject\adminnew
**Backend API:** http://10.25.141.159:5000/api

---

## 1. DASHBOARD

| Field | Detail |
|-------|--------|
| **Route** | `/` |
| **Component** | `src/pages/Dashboard.js` (98 lines) |
| **Purpose** | Banking operations summary — stat cards + fraud mini-stats + charts |

### UI Components
- 4 `StatCard` components: Total Users, Active Users, Transactions Today, Total Balance
- 6 `MiniStat` inline cards: Flagged Users, Fraud Accounts, Open Alerts, Pending Complaints, Under Review, Hold for Review
- `LineChart` (7-day transaction volume via Recharts)
- `DonutChart` (credit vs debit via Recharts)
- Error state with Retry button
- Loading spinner

### Backend APIs Used
| API Function | Endpoint | Status |
|---|---|---|
| `getAdminStatsSummary()` | `GET /admin/stats-summary` | ✅ Exists |
| `getTransactionChart()` | `GET /dashboard/transactions-7days` | ✅ Exists |
| `getCreditDebitStats()` | `GET /dashboard/credit-debit` | ✅ Exists |

### Features Implemented
- Loads all 3 APIs in parallel via `Promise.all`
- 11-metric summary from `stats-summary`
- 7-day line chart
- Credit/debit donut chart
- Error recovery with retry button

### Unused Imports (warnings)
`Users`, `IndianRupee`, `ArrowRightLeft`, `Ban` from `lucide-react` — imported but never used

### Broken / Missing
- None — page is fully functional

---

## 2. USERS

| Field | Detail |
|-------|--------|
| **Route** | `/users` |
| **Component** | `src/pages/Users.js` (201 lines) |
| **Purpose** | Manage registered users — search, filter, freeze/unfreeze, add balance |

### UI Components
- Search input (search by name, account, phone, Aadhaar)
- Status filter dropdown (ACTIVE, TEMP_FROZEN, UNDER_REVIEW, FROZEN, SUSPENDED, BLOCKED, CLEARED)
- Flagged filter dropdown (All Users, Flagged for Fraud)
- Per-page selector (10/20/50)
- Table: Name, Account, Phone, Balance, Status, Flagged, Actions
- Page number buttons (shows up to 5 page buttons)
- Transaction History modal (table: Txn ID, Type, Amount, To, Date)
- Add Balance modal (amount + reason inputs)
- Loading/error states

### Backend APIs Used
| API Function | Endpoint | Status |
|---|---|---|
| `getAllUsers(page, limit, filters)` | `GET /users/admin/all-users?page=&limit=&search=&status=&flagged=` | ✅ Exists |
| `getUserTransactions(userId)` | `GET /txns/admin/user/:userId` | ✅ Exists |
| `freezeUser(userId)` | `POST /users/admin/freeze/:userId` | ✅ Exists |
| `unfreezeUser(userId)` | `POST /users/admin/unfreeze/:userId` | ✅ Exists |
| `addBalanceToUser({ userId, amount, reason })` | `POST /users/admin/add-balance/:userId` | ✅ Exists |

### Features Implemented
- Server-side search (resets to page 1)
- Server-side status filtering (resets to page 1)
- Server-side flagged filter (resets to page 1)
- Server-side pagination with page controls
- Freeze/Unfreeze buttons (context-aware: shows Snowflake for active, Sun for frozen)
- Transaction history modal (Eye button)
- Add balance modal (Plus button) with amount validation

### Buttons/Actions
| Button | Action | Endpoint | Works? |
|--------|--------|----------|--------|
| Eye (transactions) | Opens Tx History modal | `GET /txns/admin/user/:userId` | ✅ |
| Plus (add balance) | Opens Add Balance modal | — | ✅ |
| Snowflake (freeze) | Freezes user | `POST /users/admin/freeze/:userId` | ✅ |
| Sun (unfreeze) | Unfreezes user | `POST /users/admin/unfreeze/:userId` | ✅ |

### API Functions Available But Unused in UI
- `bypassCooldown(userId)` — `POST /users/admin/bypass-cooldown/:userId`
- `getDeviceHistory(userId)` — `GET /users/admin/device-history/:userId`

### Missing / Incomplete
- No device history button
- No bypass-cooldown button
- No "Suspended" or "Blocked" distinction (freeze just sets FROZEN status)
- Unused import: `X` from `lucide-react`

---

## 3. FUNDS (TRANSACTIONS)

| Field | Detail |
|-------|--------|
| **Route** | `/funds` |
| **Component** | `src/pages/Funds.js` (211 lines) |
| **Purpose** | Track and manage all transactions with search, filters, archive toggle |

### UI Components
- Search input (by txn ID, account, beneficiary)
- Filter toggle button (shows/hides filter panel)
- Archive toggle button (Active / Archived)
- Filter panel: type (DEBIT/CREDIT), status (Completed/Flagged), date range (From/To), per-page selector
- Clear filters link (when active filters exist)
- Table: TXN ID, From, To, Amount, Type (arrow icon), Status, Date, Actions
- Detail modal: full transaction details (txn id, amount, type, status, sender, recipient, balance before/after, date/time, fraud reason, risk score)
- Pagination controls
- Loading/error states

### Backend APIs Used
| API Function | Endpoint | Status |
|---|---|---|
| `getAllTransactions(page, limit, filters)` | `GET /txns/admin/all?page=&limit=&search=&type=&status=&dateFrom=&dateTo=` | ✅ Exists |
| `getArchivedTransactions(page, limit, days)` | imported but **NEVER CALLED** | ❌ |

### Features Implemented
- Server-side search (resets to page 1)
- Server-side type/status/date filter (resets to page 1)
- Filter count badge on toggle button
- Server-side pagination (10/20/50 per page)
- Transaction detail modal with all fields
- Fraud reason + risk score display in detail modal
- Balance before/after display

### Broken / Missing
- **Archive toggle is BROKEN**: `getArchivedTransactions` is imported but `loadTransactions` always calls `getAllTransactions`. When `showArchive=true`, the useEffect guard `if (!showArchive)` prevents reloading, so the table shows stale non-archived data. The archive button changes the label but does nothing functional.
- Unused import: `getArchivedTransactions` from `fraud.api.js` (line 4)

---

## 4. FRAUD MANAGEMENT

| Field | Detail |
|-------|--------|
| **Route** | `/fraud` |
| **Component** | `src/pages/Fraud.js` (585 lines) |
| **Purpose** | Monitor and manage fraud alerts, blacklisted accounts, flagged users, suspicious transactions, complaints, investigations |

### UI Components
- 7 clickable stat cards: Fraud Accounts, Flagged Users, Suspicious Txns, Open Complaints, Under Investigation, Temp Frozen, Hold for Review
- Complaint mini stats (6 counts): Total, Pending, Review, Resolved, Fraud, Blocked
- Txn mini stats (3 counts): Confirmed Fraud, Suspicious, High Risk
- 2 tab buttons: Fraud Alerts, Blacklisted Accounts
- Search input (client-side filtering)
- 7 sub-table components (defined inline in the same file):
  - FraudAccountsTable
  - FlaggedUsersTable
  - SuspiciousTxnsTable
  - ComplaintsTable
  - InvestigationTable
  - FrozenUsersTable
  - HoldReviewTable
- Transaction history modal (reused across all sections)
- Active section detail panel (replaces tab view when a card is clicked)

### Backend APIs Used
| API Function | Endpoint | Status |
|---|---|---|
| `getFraudStats()` | `GET /fraud/stats` | ✅ Exists |
| `getFraudAlerts()` | `GET /fraud/alerts` | ✅ Exists |
| `getFraudAccounts()` | `GET /fraud/accounts` | ✅ Exists |
| `getUnderInvestigationUsers()` | `GET /admin/under-investigation` | ✅ Exists |
| `getTempFrozenUsers()` | `GET /admin/temp-frozen` | ✅ Exists |
| `getHoldForReviewTxns()` | `GET /admin/hold-for-review` | ✅ Exists |
| `getSuspiciousTxnStats()` | `GET /admin/suspicious-transactions/stats` | ✅ Exists |
| `getFraudAccountsList()` | `GET /admin/fraud-accounts` | ✅ Exists (no pagination params sent) |
| `getFlaggedUsers()` | `GET /admin/flagged-users` | ✅ Exists (no pagination params sent) |
| `getSuspiciousTransactions()` | `GET /admin/suspicious-transactions` | ✅ Exists (no pagination params sent) |
| `getOpenComplaints()` | `GET /admin/open-complaints` | ✅ Exists (no pagination params sent) |
| `freezeFlaggedUser(id)` | `POST /admin/flagged-users/:id/freeze` | ✅ Exists |
| `unfreezeFlaggedUser(id)` | `POST /admin/flagged-users/:id/unfreeze` | ✅ Exists |
| `markUserSafe(id)` | `POST /admin/flagged-users/:id/mark-safe` | ✅ Exists |
| `approveTransaction(id)` | `POST /admin/suspicious-transactions/:id/approve` | ✅ Exists |
| `cancelTransaction(id, reason)` | `POST /admin/suspicious-transactions/:id/cancel` | ✅ Exists |
| `investigateTransaction(id)` | `POST /admin/suspicious-transactions/:id/investigate` | ✅ Exists |
| `resolveComplaint(id, notes)` | `POST /admin/open-complaints/:id/resolve` | ✅ Exists |
| `cancelComplaintTransaction(id, notes)` | `POST /admin/open-complaints/:id/cancel-transaction` | ✅ Exists |
| `markComplaintFalse(id, notes)` | `POST /admin/open-complaints/:id/mark-false` | ✅ Exists |
| `getUserTransactions(id)` | `GET /admin/flagged-users/:id/transactions` | ✅ Exists |
| `freezeUser(userId)` | `POST /fraud/freeze-user` | ✅ Exists |
| `unfreezeUser(accountNumber)` | `POST /fraud/unfreeze-user` | ✅ Exists |
| `escalateTransaction(txnId)` | `POST /fraud/escalate` | ✅ Exists |

### Features Implemented
- 7-section interactive cards with expandable detail tables
- 2-tab main view (Fraud Alerts + Blacklisted Accounts)
- Client-side search on alerts, accounts, and detail sections
- Freeze/Unfreeze/Mark Safe actions on flagged users
- Approve/Cancel/Investigate actions on suspicious transactions
- Resolve/Cancel Transaction/Mark False actions on complaints
- Freeze/Escalate actions on fraud alerts
- Transaction history modal from any section

### Missing / Incomplete
- **No pagination** on any of the 7 detail tables — calls non-paginated `getFraudAccountsList()` etc. (no page/limit params sent)
- **Client-side only search** on alerts/accounts — not server-side
- **No pagination controls** on Fraud Alerts or Blacklisted Accounts tables either
- **Warning**: missing `default` case in switch statement on line 76 (ESLint warning)
- No "Blacklist" action on Investigation users (only Freeze + Mark Safe)
- Paginated API functions exist in `fraud.api.js` (e.g., `getFraudAccountsListPaginated`) but are **NOT used**

---

## 5. REPORTS (COMPLAINTS)

| Field | Detail |
|-------|--------|
| **Route** | `/reports` |
| **Component** | `src/pages/Reports.js` (474 lines) |
| **Purpose** | Review and manage user fraud complaints |

### UI Components
- 5 clickable stat cards: Pending, Under Review, Investigating, Resolved, Critical
- Search input (client-side, by complaint ID, name, account)
- 7 filter buttons: ALL, PENDING, UNDER_REVIEW, UNDER_INVESTIGATION, RESOLVED, REJECTED
- Per-page selector (10/20/50)
- Table: Complaint ID, Reporter, Reported Account, Category, Amount, Severity, Status, Date, View button
- Detail modal (reporter info, reported account, complaint details, related transactions, timeline)
- 6 action buttons in detail modal: Accept, Reject, Mark Fraud, Suspend, Block, Investigate
- Action confirmation modal with reason (required for reject/block/mark_fraud) and notes
- Pagination controls
- Loading/error states

### Backend APIs Used
| API Function | Endpoint | Status |
|---|---|---|
| `api.get('/admin/list?...')` | `GET /api/admin/list?page=&limit=&status=&search=` | ✅ Exists |
| `api.get('/admin/stats')` | `GET /api/admin/stats` | ✅ Exists |
| `api.get('/admin/:id')` | `GET /api/admin/:id` | ✅ Exists |
| `api.put('/admin/:id/action', {...})` | `PUT /api/admin/:id/action` | ✅ Exists |

### Features Implemented
- Stat cards filter the list (click to filter by status, click again to clear)
- Search filters client-side
- Complaint detail modal with full info
- 6 admin actions with confirmation modal
- Server-side pagination with page buttons + per-page selector
- Search + filter both reset page to 1
- Related transactions and timeline display in detail modal

### Missing / Incomplete
- **useEffect missing dependency**: `loadData` not listed in dependency array (ESLint warning)
- **Client-side search/filter** after data is loaded from server — not server-side (search param IS sent to backend but data is also client-filtered via `filteredReports` useMemo)
- No Escalate or Police Report buttons (backend supports these: `POST /admin/:id/escalate`, `POST /admin/:id/police-report`)
- No audit log display in detail modal (backend has `GET /admin/:id/audit-log`)
- No transaction history sub-view for reported account (backend has `GET /admin/:id/transaction-history`)

---

## 6. SCHEDULED TRANSACTIONS

| Field | Detail |
|-------|--------|
| **Route** | `/scheduled` |
| **Component** | `src/pages/ScheduledTxns.js` (208 lines) |
| **Purpose** | Manage delayed and held transactions with live countdown timers |

### UI Components
- 5 clickable stat cards: Pending, Fraud Review, Completed, Cancelled, Failed
- Search input (by txn ID, account)
- Archive toggle button (Active/Archived)
- Per-page selector (10/20/50)
- Table: Txn ID, User, Receiver, Amount, Status, Countdown (live timer), Date, Actions
- Live countdown timers using `useCountdown` custom hook (updates every 1s)
- Countdown urgency colors: red+pulse (<5min), yellow (<15min), blue (normal)
- Approve/Reject action buttons for PENDING and HOLD_FOR_REVIEW status
- Pagination controls
- Loading/error states

### Backend APIs Used
| API Function | Endpoint | Status |
|---|---|---|
| `getScheduledTransactions(page, limit, status, search)` | `GET /admin/scheduled-transactions?page=&limit=&status=&search=` | ✅ Exists |
| `processScheduledTransaction(txnId, action)` | `POST /admin/scheduled-transactions/:txnId/process` | ✅ Exists |
| `getArchivedScheduled(page, limit, days)` | `GET /admin/archive/scheduled?page=&limit=&days=` | ✅ Exists |

### Features Implemented
- Server-side pagination with page controls
- Status filter via stat card click (resets to page 1)
- Live countdown timers with urgency colors
- Approve/Reject actions with confirmation dialog
- Archive toggle (works — loads from `/admin/archive/scheduled`)
- Search input (passed to backend — resets page to 1)

### Missing / Incomplete
- **Stats are per-page only** — counts reflect only the current page's data, not total counts across all statuses
- **Search may not work** — backend may not accept search param for scheduled transactions (depends on adminRoutes.js implementation)
- **useEffect missing dependency**: `loadScheduled` not listed in dependency array (ESLint warning)
- Unused import: `Clock` from `lucide-react`

---

## 7. LIVE CHAT

| Field | Detail |
|-------|--------|
| **Route** | `/live-chat` |
| **Component** | `src/pages/LiveChat.js` (184 lines) |
| **Purpose** | Respond to user queries via live chat |

### UI Components
- Conversation list panel (user avatar, name, last message, unread badge)
- Chat window panel (messages, send input, send button)
- Empty state for no chats
- Empty state for no conversation selected
- Loading/error states

### Backend APIs Used
| API Function | Endpoint Called | Actual Backend Endpoint | Status |
|---|---|---|---|
| `getLiveChats()` | `GET /admin/chats` | `GET /live-chat/admin/all-chats` | ❌ **BROKEN** |
| `getChatMessages(userId)` | `GET /admin/chats/:userId` | `GET /live-chat/admin/user/:userId/messages` | ❌ **BROKEN** |
| `sendChatMessage(userId, message)` | `POST /admin/chats/:userId/message` | `POST /live-chat/admin/user/:userId/message` | ❌ **BROKEN** |

### Features Implemented
- Conversation list with last message preview
- Unread count badges
- Message display with sender differentiation (ADMIN right-aligned green, USER left-aligned gray)
- Send message on Enter or button click
- Timestamps on messages

### Broken / Missing
- **ALL API ENDPOINTS ARE WRONG** — frontend calls `/admin/chats*` but backend serves at `/live-chat/admin/*`
- No auto-refresh / polling for new messages
- No pagination on conversation list
- No typing indicators
- **Page is completely non-functional**

---

## 8. SETTINGS

| Field | Detail |
|-------|--------|
| **Route** | `/settings` |
| **Component** | `src/pages/Settings.js` (92 lines) |
| **Purpose** | Admin profile management & session control |

### UI Components
- Profile form: Name, Email, Phone, Role (disabled "Super Admin")
- Save Changes button (with "Saved ✓" feedback)
- Logout & Clear Session button

### Backend APIs Used
**None** — all data stored/retrieved from `localStorage`

### Features Implemented
- Loads admin name/email/phone from localStorage on mount
- Saves form values to localStorage
- Logout clears localStorage and reloads page

### Missing / Incomplete
- **No backend API** — profile is localStorage-only, not persisted on server
- No password change
- No notification preferences
- No theme toggle (dark mode toggle is in Topbar, not Settings)
- No real session management

---

## 9. SHARED COMPONENTS

### StatCard (`src/components/StatCard.js`)
- Reusable stat card with icon, title, value, optional percent change
- Icons: FiUsers (users), FiDollarSign (balance), FiTrendingUp (transactions), FiAlertTriangle (fraud)
- Uses `react-icons/fi` (not `lucide-react`)
- Color-coded backgrounds by type

### LineChart (`src/components/LineChart.js`)
- 7-day transaction volume chart via Recharts
- Uses `LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`
- Green theme (#22C55E)
- **Bug**: `const formatted` on line 11 is assigned but never used (ESLint warning)

### DonutChart (`src/components/DonutChart.js`)
- Credit vs Debit donut chart via Recharts
- Uses `PieChart`, `Pie`, `Cell`
- Green (#22C55E) for Credit, Dark (#0F172A) for Debit
- Legend below chart
- Returns null if no data

---

## 10. LAYOUT COMPONENTS

### Layout (`src/layout/Layout.js`)
- Flex layout: Sidebar (fixed 64rem) + main area (Topbar + scrollable content)
- Applies theme-aware background colors

### Sidebar (`src/layout/Sidebar.js`)
- 8-item navigation: Dashboard, Users, Funds, Fraud, Reports, Scheduled, Live Chat, Settings
- Uses `NavLink` with `end` prop for active state
- Active: green background + white text
- Inactive: gray text with hover effect

### Topbar (`src/layout/Topbar.js`)
- Search input (placeholder: "Search User ID / Transaction ID...")
- Dark mode toggle (Sun/Moon icon, toggles `dark` class on `documentElement`)
- Notification bell icon (no functionality)
- Admin avatar "AD" (hardcoded initials)

### Topbar Issues
- Search input is decorative — does nothing
- Notification bell has no click handler
- Admin avatar "AD" is hardcoded, not from settings/API

---

## 11. API LAYER SUMMARY

### `src/api/axios.js`
- Default export: Axios instance with `baseURL` from `REACT_APP_API_URL` or `http://localhost:5000/api`
- Request interceptor: attaches `Bearer` token from `localStorage.getItem("token")`
- Content-Type: `application/json`

### `src/api/dashboard.api.js` (7 functions)
| Function | Endpoint | Used By |
|---|---|---|
| `getDashboardStats()` | `GET /dashboard/stats` | Dashboard (unused?) |
| `getTransactionChart()` | `GET /dashboard/transactions-7days` | Dashboard ✅ |
| `getCreditDebitStats()` | `GET /dashboard/credit-debit` | Dashboard ✅ |
| `getAdminStatsSummary()` | `GET /admin/stats-summary` | Dashboard ✅ |
| `getLiveChats()` | `GET /admin/chats` | LiveChat ❌ (wrong endpoint) |
| `getChatMessages(userId)` | `GET /admin/chats/:userId` | LiveChat ❌ (wrong endpoint) |
| `sendChatMessage(userId, message)` | `POST /admin/chats/:userId/message` | LiveChat ❌ (wrong endpoint) |

### `src/api/user.api.js` (7 functions)
| Function | Endpoint | Used By |
|---|---|---|
| `getAllUsers()` | `GET /users/admin/all-users` | Users ✅ |
| `getUserTransactions(userId)` | `GET /txns/admin/user/:userId` | Users ✅ |
| `freezeUser(userId)` | `POST /users/admin/freeze/:userId` | Users ✅ |
| `unfreezeUser(userId)` | `POST /users/admin/unfreeze/:userId` | Users ✅ |
| `addBalanceToUser({ userId, amount, reason })` | `POST /users/admin/add-balance/:userId` | Users ✅ |
| `bypassCooldown(userId)` | `POST /users/admin/bypass-cooldown/:userId` | **Unused** |
| `getDeviceHistory(userId)` | `GET /users/admin/device-history/:userId` | **Unused** |

### `src/api/transaction.api.js` (4 functions)
| Function | Endpoint | Used By |
|---|---|---|
| `getAllTransactions(page, limit, filters)` | `GET /txns/admin/all` | Funds ✅ |
| `getScheduledTransactions(page, limit, status, search)` | `GET /admin/scheduled-transactions` | ScheduledTxns ✅ |
| `processScheduledTransaction(txnId, action)` | `POST /admin/scheduled-transactions/:txnId/process` | ScheduledTxns ✅ |
| `processScheduled(txnId)` | `POST /txns/process-scheduled` | **Unused** |

### `src/api/fraud.api.js` (31 functions)
| Function | Endpoint | Used By |
|---|---|---|
| `getFraudStats()` | `GET /fraud/stats` | Fraud ✅ |
| `getFraudAlerts()` | `GET /fraud/alerts` | Fraud ✅ |
| `getFraudAccounts()` | `GET /fraud/accounts` | Fraud ✅ |
| `freezeUser(userId)` | `POST /fraud/freeze-user` | Fraud ✅ |
| `unfreezeUser(accountNumber)` | `POST /fraud/unfreeze-user` | Fraud ✅ |
| `escalateTransaction(txnId)` | `POST /fraud/escalate` | Fraud ✅ |
| `reportFraudAccount({...})` | `POST /txns/report` | **Unused** |
| `getFraudAccountsList()` | `GET /admin/fraud-accounts` | Fraud ✅ |
| `getFlaggedUsers()` | `GET /admin/flagged-users` | Fraud ✅ |
| `getSuspiciousTransactions()` | `GET /admin/suspicious-transactions` | Fraud ✅ |
| `getOpenComplaints()` | `GET /admin/open-complaints` | Fraud ✅ |
| `freezeFlaggedUser(id)` | `POST /admin/flagged-users/:id/freeze` | Fraud ✅ |
| `unfreezeFlaggedUser(id)` | `POST /admin/flagged-users/:id/unfreeze` | Fraud ✅ |
| `markUserSafe(id)` | `POST /admin/flagged-users/:id/mark-safe` | Fraud ✅ |
| `approveTransaction(id)` | `POST /admin/suspicious-transactions/:id/approve` | Fraud ✅ |
| `cancelTransaction(id, reason)` | `POST /admin/suspicious-transactions/:id/cancel` | Fraud ✅ |
| `investigateTransaction(id)` | `POST /admin/suspicious-transactions/:id/investigate` | Fraud ✅ |
| `resolveComplaint(id, notes)` | `POST /admin/open-complaints/:id/resolve` | Fraud ✅ |
| `cancelComplaintTransaction(id, notes)` | `POST /admin/open-complaints/:id/cancel-transaction` | Fraud ✅ |
| `markComplaintFalse(id, notes)` | `POST /admin/open-complaints/:id/mark-false` | Fraud ✅ |
| `getUserTransactions(id)` | `GET /admin/flagged-users/:id/transactions` | Fraud ✅ |
| `getUnderInvestigationUsers(page, limit)` | `GET /admin/under-investigation` | Fraud ✅ |
| `getTempFrozenUsers(page, limit)` | `GET /admin/temp-frozen` | Fraud ✅ |
| `getHoldForReviewTxns(page, limit)` | `GET /admin/hold-for-review` | Fraud ✅ |
| `getSuspiciousTxnStats()` | `GET /admin/suspicious-transactions/stats` | Fraud ✅ |
| `getFraudAccountsListPaginated(page, limit, search)` | `GET /admin/fraud-accounts?page=&limit=&search=` | **Unused** |
| `getFlaggedUsersPaginated(page, limit, status, search)` | `GET /admin/flagged-users?page=&limit=&status=&search=` | **Unused** |
| `getSuspiciousTransactionsPaginated(page, limit, status, search, dateFrom, dateTo)` | `GET /admin/suspicious-transactions?...` | **Unused** |
| `getOpenComplaintsPaginated(page, limit, search)` | `GET /admin/open-complaints?page=&limit=&search=` | **Unused** |
| `getArchivedTransactions(page, limit, days)` | `GET /admin/archive/transactions` | Funds ❌ (imported, never called) |
| `getArchivedScheduled(page, limit, days)` | `GET /admin/archive/scheduled` | ScheduledTxns ✅ |
| `getArchivedComplaints(page, limit)` | `GET /admin/archive/complaints` | **Unused** |
| `getArchivedFraudCases(page, limit)` | `GET /admin/archive/fraud-cases` | **Unused** |
| `cleanupTestData()` | `POST /admin/cleanup-test-data` | **Unused** |
| `getAdminStatsSummary()` | `GET /admin/stats-summary` | **Unused** (actually used in Dashboard via dashboard.api.js) |

---

## 12. BACKEND ENDPOINTS NOT EXPOSED IN FRONTEND

These backend endpoints exist but have NO frontend UI:

| Endpoint | Purpose |
|---|---|
| `GET /admin/audit-logs` | Audit log with entity/admin/date filters |
| `GET /admin/:id/audit-log` | Specific complaint's audit trail |
| `GET /admin/:id/transaction-history` | Transaction history for complaint's reported user |
| `POST /admin/:id/escalate` | Escalate complaint to CRITICAL |
| `POST /admin/:id/police-report` | File police report number on complaint |
| `GET /admin/:id/review` | Accept complaint for review |
| `POST /users/admin/migrate-ifsc` | Bulk IFSC migration |
| `POST /txns/admin/approve/:id` | Admin approve scheduled txn (duplicate of `/admin/scheduled-transactions/:txnId/process`) |
| `GET /fraud/txn-alerts` | Fraud transaction alerts |
| `GET /fraud/alerts/:id` | Single fraud alert detail |
| `PUT /fraud/alerts/:id/review` | Review fraud alert |
| `PUT /fraud/alerts/:id/unfreeze` | Unfreeze from fraud alert |
| `PUT /fraud/alerts/:id/mark-safe` | Mark alert false positive |
| `PUT /fraud/alerts/:id/suspend` | Suspend user from alert |
| `PUT /fraud/alerts/:id/block` | Block user from alert |
| `POST /fraud/add-account` | Add account to fraud list |
| `PUT /fraud/deactivate/:id` | Deactivate fraud record |
| `DELETE /fraud/delete/:id` | Delete fraud record |
| `GET /fraud/complaints` | Fraud complaints list |
| `GET /blockchain/status` | Hyperledger Fabric network status |
| `GET /blockchain/transactions` | All blockchain-stored transactions |
| `GET /blockchain/transaction/:txnId` | Query specific ledger transaction |
| `GET /blockchain/verify/:txnId` | Verify transaction hash integrity |

---

## 13. BLOCKCHAIN-RELATED FUNCTIONALITY

**None.** The frontend has zero blockchain-related pages, components, or API integrations. The backend has 4 blockchain endpoints (`/api/blockchain/*`) but they are not consumed anywhere in the admin panel.

---

## 14. FRAUD-RELATED FUNCTIONALITY

Fully covered in the Fraud Management page (Page 4 above). Key points:
- 7-section interactive dashboard with real-time counts
- Fraud alerts table with Freeze/Escalate actions
- Blacklisted accounts table with Unfreeze action
- 7 detail tables for each section with action buttons
- All fraud APIs are connected and working
- No pagination on any detail section (calls non-paginated endpoints)
- Paginated fraud API functions exist but are unused

---

## 15. SUMMARY OF BROKEN/MISSING ITEMS

| Severity | Item | Page | Details |
|----------|------|------|---------|
| 🔴 **CRITICAL** | Live Chat API endpoints wrong | LiveChat | Calls `/admin/chats*` but backend serves at `/live-chat/admin/*` |
| 🟡 **MAJOR** | Archive toggle broken | Funds | `getArchivedTransactions` never called; archive view shows stale data |
| 🟡 **MAJOR** | No pagination on fraud sections | Fraud | 7 detail tables load all data at once (no page/limit params) |
| 🟡 **MAJOR** | Paginated fraud APIs unused | Fraud | 4 paginated functions exist but never called |
| 🟡 **MAJOR** | Blockchain UI missing | (none) | 4 blockchain endpoints with no frontend |
| 🟡 **MAJOR** | ~24 backend endpoints not exposed | (none) | Audit logs, police reports, escalate, fraud alert actions, etc. |
| 🟢 **MINOR** | Unused imports | Dashboard, Funds, Users, ScheduledTxns | 9 unused lucide-react imports |
| 🟢 **MINOR** | Stats per-page only | ScheduledTxns | Counts reflect only current page |
| 🟢 **MINOR** | Settings localStorage-only | Settings | No backend API for profile |
| 🟢 **MINOR** | Topbar search decorative | Layout | Search input does nothing |
| 🟢 **MINOR** | ESLint warnings | Multiple | Missing dependencies, unused vars, no default case |
| 🟢 **MINOR** | `processScheduled()` unused | — | API function in transaction.api.js is never called |
| 🟢 **MINOR** | `reportFraudAccount()` unused | — | API function in fraud.api.js is never called |
| 🟢 **MINOR** | Archived complaints/fraud-cases APIs unused | — | Functions exist but no frontend uses them |

---

## 16. FILE INVENTORY

```
src/
├── api/
│   ├── axios.js              (25 lines)  — Axios config + auth interceptor
│   ├── dashboard.api.js      (22 lines)  — 7 API functions
│   ├── fraud.api.js          (57 lines)  — 35 API functions
│   ├── transaction.api.js    (24 lines)  — 4 API functions
│   └── user.api.js           (27 lines)  — 7 API functions
├── components/
│   ├── DonutChart.js         (37 lines)  — Credit/debit pie chart
│   ├── LineChart.js          (37 lines)  — 7-day line chart
│   └── StatCard.js           (55 lines)  — Reusable stat card
├── layout/
│   ├── Layout.js             (14 lines)  — Sidebar + Topbar wrapper
│   ├── Sidebar.js            (57 lines)  — 8-item navigation
│   └── Topbar.js             (30 lines)  — Search, dark mode, bell, avatar
├── pages/
│   ├── Dashboard.js          (98 lines)  — 10 metrics + 2 charts
│   ├── Fraud.js              (585 lines) — 7-section fraud + 7 sub-tables
│   ├── Funds.js              (211 lines) — Transaction list with filters
│   ├── LiveChat.js           (184 lines) — Chat UI (BROKEN)
│   ├── Reports.js            (474 lines) — Complaint management
│   ├── ScheduledTxns.js      (208 lines) — Scheduled txn management
│   ├── Settings.js           (92 lines)  — Profile form (localStorage)
│   └── Users.js              (201 lines) — User management
├── App.js                    (29 lines)  — Router (8 routes)
├── App.css
├── App.test.js
├── index.css
├── index.js
├── logo.svg
├── reportWebVitals.js
└── setupTests.js
```
