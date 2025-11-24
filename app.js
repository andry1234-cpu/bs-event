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
    reactionDuration: 3000
};

// State Management
let currentUser = null;
let currentUserId = null;
let messages = [];
let onlineUsers = 1;
let isAuthenticated = false;
let userColors = {}; // Store user colors

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
    initializeMillicast();
    
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
            // User is signed in
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
        } else {
            // User is signed out - show welcome screen
            isAuthenticated = false;
            currentUser = null;
            currentUserId = null;
            
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
    
    addSystemMessage('Connesso! La chat è sincronizzata.');
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
    
    // Millicast stream configuration
    // Free Nationals demo stream (from Dolby OptiView)
    const streamAccountId = 'k9Mwad';
    const streamName = 'multiview';
    
    const tokenGenerator = () => window.millicast.Director.getSubscriber({
        streamAccountId: streamAccountId,
        streamName: streamName
    });
    
    try {
        // Create viewer
        millicastView = new window.millicast.View(streamName, tokenGenerator);
        
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
    contentDiv.textContent = message.content;
    
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
    reaction.textContent = emoji;
    
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
    
    // Dev testing: Press 'T' to toggle test panel
    document.addEventListener('keydown', (e) => {
        if (e.key === 't' || e.key === 'T') {
            toggleTestPanel();
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
