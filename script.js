// --- AudioAnalyzer Class ---
class AudioAnalyzer {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256; // Trade-off between time and frequency resolution
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        this.source = null;
        this.audioElement = null;
        this.delayNode = this.audioContext.createDelay(5.0);
    }

    async loadAudio(file, existingElement = null) {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        if (existingElement) {
            this.audioElement = existingElement;
        } else {
            const url = URL.createObjectURL(file);
            this.audioElement = new Audio(url);
        }

        if (!this.source) {
            this.source = this.audioContext.createMediaElementSource(this.audioElement);
            this.source.connect(this.analyser);
            this.analyser.connect(this.delayNode);
            this.delayNode.connect(this.audioContext.destination);
        }

        return new Promise((resolve, reject) => {
            const onCanPlay = () => {
                cleanup();
                resolve(this.audioElement);
            };

            const onError = (e) => {
                cleanup();
                reject(e);
            };

            const cleanup = () => {
                this.audioElement.removeEventListener('canplaythrough', onCanPlay);
                this.audioElement.removeEventListener('canplay', onCanPlay);
                this.audioElement.removeEventListener('error', onError);
            };

            this.audioElement.addEventListener('canplaythrough', onCanPlay);
            this.audioElement.addEventListener('canplay', onCanPlay);
            this.audioElement.addEventListener('error', onError);

            // If already ready, resolve immediately
            if (this.audioElement.readyState >= 3) {
                onCanPlay();
            }
        });
    }

    play() {
        if (this.audioElement) {
            this.audioElement.play();
        }
    }

    getFrequencyData() {
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    playHitSound() {
        // Simple synth hit sound using Web Audio
        if (!this.audioContext) return;
        
        try {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, this.audioContext.currentTime);
            osc.frequency.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
            
            gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.start();
            osc.stop(this.audioContext.currentTime + 0.1);
        } catch (e) {
            console.error("Hit sound failed", e);
        }
    }

    // Simple beat detection based on energy threshold
    detectBeat(sensitivity = 200) {
        this.analyser.getByteFrequencyData(this.dataArray);
        let sum = 0;
        // Focus on low frequencies for beats (kick drums)
        for (let i = 0; i < 10; i++) {
            sum += this.dataArray[i];
        }
        const average = sum / 10;
        return average > sensitivity;
    }
}

// --- Menu Background Visualizer ---
class MenuVisualizer {
    constructor() {
        this.bars = new Array(60).fill(0).map(() => Math.random() * 100);
        this.targets = new Array(60).fill(0).map(() => Math.random() * 100);
    }

    update() {
        for (let i = 0; i < this.bars.length; i++) {
            // Smoothly move towards target
            this.bars[i] += (this.targets[i] - this.bars[i]) * 0.1;

            // Occasionally change target
            if (Math.abs(this.bars[i] - this.targets[i]) < 1 || Math.random() > 0.95) {
                this.targets[i] = Math.random() * 200 * (1 - i / 60); // Taper off results
            }
        }
    }

    draw(ctx, width, height, color) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1.0;

        const barWidth = width / this.bars.length;
        const bottomOffset = height - 20;

        // Base line
        ctx.beginPath();
        ctx.moveTo(0, bottomOffset);
        ctx.lineTo(width, bottomOffset);
        ctx.stroke();

        // Scribble bars (horizontal at the bottom)
        for (let i = 0; i < this.bars.length; i++) {
            const x = i * barWidth;
            const barHeight = this.bars[i] * 1.5; // Slightly taller

            ctx.beginPath();
            ctx.moveTo(x, bottomOffset);
            // Jitter effect
            const jitter = () => (Math.random() - 0.5) * 2;
            ctx.lineTo(x + jitter(), bottomOffset - barHeight + jitter());
            ctx.stroke();
        }
        ctx.restore();
    }
}

let menuVisualizer = new MenuVisualizer();



// --- Game Objects ---
class Note {
    constructor(laneIndex, speed, length = 0) {
        this.laneIndex = laneIndex;
        this.y = -50; // Start at standard position
        this.speed = speed;
        this.length = length;
        this.hit = false;
        this.isHolding = false;
        this.missed = false;
        // Vib-Ribbon shapes: 0=Loop, 1=Square, 2=Triangle, 3=X (mapped to lanes)
        this.type = laneIndex;
    }

    update(deltaTime) {
        // Normalize speed to 60fps
        const frameScale = deltaTime / 16.67;

        // Notes always move down unless held (handled in Lane.update)
        this.y += this.speed * frameScale;
    }

    // Optimized draw: ctx styles are set by parent
    draw(ctx, laneX, laneWidth) {
        // If head is hit but it's a long note and we are holding, we still draw the tail
        if (this.hit && this.length <= 0) return;

        // If completely passed and finished
        if (this.hit && this.length > 0 && this.y > TARGET_Y + this.length) return;

        const centerX = laneX + laneWidth / 2;
        const size = 30;

        // Draw Tail (Hold Body)
        if (this.length > 0) {
            const rgb = currentThemeRgb;
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${settings.longNoteAlpha})`;
            // Tail extends UP from the head (y) to (y - length)
            // But since Y increases as we go down... 
            // The head is at Y. The end of the tail is at Y - length.

            // If we are holding, the head should be visually pinned to TargetY?
            // Let's just draw it normally for now.
            const tailY = this.y - this.length;
            const headY = this.y;

            ctx.fillRect(centerX - 10, tailY, 20, this.length);
        }

        // Don't draw head if already hit (unless we want to show it 'stuck'?)
        if (this.hit) return;

        ctx.beginPath();

        // Scribble effect (random jitter)
        const jitter = () => (Math.random() - 0.5) * 2;

        // Vib-Ribbon style wireframe arrows
        const half = size / 2;

        switch (this.type) {
            case 0: // Left Arrow
                ctx.moveTo(centerX + half + jitter(), this.y - half + jitter());
                ctx.lineTo(centerX - half + jitter(), this.y + jitter()); // Tip
                ctx.lineTo(centerX + half + jitter(), this.y + half + jitter());
                // Inner scribble
                ctx.moveTo(centerX + half - 5 + jitter(), this.y - half + 5 + jitter());
                ctx.lineTo(centerX - half + 5 + jitter(), this.y + jitter());
                ctx.lineTo(centerX + half - 5 + jitter(), this.y + half - 5 + jitter());
                break;
            case 1: // Down Arrow
                ctx.moveTo(centerX - half + jitter(), this.y - half + jitter());
                ctx.lineTo(centerX + jitter(), this.y + half + jitter()); // Tip
                ctx.lineTo(centerX + half + jitter(), this.y - half + jitter());
                // Inner scribble
                ctx.moveTo(centerX - half + 5 + jitter(), this.y - half + 5 + jitter());
                ctx.lineTo(centerX + jitter(), this.y + half - 5 + jitter());
                ctx.lineTo(centerX + half - 5 + jitter(), this.y - half + 5 + jitter());
                break;
            case 2: // Up Arrow
                ctx.moveTo(centerX - half + jitter(), this.y + half + jitter());
                ctx.lineTo(centerX + jitter(), this.y - half + jitter()); // Tip
                ctx.lineTo(centerX + half + jitter(), this.y + half + jitter());
                // Inner scribble
                ctx.moveTo(centerX - half + 5 + jitter(), this.y + half - 5 + jitter());
                ctx.lineTo(centerX + jitter(), this.y - half + 5 + jitter());
                ctx.lineTo(centerX + half - 5 + jitter(), this.y + half - 5 + jitter());
                break;
            case 3: // Right Arrow
                ctx.moveTo(centerX - half + jitter(), this.y - half + jitter());
                ctx.lineTo(centerX + half + jitter(), this.y + jitter()); // Tip
                ctx.lineTo(centerX - half + jitter(), this.y + half + jitter());
                // Inner scribble
                ctx.moveTo(centerX - half + 5 + jitter(), this.y - half + 5 + jitter());
                ctx.lineTo(centerX + half - 5 + jitter(), this.y + jitter());
                ctx.lineTo(centerX - half + 5 + jitter(), this.y + half - 5 + jitter());
                break;
        }

        ctx.stroke();
    }
}

class Lane {
    constructor(index, x, width) {
        this.index = index;
        this.x = x;
        this.width = width;
        this.notes = [];
        // Key names will be set dynamically during draw or update
        this.hitEffectTimer = 0;
        this.cooldown = 0; // Prevent spawning on top of long notes
    }

    spawnNote(speed, length = 0) {
        this.notes.push(new Note(this.index, speed, length));
        // Set cooldown based on length + buffer
        // Note speed is pixels per frame (approx).
        // Time to clear = length / speed.
        // Add minimal buffer (e.g. 200px gap)
        if (length > 0) {
            this.cooldown = (length / speed) + (100 / speed);
        } else {
            this.cooldown = 20; // Small mandatory gap for normal notes
        }
    }

    update(deltaTime, targetY, hitWindow, onHit, onMiss) {
        // Update hit effect
        if (this.hitEffectTimer > 0) {
            this.hitEffectTimer -= deltaTime / 16.67; // Normalize to frames
        }

        if (this.cooldown > 0) {
            this.cooldown -= deltaTime / 16.67;
        }

        // Identify key for this lane for checking active keys
        let laneKey = null;
        if (this.index === 0) laneKey = keyBindings.left;
        else if (this.index === 1) laneKey = keyBindings.down;
        else if (this.index === 2) laneKey = keyBindings.up;
        else if (this.index === 3) laneKey = keyBindings.right;

        for (let i = this.notes.length - 1; i >= 0; i--) {
            const note = this.notes[i];
            note.update(deltaTime);

            // Remove normal notes immediately if hit
            if (note.hit && note.length === 0) {
                this.notes.splice(i, 1);
                continue;
            }

            // Hold Logic
            if (note.hit && note.length > 0) {
                if (activeKeys[laneKey] || settings.botPlay) {
                    // Holding correctly
                    note.isHolding = true;

                    // "Eaten" Visual Effect:
                    // Fix the head at target line
                    note.y = targetY;
                    // Decrease length by travel speed
                    note.length -= note.speed * (deltaTime / 16.67);

                    // Score tick for holding
                    score += 1;
                    updateUI();

                    // Check if fully consumed
                    if (note.length <= 0) {
                        note.dead = true;
                        score += 50;
                        this.notes.splice(i, 1);
                        continue;
                    }

                } else if (!note.missed) {
                    // Released early!
                    note.isHolding = false;
                    note.missed = true;
                    onMiss();
                    if (settings.instaDie) triggerGameOver();

                    // Disappear immediately as requested
                    this.notes.splice(i, 1);
                    continue;
                }
            }

            // Check miss (for head)
            if (note.y > targetY + hitWindow && !note.hit && !note.missed) {
                note.missed = true;
                onMiss();
                // Insta-Die check
                if (settings.instaDie) triggerGameOver();
            }

            // Cleanup
            // If it's a long note that was missed (or finished but not cleanly), waiting for tail to pass
            if ((note.y - note.length) > targetY + 200) {
                this.notes.splice(i, 1);
            }
        }
    }

    draw(ctx, targetY, keyName, dynamicColor) {
        // Draw Lane Line (wireframe style)
        ctx.strokeStyle = dynamicColor;
        ctx.globalAlpha = 0.2; // Faint lines
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x, 0);
        ctx.lineTo(this.x, canvas.height);
        ctx.moveTo(this.x + this.width, 0);
        ctx.lineTo(this.x + this.width, canvas.height);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Draw Target Marker (Receptor)
        const centerX = this.x + this.width / 2;

        // Pulse effect when hit
        let scale = 1;
        if (this.hitEffectTimer > 0) {
            scale = 1 + (this.hitEffectTimer / 10) * 0.3; // Scale up to 1.3x
            ctx.shadowBlur = 10;
            ctx.shadowColor = "white";

            // Lane Light-up Effect (Accessibility check)
            if (settings.laneLights) {
                ctx.save();
                ctx.fillStyle = dynamicColor;
                ctx.globalAlpha = 0.2;
                ctx.fillRect(this.x, 0, this.width, canvas.height);
                ctx.restore();
            }
        }

        ctx.strokeStyle = dynamicColor;
        ctx.lineWidth = 2;
        ctx.beginPath();

        const size = 35 * scale;
        const half = size / 2;

        if (this.index === 0) { // Left
            ctx.moveTo(centerX + half, targetY - half);
            ctx.lineTo(centerX - half, targetY);
            ctx.lineTo(centerX + half, targetY + half);
        }
        else if (this.index === 1) { // Down
            ctx.moveTo(centerX - half, targetY - half);
            ctx.lineTo(centerX, targetY + half);
            ctx.lineTo(centerX + half, targetY - half);
        }
        else if (this.index === 2) { // Up
            ctx.moveTo(centerX - half, targetY + half);
            ctx.lineTo(centerX, targetY - half);
            ctx.lineTo(centerX + half, targetY + half);
        }
        else if (this.index === 3) { // Right
            ctx.moveTo(centerX - half, targetY - half);
            ctx.lineTo(centerX + half, targetY);
            ctx.lineTo(centerX - half, targetY + half);
        }
        ctx.stroke();

        // Reset shadow
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";

        // Draw Key Name
        ctx.fillStyle = dynamicColor;
        ctx.font = "bold 20px 'Courier Prime', monospace";
        ctx.textAlign = "center";

        // Clean up key name for display (e.g., "ArrowUp" -> "UP")
        let displayName = keyName.replace('Arrow', '').toUpperCase();
        if (displayName.length > 6) displayName = displayName.substr(0, 5) + '.';

        ctx.fillText(displayName, centerX, targetY + 60);

        // Draw Notes
        this.notes.forEach(note => note.draw(ctx, this.x, this.width));
    }

    triggerHit() {
        this.hitEffectTimer = 10; // Frames of animation
    }

    checkInput(targetY, hitWindow) {
        // Find closest note
        let closestNote = null;
        let minDist = Infinity;

        this.notes.forEach(note => {
            if (!note.hit && !note.missed) {
                const dist = Math.abs(note.y - targetY);
                if (dist < minDist) {
                    minDist = dist;
                    closestNote = note;
                }
            }
        });

        if (closestNote && minDist <= hitWindow) {
            closestNote.hit = true;
            return closestNote; // Return the note object
        }
        return null; // Miss/Ghost tap
    }
}

// --- Song Library Persistence (IndexedDB) ---
const SongLibrary = {
    db: null,
    dbName: '4VibesDB',
    version: 4,

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('songs')) {
                    db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('scores')) {
                    const store = db.createObjectStore('scores', { keyPath: 'id' });
                    store.createIndex('songId', 'songId', { unique: false });
                }
            };
        });
    },

    async addSong(title, audioBlob, videoBlob = null) {
        const transaction = this.db.transaction(['songs'], 'readwrite');
        const store = transaction.objectStore('songs');
        return new Promise((resolve, reject) => {
            const request = store.add({
                title,
                audio: audioBlob,
                video: videoBlob,
                dateAdded: Date.now()
            });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAllSongs() {
        const transaction = this.db.transaction(['songs'], 'readonly');
        const store = transaction.objectStore('songs');
        return new Promise((resolve) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
        });
    },

    async deleteSong(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['songs', 'scores'], 'readwrite');
            transaction.objectStore('songs').delete(id);
            // Optionally delete scores for this song
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    },

    async getHighScore(songId, difficulty) {
        const id = `${songId}_${difficulty}`;
        const transaction = this.db.transaction(['scores'], 'readonly');
        const store = transaction.objectStore('scores');
        return new Promise((resolve) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result ? request.result.score : 0);
        });
    },

    async updateHighScore(songId, difficulty, score) {
        const id = `${songId}_${difficulty}`;
        const currentHigh = await this.getHighScore(songId, difficulty);
        if (score > currentHigh) {
            const transaction = this.db.transaction(['scores'], 'readwrite');
            const store = transaction.objectStore('scores');
            store.put({ id, songId, difficulty, score, date: Date.now() });
        }
    }
};

// --- Main Game Logic ---

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const uiLayer = document.getElementById('ui-layer');
const startScreen = document.getElementById('start-screen');
const settingsScreen = document.getElementById('settings-screen');
const loadingScreen = document.getElementById('loading-screen'); // New
const resultsScreen = document.getElementById('results-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const creditsScreen = document.getElementById('credits-screen'); // New
const progressBar = document.getElementById('progress-bar');
const bgVideo = document.getElementById('bg-video');
const restartBtn = document.getElementById('restart-btn');
const libraryBtn = document.getElementById('library-btn');
const libraryScreen = document.getElementById('library-screen');
const libraryBackBtn = document.getElementById('library-back-btn');
const settingsBtn = document.getElementById('settings-btn');
const creditsBtn = document.getElementById('credits-btn');
const backBtn = document.getElementById('back-btn');
const creditsBackBtn = document.getElementById('credits-back-btn');
const fileInput = document.getElementById('audio-upload'); // Might be null, handle safely
const retryBtn = document.getElementById('retry-btn');
const precisionSlider = document.getElementById('precision-slider');
const contactBtn = document.getElementById('contact-btn');
const contactScreen = document.getElementById('contact-screen');
const contactBackBtn = document.getElementById('contact-back-btn');
const failMenuBtn = document.getElementById('fail-menu-btn');
const precisionValue = document.getElementById('precision-value');
const scoreDisplay = document.getElementById('score-display');
const healthContainer = document.getElementById('health-container'); // New
const healthBar = document.getElementById('health-bar'); // New
const comboPopup = document.getElementById('combo-popup'); // New
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const finalScoreEl = document.getElementById('final-score');
const maxComboEl = document.getElementById('max-combo');
const rankEl = document.getElementById('rank-grade');
const failScoreEl = document.getElementById('fail-score'); // New

// Game State
let analyzer;

// Global interaction listener to unlock AudioContext
function unlockAudioContext() {
    console.log("Interaction detected, unlocking audio...");
    if (analyzer && analyzer.audioContext.state === 'suspended') {
        analyzer.audioContext.resume().then(() => {
            console.log("AudioContext resumed successfully.");
        });
    }
    
    // Resume menu music if it was blocked
    if (menuMusic) {
        if (menuMusic.paused) {
            menuMusic.play().then(() => {
                console.log("Menu music started.");
            }).catch(e => {
                console.warn("Menu music play failed, retrying on next interaction:", e);
                return; // Don't remove listeners if it failed
            });
        }
    }
    
    // Remove listeners once successfully unlocked (or attempted)
    document.removeEventListener('click', unlockAudioContext);
    document.removeEventListener('keydown', unlockAudioContext);
    document.removeEventListener('touchstart', unlockAudioContext);
}
document.addEventListener('click', unlockAudioContext);
document.addEventListener('keydown', unlockAudioContext);
document.addEventListener('touchstart', unlockAudioContext);

let lanes = [];
let isPlaying = false;
let isPaused = false;
let isLoading = false;
let loadingInterval = null;
let score = 0;
let combo = 0;
let maxCombo = 0; // New
let health = 100; // New
let lastTime = 0;
let spawnCooldown = 0;
const activeKeys = {};
let currentFile = null; // Store the current file for restarts
let resultsTimeout = null;
let menuMusic = new Audio('videoplayback.m4a');
menuMusic.loop = true;

// Gameplay & Accessibility Settings
let settings = {
    laneLights: true,
    botPlay: false,
    ghostTap: true,
    lifeSystem: true,
    longNoteAlpha: 0.3,
    instaDie: false,
    themeColor: '#ffffff',
    difficulty: 1, // 0: Peace, 1: Normal, 2: Hard, 3: Chaos
    longNotes: true,
    bgDim: 0.2, // Default 20% dimming
    audioOffset: 0, // Calibration offset in ms
    language: 'en'
};

// --- i18n Translation Dictionary ---
const i18n = {
    en: {
        library: "LIBRARY", credits: "CREDITS", contact: "CONTACT", configuration: "CONFIGURATION",
        back: "BACK", input: "INPUT", left: "LEFT", down: "DOWN", up: "UP", right: "RIGHT", pause: "PAUSE",
        gameplay: "GAMEPLAY", precision: "PRECISION (HIT WINDOW)", audiovisuals: "AUDIO / VISUALS",
        language: "LANGUAGE", bgdim: "BACKGROUND DIM", longnoteopacity: "LONG NOTE OPACITY", themecolor: "THEME COLOR",
        reset: "RESET", lanelights: "LANE LIGHTS", audiooffset: "AUDIO OFFSET", calibrate: "CALIBRATE", fullscreen: "FULLSCREEN",
        songlibrary: "SONG LIBRARY", searchsong: "SEARCH SONG...", addnewsong: "ADD NEW SONG", difficulty: "DIFFICULTY",
        normal: "NORMAL", longnotes: "LONG\nNOTES", botplay: "BOT\nPLAY", ghosttap: "GHOST\nTAP", lifesystem: "LIFE\nSYSTEM",
        instadie: "INSTA-\nDIE", loading: "LOADING...", results: "RESULTS", score: "SCORE:", maxcombo: "MAX COMBO:",
        rank: "RANK:", continue: "CONTINUE", failed: "FAILED", retry: "RETRY", creditsmadeby: "Made by: Atlas",
        contactgmail: "Gmail:", contactnote: "Note: I'm not usually checking constantly, so I might not read it immediately.",
        combo: "Combo:", paused: "PAUSED", resume: "RESUME", restart: "RESTART", exittolibrary: "EXIT TO LIBRARY",
        calibrationinstruction1: "TAP SPACEBAR OR STRIKE THE SCREEN", calibrationinstruction2: "EXACTLY ON THE BEAT",
        taps: "TAPS:", avgoffset: "AVG OFFSET:", saveandexit: "SAVE & EXIT", cancel: "CANCEL", presskey: "PRESS KEY...",
        peace: "PEACE", hard: "HARD", chaos: "CHAOS", play: "PLAY", delete: "DELETE", on: "ON", off: "OFF"
    },
    es: {
        library: "BIBLIOTECA", credits: "CRÉDITOS", contact: "CONTACTO", configuration: "CONFIGURACIÓN",
        back: "VOLVER", input: "CONTROLES", left: "IZQUIERDA", down: "ABAJO", up: "ARRIBA", right: "DERECHA", pause: "PAUSA",
        gameplay: "JUGABILIDAD", precision: "PRECISIÓN (MARGEN)", audiovisuals: "AUDIO / GRÁFICOS",
        language: "IDIOMA", bgdim: "OSCURECIMIENTO", longnoteopacity: "OPACIDAD NOTAS LARGAS", themecolor: "COLOR DEL TEMA",
        reset: "PRD", lanelights: "LUCES DE CARRIL", audiooffset: "RETRASO AUDIO", calibrate: "CALIBRAR", fullscreen: "PANTALLA COMPLETA",
        songlibrary: "BIBLIOTECA", searchsong: "BUSCAR CANCIÓN...", addnewsong: "AÑADIR CANCIÓN NUEVA", difficulty: "DIFICULTAD",
        normal: "NORMAL", longnotes: "NOTAS\nLARGAS", botplay: "MODO\nBOT", ghosttap: "TOQUE\nFANTASMA", lifesystem: "SISTEMA\nVIDA",
        instadie: "MUERTE\nSÚBITA", loading: "CARGANDO...", results: "RESULTADOS", score: "PUNTUACIÓN:", maxcombo: "COMBO MÁX:",
        rank: "RANGO:", continue: "CONTINUAR", failed: "FALLASTE", retry: "REINTENTAR", creditsmadeby: "Creado por: Atlas",
        contactgmail: "Correo:", contactnote: "Nota: Normalmente no reviso constantemente, así que podría no leerlo de inmediato.",
        combo: "Combo:", paused: "PAUSADO", resume: "REANUDAR", restart: "REINICIAR", exittolibrary: "SALIR AL MENÚ",
        calibrationinstruction1: "TOCA ESPACIO O GOLPEA LA PANTALLA", calibrationinstruction2: "EXACTAMENTE EN EL RITMO",
        taps: "TOQUES:", avgoffset: "RETRASO MEDIO:", saveandexit: "GUARDAR Y SALIR", cancel: "CANCELAR", presskey: "PRESIONA...",
        peace: "PAZ", hard: "DIFÍCIL", chaos: "CAOS", play: "JUGAR", delete: "ELIMINAR", on: "SÍ", off: "NO"
    },
    pt: {
        library: "BIBLIOTECA", credits: "CRÉDITOS", contact: "CONTATO", configuration: "CONFIGURAÇÃO",
        back: "VOLTAR", input: "CONTROLES", left: "ESQUERDA", down: "BAIXO", up: "CIMA", right: "DIREITA", pause: "PAUSA",
        gameplay: "JOGABILIDADE", precision: "PRECISÃO (MARGEM)", audiovisuals: "ÁUDIO / GRÁFICOS",
        language: "IDIOMA", bgdim: "ESCURECIMENTO", longnoteopacity: "OPACIDADE NOTAS LONGAS", themecolor: "COR DO TEMA",
        reset: "PADRÃO", lanelights: "LUZES DA FAIXA", audiooffset: "ATRASO DE ÁUDIO", calibrate: "CALIBRAR", fullscreen: "TELA CHEIA",
        songlibrary: "BIBLIOTECA", searchsong: "BUSCAR MÚSICA...", addnewsong: "ADICIONAR MÚSICA NOVA", difficulty: "DIFICULDADE",
        normal: "NORMAL", longnotes: "NOTAS\nLONGAS", botplay: "MODO\nBOT", ghosttap: "TOQUE\nFANTASMA", lifesystem: "SISTEMA\nVIDA",
        instadie: "MORTE\nSÚBITA", loading: "CARREGANDO...", results: "RESULTADOS", score: "PONTUAÇÃO:", maxcombo: "COMBO MÁX:",
        rank: "RANK:", continue: "CONTINUAR", failed: "FALHOU", retry: "TENTAR NOVAMENTE", creditsmadeby: "Feito por: Atlas",
        contactgmail: "E-mail:", contactnote: "Nota: Normalmente não verifico constantemente, então posso não ler imediatamente.",
        combo: "Combo:", paused: "PAUSADO", resume: "RETOMAR", restart: "REINICIAR", exittolibrary: "SAIR PRO MENU",
        calibrationinstruction1: "TOQUE ESPAÇO OU BATA NA TELA", calibrationinstruction2: "EXATAMENTE NA BATIDA",
        taps: "TOQUES:", avgoffset: "ATRASO MÉDIO:", saveandexit: "SALVAR E SAIR", cancel: "CANCELAR", presskey: "PRESSIONE...",
        peace: "PAZ", hard: "DIFÍCIL", chaos: "CAOS", play: "JOGAR", delete: "EXCLUIR", on: "SIM", off: "NÃO"
    }
};

function getLang() {
    let lang = settings.language || 'en';
    if (lang === 'wingdings') return 'en';
    return i18n[lang] ? lang : 'en';
}

function setLanguage(lang) {
    // Sanitize input: if no lang provided or lang is wingdings, use internal logic
    const currentLang = settings.language || 'en';

    if (currentLang === 'wingdings') {
        document.body.classList.add('lang-wingdings');
        lang = 'en';
    } else {
        document.body.classList.remove('lang-wingdings');
        // Use provided lang if valid, otherwise fallback to settings or 'en'
        if (!i18n[lang]) lang = i18n[currentLang] ? currentLang : 'en';
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang] && i18n[lang][key]) {
            // Handle newlines in strings vs innerText
            if (el.tagName === 'INPUT' && el.type === 'text') {
                el.placeholder = i18n[lang][key];
            } else {
                // Convert "\n" to actual <br> if needed, but innerHTML is safer for buttons with breaks
                el.innerHTML = i18n[lang][key].replace(/\n/g, '<br>');
            }
        }
    });

    // Update dynamically swapped values if they are showing default text
    updateKeyButtons(); // re-apply keys or "PRESS KEY..."

    // Update toggles for current language
    const toggles = [
        { id: 'toggle-lights', key: 'laneLights' },
        { id: 'toggle-bot', key: 'botPlay' },
        { id: 'toggle-ghost', key: 'ghostTap' },
        { id: 'toggle-life', key: 'lifeSystem' },
        { id: 'toggle-longnotes', key: 'longNotes' },
        { id: 'toggle-instadie', key: 'instaDie' }
    ];
    toggles.forEach(t => updateToggleButton(t.id, settings[t.key]));
}

// Global Visual Caches (Performance)
let currentDynamicColor = '#ffffff';
let currentThemeRgb = { r: 255, g: 255, b: 255 };


const DIFFICULTY_SETTINGS = [
    { label: 'PEACE', speed: 4, sensitivity: 150, cooldown: 25, doubleChance: 0.05 },
    { label: 'NORMAL', speed: 5, sensitivity: 100, cooldown: 15, doubleChance: 0.3 },
    { label: 'HARD', speed: 7, sensitivity: 80, cooldown: 10, doubleChance: 0.5 },
    { label: 'CHAOS', speed: 10, sensitivity: 60, cooldown: 5, doubleChance: 0.7 }
];

// ... (Config & Settings SAME) ...
const LANE_COUNT = 4;
let NOTE_SPEED = 5;
let HIT_WINDOW = 50; // Now mutable
let TARGET_Y = 500;

// Default bindings
let keyBindings = {
    left: 'ArrowLeft',
    down: 'ArrowDown',
    up: 'ArrowUp',
    right: 'ArrowRight',
    pause: 'Escape'
};

// Load saved settings
if (localStorage.getItem('vibKeyBindings')) {
    try {
        keyBindings = JSON.parse(localStorage.getItem('vibKeyBindings'));
    } catch (e) {
        console.error("Failed to load bindings", e);
    }
}
if (localStorage.getItem('vibHitWindow')) {
    HIT_WINDOW = parseInt(localStorage.getItem('vibHitWindow'));
} else {
    HIT_WINDOW = 60; // Increased default to help with latency
}
// Global Game Variables
let audioContext;
let audioSource;
let audioBuffer;

// Preview Audio
const previewAudio = new Audio();
previewAudio.volume = 0.5;
let currentPreviewUrl = null;
let currentHoverVideo = null; // Track playing video preview

// Audio Fade Helper
function fadeAudio(audio, targetVolume, duration, onComplete = null) {
    if (!audio) return;

    // Clear any existing fade interval
    if (audio._fadeInterval) {
        clearInterval(audio._fadeInterval);
        audio._fadeInterval = null;
    }

    // Start playback immediately if target volume is > 0 and audio is paused
    if (targetVolume > 0 && audio.paused) {
        audio.volume = 0;
        audio.play().catch(e => console.log("Fade play interrupted:", e));
    }

    const startVolume = audio.volume;
    const volumeChange = targetVolume - startVolume;
    const steps = 20;
    const stepDuration = duration / steps;
    const volumeStep = volumeChange / steps;
    let currentStep = 0;

    audio._fadeInterval = setInterval(() => {
        currentStep++;
        let nextVolume = startVolume + (volumeStep * currentStep);

        // Clamp volume between 0 and 1
        nextVolume = Math.max(0, Math.min(1, nextVolume));
        audio.volume = nextVolume;

        if (currentStep >= steps) {
            clearInterval(audio._fadeInterval);
            audio._fadeInterval = null;
            audio.volume = targetVolume;

            // Pause if fading to 0
            if (targetVolume === 0) {
                audio.pause();
                if (onComplete) onComplete();
            }
        }
    }, stepDuration);
}

// Load Settings from LocalStorage
const savedSettings = localStorage.getItem('vibSettings');
if (savedSettings) {
    try {
        settings = { ...settings, ...JSON.parse(savedSettings) };
    } catch (e) {
        console.error("Failed to load settings", e);
    }
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Re-calculate target position (around 85% down the screen)
    TARGET_Y = canvas.height * 0.85;

    // Resize Lanes to fill width
    const laneWidth = canvas.width / LANE_COUNT;
    lanes.forEach((lane, i) => {
        lane.x = i * laneWidth;
        lane.width = laneWidth;
    });
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function applyTheme(color) {
    document.documentElement.style.setProperty('--dynamic-color', color);
    document.documentElement.style.setProperty('--fg-color', color);
    document.documentElement.style.setProperty('--accent-color', color);

    // Cache Color globally to avoid querying getComputedStyle every frame
    currentDynamicColor = color;
    currentThemeRgb = hexToRgb(color) || { r: 255, g: 255, b: 255 };

    // Update color picker if it exists
    const picker = document.getElementById('theme-color-picker');
    if (picker) picker.value = color;
}

function applyBgDim(opacity) {
    const dimmer = document.getElementById('bg-dimmer');
    if (dimmer) {
        dimmer.style.opacity = opacity;
    }
    const dimValue = document.getElementById('dim-value');
    if (dimValue) {
        dimValue.innerText = Math.round(opacity * 100) + '%';
    }
}

async function populateLibraryList(filter = '') {
    const listContainer = document.getElementById('library-list');
    if (!listContainer) return;

    const songs = await SongLibrary.getAllSongs();
    const filteredSongs = songs.filter(s =>
        s.title.toLowerCase().includes(filter.toLowerCase())
    );

    if (filteredSongs.length === 0) {
        listContainer.innerHTML = `<div class="empty-library-message">NO SONGS FOUND</div>`;
        return;
    }

    // Fetch all scores first to avoid flickering in the loop
    const songsWithScores = await Promise.all(filteredSongs.map(async song => {
        const highScore = await SongLibrary.getHighScore(song.id, settings.difficulty);
        return { ...song, highScore };
    }));

    const fragment = document.createDocumentFragment();
    const lang = getLang();
    const difficultyLabel = i18n[lang][DIFFICULTY_SETTINGS[settings.difficulty].label.toLowerCase()] || DIFFICULTY_SETTINGS[settings.difficulty].label;

    songsWithScores.forEach(song => {
        const card = document.createElement('div');
        card.className = 'song-card';

        const isVideo = song.audio.type.startsWith('video/');
        let videoHtml = '';
        let videoBlobUrl = null;

        if (isVideo) {
            videoBlobUrl = URL.createObjectURL(song.audio);
            videoHtml = `<video class="card-video-bg" src="${videoBlobUrl}" muted loop preload="metadata"></video>`;
        }

        card.innerHTML = `
            ${videoHtml}
            <div class="song-title">${song.title}</div>
            <div class="high-score">
                ${difficultyLabel}: ${song.highScore > 0 ? song.highScore : '---'}
            </div>
            <div class="song-actions">
                <button class="button play-btn" data-i18n="play">PLAY</button>
                <button class="button delete-btn" style="border-color: #ff3333; color: #ff3333;" data-i18n="delete">DELETE</button>
            </div>
        `;

        const videoElement = card.querySelector('.card-video-bg');

        if (videoElement) {
            videoElement.addEventListener('loadedmetadata', () => {
                // Seek to a frame to use as thumbnail
                videoElement.currentTime = Math.min(5, videoElement.duration / 2);
            });
        }

        // Hover Previews
        card.addEventListener('mouseenter', () => {
            // Fade out menu music
            fadeAudio(menuMusic, 0, 300);

            if (isVideo && videoElement) {
                videoElement.muted = false;
                currentHoverVideo = videoElement;
                fadeAudio(videoElement, 0.5, 300);
            } else {
                if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
                currentPreviewUrl = URL.createObjectURL(song.audio);
                previewAudio.src = currentPreviewUrl;
                fadeAudio(previewAudio, 0.5, 300);
            }
        });

        card.addEventListener('mouseleave', () => {
            if (isLoading || isPlaying) return; // Do not process during game start

            // Fade menu music back in
            fadeAudio(menuMusic, 1, 300);

            if (isVideo && videoElement) {
                fadeAudio(videoElement, 0, 300, () => {
                    videoElement.muted = true;
                    currentHoverVideo = null;
                });
            } else {
                fadeAudio(previewAudio, 0, 300, () => {
                    previewAudio.src = '';
                });
            }
        });

        // Play song
        card.querySelector('.play-btn').addEventListener('click', () => {
            // Stop previews and clean up
            if (currentHoverVideo) {
                clearInterval(currentHoverVideo._fadeInterval);
                currentHoverVideo.pause();
                currentHoverVideo.muted = true;
                currentHoverVideo = null;
            }
            clearInterval(previewAudio._fadeInterval);
            previewAudio.pause();
            previewAudio.src = '';

            // Initialize Media early to capture user gesture
            const currentAnalyzer = new AudioAnalyzer();
            currentAnalyzer.audioContext.resume().then(() => {
                initGame(song.audio, song.id, currentAnalyzer);
            });
        });

        // Delete song
        card.querySelector('.delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            // Cleanup blob url if needed
            if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
            await SongLibrary.deleteSong(song.id);
            // Get current search filter for refresh
            const currentFilter = document.getElementById('library-search').value;
            populateLibraryList(currentFilter);
        });

        fragment.appendChild(card);
    });

    // Final DOM update to prevent flickering
    listContainer.innerHTML = '';
    listContainer.appendChild(fragment);
}

async function init() {
    // Initialize Database
    await SongLibrary.init();

    // Create Lanes first so resize can update them
    lanes = [];
    const laneWidth = canvas.width / LANE_COUNT;
    for (let i = 0; i < LANE_COUNT; i++) {
        lanes.push(new Lane(i, i * laneWidth, laneWidth));
    }

    resize();
    window.addEventListener('resize', resize);

    // Start Persistent Animation Loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    // Init settings UI
    precisionSlider.value = HIT_WINDOW;
    precisionValue.innerText = HIT_WINDOW + 'px';

    // Update toggle button states
    updateToggleButton('toggle-lights', settings.laneLights);
    updateToggleButton('toggle-bot', settings.botPlay);
    updateToggleButton('toggle-ghost', settings.ghostTap);
    updateToggleButton('toggle-ghost', settings.ghostTap);
    updateToggleButton('toggle-life', settings.lifeSystem);
    updateToggleButton('toggle-instadie', settings.instaDie);

    // Init Sliders
    document.getElementById('alpha-slider').value = settings.longNoteAlpha;
    document.getElementById('alpha-value').innerText = settings.longNoteAlpha;

    document.getElementById('difficulty-slider').value = settings.difficulty;
    document.getElementById('difficulty-value').innerText = DIFFICULTY_SETTINGS[settings.difficulty].label;

    const offsetSliderInit = document.getElementById('offset-slider');
    const offsetValueInit = document.getElementById('offset-value');
    if (offsetSliderInit && settings.audioOffset !== undefined) {
        offsetSliderInit.value = settings.audioOffset;
        offsetValueInit.innerText = settings.audioOffset + 'ms';
    }

    // Apply difficulty variables
    const diff = DIFFICULTY_SETTINGS[settings.difficulty];
    NOTE_SPEED = diff.speed;

    // Apply background dim
    applyBgDim(settings.bgDim);
    document.getElementById('dim-slider').value = settings.bgDim;

    // UI Toggles State
    const togglesToUpdate = [
        { id: 'toggle-lights', key: 'laneLights' },
        { id: 'toggle-bot', key: 'botPlay' },
        { id: 'toggle-ghost', key: 'ghostTap' },
        { id: 'toggle-life', key: 'lifeSystem' },
        { id: 'toggle-longnotes', key: 'longNotes' },
        { id: 'toggle-instadie', key: 'instaDie' }
    ];

    togglesToUpdate.forEach(t => {
        const btn = document.getElementById(t.id);
        if (btn) {
            updateToggleButton(t.id, settings[t.key]);
        }
    });

    // Apply saved theme
    applyTheme(settings.themeColor);

    // Apply saved language
    document.getElementById('language-select').value = settings.language;
    setLanguage(settings.language);

    // Input Listeners
    window.addEventListener('keydown', handleInput);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('touchstart', handleTouch, { passive: false });
    if (fileInput) fileInput.addEventListener('change', handleFileUpload);

    // Fullscreen logic
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.error(`Error: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        });
    }

    // Library screen navigation handled in setupSettingsUI logic

    // Add Song to Library
    const audioUploadNew = document.getElementById('audio-upload-new');
    audioUploadNew.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const title = file.name.split('.').slice(0, -1).join('.') || file.name;
        await SongLibrary.addSong(title, file);

        // Reset input value to allow selecting the same file again after deletion
        e.target.value = '';

        // Refresh list
        populateLibraryList();
    });

    // Search Library
    const librarySearch = document.getElementById('library-search');
    librarySearch.addEventListener('input', () => {
        populateLibraryList(librarySearch.value);
    });

    // UI Listeners
    setupSettingsUI();

    // Restart/Retry Listeners
    restartBtn.addEventListener('click', returnToLibrary);
    retryBtn.addEventListener('click', () => {
        if (currentFile) {
            const currentAnalyzer = new AudioAnalyzer();
            currentAnalyzer.audioContext.resume().then(() => {
                initGame(currentFile, currentSongId, currentAnalyzer);
            });
        }
    });

    failMenuBtn.addEventListener('click', returnToLibrary);

    // Pause Listeners
    document.getElementById('pause-btn').addEventListener('click', togglePause);
    document.getElementById('resume-btn').addEventListener('click', togglePause);

    document.getElementById('pause-restart-btn').addEventListener('click', () => {
        if (currentFile) {
            togglePause(); // Unpause first
            const currentAnalyzer = new AudioAnalyzer();
            currentAnalyzer.audioContext.resume().then(() => {
                initGame(currentFile, currentSongId, currentAnalyzer);
            });
        }
    });
    document.getElementById('exit-btn').addEventListener('click', () => {
        togglePause();
        returnToLibrary();
    });

    // Sync Protection
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (isPlaying && !isPaused) {
                togglePause();
            }
        }
    });
}

function returnToLibrary() {
    isPlaying = false;
    isPaused = false;
    if (resultsTimeout) clearTimeout(resultsTimeout);
    document.getElementById('pause-screen').classList.remove('active');

    if (analyzer) {
        if (analyzer.audioElement) {
            analyzer.audioElement.pause();
            analyzer.audioElement.src = '';
            analyzer.audioElement.load(); // Force release
        }
        if (analyzer.audioContext) {
            analyzer.audioContext.close().catch(() => { });
        }
        analyzer = null;
    }

    // Resume Menu Music
    menuMusic.play().catch(e => console.log("Menu music blocked", e));

    // Hide Video Background
    bgVideo.pause();
    bgVideo.src = '';
    bgVideo.classList.add('hidden');

    // Reset file input so the same song can be played again
    if (fileInput) fileInput.value = '';
    currentFile = null;

    // Hide all game screens and show library screen
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));
    document.getElementById('library-screen').classList.add('active');
    populateLibraryList();

    // Reset UI elements
    scoreDisplay.classList.add('hidden');
    healthContainer.classList.add('hidden');
    comboPopup.classList.remove('pop');

    // Clean up game state
    lanes.forEach(lane => lane.notes = []);
    score = 0;
    combo = 0;
    health = 100;
}

function togglePause() {
    if (!isPlaying || resultsScreen.classList.contains('active')) return;

    isPaused = !isPaused;
    const pauseScreen = document.getElementById('pause-screen');

    if (isPaused) {
        pauseScreen.classList.add('active');
        if (analyzer && analyzer.audioElement) {
            analyzer.audioElement.pause();
            if (analyzer.audioContext) analyzer.audioContext.suspend();
        }
        bgVideo.pause();
    } else {
        pauseScreen.classList.remove('active');
        lastTime = performance.now(); // Reset lastTime to prevent delta jump
        if (analyzer && analyzer.audioElement) {
            analyzer.audioContext.resume().then(() => {
                analyzer.audioElement.play();
                bgVideo.play();
            });
        } else {
            bgVideo.play();
        }
    }
}



function updateToggleButton(id, active) {
    const btn = document.getElementById(id);
    if (!btn) return;

    const lang = getLang();

    if (active) {
        btn.classList.add('active');
        btn.innerText = i18n[lang].on || 'ON';
    } else {
        btn.classList.remove('active');
        btn.innerText = i18n[lang].off || 'OFF';
    }
}

function setupSettingsUI() {
    // Screen Navigation
    const screens = [
        { btn: document.getElementById('settings-btn'), screen: document.getElementById('settings-screen') },
        { btn: document.getElementById('credits-btn'), screen: document.getElementById('credits-screen') },
        { btn: document.getElementById('contact-btn'), screen: document.getElementById('contact-screen') },
        { btn: libraryBtn, screen: libraryScreen }
    ];

    screens.forEach(s => {
        if (!s.btn) return;
        s.btn.addEventListener('click', () => {
            startScreen.classList.remove('active');
            s.screen.classList.add('active');
            if (s.screen === settingsScreen) updateKeyButtons();
            if (s.screen === document.getElementById('library-screen')) populateLibraryList();
        });
    });

    [backBtn, creditsBackBtn, contactBackBtn, libraryBackBtn].forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', () => {
            // Stop any playing previews and restore menu music
            if (currentHoverVideo) {
                clearInterval(currentHoverVideo._fadeInterval);
                currentHoverVideo.pause();
                currentHoverVideo.muted = true;
                currentHoverVideo = null;
            }
            clearInterval(previewAudio._fadeInterval);
            previewAudio.pause();
            previewAudio.src = '';

            // Ensure menu music is playing at full volume when returning to menu
            if (menuMusic.paused) {
                menuMusic.volume = 1;
                menuMusic.play().catch(e => console.log("Menu music blocked", e));
            } else {
                fadeAudio(menuMusic, 1, 300);
            }

            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            startScreen.classList.add('active');
        });
    });

    // Precision (Hit Window) Slider
    precisionSlider.addEventListener('input', (e) => {
        HIT_WINDOW = parseInt(e.target.value);
        precisionValue.innerText = HIT_WINDOW + 'px';
        localStorage.setItem('vibHitWindow', HIT_WINDOW);
    });

    // Difficulty Slider
    const difficultySlider = document.getElementById('difficulty-slider');
    const difficultyValue = document.getElementById('difficulty-value');
    difficultySlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        settings.difficulty = val;
        const diff = DIFFICULTY_SETTINGS[val];

        // Translate difficulty label
        const lang = getLang();
        const labelKey = diff.label.toLowerCase();
        difficultyValue.innerText = i18n[lang][labelKey] || diff.label;
        difficultyValue.setAttribute('data-i18n', labelKey);

        NOTE_SPEED = diff.speed;
        localStorage.setItem('vibSettings', JSON.stringify(settings));

        // Update library list to show correct high scores for this difficulty
        if (document.getElementById('library-screen').classList.contains('active')) {
            populateLibraryList(document.getElementById('library-search').value);
        }
    });

    // Audio Offset Slider
    const offsetSlider = document.getElementById('offset-slider');
    const offsetValue = document.getElementById('offset-value');
    if (offsetSlider) {
        offsetSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            settings.audioOffset = val;
            offsetValue.innerText = val + 'ms';
            localStorage.setItem('vibSettings', JSON.stringify(settings));
        });
        document.getElementById('calibrate-btn').addEventListener('click', startCalibration);

        // Calibration Cancel and Save
        document.getElementById('cal-cancel-btn').addEventListener('click', () => {
            stopCalibration();
            document.getElementById('calibration-screen').classList.remove('active');
            document.getElementById('settings-screen').classList.add('active');
        });

        document.getElementById('cal-save-btn').addEventListener('click', () => {
            const avgText = document.getElementById('cal-offset').innerText;
            settings.audioOffset = parseInt(avgText) || 0;

            offsetSlider.value = settings.audioOffset;
            offsetValue.innerText = settings.audioOffset + 'ms';
            localStorage.setItem('vibSettings', JSON.stringify(settings));

            document.getElementById('calibration-screen').classList.remove('active');
            document.getElementById('settings-screen').classList.add('active');
        });

        // Calibration Tapping Listeners
        document.addEventListener('keydown', (e) => {
            if (isCalibrating && !e.repeat && (e.code === 'Space')) {
                recordCalibrationTap();
            }
        });
        document.getElementById('calibration-screen').addEventListener('mousedown', () => {
            if (isCalibrating) recordCalibrationTap();
        });
    }

    // Background Dim Slider
    const dimSlider = document.getElementById('dim-slider');
    dimSlider.addEventListener('input', (e) => {
        settings.bgDim = parseFloat(e.target.value);
        applyBgDim(settings.bgDim);
        localStorage.setItem('vibSettings', JSON.stringify(settings));
    });

    // Language Selector
    const langSelect = document.getElementById('language-select');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            settings.language = e.target.value;
            localStorage.setItem('vibSettings', JSON.stringify(settings));
            setLanguage(settings.language);
        });
    }

    // Long Note Alpha Slider
    const alphaSlider = document.getElementById('alpha-slider');
    const alphaValue = document.getElementById('alpha-value');
    alphaSlider.addEventListener('input', (e) => {
        settings.longNoteAlpha = parseFloat(e.target.value);
        alphaValue.innerText = settings.longNoteAlpha;
        localStorage.setItem('vibSettings', JSON.stringify(settings));
    });

    // Theme Color Picker
    const colorPicker = document.getElementById('theme-color-picker');
    colorPicker.addEventListener('input', (e) => {
        settings.themeColor = e.target.value;
        applyTheme(settings.themeColor);
        localStorage.setItem('vibSettings', JSON.stringify(settings));
    });

    // Reset Theme
    document.getElementById('reset-theme-btn').addEventListener('click', () => {
        settings.themeColor = '#ffffff';
        applyTheme(settings.themeColor);
        localStorage.setItem('vibSettings', JSON.stringify(settings));
    });

    // Toggle Buttons
    const configToggles = [
        { id: 'toggle-lights', key: 'laneLights' },
        { id: 'toggle-bot', key: 'botPlay' },
        { id: 'toggle-ghost', key: 'ghostTap' },
        { id: 'toggle-life', key: 'lifeSystem' },
        { id: 'toggle-longnotes', key: 'longNotes' },
        { id: 'toggle-instadie', key: 'instaDie' }
    ];

    configToggles.forEach(t => {
        const btn = document.getElementById(t.id);
        if (!btn) return;
        btn.addEventListener('click', () => {
            settings[t.key] = !settings[t.key];
            updateToggleButton(t.id, settings[t.key]);
            localStorage.setItem('vibSettings', JSON.stringify(settings));
        });
    });

    // Key Rebinding Logic
    const bindableKeys = ['left', 'down', 'up', 'right', 'pause'];
    bindableKeys.forEach(action => {
        const btn = document.querySelector(`.key-btn[data-action="${action}"]`);
        if (!btn) return;
        btn.addEventListener('click', () => {
            const lang = getLang();
            btn.innerText = i18n[lang].presskey || "PRESS KEY...";
            btn.classList.add('listening');

            const onKey = (e) => {
                e.preventDefault();
                keyBindings[action] = e.code;
                localStorage.setItem('vibKeyBindings', JSON.stringify(keyBindings));
                btn.innerText = e.code;
                btn.classList.remove('listening');
                window.removeEventListener('keydown', onKey);
            };

            window.addEventListener('keydown', onKey, { once: true });
        });
    });
}

function updateKeyButtons() {
    const lang = getLang();
    document.querySelector('.key-btn[data-action="left"]').innerText = keyBindings.left;
    document.querySelector('.key-btn[data-action="down"]').innerText = keyBindings.down;
    document.querySelector('.key-btn[data-action="up"]').innerText = keyBindings.up;
    document.querySelector('.key-btn[data-action="right"]').innerText = keyBindings.right;
    document.querySelector('.key-btn[data-action="pause"]').innerText = keyBindings.pause;
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    initGame(file);
}

let currentSongId = null;

async function initGame(file, songId = null, preinitializedAnalyzer = null) {
    currentFile = file;
    currentSongId = songId;
    isPlaying = false;
    isPaused = false;

    // Use pre-initialized analyzer if provided to maintain user gesture
    if (preinitializedAnalyzer) {
        if (analyzer) {
            analyzer.audioContext.close().catch(() => { });
        }
        analyzer = preinitializedAnalyzer;
    }

    // Stop current media immediately
    if (analyzer && analyzer.audioElement && !preinitializedAnalyzer) {
        analyzer.audioElement.pause();
        analyzer.audioElement.src = '';
    }
    if (!preinitializedAnalyzer) {
        bgVideo.pause();
        bgVideo.src = '';
    }
    bgVideo.classList.add('hidden');

    // Show song name on loading screen
    const songNameEl = document.getElementById('loading-song-name');
    if (songNameEl) songNameEl.innerText = file.name || "Library Song";

    // Ensure all overlays are hidden when starting
    const overlays = ['pause-screen', 'game-over-screen', 'results-screen'];
    overlays.forEach(id => document.getElementById(id).classList.remove('active'));

    startScreen.classList.remove('active');
    settingsScreen.classList.remove('active');
    document.getElementById('library-screen').classList.remove('active');
    loadingScreen.classList.add('active'); // Show loading
    isLoading = true;

    // Reset Game State
    score = 0;
    combo = 0;
    maxCombo = 0;
    health = 100;
    updateUI();
    lanes.forEach(lane => lane.notes = []);

    // Pause menu music when starting game and clear any ongoing fades
    if (menuMusic._fadeInterval) clearInterval(menuMusic._fadeInterval);
    menuMusic.pause();

    // Fake Loading Simulation
    let progress = 0;
    loadingInterval = setInterval(() => {
        if (document.hidden) return; // Pause loading progress if tab is hidden

        progress += Math.random() * 5;
        if (progress > 100) progress = 100;
        progressBar.style.width = progress + '%';

        if (progress === 100) {
            clearInterval(loadingInterval);
            loadingInterval = null;
            isLoading = false;

            // Wait for user to be visible before starting the actual game
            const checkVisibility = async () => {
                if (document.hidden) {
                    setTimeout(checkVisibility, 100);
                    return;
                }

                loadingScreen.classList.remove('active');
                scoreDisplay.classList.remove('hidden');
                if (settings.lifeSystem) healthContainer.classList.remove('hidden');

                // Initialize Media if not pre-initialized
                if (!analyzer) {
                    analyzer = new AudioAnalyzer();
                }
                
                const travelTimeSeconds = (TARGET_Y + 50) / (NOTE_SPEED * 60);
                const offsetSec = (settings.audioOffset || 0) / 1000;
                const totalDelay = Math.max(0, travelTimeSeconds - offsetSec);
                
                analyzer.delayNode.delayTime.setValueAtTime(totalDelay, analyzer.audioContext.currentTime);

                const isVideo = file.type.startsWith('video/');
                if (isVideo) {
                    bgVideo.src = URL.createObjectURL(file);
                    bgVideo.classList.remove('hidden');
                    bgVideo.muted = true;
                    await analyzer.loadAudio(file, bgVideo);
                } else {
                    bgVideo.classList.add('hidden');
                    await analyzer.loadAudio(file);
                }

                // Remove previous listeners if reusing audioElement
                const onEnded = () => {
                    resultsTimeout = setTimeout(() => {
                        if (isPlaying) showResults();
                    }, travelTimeSeconds * 1000 + 1000);
                };
                analyzer.audioElement.onended = onEnded;

                // Start reproduction
                analyzer.play();
                isPlaying = true;

                // Sync video if applicable
                if (isVideo) {
                    bgVideo.currentTime = 0;
                    // We don't pause bgVideo here anymore because it's the audio source
                }
            };

            setTimeout(checkVisibility, 500);
        }
    }, 50);
}

async function showResults() {
    isPlaying = false;
    isPaused = false;
    if (resultsTimeout) clearTimeout(resultsTimeout);
    document.getElementById('pause-screen').classList.remove('active');

    scoreDisplay.classList.add('hidden');
    healthContainer.classList.add('hidden'); // Hide health bar

    // Update High Score if in library
    if (currentSongId) {
        await SongLibrary.updateHighScore(currentSongId, settings.difficulty, score);
    }

    // Calculate Rank
    let rank = 'F';
    if (score > 10000) rank = 'S';
    else if (score > 7500) rank = 'A';
    else if (score > 5000) rank = 'B';
    else if (score > 2500) rank = 'C';
    else if (score > 1000) rank = 'D';

    finalScoreEl.innerText = score;
    maxComboEl.innerText = maxCombo;
    rankEl.innerText = rank;

    resultsScreen.classList.add('active');

    // Resume Menu Music
    menuMusic.play().catch(e => console.log("Menu music blocked", e));
}

function triggerGameOver() {
    isPlaying = false;
    if (analyzer && analyzer.audioElement) {
        analyzer.audioElement.pause();
    }
    scoreDisplay.classList.add('hidden');
    healthContainer.classList.add('hidden');

    failScoreEl.innerText = score;
    gameOverScreen.classList.add('active');
}

function showComboPopup(count) {
    comboPopup.innerText = count;
    comboPopup.classList.remove('pop');
    void comboPopup.offsetWidth; // Force reflow
    comboPopup.classList.add('pop');
}

function handleInput(e) {
    // Physical pause key
    if (e.code === keyBindings.pause) {
        togglePause();
        return;
    }

    if (!isPlaying || isPaused) return;

    // Track active keys for Hold Notes
    if (!activeKeys[e.code]) {
        activeKeys[e.code] = true;

        let laneIndex = -1;
        if (e.code === keyBindings.left) laneIndex = 0;
        else if (e.code === keyBindings.down) laneIndex = 1;
        else if (e.code === keyBindings.up) laneIndex = 2;
        else if (e.code === keyBindings.right) laneIndex = 3;

        if (laneIndex >= 0) {
            processInput(laneIndex);
        }
    }
}

function handleKeyUp(e) {
    activeKeys[e.code] = false;

    // Check if we released a hold note too early? 
    // For now, simple logic: if we stop holding, the 'isHolding' state in Lane.update will handle it.
}

function handleTouch(e) {
    if (!isPlaying || isPaused) return;
    // prevent default to stop scrolling/zooming
    if (e.type !== 'click') e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const laneWidth = canvas.width / LANE_COUNT;

    // Reset active keys for touch (simplistic approach for multi-touch)
    // Actually, we should map touches to lanes and set activeKeys based on touches.

    // Clear all touch-based active keys first?
    // No, that's complex. Let's just handle taps for now and maybe hold logic later for touch if requested.
    // For now, let's stick to keyboard hold support primarily or basic touch 'start' as trigger.

    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const x = touch.clientX - rect.left;
        const laneIndex = Math.floor(x / laneWidth);

        if (laneIndex >= 0 && laneIndex < LANE_COUNT) {
            processInput(laneIndex);

            // Should valid 'activeKeys' for touch?
            // Mapping touch to key codes is tricky. 
            // Let's assume touch is just a tap for now to avoid breaking existing touch logic.
        }
    }
}

function processInput(laneIndex) {
    const hitNote = lanes[laneIndex].checkInput(TARGET_Y, HIT_WINDOW);

    if (hitNote) {
        // If it's a long note, we don't give the full score immediately, 
        // just the initial judgment, and we DON'T kill it (Lane.update handles that).
        // But Lane.update handles 'isHolding' if 'hit' is true. 
        // checkInput sets 'hit' to true.

        // Use a base score for hitting the head
        score += 100 + (combo * 10);
        combo++;
        if (combo > maxCombo) maxCombo = combo;

        // Health boost
        if (settings.lifeSystem) health = Math.min(100, health + 2);

        lanes[laneIndex].triggerHit();
        if (analyzer) analyzer.playHitSound(laneIndex);

        if (combo >= 5) {
            showComboPopup(combo);
        }
    } else {
        // Only break combo on ghost tap if ghost tapping is disabled in settings
        // The user said: "it keeps losing combo when hitting nothing with ghost tapping [ON]"
        // So if settings.ghostTap is true, it means ALLOWED (no penalty).
        if (!settings.ghostTap) {
            combo = 0;

            // Penalty check if enabled
            if (settings.lifeSystem) {
                health -= 5;
                if (health <= 0) triggerGameOver();
            }
        }
    }
    updateUI();
}

// Caches for UI Updates (Performance)
let lastUiScore = -1;
let lastUiCombo = -1;
let lastUiHealth = -1;

function updateUI() {
    if (score !== lastUiScore) {
        scoreEl.innerText = score;
        lastUiScore = score;
    }

    if (combo !== lastUiCombo) {
        comboEl.innerText = combo;
        lastUiCombo = combo;
    }

    if (health !== lastUiHealth) {
        healthBar.style.height = health + '%';
        lastUiHealth = health;
    }

    // Hide health bar if life system is off
    if (settings.lifeSystem) {
        if (healthContainer.classList.contains('hidden')) {
            healthContainer.classList.remove('hidden');
        }
    } else {
        if (!healthContainer.classList.contains('hidden')) {
            healthContainer.classList.add('hidden');
        }
    }
}

function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);



    // Use cached dynamic color
    const dynamicColor = currentDynamicColor;

    // Menu Visualizer (if not playing)
    if (!isPlaying) {
        menuVisualizer.update();
        menuVisualizer.draw(ctx, canvas.width, canvas.height, dynamicColor);
        requestAnimationFrame(gameLoop);
        return;
    }

    // Pause check & Sync protection
    if (isPaused) {
        requestAnimationFrame(gameLoop);
        return;
    }

    // Clamp deltaTime (max 100ms) to prevent huge jumps when coming back from background
    const clampedDelta = Math.min(deltaTime, 100);

    ctx.strokeStyle = dynamicColor;
    ctx.fillStyle = dynamicColor;

    // 1. Analyze Audio & Spawn Notes
    const diff = DIFFICULTY_SETTINGS[settings.difficulty];
    if (analyzer.detectBeat(diff.sensitivity)) {
        if (spawnCooldown <= 0) {
            // Spawn in a random lane
            const randomLane = Math.floor(Math.random() * LANE_COUNT);

            // Check lane cooldown
            if (lanes[randomLane].cooldown <= 0) {
                // Randomly decide if it's a long note (15% chance, if enabled in settings)
                const isLong = settings.longNotes && Math.random() < 0.15;
                const length = isLong ? 200 + Math.random() * 200 : 0;
                lanes[randomLane].spawnNote(NOTE_SPEED, length);

                // Sometimes spawn a second note for difficulty (if not long)
                // Also check second lane cooldown
                if (!isLong && Math.random() < diff.doubleChance) {
                    const secondLane = (randomLane + 1) % LANE_COUNT;
                    if (lanes[secondLane].cooldown <= 0) {
                        lanes[secondLane].spawnNote(NOTE_SPEED, 0);
                    }
                }
                spawnCooldown = diff.cooldown; // Dynamic spawn cooldown
            }
        }
    }
    if (spawnCooldown > 0) spawnCooldown--;

    // 2. Update & Draw Lanes
    const keys = [keyBindings.left, keyBindings.down, keyBindings.up, keyBindings.right];

    // Batch draw settings for Notes (optimization)
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Pause if window lose focus
    if (document.hidden && isPlaying && !isPaused) togglePause();

    // Active A/V Sync (Video vs Audio)
    if (isPlaying && !isPaused && analyzer && analyzer.audioElement && !bgVideo.classList.contains('hidden')) {
        const travelTimeSeconds = (TARGET_Y + 50) / (NOTE_SPEED * 60);
        const expectedVideoTime = analyzer.audioElement.currentTime - travelTimeSeconds;

        // Only sync if video has actually started and is positive
        if (expectedVideoTime > 0) {
            const drift = Math.abs(bgVideo.currentTime - expectedVideoTime);
            if (drift > 0.15) { // 150ms tolerance
                bgVideo.currentTime = expectedVideoTime;
            }
        }
    }

    ctx.strokeStyle = "white";

    lanes.forEach((lane, i) => {
        // Bot Play Logic
        if (settings.botPlay) {
            const nearestNote = lane.notes[0];
            if (nearestNote && Math.abs(nearestNote.y - TARGET_Y) < 10) {
                // Trigger a hit
                // If it's a long note, we DON'T kill it. 
                // Lane.update handles the hold logic via 'settings.botPlay' check.
                if (!nearestNote.hit) {
                    const hitNote = lane.checkInput(TARGET_Y, HIT_WINDOW);
                    if (hitNote) {
                        score += 100 + (combo * 10);
                        combo++;
                        if (combo > maxCombo) maxCombo = combo;
                        if (settings.lifeSystem) health = Math.min(100, health + 2);
                        lane.triggerHit();
                        if (analyzer) analyzer.playHitSound(i);
                        updateUI();
                    }
                }
            }
        }

        lane.update(
            clampedDelta,
            TARGET_Y,
            HIT_WINDOW,
            () => { /* onHit (handled in keydown) */ },
            () => { // onMiss
                combo = 0;
                if (settings.lifeSystem) {
                    health -= 10; // Penalty for miss
                    if (health <= 0) triggerGameOver();
                }
                updateUI();
            }
        );
        lane.draw(ctx, TARGET_Y, keys[i], dynamicColor);
    });

    // 3. Draw Target Line (Global)
    ctx.strokeStyle = "#555";
    ctx.beginPath();
    ctx.moveTo(0, TARGET_Y);
    ctx.lineTo(canvas.width, TARGET_Y);
    ctx.stroke();

    // 4. Draw Frequency Visualizer (Left Side)
    if (analyzer) {
        const dataArray = analyzer.getFrequencyData();
        const barWidth = 2; // Thin lines
        const leftOffset = 20; // Offset from edge

        ctx.strokeStyle = dynamicColor;
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Draw a vertical line as the base
        ctx.moveTo(leftOffset, 0);
        ctx.lineTo(leftOffset, canvas.height);

        // Draw frequency spikes
        const step = Math.floor(dataArray.length / 60);
        for (let i = 0; i < 60; i++) {
            const value = dataArray[i * step];
            const percent = value / 255;
            const y = (i / 60) * canvas.height;
            const x = leftOffset + (percent * 100);

            ctx.moveTo(leftOffset, y);
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    requestAnimationFrame(gameLoop);
}

// ============================================
// Audio Calibration Logic
// ============================================
let isCalibrating = false;
let calInterval = null;
let calContext = null;
let calTaps = [];
let expectedBeatTime = 0;

function startCalibration() {
    isCalibrating = false; // False during countdown
    calTaps = [];
    document.getElementById('cal-taps').innerText = '0';
    document.getElementById('cal-offset').innerText = '0';
    document.getElementById('cal-save-btn').classList.add('hidden');

    // Pause Background Music while testing
    if (menuMusic._fadeInterval) clearInterval(menuMusic._fadeInterval);
    menuMusic.pause();

    // Switch screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('calibration-screen').classList.add('active');

    // Start Audio Context
    if (!calContext) calContext = new (window.AudioContext || window.webkitAudioContext)();
    if (calContext.state === 'suspended') calContext.resume();

    const pulseEl = document.getElementById('calibration-pulse');
    const countdownEl = document.getElementById('calibration-countdown');

    // Countdown
    let count = 3;
    countdownEl.innerText = count;

    let countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownEl.innerText = count;
        } else {
            countdownEl.innerText = "GO!";
            clearInterval(countdownInterval);

            setTimeout(() => {
                countdownEl.innerText = "";
            }, 500);

            // Start actual calibration
            isCalibrating = true;
            const intervalMs = 500;

            calInterval = setInterval(() => {
                expectedBeatTime = performance.now();

                // Play beep
                const osc = calContext.createOscillator();
                const gain = calContext.createGain();
                osc.connect(gain);
                gain.connect(calContext.destination);

                osc.frequency.value = 800; // High pitch tick
                osc.type = 'square';

                gain.gain.setValueAtTime(0.1, calContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, calContext.currentTime + 0.1);

                osc.start();
                osc.stop(calContext.currentTime + 0.1);

                // Visual pulse
                pulseEl.classList.add('active');
                setTimeout(() => pulseEl.classList.remove('active'), 100);

            }, intervalMs);
        }
    }, 1000);

    // Safety clear just in case user cancels during countdown
    calInterval = countdownInterval;
}

function stopCalibration() {
    isCalibrating = false;
    if (calInterval) {
        clearInterval(calInterval);
        calInterval = null;
    }

    // Resume menu music if we are heading back to menus
    if (menuMusic.paused) {
        menuMusic.volume = 1;
        menuMusic.play().catch(e => console.log("Menu music blocked", e));
    }
}

function recordCalibrationTap() {
    if (calTaps.length >= 10) return;

    const tapTime = performance.now();
    // Offset is how late the user tapped compared to the expected beat.
    let diff = tapTime - expectedBeatTime;

    // If the difference is huge, they likely tapped early for the next beat
    if (diff > 250) diff -= 500;

    calTaps.push(diff);
    document.getElementById('cal-taps').innerText = calTaps.length;

    if (calTaps.length >= 10) {
        // Calculate average
        const avg = calTaps.reduce((a, b) => a + b, 0) / calTaps.length;
        const roundedAvg = Math.round(avg);
        document.getElementById('cal-offset').innerText = roundedAvg;

        // Show save button
        document.getElementById('cal-save-btn').classList.remove('hidden');
        stopCalibration();
    }
}

// Start menu music on first interaction (browser policy)
window.addEventListener('click', () => {
    if (menuMusic.paused && !isPlaying) {
        menuMusic.play().catch(e => console.log("Audio play failed", e));
    }
}, { once: true });

init();
