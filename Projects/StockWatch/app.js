// IMPORTANT: In a real application, this key should be kept on a secure backend server
// and not be exposed in frontend code. This is a placeholder for demonstration.
const POLYGON_API_KEY = 'cpcNngVpT_OtlshoigLd1l1glvTzVw0f';
const ALPHA_VANTAGE_API_KEY = 'YRAPRD4NX3XJWHG1';
const LOGO_DEV_API_KEY = 'pk_VbuZVWKfReGnvXBHVuTuCg';

// --- API Rate Limiter ---
const createRateLimiter = (key, limit, interval) => {
    const getStoredData = () => {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : { calls: 0, startTime: Date.now() };
    };

    const setStoredData = (data) => {
        localStorage.setItem(key, JSON.stringify(data));
    };

    return {
        call: async (apiCall) => {
            let { calls, startTime } = getStoredData();
            const now = Date.now();

            if (now - startTime > interval) {
                startTime = now;
                calls = 0;
            }

            if (calls < limit) {
                calls++;
                setStoredData({ calls, startTime });
                return await apiCall();
            } else {
                console.warn(`Rate limit for ${key} exceeded. Waiting for the next interval.`);
                const waitTime = startTime + interval - now;
                if (waitTime > 0) {
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

                // After waiting, reset and make the call
                const newStartTime = Date.now();
                setStoredData({ calls: 1, startTime: newStartTime });
                return await apiCall();
            }
        }
    };
};

const polygonRateLimiter = createRateLimiter('polygon', 4, 60 * 1000); // 4 calls per minute
const alphaVantageRateLimiter = createRateLimiter('alphaVantage', 20, 60 * 1000); // 20 calls per minute
const logoDevRateLimiter = createRateLimiter('logoDev', 4000, 24 * 60 * 60 * 1000); // 4000 calls per day


const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

const setRateLimitedImage = async (element, ticker) => {
    try {
        const imageUrl = `https://img.logo.dev/${ticker}?token=${LOGO_DEV_API_KEY}&size=50&format=png&retina=true`;
        const response = await logoDevRateLimiter.call(() => fetch(imageUrl));
        if (!response.ok) {
            throw new Error(`Failed to fetch logo for ${ticker}`);
        }
        const blob = await response.blob();
        const objectURL = URL.createObjectURL(blob);
        element.style.backgroundImage = `url(${objectURL})`;
    } catch (error) {
        console.error(error);
        // Fallback to the placeholder if the logo fails to load
        element.style.backgroundImage = `url("https://placehold.co/600x400/112111/f6f8f6?text=${ticker}")`;
    }
};

const renderResults = (results) => {
    if (!results || results.length === 0) {
        searchResults.innerHTML = '<p class="text-black/60 dark:text-white/60">No results found.</p>';
        return;
    }

    const resultsHtml = results.map((instrument, index) => `
        <div class="flex items-center gap-4 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <div id="search-logo-${index}" class="bg-center bg-no-repeat aspect-square bg-cover rounded-lg size-12"></div>
            <div class="flex-1">
                <p class="text-black dark:text-white font-semibold">${instrument.ticker}</p>
                <p class="text-black/60 dark:text-white/60 text-sm truncate">${instrument.name}</p>
            </div>
        </div>
    `).join('');

    searchResults.innerHTML = resultsHtml;

    results.forEach((instrument, index) => {
        const logoEl = document.getElementById(`search-logo-${index}`);
        if (logoEl) {
            setRateLimitedImage(logoEl, instrument.ticker);
        }
    });
};

let debounceTimer;
const searchStocks = async (query) => {
    if (query.length < 2) {
        searchResults.innerHTML = '';
        return;
    }

    try {
        const response = await polygonRateLimiter.call(() =>
            fetch(`https://api.polygon.io/v3/reference/tickers?search=${query}&active=true&limit=10&apiKey=${POLYGON_API_KEY}`)
        );
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        const data = await response.json();
        renderResults(data.results);
    } catch (error) {
        console.error('Error fetching search results:', error);
        searchResults.innerHTML = `
            <div class="p-4 bg-red-100 dark:bg-red-900/20 rounded-lg">
                <p class="text-red-700 dark:text-red-300 font-semibold">Error Fetching Stock Data</p>
                <p class="text-red-600 dark:text-red-400 text-sm mt-1">
                    Live API calls are failing. This is expected in a local environment due to browser security policies (CORS). For this to work, the request must be proxied through a backend server.
                </p>
            </div>`;
    }
};

searchInput.addEventListener('input', (event) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        searchStocks(event.target.value);
    }, 300); // 300ms delay
});

const initializeAccountData = () => {
    const accountValueEl = document.getElementById('account-value');
    const pastYearPercentageEl = document.getElementById('past-year-percentage');

    accountValueEl.textContent = '$10,000.00';
    pastYearPercentageEl.textContent = '+0.00%';
    updateGraph();
    updateMonthLabels();
};

const updateGraph = () => {
    const graphPath = document.getElementById('graph-path');
    const graphFillPath = document.getElementById('graph-fill-path');
    if (!graphPath || !graphFillPath) return;

    const now = new Date();

    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));

    const year = now.getFullYear();
    const totalDaysInYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;

    const progress = dayOfYear / totalDaysInYear;
    const graphWidth = 472;
    const graphHeight = 150;
    const currentX = progress * graphWidth;

    // A flat line for the graph, placed in the upper half of the chart area.
    const yValue = 50;

    const linePathData = `M 0 ${yValue} L ${currentX} ${yValue}`;
    const fillPathData = `M 0 ${yValue} L ${currentX} ${yValue} V ${graphHeight} H 0 Z`;

    graphPath.setAttribute('d', linePathData);
    graphFillPath.setAttribute('d', fillPathData);
};

const updateMonthLabels = () => {
    const monthLabelsEl = document.getElementById('month-labels');
    if (!monthLabelsEl) return;

    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const labels = [];
    // The user wants the axis to end at the next month.
    let endMonth = now.getMonth() + 1; // e.g. September (8) -> endMonth = 9 (October)

    for (let i = 0; i < 6; i++) {
        // Go back 2 months at a time from the end month.
        let monthIndex = (endMonth - (i * 2));
        // Handle month index wrapping around the year
        monthIndex = (monthIndex % 12 + 12) % 12;
        labels.unshift(monthNames[monthIndex]);
    }

    monthLabelsEl.innerHTML = labels.map(label => `<p class="text-black/60 dark:text-white/60 text-xs font-semibold">${label}</p>`).join('');
};

// --- Today's Movers ---
const topGainersList = document.getElementById('top-gainers-list');
const topLosersList = document.getElementById('top-losers-list');

const renderMovers = (movers) => {
    if (!movers) return;

    const createMoverHtml = (stock, isGainer, index) => {
        const type = isGainer ? 'gainer' : 'loser';
        const changeClass = isGainer ? 'text-green-500' : 'text-red-500';
        const sign = isGainer ? '+' : '';
        return `
            <div class="flex items-center gap-4 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <div id="mover-logo-${type}-${index}" class="bg-center bg-no-repeat aspect-square bg-cover rounded-lg size-12"></div>
                <div class="flex-1">
                    <p class="text-black dark:text-white font-semibold">${stock.ticker}</p>
                    <p class="${changeClass} text-sm font-semibold">${sign}${parseFloat(stock.change_amount).toFixed(2)} (${sign}${parseFloat(stock.change_percentage).toFixed(2)}%)</p>
                </div>
            </div>
        `;
    };

    if (movers.top_gainers && movers.top_gainers.length > 0) {
        const gainers = movers.top_gainers.slice(0, 5);
        topGainersList.innerHTML = gainers.map((stock, index) => createMoverHtml(stock, true, index)).join('');
        gainers.forEach((stock, index) => {
            const logoEl = document.getElementById(`mover-logo-gainer-${index}`);
            if (logoEl) setRateLimitedImage(logoEl, stock.ticker);
        });
    } else {
        topGainersList.innerHTML = '<p class="text-black/60 dark:text-white/60">No top gainers found.</p>';
    }

    if (movers.top_losers && movers.top_losers.length > 0) {
        const losers = movers.top_losers.slice(0, 5);
        topLosersList.innerHTML = losers.map((stock, index) => createMoverHtml(stock, false, index)).join('');
        losers.forEach((stock, index) => {
            const logoEl = document.getElementById(`mover-logo-loser-${index}`);
            if (logoEl) setRateLimitedImage(logoEl, stock.ticker);
        });
    } else {
        topLosersList.innerHTML = '<p class="text-black/60 dark:text-white/60">No top losers found.</p>';
    }
};

const fetchMovers = async () => {
    try {
        const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${ALPHA_VANTAGE_API_KEY}`;
        const response = await alphaVantageRateLimiter.call(() => fetch(url, { headers: { 'User-Agent': 'request' } }));
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        const data = await response.json();

        if (data.top_gainers || data.top_losers) {
            renderMovers(data);
        } else {
            console.error("Could not parse movers data:", data);
            topGainersList.innerHTML = '<p class="text-red-500">Could not retrieve movers data.</p>';
            topLosersList.innerHTML = '<p class="text-red-500">Could not retrieve movers data.</p>';
        }

    } catch (error) {
        console.error('Error fetching movers:', error);
        topGainersList.innerHTML = `<p class="text-red-500">Error fetching data. Check console.</p>`;
        topLosersList.innerHTML = `<p class="text-red-500">Error fetching data. Check console.</p>`;
    }
};


const loginContainer = document.getElementById('login-container');
const appContent = document.getElementById('app-content');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');

// --- Firebase Auth ---
window.onAuthStateChanged(window.auth, user => {
    if (user) {
        // User is signed in
        loginContainer.classList.add('hidden');
        appContent.classList.remove('hidden');
        initializeAccountData();
        fetchMovers();
    } else {
        // User is signed out
        loginContainer.classList.remove('hidden');
        appContent.classList.add('hidden');
    }
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;

    window.signInWithEmailAndPassword(window.auth, email, password)
        .catch((error) => {
            console.error('Login failed:', error);
            alert('Login failed. Please check your email and password.');
        });
});

logoutButton.addEventListener('click', () => {
    window.signOut(window.auth).catch((error) => {
        console.error('Sign out failed:', error);
    });
});