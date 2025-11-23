// Firebase Configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, onChildAdded, onDisconnect, set, serverTimestamp, query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// Configurazione
const CONFIG = {
    castrPlayerUrl: '', // Inserire l'URL del player CASTR
    maxMessages: 100,
    reactionDuration: 3000
};

// State Management
let currentUser = 'Guest_' + Math.floor(Math.random() * 1000);
let currentUserId = null;
let messages = [];
let onlineUsers = 1;

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
    
    usernameDisplay.textContent = currentUser;
    setupEventListeners();
    initializeMillicast();
    initializeFirebase();
}

// Initialize Firebase Realtime Features
function initializeFirebase() {
    // Generate unique user ID
    currentUserId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    
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
        if (!millicastView || !millicastView.webRTCPeer) return;
        
        try {
            const stats = await millicastView.webRTCPeer.getRTCPeer().getStats();
            let videoStats = null;
            
            stats.forEach(report => {
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    videoStats = report;
                }
            });
            
            if (videoStats) {
                // Local Time - current browser time in ISO format
                const localTime = new Date();
                document.getElementById('local-time').textContent = localTime.toISOString();
                
                // Stream Time - use timestamp from NTP or estimate from stats
                // OptiView gets this from embedded metadata in the stream
                // We'll estimate by subtracting buffer delay and jitter from current time
                const estimatedLatency = videoStats.jitterBufferDelay && videoStats.jitterBufferEmittedCount 
                    ? (videoStats.jitterBufferDelay / videoStats.jitterBufferEmittedCount) * 1000 + 500 // Add ~500ms for encoding/network
                    : 500;
                
                const streamDate = new Date(Date.now() - estimatedLatency);
                document.getElementById('stream-time').textContent = streamDate.toISOString();
                
                // Latency - calculate difference between local time and stream time
                const latencyMs = localTime - streamDate;
                document.getElementById('latency').textContent = `${latencyMs.toFixed(0)}ms`;
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
    const messageText = chatInput.value.trim();
    
    if (!messageText) return;
    
    const message = {
        author: currentUser,
        content: messageText,
        timestamp: Date.now(),
        userId: currentUserId
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
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = formatTime(message.timestamp);
    
    headerDiv.appendChild(authorSpan);
    headerDiv.appendChild(timeSpan);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = message.content;
    
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

// Reactions System
function triggerReaction(emoji) {
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
});

// Expose functions for external use
window.EventPage = {
    setCastrUrl,
    setUsername,
    updateOnlineUsers,
    triggerReaction,
    addMessageToUI,
    addSystemMessage
};
