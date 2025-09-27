const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

let instruments = [];

const fetchInstruments = async () => {
    try {
        const response = await fetch('instruments.json');
        if (!response.ok) {
            throw new Error(`Failed to load local instrument data with status ${response.status}`);
        }
        const data = await response.json();
        instruments = data.instruments || [];
    } catch (error) {
        console.error('Error fetching instruments:', error);
        searchResults.innerHTML = '<p class="text-red-500">Error fetching stock data. Please try again later.</p>';
    }
};

const renderResults = (results) => {
    if (results.length === 0) {
        searchResults.innerHTML = '<p class="text-black/60 dark:text-white/60">No results found.</p>';
        return;
    }

    const resultsHtml = results.map(instrument => `
        <div class="flex items-center gap-4">
            <div class="bg-center bg-no-repeat aspect-square bg-cover rounded-lg size-12" style='background-image: url("https://placehold.co/600x400");'></div>
            <div class="flex-1">
                <p class="text-black dark:text-white font-semibold">${instrument.instrument.symbol}</p>
                <p class="text-black/60 dark:text-white/60 text-sm">${instrument.instrument.type}</p>
            </div>
        </div>
    `).join('');

    searchResults.innerHTML = resultsHtml;
};

const handleSearch = (event) => {
    const query = event.target.value.toLowerCase();
    if (query.length < 1) {
        searchResults.innerHTML = '';
        return;
    }

    const filteredInstruments = instruments.filter(inst =>
        inst.instrument.symbol.toLowerCase().startsWith(query)
    );

    renderResults(filteredInstruments);
};

searchInput.addEventListener('input', handleSearch);

// Fetch instruments when the page loads
fetchInstruments();