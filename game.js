// DOM Elements
const canvas = document.getElementById('player-canvas');
const ctx = canvas.getContext('2d');
const addButton = document.getElementById('add-button');
const removeButton = document.getElementById('remove-button');
const startButton = document.getElementById('start-button');
const nextButton = document.getElementById('next-button');
const messageBox = document.getElementById('message-box');
const speedUpgradeButton = document.getElementById('speed-upgrade-button');
const slowUpgradeButton = document.getElementById('slow-upgrade-button');
const winningNumberUpgradeButton = document.getElementById('winning-number-upgrade-button');
const luckyChanceUpgradeButton = document.getElementById('lucky-chance-upgrade-button');
const inventoryUpgradeButton = document.getElementById('inventory-upgrade-button');
const playerSelectorContainer = document.getElementById('player-selector');

// --- CONTROLS ---

// ** Shared Constants **
const colors = ['#6a82fb', '#ff6b6b', '#ffd166', '#06d6a0', '#118ab2', '#ef476f'];
const playerSize = 50;
const defaultWinningThreshold = 20;
const defaultLuckyChance = 0;
const defaultMaxFish = 20;

// ** Ball Game Constants **
const BALL_GAME_ROLL_THRESHOLD = 15;
const BALL_GAME_PROJECTILE_HEALTH = 20;
const BALL_GAME_PROJECTILE_SCORE = 20;
const BALL_GAME_PROJECTILE_RADIUS = 10;
const DEFAULT_PROJECTILE_SPEED = 0.0002;
const MIN_PROJECTILE_SPEED = 0.00005;
const projectileRadius = 3; // a.k.a. small projectile radius

// ** Farming Game Constants **
const FARMING_GAME_WIN_SCORE = 10;
const farmedCircleRadius = 10;

// ** Fishing Game Constants **
const FISHERMAN_SPEED = 0.0005;
const fishermanRadius = 15;
const FISHING_GAME_ROLL_THRESHOLD = 15;
const FISHING_GAME_FISH_SCORE = 10;
const FISHING_GAME_DELIVERY_COUNT = 20;

// ** Shop Constants **
const SHOP_SPEED_UPGRADE_COST = 10;
const SHOP_SPEED_UPGRADE_BOOST = 0.00005;
const SHOP_SLOW_UPGRADE_COST = 10;
const SHOP_SLOW_UPGRADE_SLOW = 0.00005;
const SHOP_WINNING_NUMBER_UPGRADE_COST = 1000;
const SHOP_LUCKY_CHANCE_UPGRADE_COST = 100;
const SHOP_INVENTORY_UPGRADE_COST = 10;


// --- GAME STATE ---
let players = [];
let projectiles = [];
let farmedCircles = [];
let fishermen = [];
let fish = [];
let projectileQueue = [];
let playerCounter = 1;
let isAddingPlayer = false;
let isRemovingPlayer = false;
let isGameRunning = false;
const gameModes = ['ball', 'farming', 'fishing'];
let currentModeIndex = 0;
let gameLoopInterval;
let gameTurnInterval;
let messageTimeout;
let selectedForUpgrade = 'all';


// --- CORE FUNCTIONS ---
const resizeCanvas = () => {
    const container = canvas.parentElement;
    canvas.width = container.offsetWidth;
    canvas.height = window.innerHeight - document.getElementById('controls').offsetHeight - document.getElementById('shop-container').offsetHeight - 80;
    draw();
};

const showMessage = (text, type = 'info') => {
    clearTimeout(messageTimeout);
    messageBox.textContent = text;
    messageBox.className = 'show';
    if (type === 'error') messageBox.style.backgroundColor = 'rgba(239, 68, 68, 0.9)';
    else if (type === 'success') messageBox.style.backgroundColor = 'rgba(34, 197, 94, 0.9)';
    else messageBox.style.backgroundColor = 'rgba(46, 46, 74, 0.9)';
    messageTimeout = setTimeout(() => { messageBox.className = ''; }, 2000);
};

const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set shadow for all elements
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;

    // Draw Players
    players.forEach(player => {
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, playerSize, playerSize);

        // Draw Player Name
        ctx.fillStyle = 'black';
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(player.name, player.x + playerSize / 2, player.y + playerSize / 2 - 18);

        // Draw Last Roll in corner
        if (player.lastRoll > 0) {
                    ctx.font = 'bold 12px Inter';
                    ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
                    ctx.fillText(player.lastRoll, player.x + playerSize - 4, player.y + 4);
        }

        if (isGameRunning || player.score > 0 || player.totalXp > 0) {
            ctx.font = 'bold 12px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Draw Money
            ctx.fillText(`💰${player.score}`, player.x + playerSize / 2, player.y + playerSize / 2);

            // Draw Level
            const { level, progress } = calculateLevel(player.totalXp);
            ctx.fillText(`⭐${level} (${progress}%)`, player.x + playerSize / 2, player.y + playerSize / 2 + 15);
        }
    });
    // Draw game objects
    projectiles.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill(); });
    farmedCircles.forEach(c => { ctx.beginPath(); ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2); ctx.fillStyle = c.color; ctx.fill(); });
    fishermen.forEach(f => { ctx.beginPath(); ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2); ctx.fillStyle = f.color; ctx.fill(); });
    fish.forEach(f => { ctx.beginPath(); ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2); ctx.fillStyle = f.color; ctx.fill(); });

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
};

// --- Player Management ---
const getClosestEdgePoint = (x, y) => { /* ... (logic unchanged) ... */ };
const handleCanvasClick = (event) => { /* ... (logic unchanged) ... */ };
const getClosestEdgePoint_full = (x, y) => {
    const distances = { top: y, bottom: canvas.height - y, left: x, right: canvas.width - x };
    const minDistance = Math.min(...Object.values(distances));
    let edgeX = x, edgeY = y;
    if (minDistance === distances.top) edgeY = 0; else if (minDistance === distances.bottom) edgeY = canvas.height - playerSize;
    else if (minDistance === distances.left) edgeX = 0; else if (minDistance === distances.right) edgeX = canvas.width - playerSize;
    return { x: Math.max(0, Math.min(edgeX, canvas.width - playerSize)), y: Math.max(0, Math.min(edgeY, canvas.height - playerSize)) };
};
const handleCanvasClick_full = (event) => {
    if (isGameRunning) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left, clickY = event.clientY - rect.top;
    if (isAddingPlayer) {
        const { x, y } = getClosestEdgePoint_full(clickX, clickY);
        players.push({ id: Date.now(), name: `Player ${playerCounter}`, color: colors[(playerCounter - 1) % colors.length], x, y, score: 0, lastRoll: 0, speed: DEFAULT_PROJECTILE_SPEED, winningThreshold: defaultWinningThreshold, luckyChance: defaultLuckyChance, maxFish: defaultMaxFish, totalXp: 0 });
        playerCounter++; isAddingPlayer = false; addButton.classList.remove('active');
        showMessage(`Added Player ${playerCounter-1}!`, 'success'); draw(); renderShopSelector();
    } else if (isRemovingPlayer) {
        const pIndex = players.findIndex(p => clickX > p.x && clickX < p.x + playerSize && clickY > p.y && clickY < p.y + playerSize);
        if (pIndex !== -1) {
            const removedName = players[pIndex].name; players.splice(pIndex, 1);
            players.forEach((p, i) => { p.name = `Player ${i + 1}`; }); playerCounter = players.length + 1;
            showMessage(`Removed ${removedName}.`, 'info'); draw(); renderShopSelector();
        } else { showMessage('No player found.', 'error'); }
        isRemovingPlayer = false; removeButton.classList.remove('active');
    }
};

// --- Shared Logic ---
const generateRandomPath = (start, end) => ({ start, control: { x: (start.x + end.x) / 2 + (Math.random() - 0.5) * canvas.width, y: (start.y + end.y) / 2 + (Math.random() - 0.5) * canvas.height }, end });
const getPointOnBezierCurve = (p, t) => ({ x: (1 - t) ** 2 * p.start.x + 2 * (1 - t) * t * p.control.x + t ** 2 * p.end.x, y: (1 - t) ** 2 * p.start.y + 2 * (1 - t) * t * p.control.y + t ** 2 * p.end.y });
const addScore = (player, amount) => {
    if (!player) return;
    player.score += amount;
    player.totalXp += amount;
};
const calculateLevel = (xp) => {
    let level = 1;
    let xpForNextLevel = 1000;
    let remainingXp = xp;

    while (remainingXp >= xpForNextLevel) {
        remainingXp -= xpForNextLevel;
        level++;
        xpForNextLevel *= 1.2;
    }

    const progress = (remainingXp / xpForNextLevel) * 100;
    return { level, progress: Math.floor(progress) };
};

// --- Ball Game Logic (Unchanged, collapsed for brevity) ---
const generateProjectiles = () => { /* ... */ };
const checkCollisions = () => { /* ... */ };
const ballGameLoop = () => { /* ... */ };
const generateProjectiles_full = () => {
    if (players.length < 2) { stopGame(); return; }
    players.forEach(p1 => {
        const enemies = players.filter(p2 => p2.id !== p1.id); if (enemies.length === 0) return;
        const roll = Math.floor(Math.random() * 20) + 1; p1.lastRoll = roll;
        setTimeout(() => showMessage(`${p1.name} rolls a ${roll}!`), players.indexOf(p1) * 100);

                if (roll >= BALL_GAME_ROLL_THRESHOLD) {
            const enemy = enemies[Math.floor(Math.random() * enemies.length)];
            const path = generateRandomPath({ x: p1.x + playerSize / 2, y: p1.y + playerSize / 2 }, { x: enemy.x + playerSize / 2, y: enemy.y + playerSize / 2 });
            projectileQueue.push({
                color: p1.color, sourcePlayerId: p1.id, path, speed: p1.speed,
                        isLarge: true, health: BALL_GAME_PROJECTILE_HEALTH, scoreValue: BALL_GAME_PROJECTILE_SCORE, radius: BALL_GAME_PROJECTILE_RADIUS
            });
        } else {
            let assignments = new Array(enemies.length).fill(0); for (let i = 0; i < roll; i++) assignments[i % enemies.length]++;
            enemies.forEach((enemy, i) => {
                const path = generateRandomPath({ x: p1.x + playerSize / 2, y: p1.y + playerSize / 2 }, { x: enemy.x + playerSize / 2, y: enemy.y + playerSize / 2 });
                for (let j = 0; j < assignments[i]; j++) {
                    projectileQueue.push({
                        color: p1.color, sourcePlayerId: p1.id, path, speed: p1.speed,
                        isLarge: false, health: 1, scoreValue: 1, radius: projectileRadius
                    });
                }
            });
        }
    });
};
const checkCollisions_full = () => {
    let toRemove = new Set();
    let projectilesToDamage = new Map();

    projectiles.forEach(p => {
        if (toRemove.has(p.id)) return;
        players.forEach(pl => {
            if (p.sourcePlayerId !== pl.id && p.x > pl.x && p.x < pl.x + playerSize && p.y > pl.y && p.y < pl.y + playerSize) {
                toRemove.add(p.id);
                const source = players.find(sp => sp.id === p.sourcePlayerId);
                addScore(source, p.scoreValue || 1);
            }
        });
    });

    for (let i = 0; i < projectiles.length; i++) {
        for (let j = i + 1; j < projectiles.length; j++) {
            const p1 = projectiles[i];
            const p2 = projectiles[j];
            if (p1.sourcePlayerId === p2.sourcePlayerId || toRemove.has(p1.id) || toRemove.has(p2.id)) continue;

            const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            if (dist < (p1.radius || projectileRadius) + (p2.radius || projectileRadius)) {
                if (p1.isLarge && !p2.isLarge) {
                    toRemove.add(p2.id);
                    projectilesToDamage.set(p1.id, (projectilesToDamage.get(p1.id) || 0) + 1);
                } else if (!p1.isLarge && p2.isLarge) {
                    toRemove.add(p1.id);
                    projectilesToDamage.set(p2.id, (projectilesToDamage.get(p2.id) || 0) + 1);
                } else if (!p1.isLarge && !p2.isLarge) {
                    toRemove.add(p1.id);
                    toRemove.add(p2.id);
                } else if (p1.isLarge && p2.isLarge) {
                    projectilesToDamage.set(p1.id, (projectilesToDamage.get(p1.id) || 0) + 10);
                    projectilesToDamage.set(p2.id, (projectilesToDamage.get(p2.id) || 0) + 10);
                }
            }
        }
    }

    projectilesToDamage.forEach((damage, id) => {
        const p = projectiles.find(proj => proj.id === id);
        if (p) {
            p.health -= damage;
            if (p.health <= 0) toRemove.add(id);
        }
    });

    projectiles = projectiles.filter(p => !toRemove.has(p.id));
};
const ballGameLoop_full = () => {
    if (projectileQueue.length > 0) {
        const pInfo = projectileQueue.shift();
        projectiles.push({ id: Date.now() + Math.random(), ...pInfo, x: pInfo.path.start.x, y: pInfo.path.start.y, progress: 0 });
    }
    projectiles.forEach(p => { const newPos = getPointOnBezierCurve(p.path, p.progress += p.speed); p.x = newPos.x; p.y = newPos.y; });
    projectiles = projectiles.filter(p => p.progress < 1);
    checkCollisions_full();
};

// --- Farming & Fishing Shared Spawn Logic ---
const findOpenPosition = (owner, newRadius, existingObjects) => {
    let distance = (owner.size || playerSize) / 2 + newRadius;
    let angle = Math.random() * Math.PI * 2;
    const ownerCenter = { x: owner.x + (owner.size || playerSize) / 2, y: owner.y + (owner.size || playerSize) / 2 };

    for (let i = 0; i < 300; i++) { // Increased iterations for denser spiral
        const potX = ownerCenter.x + Math.cos(angle) * distance;
        const potY = ownerCenter.y + Math.sin(angle) * distance;

        // Check bounds first
        if (potX - newRadius < 0 || potX + newRadius > canvas.width || potY - newRadius < 0 || potY + newRadius > canvas.height) {
            angle += 0.2; // Tighter angle step
            if (i > 0 && i % 100 === 0) distance += newRadius * 0.5; // Slower distance increase
            continue;
        }

        const potentialCircle = { x: potX, y: potY, radius: newRadius };
        let isOverlapping = false;
        for (const obj of existingObjects) {
            // Check for overlap with existing objects
            if (Math.hypot(obj.x - potX, obj.y - potY) < obj.radius + newRadius) {
                isOverlapping = true;
                break;
            }
        }

        if (!isOverlapping) {
            return potentialCircle; // Found a spot
        }

        angle += 0.2; // Tighter angle step
        if (i > 0 && i % 100 === 0) {
            distance += newRadius * 0.5; // Slower distance increase
        }
    }
    return null; // No position found
};

// --- Farming Game Logic ---
const addFarmedCircle = (player) => {
    const pos = findOpenPosition(player, farmedCircleRadius, farmedCircles);
    if (pos) farmedCircles.push({ ...pos, color: player.color, ownerId: player.id });
    else showMessage(`${player.name} is out of space!`, 'error');
};
const farmingTurn = () => {
    players.forEach((player, index) => {
        setTimeout(() => {
            const roll = Math.floor(Math.random() * 20) + 1;
            player.lastRoll = roll;
            showMessage(`${player.name} rolled a ${roll}.`);
            if (roll >= player.winningThreshold) {
                setTimeout(() => {
                            addScore(player, FARMING_GAME_WIN_SCORE); addFarmedCircle(player);
                            showMessage(`${player.name} wins a circle! +${FARMING_GAME_WIN_SCORE} points.`, 'success');
                    if (Math.random() * 100 < player.luckyChance) {
                        setTimeout(() => { addFarmedCircle(player); showMessage(`${player.name} gets a lucky extra circle!`, 'success'); draw(); }, 250);
                    }
                    draw();
                }, 500);
            }
            draw();
        }, index * 1000);
    });
};

// --- NEW: Fishing Game Logic ---
const addFish = (fisherman) => {
    const ownerFish = fish.filter(f => f.ownerId === fisherman.ownerId);
    const pos = findOpenPosition({ ...fisherman, size: fisherman.radius * 2 }, projectileRadius, ownerFish);
    if (pos) {
        // Add targetEnemyId for future delivery assignment and fix missing radius
        fish.push({ id: Date.now() + Math.random(), ...pos, radius: projectileRadius, color: fisherman.color, ownerId: fisherman.ownerId, targetEnemyId: null });
    } else {
        showMessage(`Fisherman for ${players.find(p=>p.id===fisherman.ownerId).name} is out of space!`, 'error');
    }
};

const startDelivery = (fisherman) => {
    const enemies = players.filter(p => p.id !== fisherman.ownerId);
    const ownerName = players.find(p => p.id === fisherman.ownerId).name;

    if (enemies.length === 0) {
        showMessage(`No one for ${ownerName} to deliver to! Fish reset.`, 'info');
        fish = fish.filter(f => f.ownerId !== fisherman.ownerId); // Clear this fisherman's fish
        fisherman.fishCount = 0;
        return;
    }

    // Get the 20 (or more) fish for this fisherman
            const fishermanFish = fish.filter(f => f.ownerId === fisherman.ownerId && f.targetEnemyId === null).slice(0, FISHING_GAME_DELIVERY_COUNT);

    // Assign each fish to an enemy, dividing them as equally as possible
    fishermanFish.forEach((f, index) => {
        const enemyForThisFish = enemies[index % enemies.length];
        f.targetEnemyId = enemyForThisFish.id;
    });

    fisherman.state = 'delivering';
    fisherman.deliveryEnemies = enemies;
    fisherman.currentEnemyIndex = 0;

    // Start path to the first enemy
    const firstEnemy = enemies[0];
    const targetCenter = { x: firstEnemy.x + playerSize / 2, y: firstEnemy.y + playerSize / 2 };
    fisherman.path = generateRandomPath({ x: fisherman.x, y: fisherman.y }, targetCenter);
    fisherman.progress = 0;

    showMessage(`${ownerName}'s fisherman begins its delivery run!`, 'success');
};

const fishingTurn = () => {
    players.forEach((player, index) => {
        const fisherman = fishermen.find(f => f.ownerId === player.id);
        // Check new state property to ensure fisherman is available
        if (!fisherman || fisherman.state !== 'fishing') return;

        setTimeout(() => {
            const roll = Math.floor(Math.random() * 20) + 1;
            player.lastRoll = roll;
            showMessage(`${player.name} rolled a ${roll}.`);
                    if (roll >= FISHING_GAME_ROLL_THRESHOLD) {
                setTimeout(() => {
                    addFish(fisherman);
                    fisherman.fishCount++;
                    showMessage(`${player.name} caught a fish! (${fisherman.fishCount}/${player.maxFish})`, 'success');
                    if (fisherman.fishCount >= player.maxFish) {
                        showMessage(`${player.name}'s fisherman is preparing to deliver fish!`, 'info');
                        startDelivery(fisherman);
                    }
                    draw();
                }, 500);
            }
            draw();
        }, index * 1000);
    });
};

const fishingGameLoop = () => {
    // Handle fisherman movement and state changes
    fishermen.forEach(f => {
        // State: delivering or returning (path-based movement)
        if (f.state === 'delivering' || f.state === 'returning') {
            f.progress += FISHERMAN_SPEED;
            const newPos = getPointOnBezierCurve(f.path, f.progress);
            f.x = newPos.x;
            f.y = newPos.y;

            if (f.progress >= 1) {
                if (f.state === 'delivering') {
                    // Reached an enemy, now wait for fish to arrive
                    f.state = 'awaiting_delivery';
                    const enemyName = players.find(p => p.id === f.deliveryEnemies[f.currentEnemyIndex].id).name;
                    showMessage(`Fisherman has reached ${enemyName}. Fish are incoming!`, 'info');
                } else { // state === 'returning'
                    // Returned home, check for next enemy
                    f.currentEnemyIndex++;
                    const ownerName = players.find(p => p.id === f.ownerId).name;
                    if (f.currentEnemyIndex < f.deliveryEnemies.length) {
                        f.state = 'delivering';
                        const nextEnemy = f.deliveryEnemies[f.currentEnemyIndex];
                        const targetCenter = { x: nextEnemy.x + playerSize / 2, y: nextEnemy.y + playerSize / 2 };
                        f.path = generateRandomPath({ x: f.x, y: f.y }, targetCenter);
                        f.progress = 0;
                    } else {
                        showMessage(`${ownerName}'s fisherman has completed its run!`, 'success');
                        f.state = 'fishing';
                        f.fishCount = 0;
                        f.deliveryEnemies = [];
                        f.currentEnemyIndex = -1;
                        f.path = null;
                        f.progress = 0;
                    }
                }
            }
        }
        // State: awaiting delivery (waiting for fish to hit the target)
        else if (f.state === 'awaiting_delivery') {
            const currentTargetId = f.deliveryEnemies[f.currentEnemyIndex].id;
            const fishRemaining = fish.some(fishie => fishie.targetEnemyId === currentTargetId);

            if (!fishRemaining) {
                // All fish for this target are delivered, time to go home
                f.state = 'returning';
                f.path = generateRandomPath({ x: f.x, y: f.y }, { x: f.homeX, y: f.homeY });
                f.progress = 0;
                const ownerName = players.find(p => p.id === f.ownerId).name;
                showMessage(`${ownerName}'s fisherman is returning home.`, 'info');
            }
        }
    });

    // Handle fish movement and scoring
    let fishToRemove = new Set();
    fish.forEach(f => {
        if (f.targetEnemyId) {
            const fisherman = fishermen.find(fm => fm.ownerId === f.ownerId);
            if (!fisherman || fisherman.currentEnemyIndex === -1) return;

            const currentTargetEnemy = fisherman.deliveryEnemies[fisherman.currentEnemyIndex];
            if (!currentTargetEnemy) return;

            // Fish movement logic
            if (f.targetEnemyId === currentTargetEnemy.id) {
                let targetPos = { x: fisherman.x, y: fisherman.y };
                let speed = 0.08;

                // If fisherman is waiting, fish should target the enemy square directly
                if (fisherman.state === 'awaiting_delivery') {
                    targetPos = { x: currentTargetEnemy.x + playerSize / 2, y: currentTargetEnemy.y + playerSize / 2 };
                    speed = 0.1; // Move a bit faster to the final target
                }

                const dx = targetPos.x - f.x;
                const dy = targetPos.y - f.y;
                const distance = Math.hypot(dx, dy);

                // Move towards the target
                if (distance > 1) { // Stop when very close
                     // Don't get too close when following fisherman
                    if (fisherman.state !== 'awaiting_delivery' && distance < fisherman.radius * 2.5) {
                        // Don't move if too close while following
                    } else {
                        f.x += dx * speed;
                        f.y += dy * speed;
                    }
                }

                // Check for collision with the target player
                if (f.x > currentTargetEnemy.x && f.x < currentTargetEnemy.x + playerSize &&
                    f.y > currentTargetEnemy.y && f.y < currentTargetEnemy.y + playerSize)
                {
                    const owner = players.find(p => p.id === f.ownerId);
                    if (owner) {
                                addScore(owner, FISHING_GAME_FISH_SCORE);
                                showMessage(`${owner.name} scored! +${FISHING_GAME_FISH_SCORE} points.`, 'success');
                    }
                    fishToRemove.add(f.id);
                }
            }
        }
    });

    if (fishToRemove.size > 0) {
        fish = fish.filter(f => !fishToRemove.has(f.id));
    }
};

// --- Main Game Control ---
const setupBallGame = () => { /* ... */ };
const setupFarmingGame = () => { /* ... */ };
const setupFishingGame = () => {
    document.title = 'Fishing Game';
    showMessage('Fishing Mode starting...', 'success');
    fishermen = [];
    fish = [];
    players.forEach(player => {
        const pos = findOpenPosition(player, fishermanRadius, fishermen);
        if (pos) {
            // Add new state properties for the fisherman
            fishermen.push({
                ...pos,
                id: Date.now() + player.id,
                ownerId: player.id,
                radius: fishermanRadius,
                color: player.color,
                fishCount: 0,
                state: 'fishing', // 'fishing', 'delivering', 'returning'
                homeX: pos.x,
                homeY: pos.y,
                path: null,
                progress: 0,
                deliveryEnemies: [],
                currentEnemyIndex: -1
            });
        }
    });
    gameTurnInterval = setInterval(fishingTurn, 1000);
    gameLoopInterval = setInterval(() => { fishingGameLoop(); ballGameLoop_full(); draw(); }, 1000 / 60);
    fishingTurn();
    draw();
};
const setupBallGame_full = () => {
    document.title = 'Ball Game'; showMessage('Ball Game starting...');
    gameLoopInterval = setInterval(() => { ballGameLoop_full(); draw(); }, 1000 / 60);
    generateProjectiles_full(); gameTurnInterval = setInterval(generateProjectiles_full, 10000);
};
const setupFarmingGame_full = () => {
    document.title = 'Farming Game'; showMessage('Farming Mode starting...', 'success');
    farmedCircles = []; players.forEach(addFarmedCircle);
    gameTurnInterval = setInterval(farmingTurn, 10000); farmingTurn(); draw();
};

const clearGameState = () => {
    clearInterval(gameLoopInterval); clearInterval(gameTurnInterval);
    projectiles = []; projectileQueue = []; farmedCircles = []; fishermen = []; fish = [];
    players.forEach(p => p.lastRoll = 0);
};

const startGame = () => {
    if (players.length < 2) { showMessage('You need at least two players!', 'error'); return; }
    isGameRunning = true;
    startButton.textContent = 'Stop'; startButton.classList.add('stop');
    addButton.disabled = true; removeButton.disabled = true; nextButton.disabled = false;
            players.forEach(p => { p.score = 0; p.lastRoll = 0; p.speed = DEFAULT_PROJECTILE_SPEED; p.winningThreshold = defaultWinningThreshold; p.luckyChance = defaultLuckyChance; p.maxFish = defaultMaxFish; p.totalXp = 0; });
    currentModeIndex = 0;
    renderShopItems();
    setupBallGame_full();
};

const switchToNextMode = () => {
    clearGameState();
            ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas immediately

            setTimeout(() => {
                currentModeIndex = (currentModeIndex + 1) % gameModes.length;
                renderShopItems();
                const newMode = gameModes[currentModeIndex];
                if (newMode === 'ball') setupBallGame_full();
                else if (newMode === 'farming') setupFarmingGame_full();
                else if (newMode === 'fishing') setupFishingGame();
            }, 100); // 100ms buffer
};

const stopGame = () => {
    isGameRunning = false;
    startButton.textContent = 'Start'; startButton.classList.remove('stop');
    addButton.disabled = false; removeButton.disabled = false; nextButton.disabled = true;
    showMessage('Game stopped. Scores reset.', 'info');
    clearGameState();
            players.forEach(p => { p.score = 0; p.lastRoll = 0; p.speed = DEFAULT_PROJECTILE_SPEED; p.winningThreshold = defaultWinningThreshold; p.luckyChance = defaultLuckyChance; p.maxFish = defaultMaxFish; p.totalXp = 0; });
    currentModeIndex = 0;
    document.title = 'Ball Game';
    renderShopItems();
    draw();
};

// --- Shop Functions ---
const renderShopItems = () => {
    const currentMode = gameModes[currentModeIndex];
    const isBall = isGameRunning && currentMode === 'ball';
    const isFarming = isGameRunning && currentMode === 'farming';
    const isFishing = isGameRunning && currentMode === 'fishing';

    speedUpgradeButton.classList.toggle('hidden', !isBall);
    slowUpgradeButton.classList.toggle('hidden', !isBall);
    winningNumberUpgradeButton.classList.toggle('hidden', !isFarming);
    luckyChanceUpgradeButton.classList.toggle('hidden', !isFarming);
    inventoryUpgradeButton.classList.toggle('hidden', !isFishing);

    if (!isGameRunning) {
        speedUpgradeButton.classList.remove('hidden');
        slowUpgradeButton.classList.remove('hidden');
    }
};

const renderShopSelector = () => { /* ... (logic unchanged) ... */ };
const buySpeedUpgrade = () => { /* ... (logic unchanged) ... */ };
const buySlowUpgrade = () => { /* ... (logic unchanged) ... */ };
const buyWinningNumberUpgrade = () => { /* ... (logic unchanged) ... */ };
const buyLuckyChanceUpgrade = () => { /* ... (logic unchanged) ... */ };
const buyInventoryUpgrade_full = () => {
    if (!isGameRunning || gameModes[currentModeIndex] !== 'fishing') {
        showMessage('This upgrade is for the Fishing Game!', 'error');
        return;
    }
    const cost = SHOP_INVENTORY_UPGRADE_COST;
    const upgrade = (p) => {
        if (p.score >= cost) {
            p.score -= cost;
            p.maxFish += 1;
            return true;
        }
        return false;
    };

    if (selectedForUpgrade === 'all') {
        const upgraded = players.map(upgrade).some(s => s);
        showMessage(upgraded ? 'Inventory upgraded for affordable players!' : 'None could afford.', upgraded ? 'success' : 'error');
    } else {
        const p = players.find(pl => pl.id === selectedForUpgrade);
        if (p) {
            if (upgrade(p)) {
                showMessage(`${p.name}'s inventory is now ${p.maxFish}!`, 'success');
            } else {
                showMessage(`${p.name} can't afford that.`, 'error');
            }
        }
    }
    draw();
};

// Full shop logic (unchanged)
const renderShopSelector_full = () => {
    playerSelectorContainer.innerHTML = '';
    const allButton = document.createElement('button'); allButton.textContent = 'All'; allButton.className = 'selector-button active';
    allButton.onclick = () => { selectedForUpgrade = 'all'; renderShopSelector_full(); }; playerSelectorContainer.appendChild(allButton);
    players.forEach(player => {
        const playerButton = document.createElement('button'); playerButton.textContent = player.name; playerButton.className = 'selector-button';
        playerButton.style.backgroundColor = player.color; playerButton.style.color = 'white';
        if (selectedForUpgrade === player.id) { allButton.classList.remove('active'); playerButton.classList.add('active'); }
        playerButton.onclick = () => { selectedForUpgrade = player.id; renderShopSelector_full(); }; playerSelectorContainer.appendChild(playerButton);
    });
};
const buySpeedUpgrade_full = () => {
    if (!isGameRunning || gameModes[currentModeIndex] !== 'ball') { showMessage('This upgrade is for the Ball Game!', 'error'); return; }
            const cost = SHOP_SPEED_UPGRADE_COST, boost = SHOP_SPEED_UPGRADE_BOOST; const upgrade = (p) => { if (p.score >= cost) { p.score -= cost; p.speed += boost; return true; } return false; };
    if (selectedForUpgrade === 'all') { const u = players.map(upgrade).some(s => s); showMessage(u ? 'Speed upgraded!' : 'None could afford.', u ? 'success' : 'error'); }
            else {
                const p = players.find(pl => pl.id === selectedForUpgrade);
                if (p) {
                    const success = upgrade(p);
                    showMessage(success ? `${p.name} speed up!` : `${p.name} can't afford.`, success ? 'success' : 'error');
                }
            }
    draw();
};
const buySlowUpgrade_full = () => {
    if (!isGameRunning || gameModes[currentModeIndex] !== 'ball') { showMessage('This upgrade is for the Ball Game!', 'error'); return; }
            const cost = SHOP_SLOW_UPGRADE_COST, slow = SHOP_SLOW_UPGRADE_SLOW; const upgrade = (p) => { if (p.score >= cost) { p.score -= cost; p.speed = Math.max(MIN_PROJECTILE_SPEED, p.speed - slow); return true; } return false; };
    if (selectedForUpgrade === 'all') { const u = players.map(upgrade).some(s => s); showMessage(u ? 'Slow applied!' : 'None could afford.', u ? 'success' : 'error'); }
            else {
                const p = players.find(pl => pl.id === selectedForUpgrade);
                if (p) {
                    const success = upgrade(p);
                    showMessage(success ? `${p.name} slowed!` : `${p.name} can't afford.`, success ? 'success' : 'error');
                }
            }
    draw();
};
const buyWinningNumberUpgrade_full = () => {
    if (!isGameRunning || gameModes[currentModeIndex] !== 'farming') { showMessage('This upgrade is for the Farming Game!', 'error'); return; }
            const cost = SHOP_WINNING_NUMBER_UPGRADE_COST; const upgrade = (p) => { if (p.score >= cost) { if (p.winningThreshold > 1) { p.score -= cost; p.winningThreshold--; return true; } else { showMessage(`${p.name} maxed!`, 'info'); return false; } } return false; };
    if (selectedForUpgrade === 'all') { if (players.map(upgrade).some(s => s)) showMessage(`Upgraded for affordable players!`, 'success'); else showMessage('None could afford.', 'error'); }
    else { const p = players.find(pl => pl.id === selectedForUpgrade); if (p && upgrade(p)) showMessage(`${p.name}'s wins: ${p.winningThreshold}-20!`, 'success'); else if (p) showMessage(`${p.name} can't afford.`, 'error'); }
    draw();
};
const buyLuckyChanceUpgrade_full = () => {
    if (!isGameRunning || gameModes[currentModeIndex] !== 'farming') { showMessage('This upgrade is for the Farming Game!', 'error'); return; }
            const cost = SHOP_LUCKY_CHANCE_UPGRADE_COST; const upgrade = (p) => { if (p.score >= cost) { p.score -= cost; p.luckyChance += 1; return true; } return false; };
    if (selectedForUpgrade === 'all') { const u = players.map(upgrade).some(s => s); showMessage(u ? 'Lucky Chance up!' : 'None could afford.', u ? 'success' : 'error'); }
    else { const p = players.find(pl => pl.id === selectedForUpgrade); if (p && upgrade(p)) showMessage(`${p.name}'s Lucky Chance: ${p.luckyChance}%!`, 'success'); else if (p) showMessage(`${p.name} can't afford.`, 'error'); }
    draw();
};

// --- Event Listeners ---
addButton.addEventListener('click', () => { if(isGameRunning) return; isAddingPlayer = true; isRemovingPlayer = false; addButton.classList.add('active'); removeButton.classList.remove('active'); showMessage('Click on the canvas edge to add a player.'); });
removeButton.addEventListener('click', () => { if(isGameRunning) return; isRemovingPlayer = true; isAddingPlayer = false; removeButton.classList.add('active'); addButton.classList.remove('active'); showMessage('Click on a player to remove it.'); });
startButton.addEventListener('click', () => { if (isGameRunning) stopGame(); else startGame(); });
nextButton.addEventListener('click', () => { if (isGameRunning) switchToNextMode(); });
speedUpgradeButton.addEventListener('click', buySpeedUpgrade_full);
slowUpgradeButton.addEventListener('click', buySlowUpgrade_full);
winningNumberUpgradeButton.addEventListener('click', buyWinningNumberUpgrade_full);
luckyChanceUpgradeButton.addEventListener('click', buyLuckyChanceUpgrade_full);
inventoryUpgradeButton.addEventListener('click', buyInventoryUpgrade_full);
canvas.addEventListener('click', handleCanvasClick_full);
window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', () => { resizeCanvas(); renderShopSelector_full(); renderShopItems(); });
