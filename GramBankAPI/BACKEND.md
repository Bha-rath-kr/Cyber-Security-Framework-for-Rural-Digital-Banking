# GramBank Backend Documentation

> **Generated:** May 23, 2026  
> **Project:** `C:\GramBankProject\GramBankAPI`  
> **Stack:** Node.js / Express 5 / MongoDB / Mongoose / JWT / Hyperledger Fabric / brain.js

---

## 1. BACKEND OVERVIEW

### Purpose
GramBank is a digital banking simulation backend that provides:
- User registration and authentication (MPIN + JWT)
- UPI and bank transfer transactions with fraud detection
- Scheduled/delayed transaction processing
- Complaint and fraud reporting system
- Admin dashboard for user/transaction/complaint management
- Blockchain-backed audit trail (Hyperledger Fabric)
- ML-based anomaly detection (autoencoder neural network)
- Live chat support
- UPI Collect Request workflow
- SMS notifications via Twilio

### Architecture Summary
```
Mobile/Web Client → HTTP → Express.js (port 5000) → MongoDB (GramBank)
                                              → Hyperledger Fabric (blockchain)
                                              → Twilio SMS API
                                              → ImgBB (QR upload)
```

### Request Flow
1. Client sends HTTP request to `http://<host>:5000/api/<route>`
2. CORS middleware allows cross-origin requests
3. `express.json()` parses request body
4. Auth middleware (`middleware/auth.js`) verifies JWT for protected routes
5. Route handler calls service layer or directly queries Mongoose models
6. Fraud engine evaluates risk before transactions
7. MongoDB stores persistent data
8. Fabric client optionally stores transaction hash on Hyperledger ledger
9. Twilio sends SMS notifications
10. JSON response returned to client

### Major Modules

| Module | Location | Purpose |
|--------|----------|---------|
| Routes | `routes/` | 11 route files handling all API endpoints |
| Models | `models/` | 12 Mongoose schemas |
| Services | `services/` | `fraudEngine.js`, `complaintService.js` |
| ML | `ml/` | `anomalyModel.js` — brain.js autoencoder |
| Fabric | `fabric/` | Hyperledger Fabric client, chaincode, crypto-config |
| Middleware | `middleware/` | JWT authentication |
| Utils | `utils/` | `fraudCheck.js`, `performanceMonitor.js` |
| Config | `config/` | MongoDB connection |
| Data | `data/` | ML training dataset, saved model weights |

### Backend Interactions

- **Mobile/Web Client**: Consumes all REST APIs, sends JWT in `Authorization: Bearer <token>` header
- **Admin Dashboard**: Uses admin-specific endpoints under `/api/admin/` and `/api/users/admin/`
- **Blockchain**: Transaction records stored on Hyperledger Fabric via `fabricClient.js`
- **ML Model**: Loaded at startup, used in transaction fraud scoring and complaint fraud indicators

---

## 2. COMPLETE FOLDER STRUCTURE

```
C:\GramBankProject\GramBankAPI\
├── .env                          # Environment variables (not committed)
├── .env.example                  # Template for .env
├── .gitignore
├── package.json                  # Dependencies & scripts
├── server.js                     # ENTRY POINT
│
├── config/
│   └── db.js                     # MongoDB connection helper
│
├── middleware/
│   └── auth.js                   # JWT authentication middleware
│
├── models/                       # 12 Mongoose schemas
│   ├── User.js                   # User accounts with KYC, UPI, status flags
│   ├── Transaction.js            # Financial transactions
│   ├── ScheduledTransaction.js   # Delayed/held transactions
│   ├── FraudAccount.js           # Blacklisted fraud accounts
│   ├── FraudAlert.js             # Fraud detection alerts
│   ├── TransactionReport.js      # User complaints/reports
│   ├── AuditLog.js               # Audit trail for entity changes
│   ├── AdminAction.js            # Admin actions on complaints
│   ├── ChatMessage.js            # Live chat messages
│   ├── Otp.js                    # One-time passwords
│   ├── TrustedReceiver.js        # Trusted beneficiaries (TTL)
│   └── UPICollectRequest.js      # UPI collect request workflow
│
├── routes/                       # 11 route files
│   ├── userRoutes.js             # Auth (signup, login, forgot MPIN), user search, admin user mgmt
│   ├── txnRoutes.js              # Transactions (send, UPI send, scheduled, history, reports)
│   ├── otpRoutes.js              # OTP send/verify for signup
│   ├── dashboard.routes.js       # Dashboard stats, 7-day chart, credit/debit donut
│   ├── adminRoutes.js            # Admin: complaints, scheduled txns, fraud mgmt, archive
│   ├── fraudRoutes.js            # Fraud accounts, alerts, freeze/unfreeze, stats
│   ├── reportRoutes.js           # Complaint create, track, my-reports
│   ├── blockchainRoutes.js       # Fabric status, transactions, verify
│   ├── chatbotRoutes.js          # FAQ chatbot (static)
│   ├── liveChatRoutes.js         # Live chat (user + admin)
│   └── upiCollectRoutes.js       # UPI Collect Request CRUD
│
├── services/
│   ├── fraudEngine.js            # Core fraud risk evaluation engine
│   └── complaintService.js       # Complaint submission, admin actions, notifications
│
├── ml/
│   └── anomalyModel.js           # brain.js autoencoder for anomaly detection
│
├── utils/
│   ├── fraudCheck.js             # Quick fraud blacklist lookup
│   └── performanceMonitor.js     # Temp console logging for project metrics
│
├── fabric/                       # Hyperledger Fabric integration
│   ├── fabricClient.js           # SDK: connect, store, query, verify on ledger
│   ├── hashUtils.js              # SHA-256 hash generation/verification
│   ├── setup-fabric.ps1          # Windows Fabric setup script
│   ├── setup-fabric.sh           # Linux Fabric setup script
│   ├── crypto-config.yaml        # Certificate authority config
│   ├── chaincode/
│   │   ├── index.js              # Chaincode entry point
│   │   ├── package.json
│   │   └── lib/
│   │       └── auditLedger.js    # Chaincode: createTransaction, query, getAll
│   ├── config/
│   │   ├── connection-profile.json  # Fabric network connection profile
│   │   └── core.yaml
│   ├── configtx/
│   │   ├── channel.tx
│   │   ├── genesis.block
│   │   └── GramBankMSPanchors.tx
│   ├── docker/
│   │   ├── configtx.yaml
│   │   └── docker-compose.yaml     # Fabric network Docker setup
│   ├── crypto-config/              # Generated certificates
│   │   ├── ordererOrganizations/   # Orderer TLS + MSP certs
│   │   └── peerOrganizations/      # Peer TLS + MSP certs
│   └── wallet/
│       └── admin.id               # Fabric admin wallet identity
│
├── data/
│   ├── anomaly-model.json          # Trained brain.js model weights
│   └── ml_fraud_dataset_50.json    # Training dataset (50 samples)
│
├── seed-fraud.js                   # Seed 35 fraud accounts into DB
├── fraudList.js                    # Static list of 31 known fraud accounts
├── check-users.js                  # Utility to check users in DB
├── fix-status.js                   # Fix invalid user statuses
├── test-report-real-txn.js         # Test script for real transaction reporting
└── server.log                      # Server log file
```

---

## 3. SERVER ENTRY POINT (`server.js`)

### Middleware & Express Setup
- **dotenv**: Loads `.env` variables
- **cors**: Universal CORS with `origin: "*"` + manual header middleware for Express 5 compatibility
- **express.json()**: Body parsing
- **Manual CORS headers**: `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods` — with OPTIONS preflight handling

### MongoDB Connection
```js
mongoose.connect(process.env.MONGO_URI)
```
Connected at startup. No retry logic in `server.js` — `config/db.js` has retry + exit on failure (but is not imported in `server.js`).

### ML Model Startup
```js
const { trainFromDataset, loadModelIfExists } = require("./ml/anomalyModel");
(async () => {
  const loaded = await loadModelIfExists();
  if (!loaded) {
    await trainFromDataset();
  }
})();
```
- Tries to load saved model from `data/anomaly-model.json`
- If no saved model found, trains from `data/ml_fraud_dataset_50.json`
- Non-blocking async

### Hyperledger Fabric Startup
```js
const fabricClient = require("./fabric/fabricClient");
(async () => {
  try {
    await fabricClient.connectToFabric();
  } catch (err) {
    console.warn("[FABRIC] Initial connection failed:", err.message);
  }
})();
```
- Non-blocking with graceful fallback
- Only connects if `FABRIC_ENABLED=true`

### Route Registration (12 route groups)

| Prefix | File | Purpose |
|--------|------|---------|
| `/api/users` | `routes/userRoutes.js` | Auth, user search, admin user mgmt |
| `/api/txns` | `routes/txnRoutes.js` | Transactions, scheduled, reports |
| `/api/otp` | `routes/otpRoutes.js` | OTP send/verify |
| `/api/dashboard` | `routes/dashboard.routes.js` | Stats, charts |
| `/api/fraud` | `routes/fraudRoutes.js` | Fraud accounts, alerts |
| `/api/reports` | `routes/reportRoutes.js` | Complaint create/track |
| `/api/chatbot` | `routes/chatbotRoutes.js` | FAQ chatbot |
| `/api/live-chat` | `routes/liveChatRoutes.js` | Live chat |
| `/api/admin` | `routes/adminRoutes.js` | Admin dashboard |
| `/api/upi-collect` | `routes/upiCollectRoutes.js` | UPI collect requests |
| `/api/blockchain` | `routes/blockchainRoutes.js` | Fabric queries |

### Cron Job
- **`* * * * *`** (every minute) — processes scheduled transactions
- Checks `MongoDB.readyState` before proceeding
- Finds `ScheduledTransaction` with `status IN ["PENDING", "HOLD_FOR_REVIEW"]`, `auto_process_at <= now`, `processing_locked: false`, `is_reported: false`
- Debits sender, credits receiver, creates `Transaction` records
- Stores on Hyperledger Fabric (non-blocking)

### Server Listen
```
HOST = 0.0.0.0 (all interfaces)
PORT = 5000
```

### Request Lifecycle
```
HTTP Request → CORS check → express.json() → auth middleware (if needed) → route handler
  → fraud engine evaluation (for transactions)
  → MongoDB query/update
  → Fabric storage (optional, async)
  → Twilio SMS (optional)
  → JSON Response
```

---

## 4. COMPLETE ROUTE INVENTORY

### 4.1 `userRoutes.js` — `/api/users`

| Method | Endpoint | Auth | Purpose | Body/Params | Response |
|--------|----------|------|---------|-------------|----------|
| POST | `/signup` | No | Register user | `{name, aadhaarNumber, panNumber, mpin, phone}` | `{message, userId, accountNumber, upiId, upiQR}` |
| POST | `/login` | No | Login with Aadhaar + MPIN | `{aadhaarNumber, mpin}` | `{message, token, user}` |
| POST | `/search` | No | Search user by phone | `{phone}` | `{success, ...user, receiverStatus, fraudWarning?}` |
| GET | `/all-contacts` | No | All users as contacts | — | Array of `{name, phone, upiId, accountNumber, status}` |
| POST | `/forgot-mpin/request` | No | Send OTP for MPIN reset | `{aadhaarNumber, phoneNumber}` | `{message}` |
| POST | `/forgot-mpin/reset` | No | Reset MPIN with OTP | `{aadhaarNumber, phoneNumber, otp, newMpin}` | `{message}` |
| GET | `/admin/all-users` | No | List all users (paginated) | Query: `page, limit, search, status, flagged` | `{totalUsers, currentPage, totalPages, users}` |
| POST | `/admin/add-balance/:userId` | No | Admin adds balance to user | `{amount, reason}` | `{message, balance_before, balance_after}` |
| POST | `/admin/migrate-ifsc` | No | Set default IFSC on all users | — | `{message}` |
| POST | `/admin/freeze/:userId` | No | Freeze user account | — | `{message, user}` |
| POST | `/admin/unfreeze/:userId` | No | Unfreeze user account | — | `{message, user}` |

### 4.2 `txnRoutes.js` — `/api/txns`

| Method | Endpoint | Auth | Purpose | Body/Params | Response |
|--------|----------|------|---------|-------------|----------|
| POST | `/send-otp` | Yes | Send transaction OTP via SMS | `{phone?}` | `{message, otp}` |
| POST | `/send` | Yes | Bank transfer with fraud checks | `{to_account, ifsc, beneficiary_name, amount, otp, phone}` | `{message, txn_id, decision, ...}` |
| POST | `/upi/send` | Yes | UPI transfer with fraud checks | `{upiId, amount, otp, phone}` | `{message, txn_id, decision, ...}` |
| POST | `/report/:id` | Yes | Report a scheduled transaction | `{report_type, description}` | `{message, report, transaction_status}` |
| POST | `/admin/approve/:id` | Yes | Admin approves delayed txn | — | `{message, transaction}` |
| GET | `/history` | Yes | Transaction history (combined) | — | Array of transactions + scheduled |
| GET | `/alerts` | Yes | Fraud alerts for user | — | Array of flagged transactions |
| POST | `/seed-fraud` | Yes | Seed 10 test fraud transactions | — | `{message, currentBalance}` |
| GET | `/balance` | Yes | Current balance + recent 5 txns | — | `{name, aadhaarNumber, balance, upiId, upiQR, recent}` |
| POST | `/report` | Yes | Report fraudulent account | `{accountNumber, phoneNumber, upiId, name, reason, fraudType, riskLevel}` | `{message, fraud}` |
| GET | `/scheduled` | Yes | User's scheduled transactions | — | `{count, transactions}` |
| DELETE | `/scheduled/:txnId` | Yes | Cancel pending scheduled txn | — | `{message, txn_id, refund}` |
| POST | `/process-scheduled` | No | Background job: process due scheduled txns | — | `{message, processed, failed, total}` |
| GET | `/admin/all` | No | Admin: all transactions (paginated) | Query: `page, limit, search, type, status, dateFrom, dateTo` | `{totalTransactions, currentPage, totalPages, transactions}` |
| GET | `/admin/user/:userId` | No | Admin: user's transactions | — | `{userId, totalTransactions, ...}` |

### 4.3 `otpRoutes.js` — `/api/otp`

| Method | Endpoint | Auth | Purpose | Body | Response |
|--------|----------|------|---------|------|----------|
| POST | `/send` | No | Send signup OTP | `{phone}` | `{success, otp}` |
| POST | `/verify` | No | Verify OTP | `{phone, code}` | `{success, message}` |

### 4.4 `dashboard.routes.js` — `/api/dashboard`

| Method | Endpoint | Auth | Purpose | Response |
|--------|----------|------|---------|----------|
| GET | `/stats` | No | Total users, balance, today txns, fraud alerts | `{totalUsers, totalBalance, todayTransactions, fraudAlerts}` |
| GET | `/transactions-7days` | No | Daily transaction volume (last 7 days) | Array of `{day, total}` |
| GET | `/credit-debit` | No | Credit vs Debit counts | `{Credit: N, Debit: N}` |

### 4.5 `adminRoutes.js` — `/api/admin`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/stats` | Complaint statistics (total, pending, resolved, etc.) |
| GET | `/scheduled-transactions` | All scheduled txns (paginated, status filter) |
| POST | `/scheduled-transactions/:txnId/process` | Admin approve/reject scheduled txn |
| GET | `/list` | List complaints (filters: status, severity, category, search) |
| GET | `/audit-logs` | Audit logs (filters: entityType, entityId, adminId, action, date range) |
| GET | `/fraud-accounts` | Fraud accounts (paginated, searchable) |
| GET | `/flagged-users` | Users flagged for fraud |
| GET | `/suspicious-transactions` | Suspicious/fraud transactions |
| GET | `/open-complaints` | Open complaints (PENDING, UNDER_REVIEW, etc.) |
| POST | `/flagged-users/:id/freeze` | Freeze a flagged user |
| POST | `/flagged-users/:id/unfreeze` | Unfreeze a user |
| POST | `/flagged-users/:id/mark-safe` | Mark user as safe (clear fraud flag) |
| POST | `/suspicious-transactions/:id/approve` | Approve suspicious txn as safe |
| POST | `/suspicious-transactions/:id/cancel` | Cancel suspicious txn |
| POST | `/suspicious-transactions/:id/investigate` | Flag txn for investigation |
| POST | `/open-complaints/:id/resolve` | Resolve a complaint |
| POST | `/open-complaints/:id/cancel-transaction` | Cancel transaction per complaint |
| POST | `/open-complaints/:id/mark-false` | Mark complaint as false |
| GET | `/flagged-users/:id/transactions` | Transaction history of flagged user |
| GET | `/under-investigation` | Users under review or frozen |
| GET | `/temp-frozen` | Temp-frozen users |
| GET | `/hold-for-review` | Scheduled txns held for review |
| GET | `/suspicious-transactions/stats` | Summary counts (fraud, suspicious, high-risk) |
| GET | `/archive/transactions` | Archived (old) transactions |
| GET | `/archive/scheduled` | Archived scheduled transactions |
| GET | `/archive/complaints` | Resolved/rejected complaints |
| GET | `/archive/fraud-cases` | Resolved/cleared fraud alerts |
| POST | `/cleanup-test-data` | Remove test/demo records |
| GET | `/stats-summary` | Comprehensive dashboard summary |
| GET | `/:id` | Complaint details by ID |
| PUT | `/:id/review` | Move complaint to under review |
| PUT | `/:id/action` | Execute action (accept, reject, mark_fraud, suspend, block, investigate) |
| GET | `/:id/transaction-history` | Reported user's transaction history |
| GET | `/:id/audit-log` | Complaint audit log |
| POST | `/:id/escalate` | Escalate complaint to investigation |
| POST | `/:id/police-report` | Record police report |

### 4.6 `fraudRoutes.js` — `/api/fraud`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/stats` | Fraud statistics (suspicious txns, flagged users, high-risk, by type, by risk) |
| GET | `/txn-alerts` | All fraud-flagged transactions |
| GET | `/alerts` | FraudAlerts with pagination |
| GET | `/alerts/:id` | Single alert detail |
| PUT | `/alerts/:id/review` | Move alert to UNDER_REVIEW |
| PUT | `/alerts/:id/unfreeze` | Unfreeze user + resolve alert |
| PUT | `/alerts/:id/mark-safe` | Mark as false positive |
| PUT | `/alerts/:id/suspend` | Suspend user |
| PUT | `/alerts/:id/block` | Permanently block user |
| GET | `/accounts` | Fraud accounts (filters: isActive, fraudType, riskLevel) |
| POST | `/add-account` | Add account to fraud list |
| PUT | `/deactivate/:id` | Deactivate fraud record |
| DELETE | `/delete/:id` | Permanently delete fraud record |
| POST | `/freeze-user` | Freeze user (with audit log) |
| POST | `/unfreeze-user` | Unfreeze + remove from blacklist |
| POST | `/escalate` | Escalate transaction as fraud |
| GET | `/complaints` | Transaction reports (paginated) |

### 4.7 `reportRoutes.js` — `/api/reports`

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/create` | Yes | Create complaint report |
| GET | `/my-reports` | Yes | User's reports |
| GET | `/track/:complaintId` | No | Track complaint by ID |
| GET | `/:reportId` | Yes | Single report detail |

### 4.8 `blockchainRoutes.js` — `/api/blockchain`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/status` | Fabric network status |
| GET | `/transactions` | All blockchain transactions |
| GET | `/transaction/:txnId` | Query single transaction by ID |
| GET | `/verify/:txnId` | Verify transaction hash integrity |

### 4.9 `chatbotRoutes.js` — `/api/chatbot`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/faqs` | All FAQs (optional `?category=` filter) |
| GET | `/search` | Search FAQs (`?q=`) |
| POST | `/chat` | Keyword-based FAQ response |
| GET | `/categories` | FAQ categories |

### 4.10 `liveChatRoutes.js` — `/api/live-chat`

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/message` | Yes | Send chat message |
| GET | `/messages` | Yes | Get messages (pagination, `?before=` timestamp) |
| GET | `/unread-count` | Yes | Unread admin message count |
| PUT | `/mark-read` | Yes | Mark admin messages as read |
| POST | `/admin/message` | No | Admin sends message |
| GET | `/admin/all-chats` | No | Admin: chat list with last message |
| GET | `/admin/user/:userId/messages` | No | Admin: user's messages |
| POST | `/admin/user/:userId/message` | No | Admin: reply to user |

### 4.11 `upiCollectRoutes.js` — `/api/upi-collect`

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/create` | Yes | Create UPI collect request |
| GET | `/incoming` | Yes | Incoming requests |
| GET | `/sent` | Yes | Sent requests |
| POST | `/acknowledge-warning` | Yes | Acknowledge warning on suspicious request |
| POST | `/send-otp` | Yes | Send OTP for collect response |
| POST | `/respond` | Yes | Approve/reject collect request |

---

## 5. AUTHENTICATION SYSTEM

### Signup (`POST /api/users/signup`)
- Validates Aadhaar (12 digits), PAN (format `ABCDE1234F`)
- Checks for duplicate Aadhaar
- Hashes MPIN with bcrypt (salt rounds: 10)
- Generates unique account number (`2130` + 10 random digits)
- Creates UPI ID as `<accountNumber>@grambank`
- Generates QR code via `qrcode` npm package, uploads to ImgBB
- Returns user ID, account number, UPI ID, QR URL

### Login (`POST /api/users/login`)
- Validates Aadhaar + MPIN
- Checks if user is `FROZEN` (403 if yes)
- Compares MPIN hash with bcrypt
- Fixes invalid status to `ACTIVE` if needed
- Generates JWT with `{id, aadhaarNumber}`, expires in 7 days
- Returns token + user data

### JWT Token
- Algorithm: HS256 (default)
- Payload: `{id: mongoose.Types.ObjectId, aadhaarNumber: string}`
- Secret: `process.env.JWT_SECRET`
- Expiry: 7 days

### Auth Middleware (`middleware/auth.js`)
```js
Header: Authorization: Bearer <token>
```
- Extracts token from `Authorization` header
- Verifies with `jwt.verify(token, JWT_SECRET)`
- Fetches user from DB by `payload.id`
- Attaches `req.user` (full Mongoose document)
- Returns 401 on failure

### MPIN
- 4-digit numeric PIN
- Stored as bcrypt hash (`mpinHash` field)
- Validated via `bcrypt.compare()`
- Reset via OTP flow: `/forgot-mpin/request` → `/forgot-mpin/reset`

### OTP
- 4-digit or 6-digit numeric code
- Stored in `Otp` collection with 5-minute expiry
- Sent via Twilio SMS (graceful fallback if Twilio not configured)

### Session Handling
- **No session** — fully stateless JWT-based auth
- Each request must include `Authorization: Bearer <token>`

### Role Access
- **No dedicated admin role** — admin auth is handled ad-hoc in route handlers
- Admin routes under `/api/users/admin/`, `/api/admin/`, `/api/txns/admin/` are unauthenticated or use simple checks
- No `isAdmin` middleware exists

---

## 6. DATABASE MODELS

### 6.1 `User.js`
```js
{
  name: String (required),
  aadhaarNumber: String (required, unique, /^\d{12}$/),
  panNumber: String (required, /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/),
  mpinHash: String (required, bcrypt),
  balance: Number (default: 15000),
  transactionsCount: Number (default: 0),
  createdAt: Date (default: now),
  accountNumber: String (required, unique),
  status: String (enum: ACTIVE|TEMP_FROZEN|UNDER_REVIEW|FROZEN|SUSPENDED|BLOCKED|CLEARED, default: ACTIVE),
  phoneNumber: String (required, unique, /^[6-9]\d{9}$/),
  upiId: String (required, unique, format: <account>@grambank),
  upiQR: String (required, URL to ImgBB),
  ifsc: String (default: "GBRK0002130"),
  accountStatus: {
    isFrozen: Boolean,
    frozenAt: Date, frozenBy: String, frozenReason: String,
    isSuspended: Boolean, suspendedAt: Date, suspendedUntil: Date,
    suspendedBy: String, suspensionReason: String,
    isBlocked: Boolean, blockedAt: Date, blockedBy: String, blockingReason: String
  },
  riskFlags: {
    isFlaggedForFraud: Boolean (default: false),
    flaggedAt: Date, complaintCount: Number (default: 0), warningCount: Number (default: 0)
  }
}
```

### 6.2 `Transaction.js`
```js
{
  txn_id: String (required, unique),
  user_id: ObjectId (ref: User, required),
  to_account: String, to_upi: String,
  from_account: String, from_upi: String,
  ifsc: String, beneficiary_name: String,
  amount: Number (required),
  balance_before: Number (required),
  balance_after: Number (required),
  type: String (enum: DEBIT|CREDIT, required),
  hour: Number, day: Number,
  txns_last_24h: Number, avg_amount_7d: Number,
  location_delta_km: Number, is_foreign_device: Number (default: 0),
  is_fraud: Boolean (default: false),
  fraud_reason: String,
  is_suspicious: Boolean (default: false),
  suspicious_flags: [String],
  risk_score: Number (default: 0),
  time_since_last_txn_seconds: Number,
  rapid_sequence_detected: Boolean (default: false),
  createdAt: Date (default: now)
}
```

### 6.3 `ScheduledTransaction.js`
```js
{
  user_id: ObjectId (ref: User, required),
  txn_id: String (required, unique),
  to_account: String, to_upi: String,
  from_account: String, ifsc: String,
  beneficiary_name: String,
  amount: Number (required),
  balance_before: Number (required),
  balance_after: Number (required),
  type: String (enum: DEBIT|CREDIT, required),
  status: String (enum: PENDING|HOLD_FOR_REVIEW|APPROVED_BY_ADMIN|PROCESSING|COMPLETED|FAILED|CANCELLED|EXPIRED, default: PENDING),
  scheduled_at: Date (required),
  auto_process_at: Date (required),
  processed_at: Date,
  delay_reason: String,
  fraud_check_passed: Boolean (default: true),
  is_reported: Boolean (default: false),
  report_reason: String,
  processing_locked: Boolean (default: false),
  createdAt: Date (default: now)
}
// Indexes: {status, auto_process_at}, {user_id, status}
```

### 6.4 `FraudAccount.js`
```js
{
  name: String (required),
  phoneNumber: String (unique, sparse, /^[6-9]\d{9}$/),
  accountNumber: String (unique, sparse),
  upiId: String (unique, sparse),
  ifsc: String,
  reason: String (required),
  fraudType: String (enum: PHISHING|FAKE_INVESTMENT|IDENTITY_THEFT|CREDIT_CARD_FRAUD|UPI_SCAM|ACCOUNT_TAKEOVER|SOCIAL_ENGINEERING|MONEY_MULE|OTHER, required),
  riskLevel: String (enum: LOW|MEDIUM|HIGH|CRITICAL, required),
  reportedBy: String,
  isActive: Boolean (default: true),
  createdAt: Date, updatedAt: Date
}
```

### 6.5 `FraudAlert.js`
```js
{
  userId: ObjectId (ref: User, required),
  receiverId: ObjectId (ref: User),
  transactionId: ObjectId (ref: Transaction),
  scheduledTxnId: ObjectId (ref: ScheduledTransaction),
  upiCollectRequestId: ObjectId (ref: UPICollectRequest),
  riskScore: Number (required, 0-200),
  anomalyScore: Number (0-1),
  riskReasons: [String],
  fraudType: String (enum: ..., default: OTHER),
  decision: String (enum: SAFE|WARNING|HOLD_FOR_REVIEW|TEMP_FREEZE, required),
  status: String (enum: OPEN|UNDER_REVIEW|CLEARED|CONFIRMED_FRAUD|RESOLVED, default: OPEN),
  adminNotes: String,
  reviewedBy: String, reviewedAt: Date, resolvedAt: Date
}
```

### 6.6 `TransactionReport.js` (134 lines — most complex model)
```js
{
  complaintId: String (required, unique, format: CMP-YYYYMMDD-XXXXX),
  reporter: { user_id, name, accountNumber, phoneNumber },
  reported: { accountNumber, upiId, name, user_id },
  relatedTransaction: { txn_id, amount, type, timestamp },
  complaint: { category (enum: 11 types), description, incidentDate, reportedAt },
  evidence: [{ url, description, uploadedAt }],
  severity: String (enum: LOW|MEDIUM|HIGH|CRITICAL),
  status: String (enum: PENDING|UNDER_REVIEW|ACCEPTED|REJECTED|MARKED_FRAUD|SUSPENDED|BLOCKED|UNDER_INVESTIGATION|ACTION_TAKEN|RESOLVED, default: PENDING),
  admin: { admin_id, name, actionTakenAt, actionType, notes, rejectionReason },
  investigation: { findings, policeReportFiled, policeReportNumber },
  timeline: [{ status, note, performedBy, performedAt }],
  fraudIndicators: { deviceMismatch, locationAnomaly, rapidTransactions, newBeneficiary, unusualAmount, score },
  resolution: { resolvedAt, resolutionSummary, refundIssued, refundAmount }
}
```

### 6.7 `AuditLog.js`
```js
{
  entityType: String (enum: COMPLAINT|USER|TRANSACTION|FRAUD_ACCOUNT),
  entityId: String,
  action: String,
  previousState: Mixed,
  newState: Mixed,
  performedBy: { type (USER|ADMIN|SYSTEM), id, name, role, ipAddress, userAgent },
  timestamp: Date,
  reason: String
}
```

### 6.8 `AdminAction.js`
```js
{
  complaintId: String (ref: TransactionReport),
  adminId: ObjectId (ref: Admin — note: Admin model does NOT exist),
  adminName: String,
  actionType: String (enum: ACCEPT|REJECT|MARK_FRAUD|SUSPEND|BLOCK|INVESTIGATE),
  reason, notes,
  impact: { userFrozen, addedToFraudList, transactionsBlocked },
  timestamp: Date
}
```

### 6.9 `ChatMessage.js`
```js
{
  sender_id: ObjectId (ref: User),
  sender_type: String (enum: USER|ADMIN),
  message: String (maxLength: 1000),
  is_read: Boolean (default: false),
  createdAt: Date
}
```

### 6.10 `Otp.js`
```js
{
  phone: String (required),
  code: String (required),
  expiresAt: Date (required),
  used: Boolean (default: false)
}
```

### 6.11 `TrustedReceiver.js`
```js
{
  user_id: ObjectId (ref: User),
  receiver_account: String,
  trusted_until: Date,
  createdAt: Date
}
// TTL index on trusted_until — auto-deletes expired entries
```

### 6.12 `UPICollectRequest.js`
```js
{
  request_id: String (required, unique),
  requester_id: ObjectId (ref: User),
  requester_name, requester_upi, requester_account,
  target_id: ObjectId (ref: User),
  target_upi, target_account,
  amount: Number,
  description: String,
  status: String (enum: PENDING|APPROVED|REJECTED|EXPIRED|FAILED),
  intent: String (enum: SEND|REQUEST),
  is_suspicious, suspicious_flags, risk_score,
  warning_acknowledged, message_validated, message_sent_at,
  expires_at, processed_at
}
```

---

## 7. TRANSACTION ENGINE

### Flow for `POST /api/txns/send`

1. **Auth check**: JWT middleware verifies token → `req.user`
2. **Account status check**: If user is `TEMP_FROZEN|FROZEN|UNDER_REVIEW|SUSPENDED|BLOCKED`, return 403 with descriptive message
3. **Input validation**: `to_account`, `ifsc`, `amount` required; amount must be numeric > 0
4. **Receiver status check**: Look up receiver by `accountNumber`. If receiver exists and is not `ACTIVE`, block transaction with receiver status info
5. **OTP verification** (for `amount >= 10000`): Validate OTP from DB, check expiry (5 min)
6. **Fraud blacklist check**: Search `FraudAccount` for `to_account`. If found, block with fraud type/reason
7. **Under investigation check**: If receiver has open investigation complaint, warn user
8. **Fraud Engine evaluation**: `fraudEngine.evaluateTransactionRisk()` returns risk score + decision
9. **Decision handling**:
   - **TEMP_FREEZE** (risk >= 90): Auto-freeze user + block transaction + create `FraudAlert`
   - **HOLD_FOR_REVIEW** (risk 60-89): Create `ScheduledTransaction` with status `HOLD_FOR_REVIEW`, 1-hour auto-process, create `FraudAlert`
   - **SAFE/WARNING**: Proceed to trusted beneficiary check
10. **Trusted beneficiary check**: If receiver is in `TrustedReceiver` (1-min window), process instantly
11. **High-value delay** (amount > 10000): Create `ScheduledTransaction` with status `PENDING`, 1-hour auto-process, no `FraudAlert`
12. **Instant processing** (amount <= 10000 OR trusted): Deduct sender, credit receiver, create debit + credit transactions, register trusted receiver (1-min validity), send SMS, store on Fabric

### Flow for `POST /api/txns/upi/send`
Same logic as bank send, but:
- Looks up receiver by `upiId` instead of account number
- Checks blacklist for both UPI ID and receiver's account number
- UPI ID as receiver identifier

### Flow for `POST /api/txns/admin/approve/:id`
1. Find `ScheduledTransaction` with `status IN [PENDING, HOLD_FOR_REVIEW]`, `processing_locked: false`, `is_reported: false`
2. Set status to `APPROVED_BY_ADMIN` + lock
3. Process transfer: deduct sender, credit receiver, create transactions
4. Set status to `COMPLETED`
5. Store on Fabric (async)

### Flow for Scheduled Transaction Processing (cron + `/process-scheduled`)
1. Find all scheduled txns where: `status IN [PENDING, HOLD_FOR_REVIEW]`, `auto_process_at <= now`, `processing_locked: false`, `is_reported: false`
2. For each: lock → check balance → deduct sender → credit receiver → create transactions → mark COMPLETED
3. If insufficient balance: mark FAILED
4. Store on Fabric (async)

### Complaint Cancellation Path
- `POST /api/txns/report/:id` with `report_type` = `UNAUTHORIZED|WRONG_RECIPIENT|FRAUD` → sets status to `FAILED`, `is_reported: true`, `processing_locked: true`
- `POST /api/reports/create` with same blocking types → cancels scheduled transaction

### Admin Override
- Admin can approve/reject via `/api/admin/scheduled-transactions/:txnId/process` or `/api/txns/admin/approve/:id`
- Admin can cancel transaction via complaint system's `cancel-transaction` action

---

## 8. FRAUD ENGINE (`services/fraudEngine.js`)

### Architecture
The engine uses a hybrid approach:
1. **Rule-based scoring** — deterministic checks with point values
2. **ML anomaly scoring** — autoencoder reconstruction error
3. **Combined risk score** — sum of rule + ML contributions, capped at 200

### Rule-Based Scoring (`evaluateTransactionRisk`)

| Rule | Condition | Points |
|------|-----------|--------|
| Blacklisted receiver | Receiver found in `FraudAccount` | +80 |
| Rapid transactions | ≥5 DEBIT transactions in 2 minutes | +30 |
| Multiple receivers | >3 unique receivers in 5 minutes | +25 |
| Repeated amount | ≥3 transactions with same amount | +20 |
| High amount >50000 | Amount > ₹50,000 | +30 |
| High amount >10000 | Amount > ₹10,000 (≤50,000) | +15 |
| New beneficiary | No prior transaction to this receiver | +20 |
| ML anomaly >0.85 | Autoencoder score > 0.85 | +20 |
| ML anomaly 0.7-0.85 | Autoencoder score 0.7-0.85 | +10 |

### Risk Thresholds → Decisions

| Risk Score | Decision | Action |
|------------|----------|--------|
| >= 90 | `TEMP_FREEZE` | Auto-freeze user, block transaction |
| 60-89 | `HOLD_FOR_REVIEW` | 1-hour delay, create FraudAlert |
| 30-59 | `WARNING` | Allow proceed, create FraudAlert |
| < 30 | `SAFE` | Allow proceed, no alert |

### `evaluateUPICollectRisk`
Same threshold system. Rules:
- `UNKNOWN_REQUESTER` +25
- `BLACKLISTED_REQUESTER` +80
- High amounts (+15/+30)
- `RAPID_REQUEST_PATTERN` (≥5 requests in 2 min) +25
- ML anomaly (+10/+20)

### `autoFreezeUser(userId, reason)`
- Sets `status: "TEMP_FROZEN"`
- Sets `accountStatus.isFrozen: true` with timestamp and reason
- Sets `riskFlags.isFlaggedForFraud: true`

### `buildDecisionResponse(fraudResult, options)`
Returns user-facing response with:
- `popupTitle`, `userMessage`, `allowProceed`, `actionRequired`, `holdTime`
- Customizable via `options` parameter
- Special case for new beneficiary cooling period (30 min)

### `getReceiverStatus(receiverIdentifier)`
Checks if receiver is blacklisted or has restricted status. Returns:
- `BLACKLISTED` — fraud list HIGH/CRITICAL or user BLOCKED/SUSPENDED
- `HIGH_RISK` — fraud list MEDIUM
- `TEMP_FROZEN` — user TEMP_FROZEN
- `UNDER_REVIEW` — user FROZEN/UNDER_REVIEW
- `SAFE` — no issues

---

## 9. ML MODEL (`ml/anomalyModel.js`)

### Architecture
- **Library**: brain.js (NeuralNetwork)
- **Type**: Autoencoder (unsupervised anomaly detection)
- **Hidden Layers**: `[8, 6]`
- **Input/Output**: 8 features (input = output for training)
- **Network shape**: `8 → 8 → 6 → 8`

### Features (8 normalized inputs)

| Feature | Raw Range | Normalization |
|---------|-----------|---------------|
| `amount` | 0+ | `/ 10000` |
| `hour` | 0-23 | `/ 24` |
| `day` | 0-6 | `/ 7` |
| `txns_24h` | 0+ | `/ 50` |
| `avg7d` | 0+ | `/ 10000` |
| `balance` | 0+ | `/ 20000` |
| `loc_delta` | 0+ km | `/ 1000` |
| `is_foreign` | 0 or 1 | unchanged |

### Training
- Reads `data/ml_fraud_dataset_50.json`
- Filters only non-fraud rows (`is_fraud === 0`) — uses them as "normal" patterns
- Trains with `iterations: 300`, `learningRate: 0.01`
- Saves weights to `data/anomaly-model.json`

### Inference (`scoreAnomaly`)
1. Normalize input features
2. `net.run(input)` → reconstructs output (should match input for normal patterns)
3. Calculate **Mean Squared Error (MSE)** between input and reconstruction:
   ```
   mse = Σ(input[k] - output[k])² / 8
   ```
4. Convert to anomaly score via hyperbolic tangent:
   ```
   score = tanh(mse × 50)
   ```
5. Returns 0.0 (normal) to 1.0 (highly anomalous)

### Simple Viva Explanation
"The ML model is an autoencoder neural network trained on normal transaction patterns. It learns to reconstruct normal transactions with low error. When a new transaction comes in, the model tries to reconstruct it. If the reconstruction error is high (meaning the transaction doesn't fit normal patterns), the anomaly score is high — indicating potential fraud. This is combined with rule-based checks for a final risk score."

---

## 10. BLOCKCHAIN BACKEND (Hyperledger Fabric)

### Architecture
- **Network**: Single organization (`GramBankMSP`), single peer (`peer0.grambank.com`), single orderer (`orderer.grambank.com`)
- **Channel**: `grambankchannel`
- **Chaincode**: `auditcc` (Node.js)
- **World State**: CouchDB (via Docker compose)
- **SDK**: `fabric-network` v2.2.20

### Components

| Component | Role |
|-----------|------|
| **Peer** | `peer0.grambank.com` — commits ledgers, runs chaincode |
| **Orderer** | `orderer.grambank.com` — orders transactions into blocks |
| **CA** | Certificate Authority for identity management |
| **CouchDB** | State database for rich queries |
| **Chaincode** | `auditLedger.js` — manages transaction records |

### Chaincode (`fabric/chaincode/lib/auditLedger.js`)
Functions:
- **`createTransaction(ctx, txnId, txnDataJson)`** — stores a transaction record on ledger (idempotent: rejects duplicates)
- **`queryTransaction(ctx, txnId)`** — retrieves single transaction
- **`getAllTransactions(ctx)`** — returns all transaction records
- **`getTransactionBySender(ctx, senderAccount)`** — filter by sender
- **`transactionExists(ctx, txnId)`** — check existence

Record format:
```json
{
  "txnId": "TXN-12345",
  "senderAccount": "2130...",
  "receiverAccount": "2130...",
  "amount": 5000,
  "timestamp": "2026-05-23T10:00:00.000Z",
  "status": "SUCCESS",
  "fraudDecision": "SAFE",
  "transactionHash": "sha256hex...",
  "docType": "transaction"
}
```

### Fabric Client (`fabric/fabricClient.js`)

**`connectToFabric()`**
- Only connects if `FABRIC_ENABLED=true` (env var)
- Loads wallet from `fabric/wallet/` or creates in-memory wallet
- Loads admin identity from `crypto-config/peerOrganizations/grambank.com/users/Admin@grambank.com/msp/`
- Connects via `Gateway` with `discovery: { enabled: false, asLocalhost: true }`
- Gets network `grambankchannel` → contract `auditcc`

**`storeTransactionOnBlockchain(transactionData)`**
- Generates SHA-256 hash from `txnId|senderAccount|receiverAccount|amount|timestamp`
- Calls `contract.submitTransaction('createTransaction', txnId, JSON.stringify(txnData))`
- Non-blocking with graceful fallback — never throws
- Returns `{stored, blockchainTxnId, blockchainHash}`

**`queryTransactionFromBlockchain(txnId)`**
- Calls `contract.evaluateTransaction('queryTransaction', txnId)`
- Throws if Fabric not connected or txn not found

**`getAllBlockchainTransactions()`**
- Calls `contract.evaluateTransaction('getAllTransactions')`

### When Transactions Get Stored on Blockchain
- Instant bank transfers (`/api/txns/send`) — after successful processing
- UPI transfers (`/api/txns/upi/send`) — after successful processing
- Scheduled transactions (cron processing) — after completion
- Admin-approved transactions — after admin approval processing

**When they do NOT get stored:**
- `FABRIC_ENABLED` is not `true`
- Fabric connection failed at startup
- Transaction was blocked by fraud engine
- Network error during storage (graceful fallback)
- Querying transactions that were never stored (return 404)

### Hash Verification (`fabric/hashUtils.js`)
- `generateTransactionHash(txnData)`: `SHA-256(txnId|senderAccount|receiverAccount|amount|timestamp)`
- `verifyTransactionHash(txnData, expectedHash)`: compares computed hash with stored hash

---

## 11. SCHEDULED TRANSACTION SYSTEM

### Why Scheduling Exists
1. **Fraud protection**: Transactions flagged by fraud engine (`HOLD_FOR_REVIEW`) are delayed 1 hour
2. **High-value protection**: All transactions > ₹10,000 to new beneficiaries are delayed 1 hour  
3. **New beneficiary cooling**: 30-minute cool-down for first-time receivers

### 1-Hour Hold Logic
When a transaction is delayed:
1. A `ScheduledTransaction` document is created with:
   - `status`: `PENDING` (high-value) or `HOLD_FOR_REVIEW` (fraud-flagged)
   - `auto_process_at`: `now + 1 hour`
   - `processing_locked`: `false`
2. Sender's balance is NOT deducted at this point
3. The cron job (every minute) picks up due transactions and processes them

### Trusted Beneficiary Bypass
- When a transaction is instant (≤ ₹10,000) or flagged `WARNING`, the receiver is registered as **trusted** for 1 minute via `TrustedReceiver`
- Subsequent transactions to the same receiver within 1 minute bypass the high-value delay
- `TrustedReceiver` has a TTL index on `trusted_until` for auto-cleanup

### Admin Approval Flow
1. Admin reviews `HOLD_FOR_REVIEW` transactions via `/api/admin/hold-for-review`
2. Admin can approve (process immediately) or reject (cancel)
3. Approval endpoint: `POST /api/admin/scheduled-transactions/:txnId/process` with `action: "approve"`
4. Rejection: sets status to `CANCELLED` with reason
5. Also available: `POST /api/txns/admin/approve/:id` — processes directly

### Cron Processing
- Every minute, `server.js` cron + `POST /api/txns/process-scheduled` both run similar logic
- Finds due transactions, locks each one, processes the transfer, marks `COMPLETED` or `FAILED`
- Stores on Fabric after completion

### Complaint Cancellation
- User reports a scheduled transaction via `POST /api/txns/report/:id`
- If `report_type` is `UNAUTHORIZED|WRONG_RECIPIENT|FRAUD`:
  - Sets `status: FAILED`, `is_reported: true`, `processing_locked: true`
- If `report_type` is something else, report is saved but transaction proceeds

### Automatic Release
- After 1 hour, cron automatically processes the transaction (deducts sender, credits receiver)
- No further admin intervention needed for `PENDING` status
- `HOLD_FOR_REVIEW` transactions are also auto-processed after 1 hour (unless cancelled by admin/user)

---

## 12. CRON JOBS

There is one cron job in `server.js`:

### Scheduled Transaction Processing
```js
cron.schedule("* * * * *", ...)  // Every minute
```
- Skips if MongoDB not connected
- Finds pending scheduled transactions: `status IN [PENDING, HOLD_FOR_REVIEW]`, `auto_process_at <= now`, `processing_locked: false`, `is_reported: false`
- For each: lock → check balance → deduct sender → credit receiver → create `Transaction` records → mark `COMPLETED` or `FAILED`
- Stores on Fabric (async, non-blocking)

**Note**: There is NO dedicated fraud monitoring cron (`fraud-cron.js` was from a previous version). The only cron job is the scheduled transaction processor.

---

## 13. ADMIN BACKEND

### Admin APIs Summary

All admin endpoints (see section 4.5 for full list) cover:

**User Management**: List users, add balance, freeze/unfreeze, flagged users, under investigation, temp frozen
**Fraud Management**: Fraud accounts (CRUD), fraud alerts (review, unfreeze, mark-safe, suspend, block), suspicious transactions (approve, cancel, investigate), flagged users
**Complaint Management**: List complaints, view detail, accept, reject, mark fraud, suspend, block, investigate, resolve, cancel transaction, mark false, escalate, add police report
**Transaction Management**: All transactions list, user-specific transactions, scheduled transactions archive
**Dashboard/Stats**: Complaint stats, stats summary, suspicious txn stats
**Archive**: Old transactions, scheduled transactions, resolved complaints, resolved fraud cases
**Audit**: Audit logs with filters
**Cleanup**: Remove test data (₹1/₹2 transactions, orphaned alerts)
**Live Chat**: Chat list, user messages, admin reply

**Note**: No `isAdmin` middleware exists. Admin routes are unauthenticated (no JWT required). Any client can call them.

---

## 14. DASHBOARD DATA SOURCES

| Endpoint | Data Sources | Computation |
|----------|-------------|-------------|
| `GET /api/dashboard/stats` | `User.countDocuments()`, `User.aggregate($sum balance)`, `Transaction.countDocuments(today)`, `FraudAccount.countDocuments()` | Simple counts + aggregation |
| `GET /api/dashboard/transactions-7days` | `Transaction.aggregate($match last 7 days, $group by date, $sum amount)` | Aggregation pipeline → day name mapping |
| `GET /api/dashboard/credit-debit` | `Transaction.aggregate($group by type, $sum count)` | Aggregation → `{Credit, Debit}` |
| `GET /api/admin/stats-summary` | 11 concurrent `countDocuments` queries | Total users, active, fraud alerts, flagged, complaints, etc. |
| `GET /api/admin/suspicious-transactions/stats` | 3 concurrent `countDocuments` | Confirmed fraud, suspicious, high-risk counts |
| `GET /api/fraud/stats` | `countDocuments`, `aggregate($group by fraudType)`, `aggregate($group by riskLevel)`, `ComplaintService.getComplaintStats()` | Multi-source fraud dashboard |

---

## 15. COMPLAINT SYSTEM

### Complaint Creation (`POST /api/reports/create`)
1. User provides `transaction_id` (from Transaction or ScheduledTransaction), `report_type`, `description`, optional `reported_account`, `amount`, `evidence`, `upi_id`
2. System resolves reported account from: body → transaction DB → UPI lookup → fallback "UNKNOWN"
3. Category mapped from report_type (UNAUTHORIZED → UNAUTHORIZED_TRANSACTION, etc.)
4. `ComplaintService.submitComplaint()`:
   - Generates `complaintId` (format: `CMP-YYYYMMDD-XXXXX`)
   - Calculates fraud indicators (rapid txns, unusual amount, fraud list, ML anomaly)
   - Calculates severity from amount + category
   - Creates `TransactionReport` with timeline, audit log
   - Sends SMS notification to reporter
   - If scheduled transaction + blocking type → cancels scheduled txn

### Complaint Statuses
`PENDING` → `UNDER_REVIEW` → `ACCEPTED` | `REJECTED` | `MARKED_FRAUD` | `SUSPENDED` | `BLOCKED` | `UNDER_INVESTIGATION` → `ACTION_TAKEN` → `RESOLVED`

### Admin Review Flow
1. Admin views complaint list via `GET /api/admin/list`
2. Admin can view detail via `GET /api/admin/:id` (includes reported user, related transactions, audit logs)
3. Admin takes action via `PUT /api/admin/:id/action` with `action` field:

| Action | Effect |
|--------|--------|
| `accept` | Status → ACCEPTED (later → ACTION_TAKEN) |
| `reject` | Status → REJECTED → RESOLVED, requires reason |
| `mark_fraud` | Status → MARKED_FRAUD → RESOLVED, freeze user permanently, add to fraud list |
| `suspend` | Status → SUSPENDED → RESOLVED, suspend for 30 days |
| `block` | Status → BLOCKED → RESOLVED, block permanently, add to fraud list |
| `investigate` | Status → UNDER_INVESTIGATION, flag related transactions as suspicious |

### Transaction Cancellation via Complaint
- `POST /api/admin/open-complaints/:id/cancel-transaction`: Sets complaint status to `ACTION_TAKEN`, marks related transaction as fraud
- Also accessible via admin action `cancel-transaction`

### Fraud Escalation
- `POST /api/admin/:id/escalate`: Sets severity to CRITICAL, status to UNDER_INVESTIGATION
- `POST /api/admin/:id/police-report`: Records police report number

### Resolution
- Automatic resolution for `mark_fraud`, `suspend`, `block`, `reject` actions
- Manual resolution via `POST /api/admin/open-complaints/:id/resolve`

---

## 16. LIVE CHAT BACKEND

### Architecture
- Simple persistent chat using `ChatMessage` model
- No Socket.IO — uses REST polling
- Users and admins both store messages in same collection
- `sender_type: "USER"` vs `"ADMIN"` distinguishes direction

### Endpoints

**User:**
- `POST /api/live-chat/message` — send message as user
- `GET /api/live-chat/messages` — get messages (paginated, before timestamp)
- `GET /api/live-chat/unread-count` — count of unread admin messages
- `PUT /api/live-chat/mark-read` — mark all admin messages as read

**Admin:**
- `POST /api/live-chat/admin/message` — send message as admin
- `GET /api/live-chat/admin/all-chats` — list all chats with last message + unread counts
- `GET /api/live-chat/admin/user/:userId/messages` — view user's full chat
- `POST /api/live-chat/admin/user/:userId/message` — reply to user

---

## 17. CONFIGURATION (`.env`)

| Variable | Purpose |
|----------|---------|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for JWT signing |
| `TWILIO_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_MSG_SID` | Twilio Messaging Service SID |
| `TWILIO_PHONE_NUMBER` | Twilio phone number for SMS |
| `IMGBB_API_KEY` | ImgBB API key for QR upload |
| `HOST` | Server bind address (default: `0.0.0.0`) |
| `PORT` | Server port (default: `5000`) |
| `BACKEND_HOST` | LAN IP address |
| `API_BASE_URL` | Full API URL for clients |
| `FABRIC_HOST` | Fabric network host |
| `FABRIC_AS_LOCALHOST` | Fabric discovery setting |
| `FABRIC_ENABLED` | Enable/disable Fabric integration |
| `NODE_ENV` | Environment (`development`) |

---

## 18. DEPENDENCIES

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^5.1.0 | Web framework |
| `mongoose` | ^8.19.3 | MongoDB ODM |
| `jsonwebtoken` | ^9.0.2 | JWT auth tokens |
| `bcrypt` | ^6.0.0 | Password/MPIN hashing |
| `cors` | ^2.8.5 | Cross-origin requests |
| `dotenv` | ^17.2.3 | Environment variables |
| `brain.js` | ^1.6.1 | Neural network (ML anomaly detection) |
| `node-cron` | ^4.2.1 | Scheduled task execution |
| `twilio` | ^5.10.5 | SMS notifications |
| `fabric-network` | ^2.2.20 | Hyperledger Fabric client SDK |
| `fabric-ca-client` | ^2.2.20 | Fabric CA client |
| `qrcode` | ^1.5.4 | QR code generation |
| `qs` | ^6.14.0 | URL param serialization |
| `uuid` | ^13.0.0 | Unique ID generation |
| `axios` | ^1.13.2 | HTTP requests (ImgBB upload) |
| `multer` | ^2.0.2 | File upload (declared, not used) |
| `nodemon` (dev) | ^3.1.10 | Auto-restart during development |

---

## 19. BUSINESS RULES

### Transaction Rules
- **High-value threshold**: ₹10,000 — transactions above this require OTP and trigger 1-hour delay for new beneficiaries
- **Per-transaction limit**: ₹2,00,000 (from chatbot FAQ)
- **Daily limit**: ₹1,00,000 (from chatbot FAQ)
- **OTP expiry**: 5 minutes
- **Trusted receiver window**: 1 minute after each successful instant transaction

### Fraud Thresholds
- **Risk score 0-200** (capped)
- **TEMP_FREEZE** >= 90: auto-freeze, block transaction
- **HOLD_FOR_REVIEW** 60-89: 1-hour delay, alert created
- **WARNING** 30-59: allow proceed, alert created
- **SAFE** < 30: no action
- **ML anomaly HIGH** > 0.85: +20 risk
- **ML anomaly MEDIUM** 0.7-0.85: +10 risk

### Freeze Rules
- **TEMP_FROZEN** status set by auto-freeze when risk >= 90
- **FROZEN** status set by admin (manual freeze)
- **UNDER_REVIEW** set when alert moved to review
- **SUSPENDED** — 30-day suspension via complaint action
- **BLOCKED** — permanent block via complaint action
- **CLEARED** — marked as false positive

### Beneficiary Trust Rules
- New beneficiary to unknown account → +20 risk score
- Trusted receiver established after 1 successful low-value txn (1-min window)
- >3 unique receivers in 5 minutes → +25 risk score

### Complaint Rules
- **Severity calculation**: amount (>=50000→+3, >=10000→+2, >=1000→+1) + high-risk category (+2)
  - >= 4 → CRITICAL, >= 3 → HIGH, >= 2 → MEDIUM, else LOW
- **Blocking report types**: `UNAUTHORIZED`, `WRONG_RECIPIENT`, `FRAUD` — immediately cancel scheduled transactions
- **Evidence**: optional array of URLs
- **Police report**: optional, recorded per complaint

### Scheduled Release Rules
- `auto_process_at` = `now + 1 hour` for fraud-delayed and high-value transactions
- Only `PENDING` and `HOLD_FOR_REVIEW` transactions are auto-processed
- `processing_locked` prevents duplicate processing
- `is_reported: true` transactions are never auto-processed

### UPI Collect Rules
- Max request amount: ₹1,00,000
- Suspicious amount threshold: ₹50,000
- Request expiry: 24 hours
- Cannot create request for yourself
- Requires OTP for amounts >= ₹10,000
- Rapid request limit: >5 pending requests in 24 hours → suspicious

---

## 20. KNOWN ISSUES

### Security Concerns
1. **No admin authentication** — Admin routes (`/api/admin/*`, `/api/users/admin/*`, `/api/txns/admin/*`) have no JWT middleware. Any client can access them.
2. **No `isAdmin` middleware** — The middleware directory only has `auth.js`. No admin role check exists.
3. **OTP returned in response** — `/api/otp/send` and `/api/txns/send-otp` return OTP in JSON body (labeled "for dev/test").
4. **JWT secret in `.env.example`** — Template shows placeholder but should never be default.
5. **CORS `origin: "*"`** — Allows any website to call the API.

### Logic Issues
6. **Duplicate cron processing** — Both `server.js` cron (every minute) and `POST /api/txns/process-scheduled` run similar logic. If both trigger, duplicate processing could occur (though `processing_locked` mitigates this).
7. **`HOLD_FOR_REVIEW` transactions processed by cron** — The cron processes both `PENDING` and `HOLD_FOR_REVIEW`, which means fraud-flagged transactions auto-release after 1 hour without admin review.
8. **Receiver status fix hack** — Multiple places have `if (receiver.status && !["ACTIVE", ...].includes(receiver.status)) { receiver.status = "ACTIVE" }` which silently overwrites invalid statuses.
9. **`FraudAccount` imported as `FraudAlert` in `dashboard.routes.js`** — Line 6 imports `FraudAccount` as `FraudAlert` alias, then counts documents on it. The endpoint is labeled "fraudAlerts" but actually counts FraudAccount entries.
10. **Twilio client initialized even without credentials** — `upiCollectRoutes.js` line 17 calls `require("twilio")(accountSid, authToken)` without checking if SID/token exist.
11. **`AdminAction.adminId` references non-existent `Admin` model** — `adminId` field refs "Admin" but no Admin model exists.

### Stale Code
12. **`performanceMonitor.js`** — Contains comment "Remove this file before production deployment" — purely for college project metrics display.
13. **`seed-fraud.js`** — Large seeding script, not referenced in package.json scripts.
14. **`fraudList.js`** — Static array of 31 fraud accounts, used alongside `FraudAccount` collection. Data duplication.

### Duplicate Routes
15. **Fraud report via `POST /api/txns/report` and `POST /api/fraud/add-account` and complaint via `POST /api/reports/create`** — Three different ways to report fraud.
16. **Scheduled transaction processing** — Both in `server.js` cron and `POST /api/txns/process-scheduled` route.

### Missing Features
17. **No seed-data.js** — `scripts/seed-data.js` referenced in previous docs doesn't exist. Only `seed-fraud.js` exists.
18. **No image serving** — `multer` dependency declared but no file upload endpoints implemented.

### Performance
19. **No pagination on some list endpoints** — e.g., `GET /api/txns/alerts`, `GET /api/txns/history`
20. **No indexes on `Transaction.createdAt`** — May cause slow queries on large datasets.

---

## 21. DEBUGGING GUIDE

### Backend Not Starting
- Check `.env` exists and `MONGO_URI` is correct
- Check MongoDB is running: `mongosh` to test connection
- Check port 5000 is free: `netstat -ano | findstr :5000`
- Check for syntax errors: `node --check server.js`
- Check Express 5 compatibility issues (CORS, route params)

### MongoDB Failure
- Verify MongoDB service is running
- Check connection string in `.env`
- If using MongoDB Atlas, whitelist your IP
- Check `mongoose.connection.readyState` (1 = connected)

### ML Issues
- Model not found: check `data/anomaly-model.json` exists
- Training fails: check `data/ml_fraud_dataset_50.json` exists and has valid JSON
- `scoreAnomaly` returns 0: `loadModelIfExists()` may have failed silently
- brain.js errors: check Node.js version compatibility

### Fraud Issues
- Transaction not blocked: check `FraudAccount` collection for blacklisted accounts
- Risk score always 0: check `findFraudByAny` function, check ML model loaded
- Auto-freeze not triggering: check `evaluateTransactionRisk` risk score >= 90
- Transaction not delayed: check `HIGH_VALUE_THRESHOLD = 10000`

### Transaction Hold Bug
- Transaction stuck in `PENDING`: check `auto_process_at` is in the past
- Transaction stuck in `PROCESSING`: cron may have crashed mid-processing
- `processing_locked: true` prevents re-processing: manually set to `false` in MongoDB
- `is_reported: true` prevents processing: check complaint status

### Fabric Issues
- Connection refused: Fabric network not running (start with Docker Compose)
- `FABRIC_ENABLED !== 'true'`: set env var to enable
- Certificate errors: crypto-config may not match connection profile
- Chaincode errors: check `auditcc` is installed and instantiated on channel

### Blockchain Issues
- `/api/blockchain/transactions` returns 503: Fabric not connected
- `/api/blockchain/transaction/:id` returns 404: txn not on ledger (may not have been stored)
- Hash verification fails: data tampered or timestamp mismatch

### Cron Issues
- Cron not running: check MongoDB connection (`readyState !== 1` → skip)
- Transactions not processed: check `processing_locked`, `is_reported`, `auto_process_at`
- Duplicate processing: check `processing_locked` is set before processing

### API Failures
- 401 Unauthorized: missing or expired JWT token
- 400 Bad Request: missing required fields (check body params)
- 500 Server Error: check `server.log` and console output
- CORS errors: check `origin` header matches allowed origins

---

## 22. SIMPLE VIVA EXPLANATION

"GramBank is a full-stack digital banking backend built with Node.js and Express. It handles user registration with MPIN authentication, money transfers via UPI and bank accounts, and has a built-in fraud detection system.

When a user sends money, the system first checks if the receiver is blacklisted, then runs the transaction through a fraud engine that combines rule-based checks (like 'is this amount too high?' or 'is the user sending to too many people too quickly?') with a machine learning model. The ML model is an autoencoder — it was trained on normal transactions and can detect unusual patterns by measuring how well it can reconstruct the transaction data.

If suspicious activity is detected, transactions can be either warned, delayed for 1 hour, or blocked entirely with the user's account frozen. The system also supports scheduled transactions, complaint filing with admin review, a live chat support system, and blockchain storage using Hyperledger Fabric for an immutable audit trail. All SMS notifications are handled through Twilio, and admins have a comprehensive dashboard for managing users, fraud cases, and complaints."
