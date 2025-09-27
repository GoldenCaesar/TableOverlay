// --- API Keys (Replace with your actual keys) ---
// IMPORTANT: In a real application, these keys should be managed securely and not hardcoded.
// For this project, replace the placeholder values with your actual API keys.
const POLYGON_API_KEY = 'YOUR_POLYGON_API_KEY';
const ALPHA_VANTAGE_API_KEY = 'YOUR_ALPHA_VANTAGE_API_KEY';
const LOGO_DEV_API_KEY = 'YOUR_LOGO_DEV_API_KEY';


// --- Runtime Check for API Keys ---
// This check ensures the developer has replaced the placeholder API keys.
if (POLYGON_API_KEY.startsWith('YOUR_') || ALPHA_VANTAGE_API_KEY.startsWith('YOUR_') || LOGO_DEV_API_KEY.startsWith('YOUR_') || firebaseConfig.apiKey.startsWith('YOUR_')) {
    document.body.innerHTML = `
      <div style="background-color: #112111; color: #f6f8f6; font-family: 'Manrope', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; padding: 2rem; text-align: center;">
        <h1 style="font-size: 2.5rem; color: #14b814; margin-bottom: 1.5rem;">Configuration Error</h1>
        <p style="font-size: 1.2rem; margin-bottom: 1rem;">One or more API keys in <strong>app.js</strong> or <strong>index.html</strong> are using placeholder values.</p>
        <p style="font-size: 1rem; max-width: 600px;">Please replace the placeholder values for <strong>POLYGON_API_KEY</strong>, <strong>ALPHA_VANTAGE_API_KEY</strong>, <strong>LOGO_DEV_API_KEY</strong>, and the <strong>firebaseConfig</strong> object with your actual credentials to run the application.</p>
      </div>
    `;
    throw new Error("API keys are not configured. Please update the placeholder values.");
}


// --- API Rate Limiter ---
const createRateLimiter = (key, limit, interval) => {
    const getStoredData = () => {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : { calls: 0, startTime: Date.now() };
    };
    const setStoredData = (data) => localStorage.setItem(key, JSON.stringify(data));

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
                await new Promise(resolve => setTimeout(resolve, (startTime + interval) - now));
                setStoredData({ calls: 1, startTime: Date.now() });
                return await apiCall();
            }
        }
    };
};

const polygonRateLimiter = createRateLimiter('polygon', 4, 60 * 1000);
const alphaVantageRateLimiter = createRateLimiter('alphaVantage', 20, 60 * 1000);
const logoDevRateLimiter = createRateLimiter('logoDev', 4000, 24 * 60 * 60 * 1000);


// --- Core App Logic ---
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

const setRateLimitedImage = async (element, ticker) => {
    try {
        const imageUrl = `https://img.logo.dev/${ticker}?token=${LOGO_DEV_API_KEY}&size=50&format=png&retina=true`;
        const response = await logoDevRateLimiter.call(() => fetch(imageUrl));
        if (!response.ok) throw new Error(`Failed to fetch logo for ${ticker}`);
        const blob = await response.blob();
        element.style.backgroundImage = `url(${URL.createObjectURL(blob)})`;
    } catch (error) {
        console.error(error);
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
        if (logoEl) setRateLimitedImage(logoEl, instrument.ticker);
    });
};

const searchStocks = async (query) => {
    if (query.length < 2) {
        searchResults.innerHTML = '';
        return;
    }
    try {
        const response = await polygonRateLimiter.call(() =>
            fetch(`https://api.polygon.io/v3/reference/tickers?search=${query}&active=true&limit=10&apiKey=${POLYGON_API_KEY}`)
        );
        if (!response.ok) throw new Error(`API request failed: ${response.status}`);
        const data = await response.json();
        renderResults(data.results);
    } catch (error) {
        console.error('Error fetching search results:', error);
        searchResults.innerHTML = `<div class="p-4 bg-red-100 dark:bg-red-900/20 rounded-lg"><p class="text-red-700 dark:text-red-300">Error fetching data.</p></div>`;
    }
};

const initializeAccountData = () => {
    document.getElementById('account-value').textContent = '$10,000.00';
    document.getElementById('past-year-percentage').textContent = '+0.00%';
    updateGraph();
    updateMonthLabels();
};

const updateGraph = () => {
    const graphPath = document.getElementById('graph-path');
    const graphFillPath = document.getElementById('graph-fill-path');
    if (!graphPath || !graphFillPath) return;
    const yValue = 50;
    graphPath.setAttribute('d', `M 0 ${yValue} L 472 ${yValue}`);
    graphFillPath.setAttribute('d', `M 0 ${yValue} L 472 ${yValue} V 150 H 0 Z`);
};

const updateMonthLabels = () => {
    const monthLabelsEl = document.getElementById('month-labels');
    if (!monthLabelsEl) return;
    const monthNames = ["Jan", "Mar", "May", "Jul", "Sep", "Nov"];
    monthLabelsEl.innerHTML = monthNames.map(label => `<p class="text-black/60 dark:text-white/60 text-xs font-semibold">${label}</p>`).join('');
};

const renderMovers = (movers) => {
    const topGainersList = document.getElementById('top-gainers-list');
    const topLosersList = document.getElementById('top-losers-list');
    if (!movers || !topGainersList || !topLosersList) return;

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

    topGainersList.innerHTML = movers.top_gainers?.slice(0, 5).map((s, i) => createMoverHtml(s, true, i)).join('') || '<p>No gainers found.</p>';
    movers.top_gainers?.slice(0, 5).forEach((s, i) => setRateLimitedImage(document.getElementById(`mover-logo-gainer-${i}`), s.ticker));

    topLosersList.innerHTML = movers.top_losers?.slice(0, 5).map((s, i) => createMoverHtml(s, false, i)).join('') || '<p>No losers found.</p>';
    movers.top_losers?.slice(0, 5).forEach((s, i) => setRateLimitedImage(document.getElementById(`mover-logo-loser-${i}`), s.ticker));
};

const fetchMovers = async () => {
    try {
        const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${ALPHA_VANTAGE_API_KEY}`;
        const response = await alphaVantageRateLimiter.call(() => fetch(url));
        if (!response.ok) throw new Error(`API request failed: ${response.status}`);
        const data = await response.json();
        if (data.top_gainers || data.top_losers) {
            renderMovers(data);
        } else {
            throw new Error("Could not parse movers data");
        }
    } catch (error) {
        console.error('Error fetching movers:', error);
        document.getElementById('top-gainers-list').innerHTML = `<p class="text-red-500">Could not retrieve movers.</p>`;
        document.getElementById('top-losers-list').innerHTML = `<p class="text-red-500">Could not retrieve movers.</p>`;
    }
};

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const loginContainer = document.getElementById('login-container');
    const appContent = document.getElementById('app-content');
    const logoutButton = document.getElementById('logout-button');

    let debounceTimer;
    searchInput.addEventListener('input', (event) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => searchStocks(event.target.value), 300);
    });

    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            loginContainer.classList.add('hidden');
            appContent.classList.remove('hidden');
            initializeAccountData();
            fetchMovers();
        } else {
            loginContainer.classList.remove('hidden');
            appContent.classList.add('hidden');
            ui.start('#firebaseui-auth-container', uiConfig);
        }
    });

    logoutButton.addEventListener('click', () => {
        firebase.auth().signOut().catch(error => console.error('Sign out failed:', error));
    });
});