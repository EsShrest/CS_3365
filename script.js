const TOKEN_KEY = 'lps_demo_token';
const USER_KEY = 'lps_demo_user';

let selectedNumbers = [];
let currentTicketGame = null;
let adminGameRows = [];
let browseGames = [];
let currentEditTicketId = null;
let currentOrderTicket = null;

function showAlert(message, type = 'error') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;

    const container = document.querySelector('.container') || document.querySelector('.container-sm');
    if (container) {
        container.insertBefore(alertDiv, container.firstChild);
        setTimeout(() => alertDiv.remove(), 4000);
    }
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePassword(password) {
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return re.test(password);
}

function validatePhoneNumber(phone) {
    const re = /^[\d\s\-\+\(\)]{10,}$/;
    return re.test(phone);
}

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
}

function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

async function api(path, options = {}, withAuth = true) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };

    if (withAuth) {
        const token = getToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
    }

    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = data.error || 'Request failed';
        throw new Error(message);
    }

    return data;
}

function togglePasswordVisibility(inputId, toggleId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    if (!input || !toggle) return;

    if (input.type === 'password') {
        input.type = 'text';
        toggle.textContent = 'Hide';
    } else {
        input.type = 'password';
        toggle.textContent = 'Show';
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!validateEmail(email)) {
        showAlert('Please enter a valid email address', 'error');
        return;
    }

    if (!password) {
        showAlert('Please enter your password', 'error');
        return;
    }

    try {
        const result = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }, false);

        setAuth(result.token, result.user);
        showAlert('Login successful', 'success');
        setTimeout(() => {
            window.location.href = result.user.is_admin ? 'admin-dashboard.html' : 'dashboard.html';
        }, 400);
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const address = document.getElementById('address').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (!name) {
        showAlert('Please enter your name', 'error');
        return;
    }
    if (!validateEmail(email)) {
        showAlert('Please enter a valid email address', 'error');
        return;
    }
    if (!validatePhoneNumber(phone)) {
        showAlert('Please enter a valid phone number', 'error');
        return;
    }
    if (!address) {
        showAlert('Please enter your address', 'error');
        return;
    }
    if (!validatePassword(password)) {
        showAlert('Password must be at least 8 chars and contain upper/lowercase and number', 'error');
        return;
    }
    if (password !== confirmPassword) {
        showAlert('Passwords do not match', 'error');
        return;
    }

    try {
        await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, phone, address, password }),
        }, false);
        showAlert('Registration successful. Please login.', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 500);
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

function formatMoney(value) {
    return `$${Number(value || 0).toFixed(2)}`;
}

function getPageName() {
    return window.location.pathname.split('/').pop() || 'index.html';
}

function updateSelectedDisplay() {
    const selectedDisplay = document.getElementById('selected-display');
    if (!selectedDisplay) return;

    if (selectedNumbers.length === 0) {
        selectedDisplay.textContent = '0 / 5 Selected';
        return;
    }

    const sorted = [...selectedNumbers].sort((a, b) => a - b);
    selectedDisplay.textContent = `${sorted.join(', ')} (${sorted.length}/5)`;
}

function toggleNumber(num) {
    const numberBtn = document.querySelector(`[data-number="${num}"]`);

    if (selectedNumbers.includes(num)) {
        selectedNumbers = selectedNumbers.filter((n) => n !== num);
        if (numberBtn) numberBtn.style.backgroundColor = 'var(--tertiary-dark)';
    } else if (selectedNumbers.length < 5) {
        selectedNumbers.push(num);
        if (numberBtn) numberBtn.style.backgroundColor = 'var(--accent-green)';
    } else {
        showAlert('You can only select 5 numbers', 'error');
    }

    updateSelectedDisplay();
}

function autoGenerateNumbers() {
    selectedNumbers = [];
    document.querySelectorAll('[data-number]').forEach((btn) => {
        btn.style.backgroundColor = 'var(--tertiary-dark)';
    });

    const values = new Set();
    while (values.size < 5) {
        values.add(Math.floor(Math.random() * 50) + 1);
    }
    selectedNumbers = [...values];

    selectedNumbers.forEach((num) => {
        const btn = document.querySelector(`[data-number="${num}"]`);
        if (btn) btn.style.backgroundColor = 'var(--accent-green)';
    });

    updateSelectedDisplay();
}

function clearNumbers() {
    selectedNumbers = [];
    document.querySelectorAll('[data-number]').forEach((btn) => {
        btn.style.backgroundColor = 'var(--tertiary-dark)';
    });
    updateSelectedDisplay();
}

async function purchaseTicket() {
    if (!currentTicketGame) {
        showAlert('No game selected', 'error');
        return;
    }

    if (selectedNumbers.length !== 5) {
        showAlert('Please select exactly 5 numbers', 'error');
        return;
    }

    const ticketCountInput = document.getElementById('ticket-count');
    const paymentMethodInput = document.getElementById('payment-method');
    const ticketCount = Number(ticketCountInput ? ticketCountInput.value : 1);
    const paymentMethod = paymentMethodInput ? paymentMethodInput.value : 'paypal';

    try {
        const result = await api('/api/purchase', {
            method: 'POST',
            body: JSON.stringify({
                gameId: currentTicketGame.id,
                numbers: selectedNumbers,
                ticketCount,
                paymentMethod,
            }),
        });

        showAlert(`${result.message}. Ref: ${result.paymentRef}`, 'success');
        setTimeout(() => {
            window.location.href = 'order-history.html';
        }, 700);
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function initBrowseTickets() {
    const grid = document.getElementById('tickets-grid');
    if (!grid) return;

    try {
        const { games } = await api('/api/games');
        browseGames = games;

        const params = new URLSearchParams(window.location.search);
        const initialQuery = params.get('q') || '';
        const searchInput = document.getElementById('ticket-search-input');
        if (searchInput) {
            searchInput.value = initialQuery;
            searchInput.addEventListener('input', () => {
                renderBrowseGames(searchInput.value.trim());
            });
        }

        renderBrowseGames(initialQuery);
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

function renderBrowseGames(query) {
    const grid = document.getElementById('tickets-grid');
    if (!grid) return;

    const normalized = (query || '').toLowerCase();
    const filtered = normalized
        ? browseGames.filter((game) => game.name.toLowerCase().includes(normalized))
        : browseGames;

    if (!filtered.length) {
        grid.innerHTML = '<p class="text-muted">No tickets found. Try a different search.</p>';
        return;
    }

    grid.innerHTML = '';
    filtered.forEach((game) => {
        const card = document.createElement('div');
        card.className = 'card ticket-card';
        card.innerHTML = `
            <div class="ticket-image">🎟️</div>
            <div class="card-body">
                <h3>${game.name}</h3>
                <p class="text-muted" style="font-size: 0.9rem;">Drawing Date</p>
                <p class="text-muted">${game.drawing_date}</p>
                <div style="margin: 1rem 0; padding: 1rem; background-color: var(--tertiary-dark); border-radius: 4px;">
                    <span class="text-muted">Price</span>
                    <div class="ticket-price">${formatMoney(game.price)}</div>
                    <span class="text-muted">Prize</span>
                    <div class="ticket-price">${formatMoney(game.prize_amount)}</div>
                </div>
                <a href="ticket-details.html?gameId=${game.id}" class="btn btn-primary" style="width: 100%; display: block; text-align: center;">View & Buy</a>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function initTicketDetails() {
    const params = new URLSearchParams(window.location.search);
    const gameId = Number(params.get('gameId'));

    const numberGrid = document.getElementById('number-grid');
    if (numberGrid) {
        numberGrid.innerHTML = '';
        for (let i = 1; i <= 50; i += 1) {
            const button = document.createElement('button');
            button.setAttribute('data-number', `${i}`);
            button.onclick = () => toggleNumber(i);
            button.style.padding = '0.75rem';
            button.style.backgroundColor = 'var(--tertiary-dark)';
            button.style.color = 'var(--text-primary)';
            button.style.border = '1px solid var(--border-color)';
            button.style.borderRadius = '4px';
            button.style.cursor = 'pointer';
            button.style.transition = 'all 0.3s ease';
            button.style.fontWeight = 'bold';
            button.textContent = i;
            numberGrid.appendChild(button);
        }
    }

    updateSelectedDisplay();

    if (!gameId) {
        showAlert('No game selected', 'error');
        return;
    }

    try {
        const { games } = await api('/api/games');
        const game = games.find((g) => g.id === gameId);
        if (!game) {
            showAlert('Game not found', 'error');
            return;
        }
        currentTicketGame = game;

        const ticketName = document.getElementById('ticket-name');
        const ticketPrice = document.getElementById('ticket-price');
        const ticketPrize = document.getElementById('ticket-prize');
        const ticketDate = document.getElementById('ticket-date');
        const totalCost = document.getElementById('total-cost');

        if (ticketName) ticketName.textContent = game.name;
        if (ticketPrice) ticketPrice.textContent = formatMoney(game.price);
        if (ticketPrize) ticketPrize.textContent = formatMoney(game.prize_amount);
        if (ticketDate) ticketDate.textContent = game.drawing_date;
        if (totalCost) totalCost.textContent = formatMoney(game.price);

        const ticketCountInput = document.getElementById('ticket-count');
        if (ticketCountInput && totalCost) {
            ticketCountInput.addEventListener('change', () => {
                const count = Number(ticketCountInput.value) || 1;
                totalCost.textContent = formatMoney(Number(game.price) * count);
            });
        }
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

function renderStatusBadge(status) {
    if (status === 'won') {
        return '<span style="background: rgba(28, 231, 131, 0.2); color: var(--accent-green); padding: 0.35rem 0.75rem; border-radius: 4px; font-size: 0.85rem;">Won</span>';
    }
    if (status === 'lost') {
        return '<span style="background: rgba(255, 71, 87, 0.2); color: #ff6b87; padding: 0.35rem 0.75rem; border-radius: 4px; font-size: 0.85rem;">Lost</span>';
    }
    return '<span style="background: rgba(255, 193, 7, 0.2); color: #ffc107; padding: 0.35rem 0.75rem; border-radius: 4px; font-size: 0.85rem;">Pending</span>';
}

async function initOrderHistory() {
    const tbody = document.getElementById('history-body');
    if (!tbody) return;

    try {
        const [{ tickets }, { stats }] = await Promise.all([
            api('/api/history'),
            api('/api/user/stats'),
        ]);

        if (!tickets.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="padding: 1rem;">No orders found.</td></tr>';
        } else {
            tbody.innerHTML = tickets.map((ticket) => `
                <tr style="border-bottom: 1px solid var(--border-color); cursor: pointer;" data-ticket-id="${ticket.id}">
                    <td style="padding: 1rem;">#${ticket.id}</td>
                    <td style="padding: 1rem;">${ticket.game_name}</td>
                    <td style="padding: 1rem;">${ticket.created_at}</td>
                    <td style="padding: 1rem;">${ticket.drawing_date}</td>
                    <td style="padding: 1rem;">${ticket.numbers.join(', ')}</td>
                    <td style="padding: 1rem;">${formatMoney(ticket.purchase_total)}</td>
                    <td style="padding: 1rem;">${renderStatusBadge(ticket.status)}</td>
                    <td style="padding: 1rem;">${ticket.payout > 0 ? formatMoney(ticket.payout) : '-'}</td>
                </tr>
            `).join('');

            tbody.querySelectorAll('tr[data-ticket-id]').forEach((row) => {
                row.addEventListener('click', () => {
                    const ticketId = row.getAttribute('data-ticket-id');
                    if (ticketId) openOrderDetails(Number(ticketId));
                });
            });
        }

        const totalOrders = document.getElementById('stat-total-orders');
        const wins = document.getElementById('stat-wins');
        const winnings = document.getElementById('stat-winnings');
        const spent = document.getElementById('stat-spent');

        if (totalOrders) totalOrders.textContent = stats.total_tickets;
        if (wins) wins.textContent = stats.wins;
        if (winnings) winnings.textContent = formatMoney(stats.total_winnings);
        if (spent) spent.textContent = formatMoney(stats.total_spent);
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function openOrderDetails(ticketId) {
    try {
        const { ticket } = await api(`/api/history/${ticketId}`);
        currentOrderTicket = ticket;

        const modal = document.getElementById('order-details-modal');
        const details = document.getElementById('order-details-body');
        if (!modal || !details) return;

        const claimStatus = ticket.claim_status === 'claimed'
            ? 'Claimed'
            : ticket.payout >= 600
                ? 'In-person claim required'
                : 'Eligible for online claim';

        const winningNumbers = ticket.winning_numbers ? ticket.winning_numbers.join(', ') : 'Pending draw';
        let claimAction = '<p class="text-muted">No claim available for this ticket.</p>';
        if (ticket.status === 'won' && ticket.payout > 0) {
            if (ticket.claim_status === 'claimed') {
                claimAction = '<p class="text-muted">This ticket has already been claimed.</p>';
            } else if (ticket.payout >= 600) {
                claimAction = '<p class="text-muted">Claims of $600 or more must be completed in person at a claiming center.</p>';
            } else {
                claimAction = `
                    <div class="form-group" style="margin-top: 1.5rem;">
                        <label for="claim-method">Claim Method</label>
                        <select id="claim-method">
                            <option value="paypal">PayPal</option>
                            <option value="venmo">Venmo</option>
                            <option value="bank">Bank Account</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" onclick="claimPrize(${ticket.id})">Claim Winnings</button>
                `;
            }
        }

        details.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
                <div>
                    <p class="text-muted">Ticket ID</p>
                    <div style="font-weight: bold;">#${ticket.id}</div>
                </div>
                <div>
                    <p class="text-muted">Confirmation Code</p>
                    <div style="font-weight: bold;">${ticket.confirmation_code}</div>
                </div>
                <div>
                    <p class="text-muted">Game</p>
                    <div style="font-weight: bold;">${ticket.game_name}</div>
                </div>
                <div>
                    <p class="text-muted">Draw Date</p>
                    <div style="font-weight: bold;">${ticket.drawing_date}</div>
                </div>
                <div>
                    <p class="text-muted">Numbers</p>
                    <div style="font-weight: bold;">${ticket.numbers.join(', ')}</div>
                </div>
                <div>
                    <p class="text-muted">Winning Numbers</p>
                    <div style="font-weight: bold;">${winningNumbers}</div>
                </div>
                <div>
                    <p class="text-muted">Status</p>
                    <div style="font-weight: bold;">${ticket.status.toUpperCase()}</div>
                </div>
                <div>
                    <p class="text-muted">Payout</p>
                    <div style="font-weight: bold;">${formatMoney(ticket.payout)}</div>
                </div>
                <div>
                    <p class="text-muted">Claim Status</p>
                    <div style="font-weight: bold;">${claimStatus}</div>
                </div>
            </div>
            <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
                <button class="btn btn-secondary" onclick="printTicket()">🖨️ Print Ticket</button>
            </div>
            <div style="margin-top: 1.5rem;">
                ${claimAction}
            </div>
        `;

        openModal('order-details-modal');
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function claimPrize(ticketId) {
    const methodSelect = document.getElementById('claim-method');
    const method = methodSelect ? methodSelect.value : 'paypal';

    try {
        const result = await api(`/api/claims/${ticketId}`, {
            method: 'POST',
            body: JSON.stringify({ method }),
        });

        if (result.requireInPerson) {
            showAlert(result.message, 'error');
        } else {
            showAlert(result.message, 'success');
        }

        closeModal('order-details-modal');
        initOrderHistory();
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

function printTicket() {
    if (!currentOrderTicket) return;

    const ticket = currentOrderTicket;
    const popup = window.open('', '_blank', 'width=600,height=700');
    if (!popup) return;

    const winningNumbers = ticket.winning_numbers ? ticket.winning_numbers.join(', ') : 'Pending draw';
    popup.document.write(`
        <html>
            <head><title>Ticket #${ticket.id}</title></head>
            <body style="font-family: Arial, sans-serif; padding: 2rem;">
                <h1>LottoPlay Ticket</h1>
                <p><strong>Ticket ID:</strong> #${ticket.id}</p>
                <p><strong>Confirmation Code:</strong> ${ticket.confirmation_code}</p>
                <p><strong>Game:</strong> ${ticket.game_name}</p>
                <p><strong>Draw Date:</strong> ${ticket.drawing_date}</p>
                <p><strong>Your Numbers:</strong> ${ticket.numbers.join(', ')}</p>
                <p><strong>Winning Numbers:</strong> ${winningNumbers}</p>
                <p><strong>Status:</strong> ${ticket.status.toUpperCase()}</p>
            </body>
        </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
}

async function initWinningNumbers() {
    const tableBody = document.getElementById('winning-numbers-body');
    if (!tableBody) return;

    try {
        const { draws } = await api('/api/winning-numbers');
        if (!draws.length) {
            tableBody.innerHTML = '<tr><td colspan="3" style="padding: 1rem;">No draws available.</td></tr>';
            return;
        }

        tableBody.innerHTML = draws.map((draw) => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 1rem;">${draw.game_name}</td>
                <td style="padding: 1rem;">${draw.draw_date}</td>
                <td style="padding: 1rem;">${draw.numbers.join(', ')}</td>
            </tr>
        `).join('');
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function initProfile() {
    try {
        const [{ profile }, { stats }] = await Promise.all([
            api('/api/profile'),
            api('/api/user/stats'),
        ]);

        const profileName = document.getElementById('profile-name');
        const profileEmail = document.getElementById('profile-email');
        const profilePhone = document.getElementById('profile-phone');
        const profileAddress = document.getElementById('profile-address');
        const editName = document.getElementById('edit-name');
        const editEmail = document.getElementById('edit-email');
        const editPhone = document.getElementById('edit-phone');
        const editAddress = document.getElementById('edit-address');

        if (profileName) profileName.value = profile.name;
        if (profileEmail) profileEmail.value = profile.email;
        if (profilePhone) profilePhone.value = profile.phone;
        if (profileAddress) profileAddress.value = profile.address;
        if (editName) editName.value = profile.name;
        if (editEmail) editEmail.value = profile.email;
        if (editPhone) editPhone.value = profile.phone;
        if (editAddress) editAddress.value = profile.address;

        const profileHeaderName = document.getElementById('profile-header-name');
        if (profileHeaderName) profileHeaderName.textContent = profile.name;

        const profileTickets = document.getElementById('profile-tickets');
        const profileWins = document.getElementById('profile-wins');
        const profileWinnings = document.getElementById('profile-winnings');
        if (profileTickets) profileTickets.textContent = stats.total_tickets;
        if (profileWins) profileWins.textContent = stats.wins;
        if (profileWinnings) profileWinnings.textContent = formatMoney(stats.total_winnings);
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function saveProfile() {
    const name = document.getElementById('edit-name').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const address = document.getElementById('edit-address').value.trim();

    try {
        await api('/api/profile', {
            method: 'PUT',
            body: JSON.stringify({ name, phone, address }),
        });
        showAlert('Profile updated', 'success');
        closeModal('edit-profile-modal');
        initProfile();
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function initDashboard() {
    try {
        const [{ user }, { stats }] = await Promise.all([
            api('/api/auth/me'),
            api('/api/user/stats'),
        ]);

        const welcome = document.getElementById('dashboard-welcome');
        const spent = document.getElementById('dash-spent');
        const tickets = document.getElementById('dash-tickets');
        const winnings = document.getElementById('dash-winnings');
        const wins = document.getElementById('dash-wins');

        if (welcome) welcome.textContent = `Welcome, ${user.name}!`;
        if (spent) spent.textContent = formatMoney(stats.total_spent);
        if (tickets) tickets.textContent = stats.total_tickets;
        if (winnings) winnings.textContent = formatMoney(stats.total_winnings);
        if (wins) wins.textContent = stats.wins;

        const searchForm = document.getElementById('dashboard-search-form');
        const searchInput = document.getElementById('dashboard-search-input');
        if (searchForm && searchInput) {
            searchForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const query = searchInput.value.trim();
                const target = query ? `browse-tickets.html?q=${encodeURIComponent(query)}` : 'browse-tickets.html';
                window.location.href = target;
            });
        }
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function initAdminDashboard() {
    try {
        const { stats } = await api('/api/admin/stats');
        const revenue = document.getElementById('admin-revenue');
        const sold = document.getElementById('admin-sold');
        const users = document.getElementById('admin-users');
        if (revenue) revenue.textContent = formatMoney(stats.revenue);
        if (sold) sold.textContent = stats.tickets_sold;
        if (users) users.textContent = stats.users;
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function loadAdminGames() {
    const tableBody = document.getElementById('tickets-table-body');
    if (!tableBody) return;

    try {
        const { games } = await api('/api/admin/games');
        adminGameRows = games;
        tableBody.innerHTML = '';

        games.forEach((game) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${game.id}</td>
                <td>${game.name}</td>
                <td>${formatMoney(game.price)}</td>
                <td>${formatMoney(game.prize_amount)}</td>
                <td>${game.drawing_date}</td>
                <td style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="btn btn-secondary" onclick="openEditTicket(${game.id})">Edit</button>
                    <button class="btn btn-danger" onclick="deleteTicket(${game.id})">Disable</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function handleAddTicket(event) {
    event.preventDefault();

    const name = document.getElementById('ticket-name').value.trim();
    const price = Number(document.getElementById('ticket-price').value);
    const prizeAmount = Number(document.getElementById('ticket-prize').value);
    const drawingDate = document.getElementById('ticket-date').value;

    if (!name || !price || !prizeAmount || !drawingDate) {
        showAlert('Please fill in all fields', 'error');
        return;
    }

    try {
        await api('/api/admin/games', {
            method: 'POST',
            body: JSON.stringify({ name, price, prizeAmount, drawingDate }),
        });

        showAlert('Ticket added successfully', 'success');
        document.getElementById('add-ticket-form').reset();
        loadAdminGames();
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function deleteTicket(id) {
    if (!confirm('Disable this ticket?')) {
        return;
    }

    try {
        await api(`/api/admin/games/${id}`, { method: 'DELETE' });
        showAlert('Ticket disabled', 'success');
        loadAdminGames();
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

function editTicket(id) {
    const ticket = adminGameRows.find((t) => t.id === id);
    if (ticket) {
        showAlert(`Editing is not enabled in this demo for ${ticket.name}`, 'success');
    }
}

function openEditTicket(id) {
    const ticket = adminGameRows.find((t) => t.id === id);
    if (!ticket) return;

    currentEditTicketId = id;
    const nameInput = document.getElementById('edit-ticket-name');
    const priceInput = document.getElementById('edit-ticket-price');
    const prizeInput = document.getElementById('edit-ticket-prize');
    const dateInput = document.getElementById('edit-ticket-date');

    if (nameInput) nameInput.value = ticket.name;
    if (priceInput) priceInput.value = ticket.price;
    if (prizeInput) prizeInput.value = ticket.prize_amount;
    if (dateInput) dateInput.value = ticket.drawing_date;

    openModal('edit-ticket-modal');
}

async function updateTicket() {
    if (!currentEditTicketId) return;

    const name = document.getElementById('edit-ticket-name').value.trim();
    const price = Number(document.getElementById('edit-ticket-price').value);
    const prizeAmount = Number(document.getElementById('edit-ticket-prize').value);
    const drawingDate = document.getElementById('edit-ticket-date').value;

    if (!name || !price || !prizeAmount || !drawingDate) {
        showAlert('Please fill in all fields', 'error');
        return;
    }

    try {
        await api(`/api/admin/games/${currentEditTicketId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, price, prizeAmount, drawingDate }),
        });

        showAlert('Ticket updated successfully', 'success');
        closeModal('edit-ticket-modal');
        loadAdminGames();
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function logout() {
    try {
        await api('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        // Ignore logout API failures in demo mode.
    } finally {
        clearAuth();
        window.location.href = 'index.html';
    }
}

function requireAuthOrRedirect(page) {
    if (page === 'index.html' || page === 'register.html') return true;
    if (!getToken()) {
        window.location.href = 'index.html';
        return false;
    }

    const user = getUser();
    const adminPage = page === 'admin-dashboard.html' || page === 'admin-tickets.html';
    if (adminPage && (!user || !user.is_admin)) {
        window.location.href = 'dashboard.html';
        return false;
    }

    return true;
}

function wireLogoutButtons() {
    const logoutLinks = Array.from(document.querySelectorAll('a')).filter((a) => a.textContent.trim().toLowerCase() === 'logout');
    logoutLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            logout();
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const page = getPageName();
    if (!requireAuthOrRedirect(page)) return;

    wireLogoutButtons();

    if (page === 'browse-tickets.html') {
        initBrowseTickets();
    }
    if (page === 'ticket-details.html') {
        initTicketDetails();
    }
    if (page === 'order-history.html') {
        initOrderHistory();
    }
    if (page === 'profile.html') {
        initProfile();
    }
    if (page === 'dashboard.html') {
        initDashboard();
    }
    if (page === 'admin-dashboard.html') {
        initAdminDashboard();
    }
    if (page === 'admin-tickets.html') {
        loadAdminGames();
    }
    if (page === 'winning-numbers.html') {
        initWinningNumbers();
    }
});
