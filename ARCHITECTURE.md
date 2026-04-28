# Lottery Purchase System (LPS) - Architecture & Security Design

## System Overview

The LPS is a full-stack **Lottery Ticket Purchase & Management System** built with **Node.js + Express backend** and **vanilla JavaScript frontend**. It simulates a complete lottery ecosystem with user registration, game browsing, ticket purchasing, win calculations, and admin management.

---

## Architecture Design

### Technology Stack
- **Runtime**: Node.js (async event-driven)
- **Framework**: Express.js (REST API)
- **Database**: MySQL 8.0+ (local instance)
- **Frontend**: Vanilla JavaScript + HTML/CSS
- **Authentication**: Bearer token + in-memory sessions
- **Cryptography**: Node.js built-in `crypto` module

## Design Pattern: Promise-Based Async

The project uses **async/await** with a MySQL connection pool powered by `mysql2/promise`:

```javascript
const mysql = require('mysql2/promise');
const db = mysql.createPool({ host, user, password, database });

async function get(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows[0];
}

// This enables async/await syntax in endpoints
async function authMiddleware(req, res, next) {
  const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
  // ...
}
```

**Why?** Uses the native promise API to keep database access clean, consistent, and compatible with `async/await`.

---

## Data Models

### 1. Users Table
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50) NOT NULL,
  address VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,  -- Scrypt hash with salt
  is_admin TINYINT(1) NOT NULL DEFAULT 0,  -- Role flag
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)
```

**Key Features:**
- Email is UNIQUE + lowercase for consistent lookups
- `is_admin` field controls authorization
- No password stored—only hash (`salt:hashed`)
- Timestamps track account creation

### 2. Games Table
```sql
CREATE TABLE games (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  price DECIMAL(10, 2) NOT NULL,
  prize_amount DECIMAL(12, 2) NOT NULL,
  drawing_date DATE NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1    -- Soft delete flag
)
```

**Key Features:**
- `active` field allows soft deletes (admins disable games, don't remove)
- Drawing date determines when results are calculated
- Seeded with 4 default games on first run

### 3. Tickets Table
```sql
CREATE TABLE tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  game_id INT NOT NULL,
  numbers_json TEXT NOT NULL,           -- [1,5,12,33,50] as JSON string
  purchase_total DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL,  -- 'paypal', 'venmo', 'bank'
  payment_status VARCHAR(20) NOT NULL,  -- 'paid' (always for mock)
  status VARCHAR(20) NOT NULL,          -- 'pending', 'won', 'lost'
  winning_numbers_json TEXT,            -- [2,6,15,40,48] or NULL if pending
  matches INT DEFAULT 0,                -- Count of matching numbers
  payout DECIMAL(12, 2) DEFAULT 0,       -- Calculated payout
  confirmation_code VARCHAR(60) NOT NULL, -- CNF-timestamp-random
  claim_status VARCHAR(20) DEFAULT 'unclaimed', -- 'unclaimed' or 'claimed'
  claimed_at DATETIME NULL,             -- When prize was claimed (NULL if unclaimed)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(game_id) REFERENCES games(id)
)
```

**Key Features:**
- JSON serialization of number arrays (1-50 range validation done on backend)
- Foreign keys ensure referential integrity
- `status` transitions: `pending` → `won` or `lost` when drawing date passes
- `confirmation_code` gives users a unique identifier for each ticket
- `claim_status` tracks whether prize has been claimed ('unclaimed' or 'claimed')
- `claimed_at` timestamp records when user claimed their prize (null if unclaimed)

### 4. Winning Numbers Table
```sql
CREATE TABLE winning_numbers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_id INT NOT NULL,
  draw_date DATE NOT NULL,
  numbers_json TEXT NOT NULL,           -- [3,12,18,24,39] as JSON string
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(game_id) REFERENCES games(id)
)
```

**Key Features:**
- Stores historical winning draws for each game
- Seeded with 3 sample draws × 4 games = 12 records on first run
- Used to display "Previous Winning Numbers" page to users
- Supports win calculation when tickets are purchased with past drawing dates

---

## Controller Architecture

All business logic lives in Express route handlers following this pattern:

```javascript
app.METHOD('/api/route', [middleware], async (req, res) => {
  try {
    // 1. Validate input
    // 2. Query database (await)
    // 3. Business logic
    // 4. Respond with JSON
  } catch (error) {
    res.status(500).json({ error: 'Operation failed' });
  }
});
```

### Authentication Endpoints

#### `POST /api/auth/register`
- **Input**: `{ name, email, phone, address, password }`
- **Validation**: All fields required, password ≥ 8 chars
- **Process**: Hash password with salt, insert user record
- **Response**: `{ message: 'Registration successful' }`

#### `POST /api/auth/login`
- **Input**: `{ email, password }`
- **Process**: Lookup user by lowercase email, verify password timing-safely, generate token
- **Response**: `{ token, user: { id, name, email, is_admin } }`
- **Token Creation**: 24 bytes random hex = 192 bits entropy, cryptographically strong

#### `POST /api/auth/logout` (auth required)
- **Process**: Delete session token from in-memory map
- **Response**: `{ message: 'Logged out' }`

#### `GET /api/auth/me` (auth required)
- **Response**: Returns authenticated user from session

### User Endpoints

#### `GET /api/games` (auth required)
- Returns all active `games` where `active = 1`
- **Response**: `{ games: [...] }`

#### `GET /api/profile` (auth required)
- Returns user's own profile data

#### `PUT /api/profile` (auth required)
- **Input**: `{ name, phone, address }`
- Updates user record (cannot change email/password via this endpoint)

#### `GET /api/user/stats` (auth required)
- Aggregates user's ticket data:
  - `total_tickets`: COUNT(*) of user's tickets
  - `total_spent`: SUM(purchase_total)
  - `wins`: COUNT where status = 'won'
  - `total_winnings`: SUM(payout)

#### `POST /api/purchase` (auth required)
- **Input**: `{ gameId, numbers: [1,5,12,33,50], ticketCount: 3, paymentMethod: 'paypal' }`
- **Validation**:
  - Lottery numbers: exactly 5, unique, 1-50 range
  - Ticket count: 1-10
  - Payment method: whitelist ('paypal', 'venmo', 'bank')
  - Game: must exist and be active
- **Process**:
  1. Log mock payment to `logs/payments.log`
  2. For each ticket:
     - If drawing date has passed: generate winning numbers, calculate matches and payout
     - If drawing date future: set status = 'pending'
     - If won: log email to `logs/email.log`
  3. Insert all tickets into DB
- **Response**: `{ message, paymentRef, game, ticketCount, total, tickets: [...] }`

#### `GET /api/history` (auth required)
- SELECT tickets with JOIN to games for user
- Parse JSON fields back to arrays
- **Response**: `{ tickets: [...] }`

### Admin Endpoints (require `authMiddleware` + `adminOnly`)

#### `GET /api/admin/stats` (admin only)
- Aggregate system-wide stats:
  - `tickets_sold`: Total
  - `revenue`: Total purchase amounts
  - `wins`: Winning tickets count
  - `users`: Non-admin user count

#### `GET /api/admin/games` (admin only)
- Returns ALL games including disabled ones

#### `POST /api/admin/games` (admin only)
- **Input**: `{ name, price, prizeAmount, drawingDate }`
- Insert new game

#### `DELETE /api/admin/games/:id` (admin only)
- Soft delete: `UPDATE games SET active = 0 WHERE id = ?`

#### `PUT /api/admin/games/:id` (admin only)
- **Input**: `{ name, price, prizeAmount, drawingDate }`
- Updates existing game: Price, prize amount, name, and drawing date
- **Response**: `{ message: 'Game updated' }`

### Enhanced Endpoints (Search & Details)

#### `GET /api/games?q=query` (auth required)
- **Query Parameter**: `q` (optional search string)
- Returns games matching the search query (case-insensitive substring match)
- If no query: returns all active games
- **Response**: `{ games: [...] }`
- **Use Case**: Real-time ticket search on browse page

#### `GET /api/history/:id` (auth required)
- **Path Parameter**: `id` (ticket ID)
- Returns single ticket with full details including:
  - Ticket ID, confirmation code, game info, numbers, status
  - Winning numbers (if draw date has passed)
  - Payout amount, matches count
  - **claim_status** ('unclaimed' or 'claimed')
  - **claimed_at** timestamp (null if not yet claimed)
- **Response**: `{ ticket: { ...with all fields... } }`
- **Use Case**: Display order details in modal when user clicks history row

### Claims & Prize Management

#### `POST /api/claims/:ticketId` (auth required)
- **Claim Prize** for winning ticket
- **Validation**:
  - Ticket must belong to authenticated user
  - Ticket must have winning status (`status = 'won'`)
  - Payout must be > 0
  - Prevent duplicate claims (check `claim_status != 'claimed'`)
- **Business Logic**:
  - **If payout < $600**: 
    - Update `claim_status = 'claimed'`, set `claimed_at = NOW()`
    - Return: `{ message: 'Claim processed successfully', requireInPerson: false }`
  - **If payout ≥ $600**:
    - Do NOT update database
    - Return: `{ requireInPerson: true, message: 'Claims of $600 or more must be verified in person.' }`
- **Response Examples**:
  ```json
  // Online claim success
  { "message": "Claim processed successfully", "requireInPerson": false }
  
  // In-person claim required
  { "requireInPerson": true, "message": "Claims of $600 or more must be verified in person." }
  ```
- **Use Case**: User claims prize from order details modal

### Winning Numbers Display

#### `GET /api/winning-numbers` (auth required)
- Returns all historical winning draws across all games
- **Response**:
  ```json
  {
    "draws": [
      {
        "game_name": "Power Ball",
        "draw_date": "2026-03-30",
        "winning_numbers": [3, 12, 18, 24, 39]
      },
      ...
    ]
  }
  ```
- **Use Case**: Display on dedicated "Previous Winning Numbers" page

---

## Security Design & Choices

### 1. Password Security

#### Scrypt Hash with Random Salt
```javascript
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');  // 16 bytes = 128 bits
  const hashed = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hashed}`;
}
```

**Why Scrypt?**
- **Memory-hard algorithm**: Resistant to GPU/ASIC brute-force attacks
- **CPU-intensive**: Takes ~0.3s per hash (slow by design)
- Standard choice alongside bcrypt, Argon2

**Why Random Salt?**
- 16 bytes (128 bits) prevents rainbow table attacks
- Different salt per password = different Hash even for identical passwords
- Stored alongside hash as `salt:hash` tuple

#### Timing-Safe Password Comparison
```javascript
function verifyPassword(password, storedHash) {
  const [salt, originalHash] = storedHash.split(':');
  const hashedBuffer = crypto.scryptSync(password, salt, 64);
  const originalBuffer = Buffer.from(originalHash, 'hex');
  return crypto.timingSafeEqual(hashedBuffer, originalBuffer);
}
```

**Why `timingSafeEqual`?**
- **Prevents timing attacks**: Takes constant time regardless of where bytes mismatch
- Normal string comparison (`===`) exits early on first mismatch → attacker can measure response time → infer correct bytes
- `timingSafeEqual` compares all bytes before returning false

### 2. SQL Injection Prevention

#### Parameterized Queries (Prepared Statements)
```javascript
// ✓ SAFE - uses parameterized query
const user = await get('SELECT * FROM users WHERE email = ?', [email]);

// ✗ WRONG - string interpolation (vulnerable)
const user = await get(`SELECT * FROM users WHERE email = '${email}'`);
```

**Why?**
- MySQL client separates SQL structure from data
- `?` placeholders are replaced safely
- Data never parsed as SQL code
- Prevents injection like `email = "admin'--"` from breaking query logic

### 3. Authentication & Authorization

#### Stateful Session Model (In-Memory)
```javascript
const sessions = new Map();  // { token: userId }

function createToken() {
  return crypto.randomBytes(24).toString('hex');  // 192-bit entropy
}

app.post('/api/auth/login', async (req, res) => {
  const token = createToken();
  sessions.set(token, user.id);
  res.json({ token });
});
```

**Design:**
- Token = 24 bytes hex = 192 bits entropy (256^24 combinations)
- Server stores `token → userId` mapping in memory
- Each request includes token in `Authorization: Bearer <token>` header

**Trade-offs:**
- **Pro**: Simple, no JWT decoding, immediate token revocation (logout)
- **Con**: Lost on server restart, not suitable for distributed systems, single-server only

#### Authentication Middleware
```javascript
async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    
    if (!token || !sessions.has(token)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = sessions.get(token);
    const user = await get('SELECT ... FROM users WHERE id = ?', [userId]);
    
    if (!user) {
      sessions.delete(token);  // Clean up stale token
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' });
  }
}
```

**Security Features:**
- Token must exist in session map
- User record must still exist in DB (deleted users auto-logout)
- User object attached to `req` for authorization checks
- All protected endpoints require this middleware

#### Role-Based Authorization (Admin-Only)
```javascript
function adminOnly(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// Usage: app.get('/api/admin/stats', authMiddleware, adminOnly, handler);
```

**Design:**
- `is_admin` field (0 or 1) is checked **only after authentication**
- Middleware chain: auth → authMiddleware sets req.user → adminOnly checks flag
- Missing auth bypasses permission check (status 401)
- Failed auth blocks access (status 403)

### 4. Input Validation

#### Client-Side Validation (JavaScript)
```javascript
// Client validates before sending to API
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePassword(password) {
  const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  // Requires: lowercase, uppercase, digit, min 8 chars
  return re.test(password);
}

function validatePhoneNumber(phone) {
  const re = /^[\d\s\-\+\(\)]{10,}$/;
  return re.test(phone);
}
```

#### Server-Side Validation (Mandatory)
```javascript
app.post('/api/auth/register', async (req, res) => {
  const { name, email, phone, address, password } = req.body;

  // Presence checks
  if (!name || !email || !phone || !address || !password) {
    res.status(400).json({ error: 'All fields are required' });
    return;
  }

  // Length check
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  // Uniqueness check
  const exists = await get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (exists) {
    res.status(409).json({ error: 'Email is already registered' });
    return;
  }

  // Normalization before insert
  await run(
    'INSERT INTO users (...) VALUES (...)',
    [name.trim(), email.toLowerCase().trim(), phone.trim(), address.trim(), hashPassword(password)]
  );
});
```

**Why Server-Side Matters:**
- Client validation can be bypassed (curl, Postman, network inspection)
- Server is the **trust boundary** — must validate all input
- Prevents malformed data from reaching database

#### Lottery Number Validation
```javascript
function parseNumbers(input) {
  // Must be array of exactly 5
  if (!Array.isArray(input) || input.length !== 5) {
    return null;
  }

  // Convert to integers
  const parsed = input.map((n) => Number(n));

  // Each number: integer, 1-50 range
  const valid = parsed.every((n) => Number.isInteger(n) && n >= 1 && n <= 50);
  if (!valid) {
    return null;
  }

  // All unique (no duplicates)
  const unique = new Set(parsed);
  if (unique.size !== 5) {
    return null;
  }

  return [...unique].sort((a, b) => a - b);
}
```

**Validation Layers:**
1. Type check (array)
2. Length check (exactly 5)
3. Range check (1-50)
4. Uniqueness check (no duplicates)
5. Returns null if ANY check fails → API returns 400

#### Whitelist Validation (Payment Methods)
```javascript
const allowedMethods = ['paypal', 'venmo', 'bank'];
if (!allowedMethods.includes(paymentMethod)) {
  res.status(400).json({ error: 'Invalid payment method' });
  return;
}
```

**Why Whitelist?**
- Only KNOWN GOOD values accepted
- Blocks injection of unexpected values
- Database doesn't store user-controlled values directly

### 5. Data Persistence & Integrity

#### MySQL Foreign Keys & Constraints
```sql
FOREIGN KEY(user_id) REFERENCES users(id),
FOREIGN KEY(game_id) REFERENCES games(id)
```

**Prevents:**
- Orphaned tickets (deleted sessions)
- Tickets referencing non-existent games
- Data corruption from API manipulation

#### Database Transactions (Implicit)
```javascript
// MySQL auto-commits individual statements
// For demo purposes, okay; production would batch operations in explicit transactions
```

#### Soft Deletes (Games)
```javascript
// Instead of: DELETE FROM games WHERE id = ?
// Use:        UPDATE games SET active = 0 WHERE id = ?
// Ensures ticket history remains intact
```

### 6. Logging & Audit Trail

#### Payment Logging
```javascript
appendLog('payments.log', `[${new Date().toISOString()}] mock_payment success ref=${paymentRef} user=${req.user.email} method=${paymentMethod} amount=${total.toFixed(2)}`);
```

**Audit Trail:** Timestamp, transaction ID, user, method, amount

#### Email Logging
```javascript
appendLog('email.log', `[${new Date().toISOString()}] to=${req.user.email} subject="You have a winning ticket" ticket=${confirmationCode} payout=${payout.toFixed(2)}`);
```

**Audit Trail:** Timestamp, recipient, subject, ticket, amount

### 7. Known Limitations (Demo, Not Production-Ready)

| Issue | Impact | Production Fix |
|-------|--------|-----------------|
| **In-memory sessions** | Lost on restart | Use Redis/database-backed sessions, JWT |
| **No HTTPS** | Tokens sent in plain HTTP | Enable SSL/TLS |
| **No rate limiting** | Brute-force password attacks | Implement rate limiter (express-ratelimit) |
| **No CORS** | Open to any origin | Configure CORS whitelist |
| **Mock payments** | Not connected to real payment gateway | Integrate Stripe/PayPal SDK |
| **Client-side crypto** | Browser-based storage of tokens | HTTPS-only cookies, secure flag |
| **No input sanitization** | XSS risk in logs | Escape HTML entities, use CSP headers |
| **All users see all games** | No access control on data | Implement feature flags, regional restrictions |

---

## Request/Response Flow Example

### Ticket Purchase Workflow

```
[Client]
  1. User selects game, numbers [5, 15, 25, 35, 45], qty=2
  2. POST /api/purchase
     Body: { gameId: 1, numbers: [...], ticketCount: 2, paymentMethod: 'paypal' }
     Header: Authorization: Bearer <token>
  
[Server - authMiddleware]
  3. Extract token from Authorization header
  4. Query: SELECT * FROM users WHERE id = ? (userId from session)
  5. Attach user to req → req.user = { id, name, email, is_admin }
  
[Server - Handler Logic]
  6. Validate numbers: parseNumbers() → returns [5,15,25,35,45] or null
  7. Validate ticketCount: 1-10 → 2 ✓
  8. Validate paymentMethod: whitelist → 'paypal' ✓
  9. Query: SELECT * FROM games WHERE id = ? AND active = 1
  10. Calculate: total = 2 * gamePrice = $4.00
  11. Mock payment: Log to payments.log
  12. For i = 0 to 1:
      - drawDate <= now? If yes: randomNumbers(), calculate matches & payout
      - INSERT INTO tickets (...)
  13. Before response: Parse JSON back to arrays
  
[Response]
  14. { message, paymentRef, game, ticketCount, total, tickets: [...] }
  
[Client]
  15. Display confirmation with tickets
  16. Store ticket data in localStorage
```

---

## Frontend Architecture & Pages

### New Pages

#### `winning-numbers.html`
- **Purpose**: Display historical winning numbers across all games
- **Features**:
  - Table with columns: Game Name, Draw Date, Winning Numbers
  - Calls `/api/winning-numbers` on page load
  - Accessible from main navigation on all pages
  - Styled to match warm editorial theme (cream, teal, orange accents)

#### Order Details Modal (`order-details-modal` in order-history.html)
- **Trigger**: Click on any order row in order history
- **Displays**:
  - Ticket ID, confirmation code
  - Game name, draw date, selected numbers
  - Winning numbers (if draw date has passed)
  - Ticket status (pending, won, lost)
  - Payout amount, matches
  - **Claim Action** (conditional):
    - If `status = 'won'` and `payout > 0`:
      - If `claim_status = 'claimed'`: Show "Already claimed" message
      - If `payout ≥ $600`: Show "In-person claim required at claiming center" message
      - If `payout < $600`: Show claim form with payment method select (PayPal, Venmo, Bank) + Claim button
    - If `status != 'won'`: Hide claim action
  - Print Ticket button → Opens printable version in new window
- **Validation**: Prevents accessing tickets belonging to other users via endpoint check

### Search Features

#### Dashboard Search Form
- **Location**: dashboard.html (visible below welcome message)
- **Behavior**: Text input + "Search" button
- **Action**: Submits to `browse-tickets.html?q=searchterm`

#### Browse Page Real-Time Search
- **Location**: browse-tickets.html (card above game grid)
- **Behavior**: Live filtering as user types
- **Action**: Filters game list in real-time via `renderBrowseGames(query)` function
- **Matching**: Case-insensitive substring match on game name

### Navigation Updates
All main pages now include "Winning Numbers" link in header navigation:
- dashboard.html
- browse-tickets.html
- ticket-details.html
- order-history.html
- profile.html
- admin-dashboard.html
- admin-tickets.html

### JavaScript Functions (script.js)

**New Search Functions:**
- `renderBrowseGames(query)` – Filters games by substring match, re-renders grid
- Dashboard search form wiring in `initDashboard()`

**New Order Details Functions:**
- `openOrderDetails(ticketId)` – Fetches `/api/history/:id`, displays modal with all fields
- `claimPrize(ticketId)` – Calls `/api/claims/:ticketId`, handles online/in-person response
- `printTicket()` – Opens popup with printable ticket details

**New Winning Numbers Function:**
- `initWinningNumbers()` – Fetches `/api/winning-numbers`, populates table

**New Admin Edit Functions:**
- `openEditTicket(id)` – Populates edit-ticket-modal with selected game data
- `updateTicket()` – Calls `PUT /api/admin/games/:currentEditTicketId`, reloads table

---
**Design Principles:**
- Defense in depth: Validation at input, sanitization in logic, constraints at DB
- Fail securely: Errors don't leak sensitive info (generic 401/403 messages)
- Least privilege: Admin role required explicitly, users see only own data
- Cryptographic strength: Scrypt, random salts, 192-bit tokens
