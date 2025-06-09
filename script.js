document.addEventListener('DOMContentLoaded', () => {
    const GRID_SIZE = 8;
    const EMOJIS = ['🍌', '🥝', '🍋', '🍉', '🍇', '🍒', '🥥'];
    const SPECIAL_PIECES = { ROCKET_H: '🚀', ROCKET_V: '🚀', BOMB: '💣', COLOR_BOMB: '💥' };
    
    // Configuration: Probability that the first new fruit matches the existing fruit below it
    const FRUIT_MATCH_PROBABILITY = 1.0; // 0.3 = 30% - balanced for good gameplay
    
    const INITIAL_TIME = 180; // 240 seconds for level 1 (4 minutes)
    const TIME_DECREASE_PER_LEVEL = 5; // 5 seconds less each level
    const MIN_TIME = 20; // Minimum time (20 seconds)
    
    // Mobile detection and performance optimization
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const SWAP_ANIMATION_MS = isMobile ? 200 : 350;
    const FALL_ANIMATION_MS = isMobile ? 250 : 500;
    const MATCH_ANIMATION_MS = isMobile ? 300 : 600;

    let board = [];
    let jelliedTiles = new Set();
    let score = 0;
    let level = 1;
    let timeLeft = INITIAL_TIME;
    let maxTime = INITIAL_TIME;
    let timerInterval = null;
    let isProcessing = false;
    let dragStartPiece = null;
    let dragEndPiece = null;
    let audioContext = null;
    let soundEnabled = true;
    let lastMoveTime = 0;
    let hintTimeout = null;
    let moveCheckTimeout = null;
    let currentHint = null;
    let collectionTarget = null;
    let collectionGoal = 0;
    let collectionCount = 0;
    
    // NEW: Collection system variables
    let collectionGoals = {}; // e.g., { '🥝': { target: 20, collected: 0 }, '🍉': { target: 15, collected: 0 } }
    let allCollectionGoalsMet = false;
    let levelCompleting = false; // Prevent new special item creation during level completion

    const gameBoardEl = document.getElementById('game-board');
    const pieceContainerEl = document.getElementById('piece-container');
    const scoreEl = document.getElementById('score');
    const levelEl = document.getElementById('level');
    // Removed jelly counter - no longer needed
    const timerBarEl = document.getElementById('timer-bar');
    // const timerTextEl = document.getElementById('timer-text'); // Commented out - can be restored later
    const startScreen = document.getElementById('start-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const levelCompleteScreen = document.getElementById('level-complete-screen');
    const gameOverTitle = document.getElementById('game-over-title');
    const gameOverMessage = document.getElementById('game-over-message');
    const levelCompleteTitle = document.getElementById('level-complete-title');
    const levelCompleteMessage = document.getElementById('level-complete-message');
    const startButton = document.getElementById('start-button');
    const restartButton = document.getElementById('restart-button');
    const nextLevelButton = document.getElementById('next-level-button');
    
    // NEW: Collection UI elements
    const collectionTargetsEl = document.getElementById('collection-targets-compact');
    const levelCompleteCollectionsEl = document.getElementById('level-complete-collections');
    
    // High Score elements
    const highScoresListEl = document.getElementById('high-scores-list');
    const gameOverHighScoresListEl = document.getElementById('game-over-high-scores-list');
    const finalScoreEl = document.getElementById('final-score');
    const finalLevelEl = document.getElementById('final-level');

    // Audio System
    const backgroundMusic = document.getElementById('background-music');
    let musicEnabled = true;

    function initAudio() {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            soundEnabled = true;
        } catch (e) {
            soundEnabled = false;
            console.log('Audio not supported');
        }
    }

    // Music Control Functions
    async function playBackgroundMusic() {
        if (!musicEnabled || !backgroundMusic) return;
        
        try {
            backgroundMusic.volume = 0.3; // Set volume to 30%
            await backgroundMusic.play();
        } catch (error) {
            console.log('Cannot play music - user interaction required first');
        }
    }

    function pauseBackgroundMusic() {
        if (backgroundMusic && !backgroundMusic.paused) {
            backgroundMusic.pause();
        }
    }

    function stopBackgroundMusic() {
        if (backgroundMusic) {
            backgroundMusic.pause();
            backgroundMusic.currentTime = 0;
        }
    }

    function playSound(frequency, duration = 100, volume = 0.1, type = 'sine') {
        if (!soundEnabled || !audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration / 1000);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration / 1000);
    }

    function playMatchSound(matchLength, hasJelly = true) {
        if (hasJelly) {
            // Original jelly-clearing match sound - bright and rewarding
            const baseFreq = 440;
            const frequencies = [baseFreq, baseFreq * 1.25, baseFreq * 1.5, baseFreq * 2];
            frequencies.slice(0, Math.min(matchLength, 4)).forEach((freq, i) => {
                setTimeout(() => playSound(freq, 150, 0.15), i * 50);
            });
        } else {
            // Softer, more muted sound for non-jelly matches
            const baseFreq = 330; // Lower frequency
            const frequencies = [baseFreq, baseFreq * 1.2, baseFreq * 1.4, baseFreq * 1.6];
            frequencies.slice(0, Math.min(matchLength, 4)).forEach((freq, i) => {
                setTimeout(() => playSound(freq, 120, 0.08, 'triangle'), i * 60);
            });
        }
    }

    function playSpecialSound() {
        playSound(800, 200, 0.2, 'square');
        setTimeout(() => playSound(1200, 200, 0.2, 'square'), 100);
    }

    function playSwapSound() {
        playSound(300, 80, 0.1, 'triangle');
    }

    function playFallSound() {
        // Removed the buzzy sawtooth fall sound - pieces now fall silently for better audio experience
    }

    function playJellyClearSound() {
        playSound(600, 150, 0.12, 'sine');
    }

    function playLevelCompleteSound() {
        const melody = [523, 659, 784, 1047]; // C, E, G, C
        melody.forEach((freq, i) => {
            setTimeout(() => playSound(freq, 300, 0.2), i * 150);
        });
    }

    function playShuffleSound() {
        const notes = [440, 523, 659, 784]; // A, C, E, G
        notes.forEach((freq, i) => {
            setTimeout(() => playSound(freq, 200, 0.15), i * 100);
        });
    }

    function playRocketExplosionSound() {
        // Dramatic rocket explosion sound - deep bass followed by high frequency blast
        playSound(80, 150, 0.2, 'square'); // Deep boom
        setTimeout(() => playSound(1200, 200, 0.15, 'sawtooth'), 50); // High blast
        setTimeout(() => playSound(800, 100, 0.1, 'triangle'), 150); // Echo
    }

    function playHintSound() {
        playSound(880, 150, 0.1, 'triangle');
    }

    function playGameOverSound() {
        playSound(200, 800, 0.15, 'sawtooth');
    }

    // Timer System
    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        
        timerInterval = setInterval(() => {
            timeLeft -= 0.1;
            updateTimerDisplay();
            
            if (timeLeft <= 0) {
                timeLeft = 0;
                clearInterval(timerInterval);
                gameOver();
            }
        }, 100);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        clearHintTimer(); // Also clear hint timer when game stops
        clearMoveCheckTimer(); // Also clear move check timer when game stops
    }

    function updateTimerDisplay() {
        const percentage = (timeLeft / maxTime) * 100;
        timerBarEl.style.width = percentage + '%';
        // timerTextEl.textContent = Math.ceil(timeLeft) + 's'; // Commented out - can be restored later
        
        // Change color based on time remaining
        if (percentage > 50) {
            timerBarEl.style.background = 'linear-gradient(90deg, var(--accent-gold), var(--accent-neon))';
        } else if (percentage > 25) {
            timerBarEl.style.background = 'linear-gradient(90deg, orange, var(--accent-gold))';
        } else {
            timerBarEl.style.background = 'linear-gradient(90deg, red, orange)';
        }
    }

    // Visual Effects - Disabled for performance
    function createParticleExplosion(x, y, color = '#ffd700', count = 8) {
        // Particle explosions disabled for better performance
        return;
    }

    function showScorePopup(points, x, y) {
        // Skip score popups on mobile for performance
        if (isMobile) return;
        
        const popup = document.createElement('div');
        popup.className = 'score-popup';
        popup.textContent = `+${points}`;
        popup.style.left = x + 'px';
        popup.style.top = y + 'px';
        
        document.body.appendChild(popup);
        setTimeout(() => popup.remove(), 1000);
    }

    function createJellyClearEffect(tileIndex) {
        const tileEl = gameBoardEl.children[tileIndex];
        const rect = tileEl.getBoundingClientRect();
        
        const effect = document.createElement('div');
        effect.className = 'jelly-clear-effect';
        effect.style.left = '0';
        effect.style.top = '0';
        
        tileEl.style.position = 'relative';
        tileEl.appendChild(effect);
        
        setTimeout(() => effect.remove(), 600);
        
        // Create jelly particles
        createParticleExplosion(
            rect.left + rect.width / 2, 
            rect.top + rect.height / 2, 
            '#ff69b4', 
            6
        );
    }

    function updateScore(newScore) {
        const oldScore = score;
        score = newScore;
        scoreEl.textContent = score;
        scoreEl.style.animation = 'none';
        scoreEl.offsetHeight; // Trigger reflow
        scoreEl.style.animation = 'numberPulse 0.3s ease-out';
        
        if (score > oldScore) {
            playSound(600, 100, 0.12);
        }
    }
    
    // --- HINT SYSTEM ---
    function startHintTimer() {
        clearHintTimer();
        hintTimeout = setTimeout(() => {
            showHint();
        }, 8000); // 8 seconds
    }

    function clearHintTimer() {
        if (hintTimeout) {
            clearTimeout(hintTimeout);
            hintTimeout = null;
        }
        clearCurrentHint();
    }

    // --- MOVE CHECK SYSTEM ---
    function startMoveCheckTimer() {
        clearMoveCheckTimer();
        moveCheckTimeout = setTimeout(() => {
            checkForAvailableMoves();
        }, 1000); // 1 second - quick check for available moves
    }

    function clearMoveCheckTimer() {
        if (moveCheckTimeout) {
            clearTimeout(moveCheckTimeout);
            moveCheckTimeout = null;
        }
    }

    function checkForAvailableMoves() {
        if (isProcessing) return;
        
        const possibleMove = findPossibleMove();
        if (!possibleMove) {
            // No moves available, shuffle immediately
            shuffleBoard();
        } else {
            // Moves are available, start the hint timer
            startHintTimer();
        }
    }

    function clearCurrentHint() {
        if (currentHint) {
            currentHint.piece1.classList.remove('hint');
            currentHint.piece2.classList.remove('hint');
            currentHint = null;
        }
    }

    // Show hint for available moves (assumes moves exist)
    function showHint() {
        if (isProcessing) return; // Don't show hints during processing

        const possibleMove = findPossibleMove();
        if (possibleMove) {
            const piece1 = board[possibleMove.r1][possibleMove.c1]?.el;
            const piece2 = board[possibleMove.r2][possibleMove.c2]?.el;

            if (piece1 && piece2) {
                piece1.classList.add('hint');
                piece2.classList.add('hint');

                currentHint = { piece1, piece2 };
                playHintSound();

                // This timeout fixes the bug where hints would get stuck.
                setTimeout(() => clearCurrentHint(), 5000);
            }
        }
        // Note: We no longer shuffle here - that's handled by checkForAvailableMoves()
    }

    function findPossibleMove() {
        // Check all possible swaps for valid matches
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (!board[r][c] || board[r][c].special) continue;
                
                // Check right neighbor
                if (c < GRID_SIZE - 1 && board[r][c + 1] && !board[r][c + 1].special) {
                    if (wouldCreateMatch(r, c, r, c + 1)) {
                        return { r1: r, c1: c, r2: r, c2: c + 1 };
                    }
                }
                
                // Check bottom neighbor
                if (r < GRID_SIZE - 1 && board[r + 1][c] && !board[r + 1][c].special) {
                    if (wouldCreateMatch(r, c, r + 1, c)) {
                        return { r1: r, c1: c, r2: r + 1, c2: c };
                    }
                }
            }
        }
        return null;
    }

    function wouldCreateMatch(r1, c1, r2, c2) {
        // Temporarily swap pieces in a copy of the board state
        const piece1 = board[r1][c1];
        const piece2 = board[r2][c2];
        
        if (!piece1 || !piece2 || piece1.special || piece2.special) {
            return false;
        }
        
        // Temporarily swap pieces
        board[r1][c1] = piece2;
        board[r2][c2] = piece1;
        
        // Check if this creates any matches
        const matches = findMatches();
        const hasMatch = matches.length > 0;
        
        // Swap back immediately
        board[r1][c1] = piece1;
        board[r2][c2] = piece2;
        
        return hasMatch;
    }

    async function shuffleBoard() {
        if (isProcessing) return;
        isProcessing = true;
        clearHintTimer();
        clearMoveCheckTimer();
        clearCurrentHint(); // Clear any active hints
        
        playShuffleSound();
        
        // Add shuffle animation to all pieces
        const allPieces = document.querySelectorAll('.piece:not(.matched)');
        allPieces.forEach(piece => piece.classList.add('shuffling'));
        
        // Wait for animation to reach peak
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Collect all current piece types (excluding specials)
        const pieceTypes = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (board[r][c] && !board[r][c].special) {
                    pieceTypes.push(board[r][c].type);
                }
            }
        }
        
        // Shuffle the types array
        for (let i = pieceTypes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pieceTypes[i], pieceTypes[j]] = [pieceTypes[j], pieceTypes[i]];
        }
        
        // Reassign types to non-special pieces
        let typeIndex = 0;
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (board[r][c] && !board[r][c].special && board[r][c].el) {
                    board[r][c].type = pieceTypes[typeIndex];
                    board[r][c].el.textContent = pieceTypes[typeIndex];
                    typeIndex++;
                }
            }
        }
        
        // Wait for animation to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Remove shuffle animation
        const remainingPieces = document.querySelectorAll('.piece.shuffling');
        remainingPieces.forEach(piece => piece.classList.remove('shuffling'));
        
        // Check if shuffle created matches and clear them
        const matches = findMatches();
        if (matches.length > 0) {
            await processMatches(matches);
            await processBoardChanges();
        }
        
        resetMoveTimer();
        isProcessing = false;
    }

    function setupCollectionGoal() {
        // Choose a random fruit type for collection
        const fruits = ['🍎', '🍌', '🍇', '🍊', '🍌'];
        collectionTarget = fruits[Math.floor(Math.random() * fruits.length)];
        
        // Set collection goal based on level
        collectionGoal = 15 + (level - 1) * 3; // 15 for level 1, 18 for level 2, etc.
        collectionCount = 0;
        
        // Update UI
        document.getElementById('collection-icon').textContent = collectionTarget;
        updateCollectionDisplay();
    }

    function updateCollectionDisplay() {
        const progressEl = document.getElementById('collection-progress');
        progressEl.textContent = `${collectionCount} / ${collectionGoal}`;
        
        // Add visual feedback when getting close to goal
        if (collectionCount >= collectionGoal) {
            progressEl.style.color = '#00ff88';
            progressEl.style.animation = 'numberPulse 0.5s ease-out';
        } else if (collectionCount >= collectionGoal * 0.8) {
            progressEl.style.color = '#ffdd44';
        } else {
            progressEl.style.color = 'white';
        }
    }

    function resetMoveTimer() {
        lastMoveTime = Date.now();
        clearHintTimer();
        clearMoveCheckTimer();
        startMoveCheckTimer(); // Start with the quick move check first
    }

    function updateJellyCount() {
        // Jelly count now only visible on the board - no UI counter needed
    }

    function initGame() {
        board = [];
        jelliedTiles = new Set();
        pieceContainerEl.innerHTML = '';
        gameBoardEl.innerHTML = '';
        levelCompleting = false; // Reset level completion flag
        
        // Create board tiles
        for (let r = 0; r < GRID_SIZE; r++) {
            board[r] = [];
            for (let c = 0; c < GRID_SIZE; c++) {
                const tileEl = document.createElement('div');
                tileEl.classList.add('tile');
                gameBoardEl.appendChild(tileEl);
                board[r][c] = null;
            }
        }
        
        // Create level-specific jelly pattern
        createJellyPattern();
        
        populateBoard();
        while (findMatches().length > 0) populateBoard();
        renderPieces();
        
        // NEW: Generate collection goals for this level
        generateCollectionGoals(level);
        
        timeLeft = maxTime;
        updateScore(score); // Update display with current score (don't reset)
        levelEl.textContent = level;
        updateJellyCount();
        updateTimerDisplay();
        
        startScreen.style.display = 'none';
        gameOverScreen.style.display = 'none';
        levelCompleteScreen.style.display = 'none';
        isProcessing = false;
        
        initAudio();
        startTimer();
        resetMoveTimer();
    }

    function populateBoard() {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                board[r][c] = { 
                    type: EMOJIS[Math.floor(Math.random() * EMOJIS.length)], 
                    special: null, 
                    el: null 
                };
            }
        }
    }

    function renderPieces() {
        pieceContainerEl.innerHTML = '';
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const pieceData = board[r][c];
                if (pieceData && pieceData.type) {
                    const pieceEl = createPieceElement(r, c, pieceData);
                    pieceContainerEl.appendChild(pieceEl);
                    board[r][c].el = pieceEl;
                }
            }
        }
    }
    
    function createPieceElement(r, c, pieceData, isNew = false) {
        const TILE_SIZE = gameBoardEl.querySelector('.tile').offsetWidth;
        const TILE_GAP = 2;
        const pieceEl = document.createElement('div');
        pieceEl.classList.add('piece');
        pieceEl.dataset.r = r;
        pieceEl.dataset.c = c;
        // Offset by -1px because pieces are 2px larger than tiles (TILE_SIZE + 2px)
        pieceEl.style.top = `${r * (TILE_SIZE + TILE_GAP) - 1}px`;
        pieceEl.style.left = `${c * (TILE_SIZE + TILE_GAP) - 1}px`;
        pieceEl.textContent = pieceData.special ? SPECIAL_PIECES[pieceData.special] || '❓' : pieceData.type;
        
        // Add special piece styling
        pieceEl.classList.remove('rocket-h', 'rocket-v');
        if (pieceData.special) {
            pieceEl.dataset.special = pieceData.special;
            if (pieceData.special === 'ROCKET_H') pieceEl.classList.add('rocket-h');
            if (pieceData.special === 'ROCKET_V') pieceEl.classList.add('rocket-v');
        }
        
        // Add spawn animation for new pieces
        if (isNew) {
            pieceEl.classList.add('spawning');
            setTimeout(() => pieceEl.classList.remove('spawning'), 600);
        }
        
        pieceEl.addEventListener('mousedown', onDragStart);
        pieceEl.addEventListener('touchstart', onDragStart, { passive: false });
        return pieceEl;
    }

    function clearJelly(r, c) {
        const tileIndex = r * GRID_SIZE + c;
        if (jelliedTiles.has(tileIndex)) {
            jelliedTiles.delete(tileIndex);
            const tileEl = gameBoardEl.children[tileIndex];
            tileEl.classList.remove('jellied');
            
            createJellyClearEffect(tileIndex);
            playJellyClearSound();
            updateJellyCount();
            
            // Level completion will be checked after all board processing is done in processBoardChanges()
        }
    }

    async function levelComplete() {
        stopTimer();
        isProcessing = true;
        levelCompleting = true; // Prevent new special item creation during completion
        
        // NEW: Activate all remaining special items for final score boost
        const specialBonus = await activateAllSpecialItems();
        
        // Calculate time bonus
        const timeBonus = Math.floor(timeLeft * 10);
        const levelBonus = level * 100;
        const totalBonus = timeBonus + levelBonus + specialBonus;
        const previousScore = score;
        
        updateScore(score + totalBonus);
        playLevelCompleteSound();
        
        // Populate stats display
        document.getElementById('completed-level').textContent = level;
        document.getElementById('level-score').textContent = previousScore.toLocaleString();
        document.getElementById('level-bonus').textContent = '+' + totalBonus.toLocaleString();
        
        // Display collection achievements
        displayLevelCompleteCollections();
        
        levelCompleteTitle.textContent = `🎉 LEVEL ${level} COMPLETE! 🎉`;
        
        let completionMessage = 'Stellar work, crusher!';
        if (jelliedTiles.size === 0 && allCollectionGoalsMet) {
            completionMessage = '✨ Perfect! All objectives completed! ✨';
        } else if (jelliedTiles.size === 0) {
            completionMessage = '✨ Amazing! All jelly cleared! ✨';
        } else if (allCollectionGoalsMet) {
            completionMessage = '🎯 Excellent! All goals achieved! 🎯';
        }
        
        levelCompleteMessage.textContent = completionMessage;
        
        // Show screen immediately after all processing is complete
        // (activateAllSpecialItems() has already finished all cascades)
        levelCompleteScreen.style.display = 'flex';
    }

    // NEW: Activate all remaining special items for final score boost
    async function activateAllSpecialItems() {
        const specialPieces = [];
        let totalSpecialBonus = 0;
        
        // Find all special pieces on the board
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (board[r][c] && board[r][c].special) {
                    specialPieces.push({ r, c, type: board[r][c].special });
                }
            }
        }
        
        if (specialPieces.length === 0) {
            return 0;
        }
        
        // Activate all special pieces with a slight delay between each
        for (let i = 0; i < specialPieces.length; i++) {
            const piece = specialPieces[i];
            
            // Skip if this piece was already cleared by a previous special activation
            if (!board[piece.r] || !board[piece.r][piece.c] || !board[piece.r][piece.c].special) {
                continue;
            }
            
            const piecesToClear = new Set();
            
            // Calculate bonus based on special type
            switch (piece.type) {
                case 'ROCKET_H':
                case 'ROCKET_V':
                    totalSpecialBonus += 500;
                    break;
                case 'BOMB':
                    totalSpecialBonus += 750;
                    break;
                case 'COLOR_BOMB':
                    totalSpecialBonus += 1000;
                    break;
            }
            
            // Activate the special piece
            activateSpecial(piece.r, piece.c, piece.type, piecesToClear);
            
            // Add the special piece itself to clear list
            if (board[piece.r] && board[piece.r][piece.c]) {
                piecesToClear.add(board[piece.r][piece.c]);
            }
            
            // Clear the pieces with animation
            await clearPieces(piecesToClear);
            
            // Small delay between activations for visual effect
            if (i < specialPieces.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        // Process any cascades that might result from special activations
        await processBoardChanges();
        
        return totalSpecialBonus;
    }

    // Display collection achievements on level complete with enhanced design
    function displayLevelCompleteCollections() {
        levelCompleteCollectionsEl.innerHTML = '';
        
        if (Object.keys(collectionGoals).length > 0) {
            // Create title
            const title = document.createElement('div');
            title.className = 'collections-title';
            title.textContent = '🎯 Mission Objectives';
            levelCompleteCollectionsEl.appendChild(title);
            
            // Create grid container
            const grid = document.createElement('div');
            grid.className = 'collections-grid';
            
            Object.keys(collectionGoals).forEach(fruit => {
                const goal = collectionGoals[fruit];
                const isCompleted = goal.collected >= goal.target;
                
                const itemEl = document.createElement('div');
                itemEl.className = 'level-complete-collection-item';
                
                itemEl.innerHTML = `
                    <div class="collection-fruit-display">${fruit}</div>
                    <div class="collection-info">
                        <div class="collection-count">${goal.collected}/${goal.target}</div>
                        <div class="collection-label">Collected</div>
                    </div>
                    <div class="collection-status">${isCompleted ? '✅' : '❌'}</div>
                `;
                
                grid.appendChild(itemEl);
            });
            
            levelCompleteCollectionsEl.appendChild(grid);
        }
    }

    function gameOver() {
        stopTimer();
        stopBackgroundMusic(); // Stop music when game ends
        isProcessing = true;
        playGameOverSound();
        
        // Update final stats display
        finalScoreEl.textContent = score.toLocaleString();
        finalLevelEl.textContent = level;
        
        // Check and save high score
        const isNewRecord = isNewHighScore(score, level);
        let newScoreData = null;
        
        if (isNewRecord) {
            // Prompt for player name
            let playerName = prompt("🏆 NEW HIGH SCORE! 🏆\nEnter your name for the leaderboard:", "");
            if (!playerName || playerName.trim() === "") {
                playerName = "Anonymous";
            } else {
                playerName = playerName.trim().substring(0, 12); // Limit to 12 characters
            }
            
            const updatedScores = saveHighScore(score, level, playerName);
            newScoreData = { name: playerName, score: score, level: level };
            gameOverTitle.textContent = "🏆 NEW HIGH SCORE! 🏆";
            gameOverMessage.innerHTML = `Amazing achievement, ${playerName}!<br>Your stellar crushing skills have reached new heights!`;
        } else {
            gameOverTitle.textContent = "⏰ TIME'S UP! ⏰";
            gameOverMessage.innerHTML = `The jelly got you this time!<br>Keep crushing to beat your best score!`;
        }
        
        // Display high scores on game over screen
        displayHighScores(gameOverHighScoresListEl, isNewRecord, newScoreData);
        
        setTimeout(() => {
            gameOverScreen.style.display = 'flex';
        }, 500);
    }

    function nextLevel() {
        level++;
        maxTime = Math.max(MIN_TIME, INITIAL_TIME - (level - 1) * TIME_DECREASE_PER_LEVEL);
        timeLeft = maxTime;
        initGame();
    }

    startButton.addEventListener('click', () => {
        playSound(800, 200, 0.2);
        playBackgroundMusic(); // Start music when game begins
        level = 1;
        maxTime = INITIAL_TIME;
        score = 0; // Reset score when starting new game
        initGame();
    });
    
    restartButton.addEventListener('click', () => {
        playSound(800, 200, 0.2);
        playBackgroundMusic(); // Start music when restarting
        level = 1;
        maxTime = INITIAL_TIME;
        score = 0;
        initGame();
    });

    nextLevelButton.addEventListener('click', () => {
        playSound(800, 200, 0.2);
        nextLevel();
    });

    // Initialize high scores display on start screen
    displayHighScores(highScoresListEl);

    // Continue with the remaining functions after nextLevelButton event listener...
    
    function onDragStart(e) {
        if (isProcessing) return;
        e.preventDefault();
        
        clearCurrentHint(); // Clear any active hints when player starts interacting
        resetMoveTimer();
        
        dragStartPiece = e.currentTarget;
        dragStartPiece.classList.add('selected');
        
        playSwapSound();
        
        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('mouseup', onDragEnd);
        window.addEventListener('touchmove', onDragMove);
        window.addEventListener('touchend', onDragEnd);
    }

    function onDragMove(e) {
        if (!dragStartPiece) return;
        e.preventDefault();
        const TILE_SIZE = gameBoardEl.querySelector('.tile').offsetWidth;
        const TILE_GAP = 2;
        let x, y;
        if (e.touches) { 
            x = e.touches[0].clientX; 
            y = e.touches[0].clientY; 
        } else { 
            x = e.clientX; 
            y = e.clientY; 
        }
        const boardRect = gameBoardEl.getBoundingClientRect();
        const targetC = Math.floor((x - boardRect.left - 8) / (TILE_SIZE + TILE_GAP));
        const targetR = Math.floor((y - boardRect.top - 8) / (TILE_SIZE + TILE_GAP));
        
        // Allow dragging outside board bounds but still track the direction
        const startR = parseInt(dragStartPiece.dataset.r);
        const startC = parseInt(dragStartPiece.dataset.c);
        
        // Calculate the direction of drag
        const deltaR = targetR - startR;
        const deltaC = targetC - startC;
        
        // Determine which adjacent tile we're targeting based on the largest movement
        let finalTargetR = startR;
        let finalTargetC = startC;
        
        if (Math.abs(deltaR) > Math.abs(deltaC)) {
            // Vertical movement is larger
            if (deltaR > 0) finalTargetR = startR + 1; // Moving down
            else if (deltaR < 0) finalTargetR = startR - 1; // Moving up
        } else if (Math.abs(deltaC) > Math.abs(deltaR)) {
            // Horizontal movement is larger
            if (deltaC > 0) finalTargetC = startC + 1; // Moving right
            else if (deltaC < 0) finalTargetC = startC - 1; // Moving left
        }
        
        // Make sure the final target is within bounds and is an adjacent tile
        if (finalTargetR >= 0 && finalTargetR < GRID_SIZE && 
            finalTargetC >= 0 && finalTargetC < GRID_SIZE &&
            Math.abs(startR - finalTargetR) + Math.abs(startC - finalTargetC) === 1 &&
            board[finalTargetR] && board[finalTargetR][finalTargetC]) {
            dragEndPiece = board[finalTargetR][finalTargetC].el;
        } else {
            dragEndPiece = null;
        }
    }
    
    function onDragEnd() {
        if (dragStartPiece) {
            dragStartPiece.classList.remove('selected');
            if (dragEndPiece) {
                const r1 = parseInt(dragStartPiece.dataset.r);
                const c1 = parseInt(dragStartPiece.dataset.c);
                const r2 = parseInt(dragEndPiece.dataset.r);
                const c2 = parseInt(dragEndPiece.dataset.c);
                handleSwap(r1, c1, r2, c2);
            }
        }
        dragStartPiece = null;
        dragEndPiece = null;
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('mouseup', onDragEnd);
        window.removeEventListener('touchmove', onDragMove);
        window.removeEventListener('touchend', onDragEnd);
    }

    async function handleSwap(r1, c1, r2, c2) {
        if (isProcessing) return;
        isProcessing = true;
        
        const piece1 = board[r1][c1];
        const piece2 = board[r2][c2];

        await animateSwap(piece1.el, piece2.el);
        
        board[r1][c1] = piece2; board[r2][c2] = piece1;
        piece1.el.dataset.r = r2; piece1.el.dataset.c = c2;
        piece2.el.dataset.r = r1; piece2.el.dataset.c = c1;

        const isPiece1Special = piece1.special;
        const isPiece2Special = piece2.special;
        
        let moveWasValid = false;

        if (isPiece1Special || isPiece2Special) {
            const piecesToClear = new Set();
            
            // Calculate swap direction for rockets
            const swapDirection = {
                horizontal: Math.abs(c1 - c2) === 1, // left/right swap
                vertical: Math.abs(r1 - r2) === 1     // up/down swap
            };
            
            if (isPiece1Special) activateSpecial(r2, c2, piece1.special, piecesToClear, swapDirection);
            if (isPiece2Special) activateSpecial(r1, c1, piece2.special, piecesToClear, swapDirection);
            
            piecesToClear.add(piece1);
            piecesToClear.add(piece2);

            await clearPieces(piecesToClear);
            moveWasValid = true;
            playSpecialSound();
        } else {
            piece1.isSwapped = true;
            piece2.isSwapped = true;
            const matches = findMatches();
            if (matches.length > 0) {
                moveWasValid = true;
            } else { 
                await animateSwap(piece1.el, piece2.el); 
                board[r1][c1] = piece1; board[r2][c2] = piece2;
                piece1.el.dataset.r = r1; piece1.el.dataset.c = c1;
                piece2.el.dataset.r = r2; piece2.el.dataset.c = c2;
                playSound(150, 200, 0.1);
            }
        }
        
        if (moveWasValid) {
            await processBoardChanges();
            resetMoveTimer(); // Reset timer after successful move
        }
        
        for(let r=0; r<GRID_SIZE; r++) { 
            for(let c=0; c<GRID_SIZE; c++) { 
                if(board[r][c]) board[r][c].isSwapped = false; 
            } 
        }
        
        isProcessing = false;
    }
    
    async function processBoardChanges() {
        let matches = findMatches();
        if (matches.length > 0) {
            await processMatches(matches);
        }

        while (true) {
            const cascadePromise = cascade();
            const refillPromise = refill();
            
            // Allow both operations to start simultaneously
            const [cascaded, refilled] = await Promise.all([cascadePromise, refillPromise]);
            
            // Check for matches immediately, even if pieces are still falling
            matches = findMatches();
            if (matches.length > 0) {
                await processMatches(matches);
                // Continue the loop to handle any new cascades/refills needed
                continue;
            }
            
            // If no new matches and nothing moved, we're done
            if (!cascaded && !refilled) {
                break;
            }
        }
        
        // NEW: Check for level completion after all processing is done
        checkCollectionGoals();
        if (jelliedTiles.size === 0 && allCollectionGoalsMet) {
            levelComplete();
        }
    }
    
    async function processMatches(matches) {
        // Clear hints when any match is made
        clearCurrentHint();
        
        let points = 0;
        let specialCreations = [];
        const piecesToClear = new Set();
        let collectedTargetFruits = 0;
        
        for (const match of matches) {
            const matchPoints = match.length * 10 * (match.length - 2);
            points += matchPoints;
            
            // Show score popup for this match
            const centerPiece = match[Math.floor(match.length / 2)];
            const pieceEl = board[centerPiece.r][centerPiece.c]?.el;
            if (pieceEl) {
                const rect = pieceEl.getBoundingClientRect();
                showScorePopup(matchPoints, rect.left + rect.width / 2, rect.top);
                createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2);
            }
            
            const swappedPieceInMatch = match.find(p => board[p.r] && board[p.r][p.c]?.isSwapped);
            const creationCoord = swappedPieceInMatch || match[Math.floor(match.length / 2)];
            
            // Only create special items if not in level completion mode
            if (!levelCompleting) {
                if (match.length === 4) {
                    const rocketType = match.orientation === 'horizontal' ? 'ROCKET_V' : 'ROCKET_H';
                    specialCreations.push({ r: creationCoord.r, c: creationCoord.c, special: rocketType });
                } else if (match.isTOrL) {
                    specialCreations.push({ r: match.corner.r, c: match.corner.c, special: 'COLOR_BOMB' });
                } else if (match.length >= 5) {
                    specialCreations.push({ r: creationCoord.r, c: creationCoord.c, special: 'BOMB' });
                }
            }
            
            for (const {r, c} of match) { 
                if(board[r][c]) piecesToClear.add(board[r][c]); 
            }
        }
        
        // Check if any of the matched pieces were on jellied tiles
        let hasJellyMatch = false;
        for (const match of matches) {
            for (const {r, c} of match) {
                const tileIndex = r * GRID_SIZE + c;
                if (jelliedTiles.has(tileIndex)) {
                    hasJellyMatch = true;
                    break;
                }
            }
            if (hasJellyMatch) break;
        }
        
        // Play match sound based on whether jelly was involved
        if (matches.length > 0) {
            playMatchSound(Math.max(...matches.map(m => m.length)), hasJellyMatch);
        }
        
        const secondaryClears = new Set();
        for (const piece of piecesToClear) {
            if (piece && piece.special) {
                activateSpecial(parseInt(piece.el.dataset.r), parseInt(piece.el.dataset.c), piece.special, secondaryClears);
            }
        }
        secondaryClears.forEach(p => piecesToClear.add(p));
        
        // NEW: Track collected fruits for collection goals (including pieces cleared by special items)
        addCollectedFruits(Array.from(piecesToClear));
        
        await clearPieces(piecesToClear);
        updateScore(score + points * matches.length);
        
        for (const { r, c, special } of specialCreations) {
            const pieceData = { type: 'special', special: special, el: null };
            const pieceEl = createPieceElement(r, c, pieceData);
            pieceEl.classList.add('special-created');
            pieceContainerEl.appendChild(pieceEl);
            pieceData.el = pieceEl;
            board[r][c] = pieceData;
            
            playSpecialSound();
            
            // Create special effect for special piece creation
            const rect = pieceEl.getBoundingClientRect();
            createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ff007f', 12);
        }
    }
    
    function activateSpecial(r, c, specialType, piecesToClearSet, swapDirection = null) {
        updateScore(score + 50);
        playSpecialSound();
        
        // Create visual effect at activation point
        const piece = board[r][c];
        if (piece && piece.el) {
            const rect = piece.el.getBoundingClientRect();
            createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#00ffff', 16);
        }
        
        if (specialType === 'ROCKET_H' || specialType === 'ROCKET_V') {
            // Add rocket explosion effects
            if (piece && piece.el) {
                const rect = piece.el.getBoundingClientRect();
                playRocketExplosionSound();
                piece.el.classList.add('rocket-exploding');
                
                // Create massive particle explosion
                createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ff4500', 24);
                setTimeout(() => createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ffd700', 20), 100);
                setTimeout(() => createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#00ffff', 16), 200);
            }
            
            // Original simple rocket logic - add entire row/column immediately
            if (swapDirection) {
                if (swapDirection.horizontal) {
                    // Horizontal swap -> clear entire row
                    for (let i = 0; i < GRID_SIZE; i++) if (board[r][i]) piecesToClearSet.add(board[r][i]);
                    createRocketChainReactionVisuals(r, c, 'row'); // Visual only
                } else if (swapDirection.vertical) {
                    // Vertical swap -> clear entire column
                    for (let i = 0; i < GRID_SIZE; i++) if (board[i][c]) piecesToClearSet.add(board[i][c]);
                    createRocketChainReactionVisuals(r, c, 'column'); // Visual only
                }
            } else {
                // Default behavior when not triggered by swap
                if (specialType === 'ROCKET_H') {
                    for (let i = 0; i < GRID_SIZE; i++) if (board[r][i]) piecesToClearSet.add(board[r][i]);
                    createRocketChainReactionVisuals(r, c, 'row'); // Visual only
                } else if (specialType === 'ROCKET_V') {
                    for (let i = 0; i < GRID_SIZE; i++) if (board[i][c]) piecesToClearSet.add(board[i][c]);
                    createRocketChainReactionVisuals(r, c, 'column'); // Visual only
                }
            }
        } else if (specialType === 'COLOR_BOMB') {
            // Color bomb creates MASSIVE destruction - both row AND column!
            updateScore(score + 100); // Extra bonus for mega destruction
            
            if (piece && piece.el) {
                const rect = piece.el.getBoundingClientRect();
                playRocketExplosionSound(); // Use the dramatic rocket sound
                piece.el.classList.add('rocket-exploding');
                
                // Create MEGA particle explosion with multiple colors
                createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ff4500', 30); // Orange blast
                setTimeout(() => createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ff007f', 25), 80); // Pink burst
                setTimeout(() => createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#9d4edd', 20), 160); // Purple explosion
                setTimeout(() => createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ffd700', 25), 240); // Gold finale
            }
            
            // Clear entire row
            for (let i = 0; i < GRID_SIZE; i++) if (board[r][i]) piecesToClearSet.add(board[r][i]);
            
            // Clear entire column
            for (let i = 0; i < GRID_SIZE; i++) if (board[i][c]) piecesToClearSet.add(board[i][c]);
            
            // Create dual chain reaction visuals
            createRocketChainReactionVisuals(r, c, 'row');
            setTimeout(() => createRocketChainReactionVisuals(r, c, 'column'), 200); // Slight delay for column
            
        } else if (specialType === 'BOMB') {
            for (let i = r - 1; i <= r + 1; i++) {
                for (let j = c - 1; j <= c + 1; j++) {
                    if (i >= 0 && i < GRID_SIZE && j >= 0 && j < GRID_SIZE && board[i][j]) {
                        piecesToClearSet.add(board[i][j]);
                    }
                }
            }
        }
    }

    function createRocketChainReactionVisuals(startR, startC, direction) {
        if (direction === 'row') {
            // Visual chain reaction across the row
            for (let distance = 1; distance < GRID_SIZE; distance++) {
                // Right side
                const rightC = startC + distance;
                if (rightC < GRID_SIZE) {
                    setTimeout(() => {
                        const piece = document.querySelector(`[data-r="${startR}"][data-c="${rightC}"]`);
                        if (piece) {
                            const rect = piece.getBoundingClientRect();
                            createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ffd700', 8);
                            playSound(400 + distance * 50, 100, 0.1, 'triangle');
                        }
                    }, distance * 80);
                }
                
                // Left side
                const leftC = startC - distance;
                if (leftC >= 0) {
                    setTimeout(() => {
                        const piece = document.querySelector(`[data-r="${startR}"][data-c="${leftC}"]`);
                        if (piece) {
                            const rect = piece.getBoundingClientRect();
                            createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ffd700', 8);
                            playSound(400 + distance * 50, 100, 0.1, 'triangle');
                        }
                    }, distance * 80);
                }
            }
        } else if (direction === 'column') {
            // Visual chain reaction down the column
            for (let distance = 1; distance < GRID_SIZE; distance++) {
                // Down
                const downR = startR + distance;
                if (downR < GRID_SIZE) {
                    setTimeout(() => {
                        const piece = document.querySelector(`[data-r="${downR}"][data-c="${startC}"]`);
                        if (piece) {
                            const rect = piece.getBoundingClientRect();
                            createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ffd700', 8);
                            playSound(400 + distance * 50, 100, 0.1, 'triangle');
                        }
                    }, distance * 80);
                }
                
                // Up
                const upR = startR - distance;
                if (upR >= 0) {
                    setTimeout(() => {
                        const piece = document.querySelector(`[data-r="${upR}"][data-c="${startC}"]`);
                        if (piece) {
                            const rect = piece.getBoundingClientRect();
                            createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ffd700', 8);
                            playSound(400 + distance * 50, 100, 0.1, 'triangle');
                        }
                    }, distance * 80);
                }
            }
        }
    }
    
    async function cascade() {
        const TILE_SIZE = gameBoardEl.querySelector('.tile').offsetWidth;
        const TILE_GAP = 2;
        let hasCascaded = false;
        
        for (let c = 0; c < GRID_SIZE; c++) {
            let emptyRow = GRID_SIZE - 1;
            for (let r = GRID_SIZE - 1; r >= 0; r--) {
                if (board[r][c]) {
                    if (r !== emptyRow) {
                        hasCascaded = true;
                        const piece = board[r][c];
                        board[emptyRow][c] = piece;
                        board[r][c] = null;
                        piece.el.classList.add('fall');
                        piece.el.style.top = `${emptyRow * (TILE_SIZE + TILE_GAP) - 1}px`;
                        piece.el.dataset.r = emptyRow;
                        
                        // Removed the buzzy fall sound for a cleaner audio experience
                    }
                    emptyRow--;
                }
            }
        }
        
        // Don't wait for animation if we're checking for matches immediately
        if (hasCascaded) {
            // Let animation start but don't block the game logic
            // Use shorter timeout on mobile for faster gameplay
            const animationTimeout = isMobile ? FALL_ANIMATION_MS / 2 : FALL_ANIMATION_MS;
            setTimeout(() => {
                document.querySelectorAll('.piece.fall').forEach(el => el.classList.remove('fall'));
            }, animationTimeout);
        }
        
        return hasCascaded;
    }

    async function refill() {
        const TILE_SIZE = gameBoardEl.querySelector('.tile').offsetWidth;
        const TILE_GAP = 2;
        let hasRefilled = false;
        
        for (let c = 0; c < GRID_SIZE; c++) {
            let newPieceCount = 0;
            
            // Find the topmost existing piece in this column to potentially match with
            let existingPieceType = null;
            // Scan from top to bottom to find the first existing piece (the topmost one)
            for (let r = 0; r < GRID_SIZE; r++) {
                if (board[r][c] !== null && board[r][c].type && !board[r][c].special) {
                    existingPieceType = board[r][c].type;
                    break; // Found the topmost existing piece
                }
            }
            
            for (let r = GRID_SIZE - 1; r >= 0; r--) {
                if (board[r][c] === null) {
                    hasRefilled = true;
                    newPieceCount++;
                    
                    let fruitType;
                    // For the first new piece (closest to existing pieces), use configurable probability to match
                    if (newPieceCount === 1 && existingPieceType && Math.random() < FRUIT_MATCH_PROBABILITY) {
                        fruitType = existingPieceType;
                    } else {
                        fruitType = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
                    }
                    
                    const pieceData = { 
                        type: fruitType, 
                        special: null, 
                        el: null 
                    };
                    const pieceEl = createPieceElement(r, c, pieceData, true);
                    pieceEl.style.top = `-${newPieceCount * (TILE_SIZE + TILE_GAP) - 1}px`;
                    pieceContainerEl.appendChild(pieceEl);
                    pieceData.el = pieceEl;
                    board[r][c] = pieceData;
                    
                    // Start animation immediately but don't wait for it
                    requestAnimationFrame(() => {
                        pieceEl.classList.add('fall');
                        pieceEl.style.top = `${r * (TILE_SIZE + TILE_GAP) - 1}px`;
                    });
                    
                    // Removed the buzzy fall sound for smoother audio experience
                }
            }
        }
        
        // Don't wait for animation if we're checking for matches immediately
        if (hasRefilled) {
            // Let animation complete in background
            // Use shorter timeout on mobile for faster gameplay
            const animationTimeout = isMobile ? FALL_ANIMATION_MS / 2 : FALL_ANIMATION_MS;
            setTimeout(() => {
                document.querySelectorAll('.piece.fall').forEach(el => el.classList.remove('fall'));
            }, animationTimeout);
        }
        
        return hasRefilled;
    }
    
    async function animateSwap(el1, el2) {
        const pos1 = { top: el1.style.top, left: el1.style.left };
        const pos2 = { top: el2.style.top, left: el2.style.left };
        el1.style.top = pos2.top; el1.style.left = pos2.left;
        el2.style.top = pos1.top; el2.style.left = pos1.left;
        await new Promise(resolve => setTimeout(resolve, SWAP_ANIMATION_MS));
    }
    
    async function clearPieces(piecesToClearSet) {
        for (const pieceData of piecesToClearSet) {
            if (pieceData && pieceData.el) {
                const r = parseInt(pieceData.el.dataset.r);
                const c = parseInt(pieceData.el.dataset.c);
                pieceData.el.classList.add('matched');
                board[r][c] = null;
                
                // Clear jelly from this tile
                clearJelly(r, c);
                
                // Create explosion effect
                const rect = pieceData.el.getBoundingClientRect();
                createParticleExplosion(rect.left + rect.width / 2, rect.top + rect.height / 2);
            }
        }
        await new Promise(resolve => setTimeout(() => {
            document.querySelectorAll('.piece.matched').forEach(el => el.remove());
            resolve();
        }, MATCH_ANIMATION_MS));
    }

    function findMatches() {
        const allMatches = [];
        const matchedPieces = new Set();
        const isMatched = (r, c) => matchedPieces.has(`${r},${c}`);
        
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE - 2; c++) {
                if (isMatched(r, c) || !board[r][c] || board[r][c].special) continue;
                const p1 = board[r][c];
                const match = [{r, c, type: p1.type}];
                for (let k = c + 1; k < GRID_SIZE; k++) {
                    const p2 = board[r][k];
                    if (p2 && !p2.special && p1.type === p2.type) match.push({r, c: k, type: p2.type}); else break;
                }
                if (match.length >= 3) {
                    match.orientation = 'horizontal';
                    allMatches.push(match);
                    match.forEach(p => matchedPieces.add(`${p.r},${p.c}`));
                    c += match.length - 1;
                }
            }
        }
        
        for (let c = 0; c < GRID_SIZE; c++) {
            for (let r = 0; r < GRID_SIZE - 2; r++) {
                if (isMatched(r, c) || !board[r][c] || board[r][c].special) continue;
                const p1 = board[r][c];
                const match = [{r, c, type: p1.type}];
                for (let k = r + 1; k < GRID_SIZE; k++) {
                    const p2 = board[k][c];
                    if (p2 && !p2.special && p1.type === p2.type) match.push({r: k, c, type: p2.type}); else break;
                }
                if (match.length >= 3) {
                    match.orientation = 'vertical';
                    allMatches.push(match);
                    match.forEach(p => matchedPieces.add(`${p.r},${p.c}`));
                    r += match.length - 1;
                }
            }
        }
        
        const intersections = allMatches.flat().map(p => `${p.r},${p.c}`).reduce((acc, pos) => { acc[pos] = (acc[pos] || 0) + 1; return acc; }, {});
        for (const pos in intersections) {
            if (intersections[pos] > 1) {
                const [r_s, c_s] = pos.split(','); const r = parseInt(r_s), c = parseInt(c_s);
                const hMatch = allMatches.find(m => m.some(p => p.r === r && p.c === c) && m.orientation === 'horizontal');
                const vMatch = allMatches.find(m => m.some(p => p.r === r && p.c === c) && m.orientation === 'vertical');
                if(hMatch && vMatch) {
                    const combined = [...new Set([...hMatch.map(p => `${p.r},${p.c}`), ...vMatch.map(p => `${p.r},${p.c}`)])].map(s => { const [r,c] = s.split(','); return {r: parseInt(r), c: parseInt(c)}; });
                    combined.isTOrL = true; combined.corner = { r, c };
                    const indexH = allMatches.indexOf(hMatch); if(indexH > -1) allMatches.splice(indexH, 1);
                    const indexV = allMatches.indexOf(vMatch); if(indexV > -1) allMatches.splice(indexV, 1);
                    allMatches.push(combined);
                }
            }
        }
        return allMatches;
    }

    // NEW: Generate collection goals for a level
    function generateCollectionGoals(level) {
        // Use ALL fruits that are on the board
        const fruits = EMOJIS; // ['🍌', '🥝', '🍋', '🍉', '🍇', '🍒', '🥥']
        collectionGoals = {};
        
        // Jelly counts for each level (matching the pattern designs)
        const jellyCounts = {
            1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 
            9: 36, 10: 40, 11: 44, 12: 48, 13: 52, 14: 56, 15: 60, 16: 64
        };
        
        const jellyCount = jellyCounts[level] || 64;
        
        // Set collection targets for ALL fruits (simple linear progression)
        fruits.forEach(fruit => {
            // Simple progression: Start at 5, increase by 1 each level
            const target = 4 + level; // Level 1 = 5, Level 2 = 6, Level 3 = 7, etc.
            
            collectionGoals[fruit] = {
                target: target,
                collected: 0
            };
        });
        
        allCollectionGoalsMet = false;
        updateCollectionUI();
    }

    // NEW: Update collection goals UI
    function updateCollectionUI() {
        collectionTargetsEl.innerHTML = '';
        
        Object.keys(collectionGoals).forEach(fruit => {
            const goal = collectionGoals[fruit];
            const isCompleted = goal.collected >= goal.target;
            
            const itemEl = document.createElement('div');
            itemEl.className = `collection-item-simple ${isCompleted ? 'completed' : ''}`;
            
            const displayText = isCompleted ? '✅' : `${goal.collected}/${goal.target}`;
            
            itemEl.innerHTML = `
                <div class="collection-fruit-simple">${fruit}</div>
                <div class="collection-text-simple">${displayText}</div>
            `;
            
            collectionTargetsEl.appendChild(itemEl);
        });
    }

    // NEW: Check if all collection goals are met
    function checkCollectionGoals() {
        allCollectionGoalsMet = Object.keys(collectionGoals).every(fruit => 
            collectionGoals[fruit].collected >= collectionGoals[fruit].target
        );
        return allCollectionGoalsMet;
    }

    // NEW: Add collected fruits and update UI
    function addCollectedFruits(pieces) {
        let anyGoalProgressed = false;
        
        pieces.forEach(piece => {
            const fruit = piece.type;
            if (collectionGoals[fruit] && collectionGoals[fruit].collected < collectionGoals[fruit].target) {
                collectionGoals[fruit].collected++;
                anyGoalProgressed = true;
                
                // Play collection sound
                playCollectionSound();
                
                // Check if this specific goal was just completed
                if (collectionGoals[fruit].collected === collectionGoals[fruit].target) {
                    playGoalCompleteSound();
                    createCollectionCelebration(fruit);
                }
            }
        });
        
        if (anyGoalProgressed) {
            updateCollectionUI();
        }
    }

    // NEW: Create celebration effect for completed collection goal
    function createCollectionCelebration(fruit) {
        const celebrationEl = document.createElement('div');
        celebrationEl.className = 'collection-celebration';
        document.body.appendChild(celebrationEl);
        
        // Create star burst effect
        for (let i = 0; i < 12; i++) {
            const star = document.createElement('div');
            star.className = 'collection-star';
            const angle = (i / 12) * 360;
            const distance = 50 + Math.random() * 30;
            star.style.left = '50%';
            star.style.top = '50%';
            star.style.transform = `translate(-50%, -50%) rotate(${angle}deg) translateY(-${distance}px)`;
            celebrationEl.appendChild(star);
        }
        
        // Remove celebration after animation
        setTimeout(() => {
            celebrationEl.remove();
        }, 1000);
    }

    // NEW: Collection sound effects
    function playCollectionSound() {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
    }
    
    function playGoalCompleteSound() {
        // Play a triumphant chord for goal completion
        const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
        
        frequencies.forEach((freq, index) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
            
            gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
            
            oscillator.start(audioContext.currentTime + index * 0.05);
            oscillator.stop(audioContext.currentTime + 0.8);
        });
    }

    // NEW: Create sophisticated jelly patterns for progressive difficulty
    function createJellyPattern() {
        jelliedTiles.clear();
        
        // Predefined level patterns with coordinates
        const levelPatterns = {
            1: [[3,3], [3,4], [4,3], [4,4]], // 4 tiles - center 2x2
            2: [[3,1], [3,2], [3,5], [3,6], [4,1], [4,2], [4,5], [4,6]], // 8 tiles - separated 2x2s
            3: [[2,3], [2,4], [3,2], [3,3], [3,4], [3,5], [4,2], [4,3], [4,4], [4,5], [5,3], [5,4]], // 12 tiles - diamond
            4: [[0,0], [0,1], [0,6], [0,7], [1,0], [1,1], [1,6], [1,7], [6,0], [6,1], [6,6], [6,7], [7,0], [7,1], [7,6], [7,7]], // 16 tiles - four corners
            5: [[0,4], [1,4], [2,3], [2,4], [3,0], [3,1], [3,2], [3,3], [3,4], [3,5], [4,2], [4,3], [4,4], [4,5], [4,6], [4,7], [5,3], [5,4], [6,3], [7,3]], // 20 tiles - cross
            6: [[0,3], [0,4], [1,3], [1,4], [2,3], [2,4], [3,0], [3,1], [3,2], [3,5], [3,6], [3,7], [4,0], [4,1], [4,2], [4,5], [4,6], [4,7], [5,3], [5,4], [6,3], [6,4], [7,3], [7,4]], // 24 tiles - vertical cross
            7: [[0,0], [0,1], [0,6], [0,7], [1,0], [1,1], [1,6], [1,7], [2,2], [2,3], [2,4], [2,5], [3,2], [3,5], [4,2], [4,5], [5,2], [5,3], [5,4], [5,5], [6,0], [6,1], [6,6], [6,7], [7,0], [7,1], [7,6], [7,7]], // 28 tiles - frame with rectangle
            8: [[0,0], [0,1], [0,2], [0,5], [0,6], [0,7], [1,0], [1,1], [1,2], [1,5], [1,6], [1,7], [2,0], [2,1], [2,6], [2,7], [5,0], [5,1], [5,6], [5,7], [6,0], [6,1], [6,2], [6,5], [6,6], [6,7], [7,0], [7,1], [7,2], [7,5], [7,6], [7,7]], // 32 tiles - thick frame
            9: [[0,0], [0,1], [0,2], [0,3], [0,4], [0,5], [0,6], [0,7], [1,7], [2,1], [2,2], [2,3], [2,4], [2,5], [2,7], [3,1], [3,5], [3,7], [4,1], [4,3], [4,5], [4,7], [5,1], [5,3], [5,4], [5,5], [5,7], [6,1], [6,7], [7,1], [7,2], [7,3], [7,4], [7,5], [7,6], [7,7]], // 36 tiles - spiral/maze
            10: [[0,3], [0,4], [1,1], [1,2], [1,3], [1,4], [1,5], [1,6], [2,1], [2,2], [2,3], [2,4], [2,5], [2,6], [3,1], [3,2], [3,3], [3,4], [3,5], [3,6], [4,1], [4,2], [4,3], [4,4], [4,5], [4,6], [5,1], [5,2], [5,3], [5,4], [5,5], [5,6], [6,1], [6,2], [6,3], [6,4], [6,5], [6,6], [7,3], [7,4]], // 40 tiles - vertical oval
            11: [[0,0], [0,1], [0,2], [0,5], [0,6], [0,7], [1,0], [1,1], [1,2], [1,3], [1,4], [1,5], [1,6], [1,7], [2,0], [2,1], [2,6], [2,7], [3,1], [3,3], [3,4], [3,6], [4,1], [4,3], [4,4], [4,6], [5,0], [5,1], [5,6], [5,7], [6,0], [6,1], [6,2], [6,3], [6,4], [6,5], [6,6], [6,7], [7,0], [7,1], [7,2], [7,5], [7,6], [7,7]], // 44 tiles - complex frame
            12: [[0,0], [0,1], [0,2], [0,3], [0,4], [0,5], [0,6], [0,7], [1,0], [1,1], [1,2], [1,3], [1,4], [1,5], [1,6], [1,7], [2,0], [2,1], [2,6], [2,7], [3,0], [3,1], [3,6], [3,7], [4,0], [4,1], [4,6], [4,7], [5,0], [5,1], [5,6], [5,7], [6,0], [6,1], [6,2], [6,3], [6,4], [6,5], [6,6], [6,7], [7,0], [7,1], [7,2], [7,3], [7,4], [7,5], [7,6], [7,7]], // 48 tiles - full frame
            13: [[0,2], [0,3], [0,4], [0,5], [1,1], [1,2], [1,3], [1,4], [1,5], [1,6], [2,0], [2,1], [2,2], [2,3], [2,4], [2,5], [2,6], [2,7], [3,0], [3,1], [3,2], [3,3], [3,4], [3,5], [3,6], [3,7], [4,0], [4,1], [4,2], [4,3], [4,4], [4,5], [4,6], [4,7], [5,0], [5,1], [5,2], [5,3], [5,4], [5,5], [5,6], [5,7], [6,1], [6,2], [6,3], [6,4], [6,5], [6,6], [7,2], [7,3], [7,4], [7,5]], // 52 tiles - diamond expansion
            14: [[0,0], [0,1], [0,2], [0,3], [0,4], [0,5], [0,6], [0,7], [1,0], [1,1], [1,2], [1,3], [1,4], [1,5], [1,6], [1,7], [2,1], [2,2], [2,3], [2,4], [2,5], [2,6], [3,1], [3,2], [3,3], [3,4], [3,5], [3,6], [4,1], [4,2], [4,3], [4,4], [4,5], [4,6], [5,1], [5,2], [5,3], [5,4], [5,5], [5,6], [6,0], [6,1], [6,2], [6,3], [6,4], [6,5], [6,6], [6,7], [7,0], [7,1], [7,2], [7,3], [7,4], [7,5], [7,6], [7,7]], // 56 tiles - almost full
            15: [[0,0], [0,1], [0,2], [0,3], [0,4], [0,5], [0,6], [0,7], [1,0], [1,1], [1,2], [1,3], [1,4], [1,5], [1,6], [1,7], [2,0], [2,1], [2,2], [2,3], [2,4], [2,5], [2,6], [2,7], [3,0], [3,1], [3,2], [3,5], [3,6], [3,7], [4,0], [4,1], [4,2], [4,5], [4,6], [4,7], [5,0], [5,1], [5,2], [5,3], [5,4], [5,5], [5,6], [5,7], [6,0], [6,1], [6,2], [6,3], [6,4], [6,5], [6,6], [6,7], [7,0], [7,1], [7,2], [7,3], [7,4], [7,5], [7,6], [7,7]], // 60 tiles - tiny center gap
            16: [[0,0], [0,1], [0,2], [0,3], [0,4], [0,5], [0,6], [0,7], [1,0], [1,1], [1,2], [1,3], [1,4], [1,5], [1,6], [1,7], [2,0], [2,1], [2,2], [2,3], [2,4], [2,5], [2,6], [2,7], [3,0], [3,1], [3,2], [3,3], [3,4], [3,5], [3,6], [3,7], [4,0], [4,1], [4,2], [4,3], [4,4], [4,5], [4,6], [4,7], [5,0], [5,1], [5,2], [5,3], [5,4], [5,5], [5,6], [5,7], [6,0], [6,1], [6,2], [6,3], [6,4], [6,5], [6,6], [6,7], [7,0], [7,1], [7,2], [7,3], [7,4], [7,5], [7,6], [7,7]] // 64 tiles - full board
        };
        
        // Get pattern for current level (default to full board for levels > 16)
        const pattern = levelPatterns[level] || levelPatterns[16];
        
        // Apply jelly to specified coordinates
        pattern.forEach(([r, c]) => {
            const tileIndex = r * GRID_SIZE + c;
            jelliedTiles.add(tileIndex);
            gameBoardEl.children[tileIndex].classList.add('jellied');
        });
    }
    
    // High Score System
    function getHighScores() {
        try {
            const scores = localStorage.getItem('stellarJellyHighScores');
            if (scores) {
                return JSON.parse(scores);
            } else {
                // Return default high scores if none exist
                return getDefaultHighScores();
            }
        } catch (e) {
            console.error('Error loading high scores:', e);
            return getDefaultHighScores();
        }
    }
    
    function getDefaultHighScores() {
        return [
            { name: "StarCrusher", score: 125000, level: 12, date: new Date().toLocaleDateString() },
            { name: "JellyMaster", score: 98500, level: 10, date: new Date().toLocaleDateString() },
            { name: "FruitNinja", score: 87200, level: 9, date: new Date().toLocaleDateString() },
            { name: "MatchKing", score: 76800, level: 8, date: new Date().toLocaleDateString() },
            { name: "CyberCrusher", score: 65400, level: 7, date: new Date().toLocaleDateString() },
            { name: "NeonPlayer", score: 54700, level: 6, date: new Date().toLocaleDateString() },
            { name: "GalaxyGamer", score: 43200, level: 5, date: new Date().toLocaleDateString() },
            { name: "StellarSwap", score: 32800, level: 4, date: new Date().toLocaleDateString() }
        ];
    }
    
    function saveHighScore(score, level, playerName = "Anonymous") {
        try {
            let highScores = getHighScores();
            const newScore = {
                name: playerName,
                score: score,
                level: level,
                date: new Date().toLocaleDateString()
            };
            
            highScores.push(newScore);
            highScores.sort((a, b) => {
                // First sort by score (descending)
                if (b.score !== a.score) return b.score - a.score;
                // If scores are equal, sort by level (descending)
                return b.level - a.level;
            });
            
            // Keep only top 8 scores
            highScores = highScores.slice(0, 8);
            
            localStorage.setItem('stellarJellyHighScores', JSON.stringify(highScores));
            return highScores;
        } catch (e) {
            console.error('Error saving high score:', e);
            return getHighScores();
        }
    }
    
    function isNewHighScore(score, level) {
        const highScores = getHighScores();
        if (highScores.length < 8) return true;
        
        const lowestHighScore = highScores[highScores.length - 1];
        return score > lowestHighScore.score || 
               (score === lowestHighScore.score && level > lowestHighScore.level);
    }
    
    function displayHighScores(container, highlightNew = false, newScore = null) {
        const highScores = getHighScores();
        container.innerHTML = '';
        
        if (highScores.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-light); font-style: italic;">No high scores yet!</div>';
            return;
        }
        
        highScores.forEach((scoreData, index) => {
            const scoreItem = document.createElement('div');
            scoreItem.className = 'high-score-item';
            
            // Highlight if this is a new high score
            if (highlightNew && newScore && 
                scoreData.score === newScore.score && 
                scoreData.level === newScore.level &&
                scoreData.name === newScore.name) {
                scoreItem.classList.add('new-high-score');
            }
            
            scoreItem.innerHTML = `
                <div class="high-score-rank">${index + 1}</div>
                <div class="high-score-name">${scoreData.name}</div>
                <div class="high-score-level">Level ${scoreData.level}</div>
                <div class="high-score-score">${scoreData.score.toLocaleString()}</div>
            `;
            
            container.appendChild(scoreItem);
        });
    }
    
}); 