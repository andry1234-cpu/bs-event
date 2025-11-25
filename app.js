// Firebase Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, onChildAdded, onDisconnect, set, serverTimestamp, query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCmEbIjFLlLxVgLUqwsOLCsB0aoMWF6PJQ",
  authDomain: "bendingspoons-eventdec25.firebaseapp.com",
  databaseURL: "https://bendingspoons-eventdec25-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "bendingspoons-eventdec25",
  storageBucket: "bendingspoons-eventdec25.firebasestorage.app",
  messagingSenderId: "26050473198",
  appId: "1:26050473198:web:52d2e5d2bb912eaa2ad7ff",
  measurementId: "G-6C7XXL2XSN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Configurazione
const CONFIG = {
    castrPlayerUrl: '', // Inserire l'URL del player CASTR
    maxMessages: 100,
    reactionDuration: 3000,
    // Domain whitelist for authentication (empty array = allow all)
    allowedDomains: ['bendingspoons.com', 'dedgroup.com', 'urlo.events'] // Add more domains like: ['bendingspoons.com', 'gmail.com']
};

// State Management
let currentUser = null;
let currentUserId = null;
let messages = [];
let onlineUsers = 1;
let isAuthenticated = false;
let userColors = {}; // Store user colors
let customEmojis = []; // Store custom emoji URLs
let reactionSlots = ['❤️', '👏', '🔥', '😂', '👍']; // Default emoji slots (configurable)

// DOM Elements (will be initialized after DOM is ready)
let chatMessages, chatInput, sendBtn, reactionsOverlay, reactionButtons, usernameDisplay, onlineUsersDisplay, videoIframe;
let millicastView; // Millicast viewer instance

// Initialize
function init() {
    // Initialize DOM elements
    chatMessages = document.getElementById('chat-messages');
    chatInput = document.getElementById('chat-input');
    sendBtn = document.getElementById('send-btn');
    reactionsOverlay = document.getElementById('reactions-overlay');
    reactionButtons = document.querySelectorAll('.reaction-btn');
    usernameDisplay = document.getElementById('username');
    onlineUsersDisplay = document.getElementById('online-users');
    videoIframe = document.getElementById('video-iframe');
    
    setupEventListeners();
    setupAuth();
    // Note: initializeMillicast() is now called after authentication
    
    // Hide loader and show content after layout is fully stable
    // Wait longer to ensure WebRTC negotiation is complete
    setTimeout(() => {
        const loader = document.getElementById('page-loader');
        const container = document.querySelector('.container');
        
        if (container) {
            container.classList.add('loaded');
        }
        
        if (loader) {
            setTimeout(() => {
                loader.classList.add('hidden');
            }, 300);
        }
    }, 2000);
}

// Setup Authentication
function setupAuth() {
    const welcomeScreen = document.getElementById('welcome-screen');
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Check if user's domain is allowed
            const userEmail = user.email;
            const emailDomain = userEmail.split('@')[1];
            
            // If allowedDomains is configured, check domain
            if (CONFIG.allowedDomains.length > 0 && !CONFIG.allowedDomains.includes(emailDomain)) {
                alert(`❌ Accesso negato!\n\nSolo account @${CONFIG.allowedDomains.join(', @')} possono accedere.\n\nIl tuo dominio: @${emailDomain}`);
                signOut(auth);
                return;
            }
            
            // User is signed in and domain is allowed
            isAuthenticated = true;
            currentUser = user.displayName || user.email;
            currentUserId = user.uid;
            
            // Update UI
            usernameDisplay.textContent = currentUser;
            usernameDisplay.style.display = 'inline-block';
            
            // Hide welcome screen
            if (welcomeScreen) {
                welcomeScreen.classList.add('hidden');
            }
            
            // Hide login button
            const loginBtn = document.getElementById('login-btn');
            if (loginBtn) loginBtn.style.display = 'none';
            
            // Initialize Firebase features
            initializeFirebase();
            
            // Initialize Millicast stream after authentication
            initializeMillicast();
        } else {
            // User is signed out - show welcome screen
            isAuthenticated = false;
            currentUser = null;
            currentUserId = null;
            
            // Disconnect Millicast stream
            if (millicastView) {
                try {
                    millicastView.stop();
                    millicastView = null;
                } catch (error) {
                    console.log('Stream already disconnected');
                }
            }
            
            // Show welcome screen
            if (welcomeScreen) {
                welcomeScreen.classList.remove('hidden');
            }
            
            usernameDisplay.textContent = 'Non autenticato';
            usernameDisplay.style.display = 'none';
            
            const loginBtn = document.getElementById('login-btn');
            if (loginBtn) loginBtn.style.display = 'flex';
        }
    });
}

// Google Sign In
async function signInWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        console.log('Login successful:', result.user.displayName);
    } catch (error) {
        console.error('Login error:', error);
        
        // Ignore popup cancelled errors (user closed popup or multiple attempts)
        if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
            return;
        }
        
        alert('Errore durante il login: ' + error.message);
    }
}

// Sign Out
async function signOutUser() {
    try {
        await signOut(auth);
        console.log('Logout successful');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Initialize Firebase Realtime Features
function initializeFirebase() {
    if (!currentUserId) {
        console.error('User not authenticated');
        return;
    }
    
    // Setup presence system
    setupPresence();
    
    // Listen to messages
    listenToMessages();
    
    // Listen to reactions
    listenToReactions();
    
    // Load custom emojis
    loadCustomEmojisQuiet();
    
    addSystemMessage('Connesso! La chat è sincronizzata.');
}

// Load custom emojis from database (base64)
async function loadCustomEmojisQuiet() {
    try {
        // Load custom emojis
        const emojisRef = ref(database, 'customEmojis');
        onValue(emojisRef, (snapshot) => {
            customEmojis = [];
            
            if (snapshot.exists()) {
                const emojisData = snapshot.val();
                Object.entries(emojisData).forEach(([key, emoji]) => {
                    customEmojis.push({
                        id: key,
                        name: emoji.name,
                        url: emoji.data // base64 data
                    });
                });
            }
            
            updateReactionsBar();
        });
        
        // Load configured reaction slots
        const slotsRef = ref(database, 'reactionSlots');
        onValue(slotsRef, (snapshot) => {
            if (snapshot.exists()) {
                reactionSlots = snapshot.val();
            } else {
                // Default slots
                reactionSlots = ['❤️', '👏', '🔥', '😂', '👍'];
            }
            updateReactionsBar();
        });
    } catch (error) {
        console.error('Error loading custom emojis:', error);
    }
}


// Setup Event Listeners
function setupEventListeners() {
    // Chat
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // Photo button
    const photoBtn = document.getElementById('photo-btn');
    if (photoBtn) {
        photoBtn.addEventListener('click', showPhotoMenu);
    }

    // Reactions
    reactionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const reaction = btn.dataset.reaction;
            triggerReaction(reaction);
        });
    });
    
    // User dropdown menu
    const userDropdown = document.getElementById('user-dropdown');
    
    if (usernameDisplay) {
        const toggleDropdown = (e) => {
            e.stopPropagation();
            e.preventDefault();
            userDropdown.classList.toggle('show');
        };
        
        usernameDisplay.addEventListener('click', toggleDropdown);
        usernameDisplay.addEventListener('touchend', toggleDropdown);
    }
    
    // Close dropdown when clicking outside
    const closeDropdown = (e) => {
        if (userDropdown && !e.target.closest('.user-menu')) {
            userDropdown.classList.remove('show');
        }
    };
    
    document.addEventListener('click', closeDropdown);
    document.addEventListener('touchend', closeDropdown);
    
    // Username edit (legacy - kept for compatibility)
    const editUsernameBtn = document.getElementById('edit-username-btn');
    if (editUsernameBtn) {
        editUsernameBtn.addEventListener('click', openUsernameModal);
    }
}

// Username Modal Functions
window.openUsernameModal = function() {
    const modal = document.getElementById('username-modal');
    const input = document.getElementById('username-input');
    if (modal && input) {
        input.value = currentUser;
        modal.classList.add('active');
        input.focus();
        input.select();
    }
}

window.closeUsernameModal = function() {
    const modal = document.getElementById('username-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

window.saveUsername = function() {
    const input = document.getElementById('username-input');
    const newUsername = input.value.trim();
    
    if (newUsername && newUsername.length > 0) {
        currentUser = newUsername;
        const usernameDisplay = document.getElementById('username');
        if (usernameDisplay) {
            usernameDisplay.textContent = currentUser;
        }
        closeUsernameModal();
        addSystemMessage(`Hai cambiato il tuo nome in "${currentUser}"`);
    }
}

// Initialize Millicast WebRTC viewer
async function initializeMillicast() {
    const videoElement = document.getElementById('millicast-video');
    const placeholder = document.getElementById('placeholder');
    
    if (typeof window.millicast === 'undefined') {
        console.error('Millicast SDK not loaded');
        return;
    }
    
    // Millicast stream configuration (obfuscated for basic security)
    // Note: For production, use Cloud Functions after upgrading to Blaze plan
    const _0x4a2b = ['k9Mwad', 'multiview'];
    const getStreamConfig = () => ({
        accountId: atob('azlNd2Fk'),
        name: atob('bXVsdGl2aWV3')
    });
    
    const tokenGenerator = () => {
        // Require authentication to access stream
        if (!isAuthenticated) {
            throw new Error('Autenticazione richiesta per accedere allo stream');
        }
        
        const config = getStreamConfig();
        return window.millicast.Director.getSubscriber({
            streamAccountId: config.accountId,
            streamName: config.name
        });
    };
    
    try {
        // Create viewer with token generator
        millicastView = new window.millicast.View(undefined, tokenGenerator);
        
        // Set video element
        millicastView.on('track', (event) => {
            videoElement.srcObject = event.streams[0];
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        });
        
        // Listen for video stats events from Millicast
        millicastView.on('stats', (stats) => {
            // Millicast provides detailed stats including source timestamps
            updateMetricsFromMillicastStats(stats);
        });
        
        // Connect and play
        await millicastView.connect();
        
        console.log('Millicast connected successfully');
        
        // Start monitoring stream metrics
        startMetricsMonitoring();
        
    } catch (error) {
        console.error('Millicast connection error:', error);
        if (placeholder) {
            placeholder.innerHTML = '<p>❌</p><small>Errore connessione stream</small>';
        }
    }
}

// Monitor stream metrics
let streamTimestamp = null;

function updateMetricsFromMillicastStats(stats) {
    // Millicast stats event might have timestamp info
    if (stats && stats.timestamp) {
        streamTimestamp = stats.timestamp;
    }
}

function startMetricsMonitoring() {
    const videoElement = document.getElementById('millicast-video');
    
    setInterval(async () => {
        if (!millicastView) {
            console.log('Waiting for millicastView...');
            return;
        }
        
        if (!millicastView.webRTCPeer) {
            console.log('Waiting for webRTCPeer...');
            return;
        }
        
        try {
            const peerConnection = millicastView.webRTCPeer.getRTCPeer();
            if (!peerConnection) {
                console.log('Waiting for peer connection...');
                return;
            }
            
            const stats = await peerConnection.getStats();
            let videoStats = null;
            
            stats.forEach(report => {
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    videoStats = report;
                }
            });
            
            if (videoStats) {
                // Local Time - current browser time in ISO format
                const localTime = new Date();
                const localTimeElement = document.getElementById('local-time');
                if (localTimeElement) {
                    localTimeElement.textContent = localTime.toISOString();
                }
                
                // Stream Time - use timestamp from NTP or estimate from stats
                // OptiView gets this from embedded metadata in the stream
                // We'll estimate by subtracting buffer delay and jitter from current time
                const estimatedLatency = videoStats.jitterBufferDelay && videoStats.jitterBufferEmittedCount 
                    ? (videoStats.jitterBufferDelay / videoStats.jitterBufferEmittedCount) * 1000 + 500 // Add ~500ms for encoding/network
                    : 500;
                
                const streamDate = new Date(Date.now() - estimatedLatency);
                const streamTimeElement = document.getElementById('stream-time');
                if (streamTimeElement) {
                    streamTimeElement.textContent = streamDate.toISOString();
                }
                
                // Latency - calculate difference between local time and stream time
                const latencyMs = localTime - streamDate;
                const latencyElement = document.getElementById('latency');
                if (latencyElement) {
                    latencyElement.textContent = `${latencyMs.toFixed(0)}ms`;
                }
            }
        } catch (error) {
            console.error('Error getting stream stats:', error);
        }
    }, 100); // Update every 100ms for more responsive display
}

// Legacy functions kept for compatibility
function initializeTHEOplayer() {
    console.log('THEOplayer initialization skipped - using Millicast');
}

// CASTR Player Integration (legacy - kept for compatibility)
function loadCastrPlayer() {
    if (CONFIG.castrPlayerUrl && videoIframe) {
        videoIframe.src = CONFIG.castrPlayerUrl;
        videoIframe.classList.add('active');
        const placeholder = document.querySelector('.placeholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }
    }
}

// Funzione per configurare l'URL del player CASTR
function setCastrUrl(url) {
    CONFIG.castrPlayerUrl = url;
    loadCastrPlayer();
}

// ===== FIREBASE REALTIME FUNCTIONS =====

// Setup user presence (online/offline status)
function setupPresence() {
    const userStatusRef = ref(database, 'presence/' + currentUserId);
    const connectedRef = ref(database, '.info/connected');
    
    onValue(connectedRef, (snapshot) => {
        if (snapshot.val() === true) {
            // User is online
            set(userStatusRef, {
                username: currentUser,
                online: true,
                lastSeen: serverTimestamp()
            });
            
            // When user disconnects, mark as offline
            onDisconnect(userStatusRef).set({
                username: currentUser,
                online: false,
                lastSeen: serverTimestamp()
            });
        }
    });
    
    // Listen to all users presence
    const presenceRef = ref(database, 'presence');
    onValue(presenceRef, (snapshot) => {
        let count = 0;
        snapshot.forEach((child) => {
            if (child.val().online) {
                count++;
            }
        });
        updateOnlineUsers(count);
    });
}

// Listen to incoming messages
function listenToMessages() {
    const messagesRef = ref(database, 'messages');
    const messagesQuery = query(messagesRef, orderByChild('timestamp'), limitToLast(CONFIG.maxMessages));
    
    onValue(messagesQuery, (snapshot) => {
        // Clear current messages
        chatMessages.innerHTML = '<div class="system-message">Benvenuto! La chat è pronta per l\'evento.</div>';
        messages = [];
        
        snapshot.forEach((childSnapshot) => {
            const message = childSnapshot.val();
            addMessageToUI(message);
        });
        
        // Scroll to bottom after loading all messages
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
    });
}

// Listen to incoming reactions
let reactionsInitialized = false;

function listenToReactions() {
    const reactionsRef = ref(database, 'reactions');
    const reactionsQuery = query(reactionsRef, orderByChild('timestamp'), limitToLast(50));
    
    // Use onChildAdded to only get new reactions
    onChildAdded(reactionsQuery, (childSnapshot) => {
        // Skip initial data load, only show new reactions
        if (!reactionsInitialized) {
            return;
        }
        
        const reaction = childSnapshot.val();
        const reactionAge = Date.now() - reaction.timestamp;
        
        // Only show if recent
        if (reactionAge < CONFIG.reactionDuration) {
            createFloatingReaction(reaction.emoji);
        }
    });
    
    // Mark as initialized after first load
    setTimeout(() => {
        reactionsInitialized = true;
    }, 1000);
}

// Chat Functions
function sendMessage() {
    if (!isAuthenticated) {
        alert('Devi effettuare il login per inviare messaggi');
        return;
    }
    
    const messageText = chatInput.value.trim();
    
    if (!messageText) return;
    
    const message = {
        author: currentUser,
        content: messageText,
        timestamp: Date.now(),
        userId: currentUserId,
        reactions: {}
    };
    
    // Add to Firebase only - will appear via listener
    const messagesRef = ref(database, 'messages');
    push(messagesRef, message);
    
    chatInput.value = '';
}

function addMessageToUI(message) {
    messages.push(message);
    
    const messageEl = createMessageElement(message);
    chatMessages.appendChild(messageEl);
    
    // Auto scroll
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Legacy function for compatibility
function addMessage(message) {
    addMessageToUI(message);
}

function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    
    const authorSpan = document.createElement('span');
    authorSpan.className = 'message-author';
    authorSpan.textContent = message.author;
    
    // Apply user color to name and message border
    if (message.userId) {
        const userColor = getUserColor(message.userId);
        authorSpan.style.color = userColor;
    }
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = formatTime(message.timestamp);
    
    headerDiv.appendChild(authorSpan);
    headerDiv.appendChild(timeSpan);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Check if this is a poll
    if (message.type === 'poll') {
        contentDiv.className = 'poll-message';
        
        const pollQuestion = document.createElement('div');
        pollQuestion.className = 'poll-question';
        pollQuestion.textContent = message.question;
        contentDiv.appendChild(pollQuestion);
        
        const pollOptions = document.createElement('div');
        pollOptions.className = 'poll-options';
        
        const totalVotes = message.options.reduce((sum, opt) => sum + (opt.votes || 0), 0);
        const hasVoted = message.voters && message.voters[currentUserId];
        
        message.options.forEach((option, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'poll-option';
            if (hasVoted) optionDiv.classList.add('voted');
            
            const percentage = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
            
            optionDiv.innerHTML = `
                <div class="poll-option-bar" style="width: ${percentage}%"></div>
                <div class="poll-option-content">
                    <span class="poll-option-text">${option.text}</span>
                    <span class="poll-option-votes">${option.votes || 0} voti (${percentage}%)</span>
                </div>
            `;
            
            if (!hasVoted && isAuthenticated) {
                optionDiv.style.cursor = 'pointer';
                optionDiv.addEventListener('click', () => votePoll(message, index));
            }
            
            pollOptions.appendChild(optionDiv);
        });
        
        contentDiv.appendChild(pollOptions);
        
        const pollFooter = document.createElement('div');
        pollFooter.className = 'poll-footer';
        pollFooter.textContent = `${totalVotes} ${totalVotes === 1 ? 'voto' : 'voti'} totali`;
        contentDiv.appendChild(pollFooter);
    }
    // Check if message has a photo
    else if (message.photoURL) {
        const photoContainer = document.createElement('div');
        photoContainer.className = 'message-photo-container';
        
        const img = document.createElement('img');
        img.src = message.thumbnailURL || message.photoURL;
        img.className = 'message-photo';
        img.alt = 'Foto';
        img.loading = 'lazy';
        
        img.addEventListener('click', () => {
            openLightbox(message.photoURL);
        });
        
        photoContainer.appendChild(img);
        contentDiv.appendChild(photoContainer);
        
        // Add caption if there's text beyond [Foto]
        if (message.content && message.content !== '[Foto]') {
            const caption = document.createElement('p');
            caption.className = 'photo-caption';
            caption.textContent = message.content;
            contentDiv.appendChild(caption);
        }
    } else {
        contentDiv.textContent = message.content;
    }
    
    // Apply user color to message border and background gradient
    if (message.userId) {
        const userColor = getUserColor(message.userId);
        contentDiv.style.borderLeftColor = userColor;
        
        // Convert hex to rgb for gradient with opacity
        const r = parseInt(userColor.slice(1, 3), 16);
        const g = parseInt(userColor.slice(3, 5), 16);
        const b = parseInt(userColor.slice(5, 7), 16);
        contentDiv.style.background = `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.12) 0%, rgba(${r}, ${g}, ${b}, 0.04) 100%)`;
    }
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    
    return messageDiv;
}

function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Photo Upload Functions
function closePhotoMenu(menu) {
    menu.classList.add('closing');
    setTimeout(() => menu.remove(), 200);
}

function showPhotoMenu() {
    if (!isAuthenticated) {
        alert('Devi effettuare il login per inviare foto');
        return;
    }
    
    // Remove existing menu if present
    const existingMenu = document.querySelector('.photo-menu');
    if (existingMenu) {
        closePhotoMenu(existingMenu);
        return;
    }
    
    const menu = document.createElement('div');
    menu.className = 'photo-menu';
    menu.innerHTML = `
        <button class="photo-menu-btn" id="choose-photo-btn">
            📁 Scegli foto
        </button>
        <button class="photo-menu-btn" id="capture-photo-btn">
            📷 Scatta foto
        </button>
        <button class="photo-menu-btn cancel" id="cancel-photo-btn">
            ✕ Annulla
        </button>
    `;
    
    // Append to chat section instead of body
    const chatSection = document.querySelector('.chat-section');
    chatSection.appendChild(menu);
    
    // File input for choosing photo
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    menu.querySelector('#choose-photo-btn').addEventListener('click', () => {
        fileInput.click();
        closePhotoMenu(menu);
    });
    
    menu.querySelector('#capture-photo-btn').addEventListener('click', () => {
        closePhotoMenu(menu);
        openCameraCapture();
    });
    
    menu.querySelector('#cancel-photo-btn').addEventListener('click', () => {
        closePhotoMenu(menu);
    });
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await processAndUploadImage(file);
        }
        fileInput.remove();
    });
}

async function openCameraCapture() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' },
            audio: false 
        });
        
        const modal = document.createElement('div');
        modal.className = 'camera-modal';
        modal.innerHTML = `
            <div class="camera-container">
                <video id="camera-preview" autoplay playsinline></video>
                <canvas id="camera-canvas" style="display: none;"></canvas>
                <div class="camera-controls">
                    <button class="camera-btn cancel" id="cancel-camera">Annulla</button>
                    <button class="camera-btn capture" id="capture-btn">📷 Scatta</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const video = modal.querySelector('#camera-preview');
        const canvas = modal.querySelector('#camera-canvas');
        video.srcObject = stream;
        
        modal.querySelector('#cancel-camera').addEventListener('click', () => {
            stream.getTracks().forEach(track => track.stop());
            modal.remove();
        });
        
        modal.querySelector('#capture-btn').addEventListener('click', async () => {
            // Capture image from video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            
            // Stop camera
            stream.getTracks().forEach(track => track.stop());
            
            // Convert to blob
            canvas.toBlob(async (blob) => {
                modal.remove();
                await processAndUploadImage(blob);
            }, 'image/jpeg', 0.9);
        });
        
    } catch (error) {
        console.error('Camera error:', error);
        alert('Impossibile accedere alla camera. Verifica i permessi.');
    }
}

async function processAndUploadImage(fileOrBlob) {
    try {
        // Show uploading indicator
        const uploadingMsg = document.createElement('div');
        uploadingMsg.className = 'uploading-indicator';
        uploadingMsg.textContent = 'Caricamento foto... ⏳';
        chatMessages.appendChild(uploadingMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        const timestamp = Date.now();
        
        // Compress image and convert to base64
        const compressedBase64 = await compressImageToBase64(fileOrBlob, 800, 0.85);
        const thumbnailBase64 = await compressImageToBase64(fileOrBlob, 200, 0.8);
        
        // Send message with photo (base64 stored in database)
        const message = {
            author: currentUser,
            content: '[Foto]',
            timestamp: timestamp,
            userId: currentUserId,
            photoURL: compressedBase64,
            thumbnailURL: thumbnailBase64,
            reactions: {}
        };
        
        const messagesRef = ref(database, 'messages');
        await push(messagesRef, message);
        
        uploadingMsg.remove();
        
        // Scroll to bottom after photo upload
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 200);
        
    } catch (error) {
        console.error('Error uploading photo:', error);
        alert('Errore durante il caricamento della foto');
        const uploadingMsg = document.querySelector('.uploading-indicator');
        if (uploadingMsg) uploadingMsg.remove();
    }
}

async function compressImageToBase64(fileOrBlob, maxSize, quality) {
    return new Promise((resolve) => {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            
            // Resize if needed
            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height = (height * maxSize) / width;
                    width = maxSize;
                } else {
                    width = (width * maxSize) / height;
                    height = maxSize;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert to base64
            const base64 = canvas.toDataURL('image/jpeg', quality);
            resolve(base64);
        };
        
        if (fileOrBlob instanceof Blob) {
            img.src = URL.createObjectURL(fileOrBlob);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
            };
            reader.readAsDataURL(fileOrBlob);
        }
    });
}

async function compressImage(fileOrBlob) {
    return new Promise((resolve) => {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        img.onload = () => {
            // Max width 800px
            let width = img.width;
            let height = img.height;
            
            if (width > 800) {
                height = (height * 800) / width;
                width = 800;
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.85);
        };
        
        if (fileOrBlob instanceof Blob) {
            img.src = URL.createObjectURL(fileOrBlob);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
            };
            reader.readAsDataURL(fileOrBlob);
        }
    });
}

async function createThumbnail(fileOrBlob) {
    return new Promise((resolve) => {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        img.onload = () => {
            // 200x200 thumbnail
            const size = 200;
            canvas.width = size;
            canvas.height = size;
            
            // Calculate crop to maintain aspect ratio
            const aspectRatio = img.width / img.height;
            let sourceWidth, sourceHeight, sourceX, sourceY;
            
            if (aspectRatio > 1) {
                sourceHeight = img.height;
                sourceWidth = img.height;
                sourceX = (img.width - sourceWidth) / 2;
                sourceY = 0;
            } else {
                sourceWidth = img.width;
                sourceHeight = img.width;
                sourceX = 0;
                sourceY = (img.height - sourceHeight) / 2;
            }
            
            ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, size, size);
            
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.8);
        };
        
        if (fileOrBlob instanceof Blob) {
            img.src = URL.createObjectURL(fileOrBlob);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
            };
            reader.readAsDataURL(fileOrBlob);
        }
    });
}

function openLightbox(imageUrl) {
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.innerHTML = `
        <div class="lightbox-content">
            <button class="lightbox-close">✕</button>
            <img src="${imageUrl}" alt="Foto">
        </div>
    `;
    
    document.body.appendChild(lightbox);
    
    const closeBtn = lightbox.querySelector('.lightbox-close');
    const closeLightbox = () => lightbox.remove();
    
    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
    });
}

// Generate consistent color for user
function getUserColor(userId) {
    if (userColors[userId]) {
        return userColors[userId];
    }
    
    // Bending Spoons gradient colors
    const colors = [
        '#8B5CF6', // Purple
        '#3B82F6', // Blue
        '#A78BFA', // Light Purple
        '#6366F1', // Indigo
        '#8B5CF6', // Violet
        '#7C3AED', // Deep Purple
        '#6D28D9', // Rich Purple
        '#5B21B6', // Dark Purple
    ];
    
    // Generate consistent index from userId
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    
    userColors[userId] = colors[index];
    return colors[index];
}

// Reactions System (for reactions bar at top)
function triggerReaction(emoji) {
    if (!isAuthenticated) {
        alert('Devi effettuare il login per inviare reactions');
        return;
    }
    
    // Add to Firebase only - will appear via listener
    const reactionsRef = ref(database, 'reactions');
    push(reactionsRef, {
        emoji: emoji,
        userId: currentUserId,
        timestamp: Date.now()
    });
}

function createFloatingReaction(emoji) {
    const reaction = document.createElement('div');
    reaction.className = 'floating-reaction';
    
    // Check if it's a custom emoji (URL or base64)
    if (emoji.startsWith('http') || emoji.startsWith('data:image')) {
        const img = document.createElement('img');
        img.src = emoji;
        img.className = 'custom-emoji-float';
        reaction.appendChild(img);
    } else {
        reaction.textContent = emoji;
    }
    
    // Random horizontal position
    const randomX = Math.random() * 80 + 10; // 10% to 90%
    reaction.style.left = randomX + '%';
    reaction.style.bottom = '0';
    
    reactionsOverlay.appendChild(reaction);
    
    // Remove after animation
    setTimeout(() => {
        reaction.remove();
    }, CONFIG.reactionDuration);
}

// Update online users count
function updateOnlineUsers(count) {
    onlineUsers = count;
    onlineUsersDisplay.textContent = count;
}

// Utility: Set username
function setUsername(name) {
    currentUser = name;
    usernameDisplay.textContent = name;
    
    // Update presence with new username
    if (currentUserId) {
        const userStatusRef = ref(database, 'presence/' + currentUserId);
        set(userStatusRef, {
            username: name,
            online: true,
            lastSeen: serverTimestamp()
        });
    }
    
    addSystemMessage(`Ora ti chiami ${name}`);
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    init();
    
    // Dev testing: Press 'Shift+T' to toggle test panel
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts if user is typing in input fields (except for these specific shortcuts)
        const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
        
        if (e.shiftKey && (e.key === 't' || e.key === 'T')) {
            e.preventDefault();
            toggleTestPanel();
        }
        // Admin panel: Press 'Shift+A' to toggle admin panel
        if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
            e.preventDefault();
            toggleAdminPanel();
        }
        // Poll panel: Press 'Shift+P' to toggle poll panel
        if (e.shiftKey && (e.key === 'p' || e.key === 'P')) {
            console.log('Shift+P detected, opening poll panel');
            e.preventDefault();
            togglePollPanel();
        }
    });
});

// Dev Testing Panel
function toggleTestPanel() {
    let panel = document.getElementById('dev-test-panel');
    
    if (panel) {
        panel.remove();
        return;
    }
    
    panel = document.createElement('div');
    panel.id = 'dev-test-panel';
    panel.innerHTML = `
        <div style="position: fixed; top: 80px; right: 20px; background: rgba(0, 0, 0, 0.95); border: 2px solid #8B5CF6; border-radius: 12px; padding: 1.5rem; z-index: 10000; max-width: 300px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);">
            <h3 style="margin: 0 0 1rem 0; color: #8B5CF6; font-size: 1.1rem;">🔧 Dev Test Panel</h3>
            
            <div style="margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.5rem 0; color: #fff; font-size: 0.9rem;">Color Palette:</h4>
                <div id="color-palette" style="display: grid; gap: 0.5rem;"></div>
            </div>
            
            <div style="margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.5rem 0; color: #fff; font-size: 0.9rem;">Test Messages:</h4>
                <button id="add-test-messages" style="width: 100%; padding: 0.5rem; background: #8B5CF6; border: none; border-radius: 8px; color: white; cursor: pointer; font-size: 0.9rem;">Add Sample Messages</button>
            </div>
            
            <button id="close-test-panel" style="width: 100%; padding: 0.5rem; background: #dc2626; border: none; border-radius: 8px; color: white; cursor: pointer; font-size: 0.9rem; margin-top: 0.5rem;">Close (or press T)</button>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    // Show color palette
    const colors = [
        '#8B5CF6', '#3B82F6', '#A78BFA', '#6366F1',
        '#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6'
    ];
    
    const colorPalette = panel.querySelector('#color-palette');
    colors.forEach((color, index) => {
        const colorDiv = document.createElement('div');
        colorDiv.style.cssText = `
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.4rem;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
        `;
        colorDiv.innerHTML = `
            <div style="width: 20px; height: 20px; background: ${color}; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);"></div>
            <span style="color: #fff; font-size: 0.8rem; font-family: monospace;">${color}</span>
        `;
        colorPalette.appendChild(colorDiv);
    });
    
    // Add test messages button
    panel.querySelector('#add-test-messages').addEventListener('click', () => {
        addTestMessages();
    });
    
    // Close button
    panel.querySelector('#close-test-panel').addEventListener('click', () => {
        panel.remove();
    });
}

function addTestMessages() {
    const testUsers = [
        { name: 'Alice Rossi', id: 'user001', message: 'Ciao a tutti! 👋' },
        { name: 'Marco Bianchi', id: 'user002', message: 'Evento fantastico!' },
        { name: 'Sofia Verde', id: 'user003', message: 'Non vedo l\'ora di iniziare 🚀' },
        { name: 'Luca Neri', id: 'user004', message: 'Ottima organizzazione!' },
        { name: 'Giulia Blu', id: 'user005', message: 'Grazie per l\'invito ❤️' },
        { name: 'Andrea Viola', id: 'user006', message: 'La qualità video è eccellente!' },
        { name: 'Chiara Rosa', id: 'user007', message: 'Chat molto interattiva 💬' },
        { name: 'Matteo Oro', id: 'user008', message: 'Bending Spoons forever! 🥄' }
    ];
    
    testUsers.forEach((user, index) => {
        setTimeout(() => {
            const testMessage = {
                author: user.name,
                userId: user.id,
                content: user.message,
                timestamp: Date.now() + index
            };
            addMessageToUI(testMessage);
        }, index * 200);
    });
}

// Admin Panel for Custom Emojis
function toggleAdminPanel() {
    let panel = document.getElementById('admin-panel');
    
    if (panel) {
        panel.remove();
        return;
    }
    
    if (!isAuthenticated) {
        alert('Devi effettuare il login per accedere al pannello admin');
        return;
    }
    
    panel = document.createElement('div');
    panel.id = 'admin-panel';
    panel.innerHTML = `
        <div class="admin-modal">
            <div class="admin-header">
                <h3>🔧 Admin - Reaction Slots</h3>
                <button id="close-admin" class="close-btn">✕</button>
            </div>
            
            <div class="admin-content">
                <div class="admin-section">
                    <h4>Configure Reaction Buttons (5 slots)</h4>
                    <p class="admin-hint">Click on a slot to assign an emoji</p>
                    <div id="slots-config" class="slots-grid"></div>
                </div>
                
                <div class="admin-section">
                    <h4>Available Emojis</h4>
                    <p class="admin-hint">Default + Custom uploaded emojis</p>
                    <div id="available-emojis" class="emoji-grid"></div>
                </div>
                
                <div class="admin-section">
                    <h4>Upload Custom Emoji</h4>
                    <p class="admin-hint">PNG/SVG • Max 1MB • Recommended: 512x512px or higher</p>
                    
                    <div class="upload-area" id="upload-area">
                        <input type="file" id="emoji-file-input" accept=".png,.svg" style="display: none;">
                        <div class="upload-placeholder">
                            <span class="upload-icon">📁</span>
                            <p>Drag & drop or click to upload</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    // Load custom emojis and render interface
    loadCustomEmojis();
    renderSlotsConfig();
    renderAvailableEmojis();
    
    // Close button
    panel.querySelector('#close-admin').addEventListener('click', () => {
        panel.remove();
    });
    
    // File input
    const fileInput = panel.querySelector('#emoji-file-input');
    const uploadArea = panel.querySelector('#upload-area');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    
    // Drag & drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) uploadCustomEmoji(file);
    });
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) uploadCustomEmoji(file);
    });
}

async function loadCustomEmojis() {
    try {
        const emojisRef = ref(database, 'customEmojis');
        const snapshot = await new Promise((resolve) => {
            onValue(emojisRef, resolve, { onlyOnce: true });
        });
        
        customEmojis = [];
        const emojisList = document.getElementById('custom-emojis-list');
        
        if (!snapshot.exists()) {
            emojisList.innerHTML = '<p class="empty-text">Nessuna emoji custom caricata</p>';
            updateReactionsBar();
            return;
        }
        
        emojisList.innerHTML = '';
        const emojisData = snapshot.val();
        
        Object.entries(emojisData).forEach(([key, emoji]) => {
            customEmojis.push({ id: key, name: emoji.name, url: emoji.data });
            
            const emojiDiv = document.createElement('div');
            emojiDiv.className = 'emoji-item';
            emojiDiv.innerHTML = `
                <img src="${emoji.data}" alt="${emoji.name}" class="emoji-preview">
                <span class="emoji-name">${emoji.name}</span>
                <button class="delete-emoji-btn" data-id="${key}">🗑️</button>
            `;
            
            emojiDiv.querySelector('.delete-emoji-btn').addEventListener('click', async (e) => {
                if (confirm('Eliminare questa emoji?')) {
                    await deleteCustomEmoji(e.target.dataset.id);
                }
            });
            
            emojisList.appendChild(emojiDiv);
        });
        
        updateReactionsBar();
        
    } catch (error) {
        console.error('Error loading custom emojis:', error);
        document.getElementById('custom-emojis-list').innerHTML = '<p class="error-text">Errore nel caricamento</p>';
    }
}

async function uploadCustomEmoji(file) {
    // Validate file
    if (!file.type.match('image/png') && !file.type.match('image/svg+xml')) {
        alert('Solo file PNG o SVG sono supportati');
        return;
    }
    
    if (file.size > 1024 * 1024) { // 1MB
        alert('File troppo grande. Max 1MB');
        return;
    }
    
    try {
        // Show uploading state
        const uploadArea = document.getElementById('upload-area');
        uploadArea.innerHTML = '<p class="uploading-text">Caricamento... ⏳</p>';
        
        // Convert to base64
        const base64Data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
        
        // Save to database
        const emojisRef = ref(database, 'customEmojis');
        await push(emojisRef, {
            name: file.name,
            data: base64Data,
            timestamp: Date.now()
        });
        
        // Reset upload area
        uploadArea.innerHTML = `
            <div class="upload-placeholder">
                <span class="upload-icon">📁</span>
                <p>Drag & drop or click to upload</p>
            </div>
        `;
        
        // Reload list
        await loadCustomEmojis();
        
    } catch (error) {
        console.error('Error uploading emoji:', error);
        alert('Errore durante l\'upload: ' + error.message);
    }
}

async function deleteCustomEmoji(emojiId) {
    try {
        const emojiRef = ref(database, `customEmojis/${emojiId}`);
        await set(emojiRef, null);
        await loadCustomEmojis();
    } catch (error) {
        console.error('Error deleting emoji:', error);
        alert('Errore durante l\'eliminazione');
    }
}

// Render slots configuration interface
function renderSlotsConfig() {
    const slotsContainer = document.getElementById('slots-config');
    if (!slotsContainer) return;
    
    slotsContainer.innerHTML = '';
    slotsContainer.style.cssText = 'display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; margin-bottom: 1rem;';
    
    reactionSlots.forEach((emoji, index) => {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'slot-config';
        slotDiv.style.cssText = 'background: rgba(139, 92, 246, 0.1); border: 2px solid rgba(139, 92, 246, 0.3); border-radius: 12px; padding: 1rem; text-align: center; cursor: pointer; transition: all 0.2s;';
        
        const isCustom = emoji.startsWith('http') || emoji.startsWith('data:');
        
        slotDiv.innerHTML = `
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Slot ${index + 1}</div>
            <div style="font-size: 3rem; margin: 0.5rem 0;">
                ${isCustom ? `<img src="${emoji}" style="width: 48px; height: 48px; object-fit: contain;">` : emoji}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Click to change</div>
        `;
        
        slotDiv.addEventListener('click', () => selectSlot(index));
        slotDiv.addEventListener('mouseenter', () => {
            slotDiv.style.borderColor = '#8B5CF6';
            slotDiv.style.background = 'rgba(139, 92, 246, 0.2)';
        });
        slotDiv.addEventListener('mouseleave', () => {
            slotDiv.style.borderColor = 'rgba(139, 92, 246, 0.3)';
            slotDiv.style.background = 'rgba(139, 92, 246, 0.1)';
        });
        
        slotsContainer.appendChild(slotDiv);
    });
}

// Render available emojis for selection
function renderAvailableEmojis() {
    const container = document.getElementById('available-emojis');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Default emojis
    const defaultEmojis = ['❤️', '👏', '🔥', '😂', '👍', '🎉', '💜', '✨', '🚀', '💪'];
    
    defaultEmojis.forEach(emoji => {
        const emojiDiv = document.createElement('div');
        emojiDiv.className = 'emoji-item';
        emojiDiv.style.cssText = 'background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: all 0.2s;';
        emojiDiv.innerHTML = `<div style="font-size: 2.5rem;">${emoji}</div>`;
        emojiDiv.onclick = () => assignEmojiToSlot(emoji);
        emojiDiv.addEventListener('mouseenter', () => {
            emojiDiv.style.borderColor = '#8B5CF6';
            emojiDiv.style.background = 'rgba(139, 92, 246, 0.2)';
        });
        emojiDiv.addEventListener('mouseleave', () => {
            emojiDiv.style.borderColor = 'rgba(139, 92, 246, 0.2)';
            emojiDiv.style.background = 'rgba(139, 92, 246, 0.1)';
        });
        container.appendChild(emojiDiv);
    });
    
    // Custom emojis
    customEmojis.forEach(emoji => {
        const emojiDiv = document.createElement('div');
        emojiDiv.className = 'emoji-item';
        emojiDiv.style.cssText = 'background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: all 0.2s; position: relative;';
        emojiDiv.innerHTML = `
            <img src="${emoji.url}" style="width: 48px; height: 48px; object-fit: contain;">
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">${emoji.name}</div>
            <button class="delete-emoji-btn" data-id="${emoji.id}" style="position: absolute; top: 4px; right: 4px; background: rgba(220, 38, 38, 0.8); border: none; border-radius: 4px; color: white; width: 20px; height: 20px; cursor: pointer; font-size: 0.7rem;">✕</button>
        `;
        
        emojiDiv.querySelector('img').onclick = () => assignEmojiToSlot(emoji.url);
        emojiDiv.querySelector('.delete-emoji-btn').onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Eliminare "${emoji.name}"?`)) {
                await deleteCustomEmoji(emoji.id);
                renderAvailableEmojis();
            }
        };
        
        emojiDiv.addEventListener('mouseenter', () => {
            emojiDiv.style.borderColor = '#8B5CF6';
            emojiDiv.style.background = 'rgba(139, 92, 246, 0.2)';
        });
        emojiDiv.addEventListener('mouseleave', () => {
            emojiDiv.style.borderColor = 'rgba(139, 92, 246, 0.2)';
            emojiDiv.style.background = 'rgba(139, 92, 246, 0.1)';
        });
        
        container.appendChild(emojiDiv);
    });
}

let selectedSlotIndex = null;

function selectSlot(index) {
    selectedSlotIndex = index;
    
    // Visual feedback
    const slots = document.querySelectorAll('.slot-config');
    slots.forEach((slot, i) => {
        if (i === index) {
            slot.style.borderColor = '#10b981';
            slot.style.background = 'rgba(16, 185, 129, 0.2)';
        } else {
            slot.style.borderColor = 'rgba(139, 92, 246, 0.3)';
            slot.style.background = 'rgba(139, 92, 246, 0.1)';
        }
    });
    
    // Show message
    const container = document.getElementById('available-emojis');
    const existingMsg = document.querySelector('.selection-message');
    if (existingMsg) existingMsg.remove();
    
    const msg = document.createElement('div');
    msg.className = 'selection-message';
    msg.style.cssText = 'grid-column: 1 / -1; background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; border-radius: 8px; padding: 0.75rem; text-align: center; color: #10b981; font-weight: 600;';
    msg.textContent = `Slot ${index + 1} selezionato - Clicca su un'emoji per assegnarla`;
    container.insertBefore(msg, container.firstChild);
}

async function assignEmojiToSlot(emoji) {
    if (selectedSlotIndex === null) {
        alert('Seleziona prima uno slot cliccando su di esso');
        return;
    }
    
    // Update local state
    reactionSlots[selectedSlotIndex] = emoji;
    
    // Save to Firebase
    try {
        const slotsRef = ref(database, 'reactionSlots');
        await set(slotsRef, reactionSlots);
        
        // Update UI
        renderSlotsConfig();
        updateReactionsBar();
        
        // Clear selection
        selectedSlotIndex = null;
        const msg = document.querySelector('.selection-message');
        if (msg) msg.remove();
        
    } catch (error) {
        console.error('Error saving slot configuration:', error);
        alert('Errore nel salvataggio');
    }
}


function updateReactionsBar() {
    // Update the reactions bar to use configured slots
    const reactionsBar = document.querySelector('.reactions');
    if (!reactionsBar) return;
    
    // Clear all buttons
    reactionsBar.innerHTML = '';
    
    // Create 5 buttons from configured slots
    reactionSlots.forEach((emoji, index) => {
        const btn = document.createElement('button');
        btn.className = 'reaction-btn';
        btn.dataset.reaction = emoji;
        btn.dataset.slotIndex = index;
        
        // Check if it's a custom emoji (URL) or standard emoji
        if (emoji.startsWith('http') || emoji.startsWith('data:')) {
            btn.innerHTML = `<img src="${emoji}" alt="Emoji ${index + 1}" class="custom-emoji-icon">`;
            btn.onclick = () => triggerCustomReaction(emoji);
        } else {
            btn.textContent = emoji;
            btn.onclick = () => triggerReaction(emoji);
        }
        
        reactionsBar.appendChild(btn);
    });
}

function triggerCustomReaction(imageUrl) {
    if (!isAuthenticated) {
        alert('Devi effettuare il login per inviare reactions');
        return;
    }
    
    // Add to Firebase - using image URL as emoji identifier
    const reactionsRef = ref(database, 'reactions');
    push(reactionsRef, {
        emoji: imageUrl, // Store the URL
        isCustom: true,
        userId: currentUserId,
        timestamp: Date.now()
    });
}

// Poll System
async function votePoll(pollMessage, optionIndex) {
    console.log('votePoll called. currentUserId:', currentUserId, 'isAuthenticated:', isAuthenticated);
    
    if (!isAuthenticated) {
        alert('Devi effettuare il login per votare');
        return;
    }
    
    try {
        // Find the poll message in Firebase
        const messagesRef = ref(database, 'messages');
        const snapshot = await new Promise((resolve) => {
            onValue(messagesRef, resolve, { onlyOnce: true });
        });
        
        let pollKey = null;
        snapshot.forEach((childSnapshot) => {
            const msg = childSnapshot.val();
            if (msg.type === 'poll' && msg.timestamp === pollMessage.timestamp && msg.question === pollMessage.question) {
                pollKey = childSnapshot.key;
            }
        });
        
        if (!pollKey) {
            alert('Sondaggio non trovato');
            return;
        }
        
        const pollRef = ref(database, `messages/${pollKey}`);
        const pollSnapshot = await new Promise((resolve) => {
            onValue(pollRef, resolve, { onlyOnce: true });
        });
        
        const currentPoll = pollSnapshot.val();
        
        console.log('Current poll voters:', currentPoll.voters);
        console.log('Checking if user voted:', currentPoll.voters && currentPoll.voters[currentUserId]);
        
        // Check if user already voted
        if (currentPoll.voters && currentPoll.voters[currentUserId] !== undefined) {
            alert('Hai già votato in questo sondaggio');
            return;
        }
        
        // Update votes
        const updatedOptions = [...currentPoll.options];
        updatedOptions[optionIndex].votes = (updatedOptions[optionIndex].votes || 0) + 1;
        
        const updatedVoters = { ...(currentPoll.voters || {}), [currentUserId]: optionIndex };
        
        await set(pollRef, {
            ...currentPoll,
            options: updatedOptions,
            voters: updatedVoters
        });
        
    } catch (error) {
        console.error('Error voting:', error);
        alert('Errore durante la votazione');
    }
}

function togglePollPanel() {
    console.log('togglePollPanel called, isAuthenticated:', isAuthenticated);
    let panel = document.getElementById('poll-panel');
    
    if (panel) {
        panel.remove();
        return;
    }
    
    if (!isAuthenticated) {
        alert('Devi effettuare il login per creare sondaggi');
        return;
    }
    
    panel = document.createElement('div');
    panel.id = 'poll-panel';
    console.log('Creating poll panel element');
    panel.innerHTML = `
        <div class="admin-modal">
            <div class="admin-header">
                <h3>📊 Crea Sondaggio</h3>
                <button id="close-poll" class="close-btn">✕</button>
            </div>
            
            <div class="admin-content">
                <div class="admin-section">
                    <h4>Domanda</h4>
                    <input type="text" id="poll-question" name="poll-question" placeholder="Inserisci la domanda..." maxlength="200" style="width: 100%; padding: 0.75rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; color: var(--text-primary); font-size: 0.95rem; margin-bottom: 1rem;">
                </div>
                
                <div class="admin-section">
                    <h4>Opzioni di risposta</h4>
                    <p class="admin-hint">Minimo 2, massimo 5 opzioni</p>
                    <div id="poll-options-container">
                        <input type="text" class="poll-option-input" name="poll-option-1" placeholder="Opzione 1" maxlength="100">
                        <input type="text" class="poll-option-input" name="poll-option-2" placeholder="Opzione 2" maxlength="100">
                    </div>
                    <button id="add-poll-option" style="margin-top: 0.5rem; padding: 0.5rem 1rem; background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; color: var(--text-primary); cursor: pointer; font-size: 0.9rem;">+ Aggiungi opzione</button>
                </div>
                
                <div class="admin-section">
                    <button id="create-poll-btn" style="width: 100%; padding: 1rem; background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer; font-size: 1rem; transition: all 0.2s;">Pubblica Sondaggio</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    // Close button
    panel.querySelector('#close-poll').addEventListener('click', () => {
        panel.remove();
    });
    
    // Add option button
    panel.querySelector('#add-poll-option').addEventListener('click', () => {
        const container = panel.querySelector('#poll-options-container');
        const optionCount = container.querySelectorAll('.poll-option-input').length;
        
        if (optionCount >= 5) {
            alert('Massimo 5 opzioni consentite');
            return;
        }
        
        const newOption = document.createElement('input');
        newOption.type = 'text';
        newOption.className = 'poll-option-input';
        newOption.name = `poll-option-${optionCount + 1}`;
        newOption.placeholder = `Opzione ${optionCount + 1}`;
        newOption.maxLength = 100;
        container.appendChild(newOption);
    });
    
    // Create poll button
    panel.querySelector('#create-poll-btn').addEventListener('click', async () => {
        const question = panel.querySelector('#poll-question').value.trim();
        const optionInputs = panel.querySelectorAll('.poll-option-input');
        const options = Array.from(optionInputs)
            .map(input => input.value.trim())
            .filter(opt => opt.length > 0);
        
        if (!question) {
            alert('Inserisci una domanda');
            return;
        }
        
        if (options.length < 2) {
            alert('Inserisci almeno 2 opzioni');
            return;
        }
        
        try {
            const poll = {
                question: question,
                options: options.map(opt => ({ text: opt, votes: 0 })),
                createdBy: currentUser,
                userId: currentUserId,
                timestamp: Date.now(),
                voters: {},
                type: 'poll'
            };
            
            const messagesRef = ref(database, 'messages');
            await push(messagesRef, poll);
            
            panel.remove();
            addSystemMessage('Sondaggio pubblicato!');
        } catch (error) {
            console.error('Error creating poll:', error);
            alert('Errore durante la creazione del sondaggio');
        }
    });
}

// Expose functions for external use
window.EventPage = {
    setCastrUrl,
    setUsername,
    updateOnlineUsers,
    triggerReaction,
    addMessageToUI,
    addSystemMessage
};

// Expose auth functions globally
window.signInWithGoogle = signInWithGoogle;
window.signOutUser = signOutUser;
