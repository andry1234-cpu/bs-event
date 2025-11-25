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
let customEmojis = []; // Store custom emoji URLs

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
    
    // Load custom emojis
    loadCustomEmojisQuiet();
    
    addSystemMessage('Connesso! La chat è sincronizzata.');
}

// Load custom emojis from database (base64)
async function loadCustomEmojisQuiet() {
    try {
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
    
    // Check if message has a photo
    if (message.photoURL) {
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
function showPhotoMenu() {
    if (!isAuthenticated) {
        alert('Devi effettuare il login per inviare foto');
        return;
    }
    
    // Remove existing menu if present
    const existingMenu = document.querySelector('.photo-menu');
    if (existingMenu) {
        existingMenu.remove();
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
        menu.remove();
    });
    
    menu.querySelector('#capture-photo-btn').addEventListener('click', () => {
        menu.remove();
        openCameraCapture();
    });
    
    menu.querySelector('#cancel-photo-btn').addEventListener('click', () => {
        menu.remove();
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
    
    // Check if it's a custom emoji (URL)
    if (emoji.startsWith('http')) {
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
    
    // Dev testing: Press 'T' to toggle test panel
    document.addEventListener('keydown', (e) => {
        if (e.key === 't' || e.key === 'T') {
            toggleTestPanel();
        }
        // Admin panel: Press 'Shift+A' to toggle admin panel
        if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
            toggleAdminPanel();
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
                <h3>🔧 Admin - Custom Emojis</h3>
                <button id="close-admin" class="close-btn">✕</button>
            </div>
            
            <div class="admin-content">
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
                
                <div class="admin-section">
                    <h4>Current Custom Emojis</h4>
                    <div id="custom-emojis-list" class="emoji-grid">
                        <p class="loading-text">Caricamento...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    // Load custom emojis
    loadCustomEmojis();
    
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

function updateReactionsBar() {
    // Update the reactions bar to include custom emojis
    const reactionsBar = document.querySelector('.reactions');
    if (!reactionsBar) return;
    
    // Keep default emoji buttons
    const defaultButtons = Array.from(reactionsBar.querySelectorAll('.reaction-btn')).slice(0, 5);
    
    // Clear and re-add
    reactionsBar.innerHTML = '';
    defaultButtons.forEach(btn => reactionsBar.appendChild(btn));
    
    // Add custom emoji buttons
    customEmojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'reaction-btn custom-emoji-btn';
        btn.innerHTML = `<img src="${emoji.url}" alt="${emoji.name}" class="custom-emoji-icon">`;
        btn.onclick = () => triggerCustomReaction(emoji.url);
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
