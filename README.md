# Cybersecurity Framework for Rural Digital Banking (GramBank)

A cybersecurity-focused banking platform with a multi-layer fraud detection engine, UPI payments, mobile offline support, and Hyperledger Fabric blockchain logging — spanning a Node.js API, a React admin dashboard, and a React Native mobile app.

## Problem

UPI fraud, unauthorized access, and suspicious transactions are growing cybersecurity challenges in digital banking — particularly for rural deployments where connectivity and security infrastructure are limited. Key security challenges include the absence of automated fraud scoring, offline transaction queuing, and audit-transparent hold/freeze workflows, creating delays between threat detection and response.

## Features

- **Fraud detection engine** — multi-layer system combining blacklist matching, velocity checks, amount rules, and brain.js-based transaction behavior analysis
- **ML anomaly scoring** — neural network scoring based on transaction amount, time patterns, frequency, and device/location signals
- **Automated hold/freeze workflow** — suspicious transactions enter a review hold; high-risk triggers auto-freeze with admin escalation
- **UPI & bank payments** — UPI ID sends, QR code scanning (expo-camera), phone-contacts-based payments (expo-contacts), bank transfers
- **Offline queue** — transactions enqueued in SQLite when offline, flushed with retry-backoff when connectivity resumes
- **Scheduled payments** — users schedule future transactions; fraud-checked at creation, auto-processed by cron
- **Complaint & investigation system** — users file reports across fraud categories; admin investigates, takes action, and tracks resolution
- **Blockchain logging** — optional Hyperledger Fabric integration for immutable transaction hashing (SHA-256) via custom chaincode
- **Live chat & FAQ chatbot** — REST-polled messaging between users and support admins; regex-based FAQ answers
- **Biometric auth** — expo-local-authentication for fingerprint / face unlock on mobile
- **OTP verification** — Twilio SMS OTPs for transactions and MPIN resets
- **Admin dashboard** — fraud monitoring interface, user management, complaint investigation, blockchain explorer, scheduled transaction oversight

## Tech Stack

| Layer | Technology |
|---|---|
| API | Node.js, Express, MongoDB (Mongoose), JWT, bcrypt |
| ML | brain.js (NeuralNetwork) |
| Blockchain | Hyperledger Fabric, SHA-256 |
| SMS | Twilio |
| Admin UI | React 19, React Router v7, Tailwind CSS, Recharts |
| Mobile | React Native (Expo SDK 52), React Navigation |
| Offline | expo-sqlite, AsyncStorage, @react-native-community/netinfo |
| Biometrics | expo-local-authentication |
| Camera / Contacts | expo-camera, expo-contacts |

## Architecture

```
Mobile Banking App (React Native / Expo)
        ↓
Authentication Layer (JWT / MPIN / OTP / Biometrics)
        ↓
Backend API (Node.js / Express)
        ↓
Fraud Detection Engine
        ↓
Transaction Processing + Hold/Freeze Logic
        ↓
Blockchain Audit Layer (Hyperledger Fabric)
        ↓
MongoDB Database
        ↓
Admin Monitoring Dashboard (React)
```

### Backend modules
- **Auth** — JWT + bcrypt MPIN; login via Aadhaar number; OTP via Twilio
- **Fraud engine** — `fraudEngine.js` orchestrates 4 detection layers and maps risk score to a decision: safe → warning → hold for review → temp freeze
- **Anomaly model** — brain.js neural network for transaction risk scoring; auto-saves and reloads model state across server restarts
- **Hold workflow** — held transactions are re-checked on a cron cycle; approvable by admin or auto-processed on expiry
- **Blockchain client** — Fabric gateway wrapper; configurable enable/disable; records transaction hashes on-chain
- **Complaint service** — routes user reports through investigation states with admin action tracking
- **Scheduled transactions** — cron-driven execution with pre-flight fraud checks

### Admin dashboard pages
- Dashboard (stats + charts), Users (status management, fraud alerts), Funds (transaction monitoring), Fraud (alerts, blacklist CRUD, risk scores), Reports (complaint lifecycle management with severity ratings), Scheduled Transactions (countdown timers, approve/cancel), Live Chat, Blockchain Explorer, Settings

### Mobile app capabilities
- Registration, login (Aadhaar + MPIN), biometric unlock
- Send money (UPI ID, QR scan, bank transfer, phone contacts)
- Receive money (QR generation), balance check
- Fraud alerts, transaction history, complaint filing
- UPI collect requests (create, accept, reject)
- Scheduled payment management
- Live chat with admins, FAQ chatbot
- OTP-based MPIN reset
- Full offline queue with network-aware sync

## Security Highlights

- MPIN stored as bcrypt hash, never plaintext
- JWT access tokens on all protected routes
- OTP verification for sensitive operations (transactions, PIN resets)
- Fraud engine applies `TEMP_FREEZE` decision — automatically freezes the sending user's account (`status: TEMP_FROZEN`, `isFrozen: true`)
- Blacklist (FraudAccount collection) cross-references account numbers, UPI IDs, phone numbers, and Aadhaar
- Blockchain hashing provides tamper-evident transaction records
- Authorization middleware separates user and admin routes

## Setup & Environment Configuration

All sensitive credentials are managed through `.env.example` template files. **Never commit `.env` files** — they are ignored by `.gitignore`.

### Backend Configuration (`GramBankAPI/.env.example`)

Copy `GramBankAPI/.env.example` → `GramBankAPI/.env` and fill in:

```bash
# MongoDB connection string (Atlas or local)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=Cluster0

# JWT secret for token signing
JWT_SECRET=your_secure_secret_key_here

# Twilio credentials (for OTP notifications)
TWILIO_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_MSG_SID=your_messaging_service_id
TWILIO_PHONE_NUMBER=+your_phone_number

# Image upload API
IMGBB_API_KEY=your_api_key

# Host configuration (for mobile + admin dashboard connection)
BACKEND_HOST=192.168.1.100     # Your LAN IP
API_BASE_URL=http://192.168.1.100:5000
PORT=5000
NODE_ENV=development           # or production
```

### Admin Dashboard Configuration (`adminnew/.env.example`)

Copy `adminnew/.env.example` → `adminnew/.env`:

```bash
REACT_APP_API_URL=http://192.168.1.100:5000/api
NODE_ENV=development
```

### Mobile App Configuration (`mobilenew`)

During development, the mobile app uses the Expo dev server's host for the API, so a physical phone and the Android emulator can reach the backend on port `5000`. Set `EXPO_PUBLIC_API_URL` (see `mobilenew/.env.example`) to override this. For standalone builds, configure `expo.extra.apiUrl` in `mobilenew/app.json` to the backend URL.

### Security Best Practices

- `.env` files are in `.gitignore` — never committed to version control
- `GramBankAPI/.env.example` serves as template documentation
- Update `BACKEND_HOST` with your machine's LAN IP when running mobile/admin apps
- Rotate credentials regularly in production
- Never share `.env` files or push them to public repositories

## My Implementation

I implemented the major system components including:

- **Fraud detection engine** — implemented the multi-layer pipeline in `services/fraudEngine.js` that chains blacklist lookups, velocity analysis, amount thresholds, and ML inference into a single risk score. Layers short-circuit on high-confidence matches.
- **ML anomaly model** — built the brain.js network (`anomalyModel.js`) for transaction behavior analysis with features including amount, time patterns, transaction frequency, and device signals. Added auto-persistence so the model reloads across server restarts without retraining.
- **Hold/freeze workflow** — implemented the state machine in `fraudEngine.js` that maps risk thresholds to enforcement actions, plus the cron-based review expiry in `server.js`. Admin can override at any point.
- **Offline queue** — wrote `mobilenew/utilitis/offlineQueue.js` using SQLite for durable storage and AsyncStorage for metadata. Queue flushes on reconnect with exponential backoff; user sees pending count on dashboard.
- **Blockchain integration** — wired `fabricClient.js` with error-tolerant fallback so the system runs with or without Fabric. Chaincode at `fabric-chaincodes/fraudchaincode/` stores SHA-256 hashes of transaction payloads.
- **Scheduled transactions** — built the Mongoose schema, the cron executor, and the admin approval UI with live countdown timers.
- **Admin dashboard** — implemented the admin dashboard modules in `adminnew/` using React 19 + Tailwind, including the fraud monitoring views, complaint lifecycle panels, and blockchain explorer.
- **Mobile app** — implemented the mobile banking workflows in `mobilenew/` covering the full payment lifecycle: UPI QR scanning (expo-camera), contacts-based payments (expo-contacts), biometric login (expo-local-authentication), and offline-aware transaction flows.
