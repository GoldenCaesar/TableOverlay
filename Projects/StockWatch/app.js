// IMPORTANT: In a real application, this key should be kept on a secure backend server
// and not be exposed in frontend code. This is a placeholder for demonstration.
const API_KEY = 'YOUR_POLYGON_API_KEY';

const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

const renderResults = (results) => {
    if (!results || results.length === 0) {
        searchResults.innerHTML = '<p class="text-black/60 dark:text-white/60">No results found.</p>';
        return;
    }

    const resultsHtml = results.map(instrument => `
        <div class="flex items-center gap-4 p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <div class="bg-center bg-no-repeat aspect-square bg-cover rounded-lg size-12" style='background-image: url("https://placehold.co/600x400/112111/f6f8f6?text=${instrument.ticker}");'></div>
            <div class="flex-1">
                <p class="text-black dark:text-white font-semibold">${instrument.ticker}</p>
                <p class="text-black/60 dark:text-white/60 text-sm truncate">${instrument.name}</p>
            </div>
        </div>
    `).join('');

    searchResults.innerHTML = resultsHtml;
};

let debounceTimer;
const searchStocks = async (query) => {
    if (query.length < 2) {
        searchResults.innerHTML = '';
        return;
    }

    try {
        const response = await fetch(`https://api.polygon.io/v3/reference/tickers?search=${query}&active=true&limit=10&apiKey=${API_KEY}`);
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

document.addEventListener('DOMContentLoaded', () => {
    initializeAccountData();
});