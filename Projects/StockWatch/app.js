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