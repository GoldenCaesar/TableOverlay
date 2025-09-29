// --- User-Specific API Keys ---
// These variables will hold the API keys for the current session.
// They are initialized with the placeholder values and will be updated from Firestore upon login.
let userPolygonApiKey = 'YOUR_POLYGON_API_KEY';
let userAlphaVantageApiKey = 'YOUR_ALPHA_VANTAGE_API_KEY';
let userLogoDevApiKey = 'YOUR_LOGO_DEV_API_KEY';


// --- Runtime Check for API Keys ---
// This check ensures the developer has replaced the placeholder API keys.
if (firebaseConfig.apiKey.startsWith('YOUR_')) {
    document.body.innerHTML = `
      <div style="background-color: #112111; color: #f6f8f6; font-family: 'Manrope', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; padding: 2rem; text-align: center;">
        <h1 style="font-size: 2.5rem; color: #14b814; margin-bottom: 1.5rem;">Configuration Error</h1>
        <p style="font-size: 1.2rem; margin-bottom: 1rem;">The Firebase configuration in <strong>index.html</strong> is using placeholder values.</p>
        <p style="font-size: 1rem; max-width: 600px;">Please replace the placeholder values for the <strong>firebaseConfig</strong> object with your actual credentials to run the application.</p>
      </div>
    `;
    throw new Error("Firebase is not configured. Please update the placeholder values in index.html.");
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
let db;
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

const setRateLimitedImage = async (element, ticker) => {
    if (db && firebase.auth().currentUser) {
        try {
            const doc = await db.collection('stock_history').doc(ticker).get();
            if (doc.exists && doc.data().logo) {
                element.style.backgroundImage = `url(${doc.data().logo})`;
                return;
            }
        } catch (error) {
            console.error("Error fetching cached logo:", error);
        }
    }

    try {
        const imageUrl = `https://img.logo.dev/${ticker}?token=${userLogoDevApiKey}&size=50&format=png&retina=true`;
        const response = await logoDevRateLimiter.call(() => fetch(imageUrl));
        if (!response.ok) throw new Error(`Failed to fetch logo for ${ticker}`);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result;
            element.style.backgroundImage = `url(${base64String})`;
            if (db && firebase.auth().currentUser) {
                db.collection('stock_history').doc(ticker).set({ logo: base64String }, { merge: true })
                    .catch(err => console.error("Error caching logo:", err));
            }
        };
        reader.readAsDataURL(blob);
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
        if (db && firebase.auth().currentUser) {
            db.collection('stock_history').doc(instrument.ticker).set({
                name: instrument.name,
            }, { merge: true }).catch(error => {
                console.error("Error caching stock name: ", error);
            });
        }
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
            fetch(`https://api.polygon.io/v3/reference/tickers?search=${query}&active=true&limit=10&apiKey=${userPolygonApiKey}`)
        );
        if (!response.ok) throw new Error(`API request failed: ${response.status}`);
        const data = await response.json();
        renderResults(data.results);
    } catch (error) {
        console.error('Error fetching search results:', error);
        searchResults.innerHTML = `<div class="p-4 bg-red-100 dark:bg-red-900/20 rounded-lg"><p class="text-red-700 dark:text-red-300">Error fetching data.</p></div>`;
    }
};

const updateAccountBalanceUI = (balance) => {
    const accountValueEl = document.getElementById('account-value');
    if (accountValueEl) {
        accountValueEl.textContent = `$${parseFloat(balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
};

const initializeAccountData = (balance = 10000) => {
    updateAccountBalanceUI(balance);
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
        const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${userAlphaVantageApiKey}`;
        const response = await alphaVantageRateLimiter.call(() => fetch(url));
        if (!response.ok) throw new Error(`API request failed: ${response.status}`);
        const data = await response.json();
        if (data.top_gainers || data.top_losers) {
            renderMovers(data);

            if (db && firebase.auth().currentUser) {
                const today = new Date().toISOString().split('T')[0];
                const allMovers = [...(data.top_gainers || []), ...(data.top_losers || [])];

                allMovers.forEach(async stock => {
                    const stockData = {
                        price: stock.price,
                        change_amount: stock.change_amount,
                        change_percentage: stock.change_percentage,
                        volume: stock.volume,
                    };

                    try {
                        const docRef = db.collection('stock_history').doc(stock.ticker);
                        const doc = await docRef.get();

                        let needsUpdate = true;
                        if (doc.exists) {
                            const data = doc.data();
                            if (data.daily && data.daily[today]) {
                                const existingData = data.daily[today];
                                if (
                                    existingData.price === stockData.price &&
                                    existingData.change_amount === stockData.change_amount &&
                                    existingData.change_percentage === stockData.change_percentage &&
                                    existingData.volume === stockData.volume
                                ) {
                                    needsUpdate = false;
                                }
                            }
                        }

                        if (needsUpdate) {
                            const updatePayload = {};
                            updatePayload[`daily.${today}`] = stockData;
                            await docRef.set(updatePayload, { merge: true });
                        }
                    } catch (error) {
                        console.error(`Error caching daily data for ${stock.ticker}:`, error);
                    }
                });
            }
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
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const signInButton = document.getElementById('sign-in-button');
    const signUpButton = document.getElementById('sign-up-button');
    const errorMessage = document.getElementById('error-message');
    const hamburgerMenuButton = document.getElementById('hamburger-menu-button');
    const sidebar = document.getElementById('sidebar');
    const profileButton = document.getElementById('profile-button');
    const apiKeyModal = document.getElementById('api-key-modal');
    const closeModalButton = document.getElementById('close-modal-button');
    const saveApiKeysButton = document.getElementById('save-api-keys-button');
    const polygonApiKeyInput = document.getElementById('polygon-api-key-input');
    const alphaVantageApiKeyInput = document.getElementById('alpha-vantage-api-key-input');
    const logoDevApiKeyInput = document.getElementById('logo-dev-api-key-input');
    const paperTradingButton = document.getElementById('paper-trading-button');
    const paperTradingModal = document.getElementById('paper-trading-modal');
    const closePaperTradingModalButton = document.getElementById('close-paper-trading-modal-button');
    const savePaperTradingButton = document.getElementById('save-paper-trading-button');
    const resetPaperTradingButton = document.getElementById('reset-paper-trading-button');
    const paperTradingBalanceInput = document.getElementById('paper-trading-balance-input');

    db = firebase.firestore();

    hamburgerMenuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('hidden');
    });

    profileButton.addEventListener('click', () => {
        apiKeyModal.classList.remove('hidden');
        sidebar.classList.add('hidden');
    });

    closeModalButton.addEventListener('click', () => {
        apiKeyModal.classList.add('hidden');
    });

    apiKeyModal.addEventListener('click', (e) => {
        if (e.target === apiKeyModal) {
            apiKeyModal.classList.add('hidden');
        }
    });

    paperTradingButton.addEventListener('click', () => {
        paperTradingModal.classList.remove('hidden');
        sidebar.classList.add('hidden');
    });

    closePaperTradingModalButton.addEventListener('click', () => {
        paperTradingModal.classList.add('hidden');
    });

    paperTradingModal.addEventListener('click', (e) => {
        if (e.target === paperTradingModal) {
            paperTradingModal.classList.add('hidden');
        }
    });

    resetPaperTradingButton.addEventListener('click', () => {
        console.log("Paper trading history reset is not yet implemented.");
        alert("Paper trading history reset is not yet implemented.");
    });

    document.addEventListener('click', () => {
        if (!sidebar.classList.contains('hidden')) {
            sidebar.classList.add('hidden');
        }
    });

    sidebar.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    let debounceTimer;
    searchInput.addEventListener('input', (event) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => searchStocks(event.target.value), 300);
    });

    const auth = firebase.auth();

    const displayError = (message) => {
        errorMessage.querySelector('span').textContent = message;
        errorMessage.classList.remove('hidden');
    };

    const hideError = () => {
        errorMessage.classList.add('hidden');
    };

    signUpButton.addEventListener('click', () => {
        const email = emailInput.value;
        const password = passwordInput.value;
        hideError();
        auth.createUserWithEmailAndPassword(email, password)
            .catch((error) => {
                if (error.code === 'auth/email-already-in-use') {
                    displayError('This email address is already in use. Please sign in.');
                } else {
                    displayError(error.message);
                }
                console.error("Error signing up:", error);
            });
    });

    signInButton.addEventListener('click', () => {
        const email = emailInput.value;
        const password = passwordInput.value;
        hideError();
        auth.signInWithEmailAndPassword(email, password)
            .catch((error) => {
                if (error.code === 'auth/wrong-password') {
                    displayError('Incorrect password. Please try again.');
                } else if (error.code === 'auth/user-not-found') {
                    displayError('No account found with this email. Please sign up.');
                } else {
                    displayError(error.message);
                }
                console.error("Error signing in:", error);
            });
    });

    const checkAndDisplayApiKeyError = () => {
        const postLoginErrorContainer = document.getElementById('post-login-error-container');
        if (!postLoginErrorContainer) return;

        const hasPlaceholders = userPolygonApiKey.startsWith('YOUR_') ||
                                userAlphaVantageApiKey.startsWith('YOUR_') ||
                                userLogoDevApiKey.startsWith('YOUR_');

        if (hasPlaceholders) {
            postLoginErrorContainer.classList.remove('hidden');
        } else {
            postLoginErrorContainer.classList.add('hidden');
        }
    };

    const saveApiKeys = async (user) => {
        if (!user) return;
        const apiKeys = {
            polygon: polygonApiKeyInput.value,
            alphaVantage: alphaVantageApiKeyInput.value,
            logoDev: logoDevApiKeyInput.value,
        };
        try {
            await db.collection('user_settings').doc(user.uid).set({ apiKeys }, { merge: true });
            console.log('API keys saved successfully.');
            userPolygonApiKey = apiKeys.polygon || userPolygonApiKey;
            userAlphaVantageApiKey = apiKeys.alphaVantage || userAlphaVantageApiKey;
            userLogoDevApiKey = apiKeys.logoDev || userLogoDevApiKey;
            apiKeyModal.classList.add('hidden');
            checkAndDisplayApiKeyError();
        } catch (error) {
            console.error("Error saving API keys: ", error);
            alert("Could not save API keys. Please try again.");
        }
    };

    const loadApiKeys = async (user) => {
        if (!user) return;
        try {
            const doc = await db.collection('user_settings').doc(user.uid).get();
            if (doc.exists) {
                const settings = doc.data();
                if (settings.apiKeys) {
                    userPolygonApiKey = settings.apiKeys.polygon || userPolygonApiKey;
                    userAlphaVantageApiKey = settings.apiKeys.alphaVantage || userAlphaVantageApiKey;
                    userLogoDevApiKey = settings.apiKeys.logoDev || userLogoDevApiKey;
                    polygonApiKeyInput.value = userPolygonApiKey;
                    alphaVantageApiKeyInput.value = userAlphaVantageApiKey;
                    logoDevApiKeyInput.value = userLogoDevApiKey;
                    console.log('API keys loaded successfully.');
                }
            } else {
                console.log("No custom API keys found for user. Using default placeholders.");
            }
        } catch (error) {
            console.error("Error loading API keys: ", error);
        }
    };

    const savePaperTradingBalance = async (user) => {
        if (!user) return;
        const newBalance = parseFloat(paperTradingBalanceInput.value);
        if (isNaN(newBalance) || newBalance < 0) {
            alert("Please enter a valid, non-negative number for the balance.");
            return;
        }
        if (newBalance > 10000000) {
            alert("The account balance cannot exceed $10,000,000.");
            return;
        }
        try {
            await db.collection('user_settings').doc(user.uid).set({ paperTrading: { balance: newBalance } }, { merge: true });
            console.log('Paper trading balance saved successfully.');
            updateAccountBalanceUI(newBalance);
            paperTradingModal.classList.add('hidden');
        } catch (error) {
            console.error("Error saving paper trading balance: ", error);
            alert("Could not save paper trading balance. Please try again.");
        }
    };

    const loadPaperTradingBalance = async (user) => {
        if (!user) return;
        try {
            const doc = await db.collection('user_settings').doc(user.uid).get();
            let balance = 10000;
            if (doc.exists) {
                const settings = doc.data();
                if (settings.paperTrading && typeof settings.paperTrading.balance !== 'undefined') {
                    balance = settings.paperTrading.balance;
                    console.log('Paper trading balance loaded successfully.');
                } else {
                    console.log("No custom paper trading balance found. Using default.");
                }
            }
            initializeAccountData(balance);
            paperTradingBalanceInput.value = balance;
        } catch (error) {
            console.error("Error loading paper trading balance: ", error);
            initializeAccountData();
        }
    };

    saveApiKeysButton.addEventListener('click', () => {
        const user = auth.currentUser;
        if (user) {
            saveApiKeys(user);
        } else {
            console.error("No user is signed in to save API keys.");
        }
    });

    savePaperTradingButton.addEventListener('click', () => {
        const user = auth.currentUser;
        if (user) {
            savePaperTradingBalance(user);
        } else {
            console.error("No user is signed in to save paper trading balance.");
        }
    });

    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            loginContainer.classList.add('hidden');
            appContent.classList.remove('hidden');
            await loadApiKeys(user);
            await loadPaperTradingBalance(user);
            checkAndDisplayApiKeyError();
            fetchMovers();
        } else {
            loginContainer.classList.remove('hidden');
            appContent.classList.add('hidden');
            userPolygonApiKey = 'YOUR_POLYGON_API_KEY';
            userAlphaVantageApiKey = 'YOUR_ALPHA_VANTAGE_API_KEY';
            userLogoDevApiKey = 'YOUR_LOGO_DEV_API_KEY';
        }
    });

    logoutButton.addEventListener('click', () => {
        firebase.auth().signOut().catch(error => console.error('Sign out failed:', error));
    });
});