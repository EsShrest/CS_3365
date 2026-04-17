# Lottery Purchase System (LPS) - Architecture & Security Design

## System Overview

The LPS is a full-stack **Lottery Ticket Purchase & Management System** built with **Node.js + Express backend** and **vanilla JavaScript frontend**. It simulates a complete lottery ecosystem with user registration, game browsing, ticket purchasing, win calculations, and admin management.

---

## Architecture Design

### Technology Stack
- **Runtime**: Node.js (async event-driven)
- **Framework**: Express.js (REST API)
- **Database**: SQLite (file-based, local persistence)
- **Frontend**: Vanilla JavaScript + HTML/CSS
- **Authentication**: Bearer token + in-memory sessions
- **Cryptography**: Node.js built-in `crypto` module

### Design Pattern: Promise-Based Async

The project uses **async/await** with custom promise wrappers around SQLite callbacks:

```javascript
// SQLite3 uses callbacks, so they're wrapped in Promises
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
}

// This enables async/await syntax in endpoints
async function authMiddleware(req, res, next) {
  const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
  // ...
}
```

**Why?** Converts callback-based SQLite3 API to modern promise chains, enabling cleaner `async/await` code and proper error handling with try/catch.

---

## Data Models

### 1. Users Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  password_hash TEXT NOT NULL,          -- Scrypt hash with salt
  is_admin INTEGER NOT NULL DEFAULT 0,  -- Role flag
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  price REAL NOT NULL,
  prize_amount REAL NOT NULL,
  drawing_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1    -- Soft delete flag
)
```

**Key Features:**
- `active` field allows soft deletes (admins disable games, don't remove)
- Drawing date determines when results are calculated
- Seeded with 4 default games on first run

### 3. Tickets Table
```sql
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  numbers_json TEXT NOT NULL,           -- [1,5,12,33,50] as JSON string
  purchase_total REAL NOT NULL,
  payment_method TEXT NOT NULL,         -- 'paypal', 'venmo', 'bank'
  payment_status TEXT NOT NULL,         -- 'paid' (always for mock)
  status TEXT NOT NULL,                 -- 'pending', 'won', 'lost'
  winning_numbers_json TEXT,            -- [2,6,15,40,48] or NULL if pending
  matches INTEGER DEFAULT 0,            -- Count of matching numbers
  payout REAL DEFAULT 0,                -- Calculated payout
  confirmation_code TEXT NOT NULL,      -- CNF-timestamp-random
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(game_id) REFERENCES games(id)
)
```

**Key Features:**
- JSON serialization of number arrays (1-50 range validation done on backend)
- Foreign keys ensure referential integrity
- `status` transitions: `pending` → `won` or `lost` when drawing date passes
- `confirmation_code` gives users a unique identifier for each ticket

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
- SQLite3 client separates SQL structure from data
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

#### SQLite Foreign Keys & Constraints
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
// SQLite3 auto-commits individual statements
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

## Summary

**Design Principles:**
- Defense in depth: Validation at input, sanitization in logic, constraints at DB
- Fail securely: Errors don't leak sensitive info (generic 401/403 messages)
- Least privilege: Admin role required explicitly, users see only own data
- Cryptographic strength: Scrypt, random salts, 192-bit tokens
