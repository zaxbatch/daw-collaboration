// Configuration
const API_URL = window.location.origin;
//const API_URL = 'https://daw-collaboration.onrender.com/';

let currentUser = null;
let currentBeatId = null;
let currentTrackNumber = null;

// Multi-track studio variables
let currentSession = {
    beatId: null,
    beatTitle: null,
    beatUrl: null,
    beatBuffer: null,
    tracks: []
};

// Recording variables
let mediaRecorder = null;
let audioChunks = [];
let recordingBlob = null;
let recordingStartTime = null;
let recordingTimer = null;
let isRecording = false;

// Playback synchronization
let isPlaying = false;
let playbackStartTime = 0;
let playbackInterval = null;
let masterGainNode = null;
let audioContext = null;
let trackSources = [];
let recordingStream = null;

// Initialize 8 tracks (0 = beat track, 1-7 = recording tracks)
function initTracks() {
    currentSession.tracks = [];
    for (let i = 0; i < 8; i++) {
        currentSession.tracks.push({
            id: i,
            name: i === 0 ? '🎵 Beat Track' : `Track ${i}`,
            audioBuffer: null,
            audioUrl: null,
            volume: i === 0 ? 0.8 : 1,
            muted: false,
            solo: false,
            isLoaded: false,
            recordingData: null
        });
    }
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    console.log('8-Track DAW Studio loaded');
    initTracks();
    
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            currentUser = {
                id: payload.id,
                username: payload.username,
                displayName: payload.displayName
            };
            updateUI();
            loadFeed();
            loadTrending();
            loadLeaderboard();
            discoverMusic();
            loadBeatsForStudio();
        } catch (e) {
            console.error('Invalid token');
            localStorage.removeItem('token');
        }
    } else {
        updateUI();
        discoverMusic();
        loadTrending();
        loadLeaderboard();
        loadBeatsForStudio();
    }
    
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const page = tab.dataset.page;
            showPage(page);
            
            if (page === 'feed' && currentUser) loadFeed();
            if (page === 'discover') discoverMusic();
            if (page === 'trending') loadTrending();
            if (page === 'leaderboard') loadLeaderboard();
            if (page === 'studio') loadBeatsForStudio();
            if (page === 'profile' && currentUser) loadProfile(currentUser.username);
        });
    });
});

// ==================== UI FUNCTIONS ====================

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const targetPage = document.getElementById(`${pageName}Page`);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.page === pageName) {
            tab.classList.add('active');
        }
    });
}

function updateUI() {
    const authSection = document.getElementById('authSection');
    const navTabs = document.getElementById('navTabs');
    
    if (currentUser) {
        authSection.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <span>👋 Welcome, ${escapeHtml(currentUser.displayName || currentUser.username)}</span>
                <button onclick="logout()" class="btn-danger">Logout</button>
            </div>
        `;
        navTabs.style.display = 'flex';
    } else {
        authSection.innerHTML = `
            <div class="auth-buttons">
                <button onclick="showLoginModal()" class="btn-secondary">Login</button>
                <button onclick="showRegisterModal()" class="btn-primary">Register</button>
            </div>
        `;
        navTabs.style.display = 'flex';
    }
}

// ==================== API CALLS ====================

async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'API call failed');
    }
    
    return response.json();
}

// ==================== AUTHENTICATION ====================

async function register() {
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const displayName = document.getElementById('regDisplayName').value;
    const bio = document.getElementById('regBio').value;
    const password = document.getElementById('regPassword').value;
    
    if (!username || !email || !password) {
        alert('Please fill all required fields');
        return;
    }
    
    try {
        const data = await apiCall('/api/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, displayName, bio, password })
        });
        
        localStorage.setItem('token', data.token);
        currentUser = data.user;
        updateUI();
        closeModal('registerModal');
        loadFeed();
        discoverMusic();
        alert('Registration successful!');
    } catch (error) {
        alert(error.message);
    }
}

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        alert('Please fill all fields');
        return;
    }
    
    try {
        const data = await apiCall('/api/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        localStorage.setItem('token', data.token);
        currentUser = data.user;
        updateUI();
        closeModal('loginModal');
        loadFeed();
        discoverMusic();
        alert('Login successful!');
    } catch (error) {
        alert(error.message);
    }
}

function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    updateUI();
    showPage('discover');
    discoverMusic();
}

// ==================== DELETE FUNCTIONS ====================

async function deleteBeat(beatId) {
    if (!confirm('Are you sure you want to delete this beat? All associated recordings will also be deleted.')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/beats/${beatId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
        }
        
        alert('Beat deleted successfully!');
        closeModal('beatModal');
        discoverMusic();
        if (currentUser) loadProfile(currentUser.username);
    } catch (error) {
        alert(error.message);
    }
}

async function deleteRecording(recordingId) {
    if (!confirm('Are you sure you want to delete this recording?')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/recordings/${recordingId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
        }
        
        alert('Recording deleted successfully!');
        closeModal('beatModal');
        if (currentBeatId) {
            viewBeat(currentBeatId);
        }
        if (currentUser) loadProfile(currentUser.username);
    } catch (error) {
        alert(error.message);
    }
}

async function deleteAccount() {
    if (!confirm('WARNING: This will permanently delete your account and ALL your content. Type "DELETE" to confirm.')) {
        const confirmation = prompt('Type "DELETE" to confirm:');
        if (confirmation !== 'DELETE') {
            alert('Account deletion cancelled');
            return;
        }
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/users/${currentUser.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Delete failed');
        }
        
        localStorage.removeItem('token');
        currentUser = null;
        updateUI();
        showPage('discover');
        discoverMusic();
        alert('Account deleted successfully');
    } catch (error) {
        alert(error.message);
    }
}

// ==================== FEED & DISCOVERY ====================

async function loadFeed() {
    if (!currentUser) {
        document.getElementById('feedContent').innerHTML = '<p>Please login to see your feed</p>';
        return;
    }
    
    try {
        const feed = await apiCall('/api/feed');
        const feedContent = document.getElementById('feedContent');
        
        if (feed.length === 0) {
            feedContent.innerHTML = '<p>Follow some creators to see their latest uploads!</p>';
            return;
        }
        
        feedContent.innerHTML = feed.map(item => {
            if (item.type === 'beat') {
                return `
                    <div class="feed-item" onclick="viewBeat('${item.id}')">
                        <div class="feed-header">
                            <div class="feed-avatar">${(item.producerName?.[0] || 'U').toUpperCase()}</div>
                            <div class="feed-user-info">
                                <div class="feed-username"><strong>${escapeHtml(item.producerName)}</strong></div>
                                <div class="feed-time">${timeAgo(item.createdAt)}</div>
                            </div>
                            <span class="feed-badge badge-beat">🎵 New Beat</span>
                        </div>
                        <div class="beat-title">${escapeHtml(item.title)}</div>
                        <div class="beat-info">${escapeHtml(item.genre)} • ${item.bpm} BPM</div>
                        <audio controls onclick="event.stopPropagation()">
                            <source src="${API_URL}${item.fileUrl}" type="audio/mpeg">
                        </audio>
                    </div>
                `;
            } else {
                return `
                    <div class="feed-item" onclick="viewBeat('${item.beatId}')">
                        <div class="feed-header">
                            <div class="feed-avatar">${(item.vocalistName?.[0] || 'U').toUpperCase()}</div>
                            <div class="feed-user-info">
                                <div class="feed-username"><strong>${escapeHtml(item.vocalistName)}</strong></div>
                                <div class="feed-time">${timeAgo(item.createdAt)}</div>
                            </div>
                            <span class="feed-badge badge-recording">🎤 New Recording</span>
                        </div>
                        <div class="beat-title">${escapeHtml(item.title)}</div>
                        <div class="beat-info">on "${escapeHtml(item.beatTitle)}"</div>
                        <audio controls onclick="event.stopPropagation()">
                            <source src="${API_URL}${item.fileUrl}" type="audio/mpeg">
                        </audio>
                    </div>
                `;
            }
        }).join('');
    } catch (error) {
        console.error('Error loading feed:', error);
        document.getElementById('feedContent').innerHTML = '<p>Error loading feed</p>';
    }
}

async function discoverMusic() {
    const genre = document.getElementById('discoverGenre')?.value || 'all';
    const sort = document.getElementById('discoverSort')?.value || 'newest';
    const search = document.getElementById('discoverSearch')?.value || '';
    
    try {
        const beats = await apiCall(`/api/beats?genre=${genre}&sort=${sort}&search=${search}`);
        displayBeats(beats, 'discoverContent');
    } catch (error) {
        console.error('Error discovering music:', error);
        document.getElementById('discoverContent').innerHTML = '<p>Error loading music</p>';
    }
}

async function loadTrending() {
    try {
        const trending = await apiCall('/api/trending');
        const trendingContent = document.getElementById('trendingContent');
        
        if (trending.length === 0) {
            trendingContent.innerHTML = '<p>No trending content yet. Be the first!</p>';
            return;
        }
        
        trendingContent.innerHTML = trending.map(item => {
            if (item.type === 'beat') {
                return `
                    <div class="feed-item" onclick="viewBeat('${item.id}')">
                        <div class="feed-header">
                            <div class="feed-avatar">${(item.producerName?.[0] || 'U').toUpperCase()}</div>
                            <div class="feed-user-info">
                                <div class="feed-username"><strong>${escapeHtml(item.producerName)}</strong></div>
                                <div class="feed-time">🔥 Trending Beat</div>
                            </div>
                        </div>
                        <div class="beat-title">${escapeHtml(item.title)}</div>
                        <div class="beat-stats">🎧 ${item.plays} plays • ⬇️ ${item.downloads} downloads</div>
                        <audio controls onclick="event.stopPropagation()">
                            <source src="${API_URL}${item.fileUrl}" type="audio/mpeg">
                        </audio>
                    </div>
                `;
            } else {
                return `
                    <div class="feed-item" onclick="viewBeat('${item.beatId}')">
                        <div class="feed-header">
                            <div class="feed-avatar">${(item.vocalistName?.[0] || 'U').toUpperCase()}</div>
                            <div class="feed-user-info">
                                <div class="feed-username"><strong>${escapeHtml(item.vocalistName)}</strong></div>
                                <div class="feed-time">⭐ Rating: ${item.rating?.toFixed(1) || 0}/5</div>
                            </div>
                        </div>
                        <div class="beat-title">${escapeHtml(item.title)}</div>
                        <div class="beat-info">on "${escapeHtml(item.beat?.title)}"</div>
                        <audio controls onclick="event.stopPropagation()">
                            <source src="${API_URL}${item.fileUrl}" type="audio/mpeg">
                        </audio>
                    </div>
                `;
            }
        }).join('');
    } catch (error) {
        console.error('Error loading trending:', error);
    }
}

async function loadLeaderboard() {
    try {
        const users = await apiCall('/api/leaderboard/top-users');
        const leaderboardContent = document.getElementById('leaderboardContent');
        
        if (!leaderboardContent) return;
        
        leaderboardContent.innerHTML = users.map((user, index) => `
            <div class="leaderboard-item" onclick="viewProfile('${user.username}')">
                <div class="leaderboard-rank">#${index + 1}</div>
                <div class="leaderboard-user">
                    <div class="leaderboard-avatar">${(user.displayName?.[0] || user.username?.[0] || 'U').toUpperCase()}</div>
                    <div>
                        <div><strong>${escapeHtml(user.displayName || user.username)}</strong> @${escapeHtml(user.username)}</div>
                        <div style="font-size: 12px; color: #666;">${escapeHtml(user.bio || '')}</div>
                    </div>
                </div>
                <div class="leaderboard-stats">
                    <div>⭐ ${user.points || 0} pts</div>
                    <div style="font-size: 12px;">🎵 ${user.uploadedBeats || 0} beats • 🎤 ${user.recordings || 0} recordings</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
}

function displayBeats(beats, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!beats || beats.length === 0) {
        container.innerHTML = '<p>No beats found. Be the first to upload!</p>';
        return;
    }
    
    container.innerHTML = beats.map(beat => `
        <div class="beat-card" onclick="viewBeat('${beat.id}')">
            <div class="beat-title">${escapeHtml(beat.title)}</div>
            <div class="beat-info">
                by ${escapeHtml(beat.producerName)}<br>
                ${beat.genre} • ${beat.bpm} BPM
            </div>
            <div class="beat-stats">
                🎧 ${beat.plays || 0} plays • ⬇️ ${beat.downloads || 0} downloads
            </div>
            <div class="beat-tags">
                ${beat.tags?.map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('') || ''}
            </div>
            <audio controls onclick="event.stopPropagation()">
                <source src="${API_URL}${beat.fileUrl}" type="audio/mpeg">
            </audio>
        </div>
    `).join('');
}

// ==================== BEAT FUNCTIONS ====================

async function uploadBeat() {
    if (!currentUser) {
        alert('Please login first');
        return;
    }
    
    const title = document.getElementById('beatTitle').value;
    const genre = document.getElementById('beatGenre').value;
    const bpm = document.getElementById('beatBpm').value;
    const tags = document.getElementById('beatTags').value;
    const description = document.getElementById('beatDescription').value;
    const file = document.getElementById('beatFile').files[0];
    
    if (!title || !bpm || !file) {
        alert('Please fill all required fields (Title, BPM, and audio file)');
        return;
    }
    
    const formData = new FormData();
    formData.append('beat', file);
    formData.append('title', title);
    formData.append('genre', genre);
    formData.append('bpm', bpm);
    formData.append('tags', tags);
    formData.append('description', description);
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/beats`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }
        
        alert('Beat uploaded successfully!');
        
        document.getElementById('beatTitle').value = '';
        document.getElementById('beatBpm').value = '';
        document.getElementById('beatTags').value = '';
        document.getElementById('beatDescription').value = '';
        document.getElementById('beatFile').value = '';
        
        discoverMusic();
        showPage('discover');
    } catch (error) {
        alert(error.message);
    }
}

async function viewBeat(beatId) {
    try {
        const beat = await apiCall(`/api/beats/${beatId}`);
        currentBeatId = beatId;
        
        const modalContent = document.getElementById('beatDetail');
        modalContent.innerHTML = `
            <div class="modal-header">${escapeHtml(beat.title)}</div>
            <div class="beat-info">
                <strong>Producer:</strong> ${escapeHtml(beat.producerName)}<br>
                <strong>Genre:</strong> ${beat.genre}<br>
                <strong>BPM:</strong> ${beat.bpm}<br>
                <strong>Stats:</strong> 🎧 ${beat.plays} plays • ⬇️ ${beat.downloads} downloads<br>
                <strong>Description:</strong> ${escapeHtml(beat.description || 'No description')}
            </div>
            <div class="beat-tags">
                ${beat.tags?.map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('') || ''}
            </div>
            <audio controls style="width: 100%; margin: 20px 0;">
                <source src="${API_URL}${beat.fileUrl}" type="audio/mpeg">
            </audio>
            
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                ${currentUser ? `
                    <button onclick="downloadBeat('${beat.id}')" class="download-btn">⬇️ Download Beat</button>
                    <button onclick="openMultiTrackStudio('${beat.id}', '${escapeHtml(beat.title)}', '${API_URL}${beat.fileUrl}')" class="btn-primary">🎙️ Open in 8-Track Studio</button>
                ` : '<p>Login to download or record</p>'}
                ${currentUser && beat.producerId === currentUser.id ? `
                    <button onclick="deleteBeat('${beat.id}')" class="btn-danger">🗑️ Delete Beat</button>
                ` : ''}
            </div>
            
            <h3 style="margin-top: 30px;">Vocal Versions (${beat.versions?.length || 0})</h3>
            <div id="versionsList">
                ${!beat.versions || beat.versions.length === 0 ? '<p>No vocal versions yet. Be the first to record!</p>' : 
                  beat.versions.map(version => `
                    <div class="recording-item">
                        <div class="recording-header">
                            <div class="recording-title">${escapeHtml(version.title)}</div>
                            <div class="recording-rating">⭐ ${version.rating ? version.rating.toFixed(1) : 0}/5 (${version.votes?.length || 0} votes)</div>
                        </div>
                        <div>by ${escapeHtml(version.vocalistName)}</div>
                        ${version.description ? `<div style="font-size: 14px; margin: 10px 0;">${escapeHtml(version.description)}</div>` : ''}
                        <audio controls style="width: 100%; margin: 10px 0;">
                            <source src="${API_URL}${version.fileUrl}" type="audio/mpeg">
                        </audio>
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            ${currentUser && currentUser.id !== version.vocalistId ? `
                                <div class="vote-section">
                                    <select id="rating-${version.id}" class="vote-select">
                                        <option value="1">⭐ 1 Star</option>
                                        <option value="2">⭐⭐ 2 Stars</option>
                                        <option value="3">⭐⭐⭐ 3 Stars</option>
                                        <option value="4">⭐⭐⭐⭐ 4 Stars</option>
                                        <option value="5">⭐⭐⭐⭐⭐ 5 Stars</option>
                                    </select>
                                    <button onclick="voteForRecording('${version.id}')" class="vote-btn">Vote</button>
                                </div>
                            ` : ''}
                            ${currentUser && version.vocalistId === currentUser.id ? `
                                <button onclick="deleteRecording('${version.id}')" class="btn-danger">🗑️ Delete</button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        showModal('beatModal');
    } catch (error) {
        alert(error.message);
    }
}

async function downloadBeat(beatId) {
    try {
        const token = localStorage.getItem('token');
        window.open(`${API_URL}/api/beats/${beatId}/download?token=${token}`, '_blank');
    } catch (error) {
        alert('Error downloading beat');
    }
}

async function voteForRecording(recordingId) {
    const ratingSelect = document.getElementById(`rating-${recordingId}`);
    if (!ratingSelect) return;
    
    const rating = parseInt(ratingSelect.value);
    
    try {
        await apiCall('/api/vote', {
            method: 'POST',
            body: JSON.stringify({ recordingId, rating })
        });
        
        alert('Vote recorded!');
        if (currentBeatId) {
            viewBeat(currentBeatId);
        }
    } catch (error) {
        alert(error.message);
    }
}

// ==================== 8-TRACK DAW STUDIO WITH PROPER RECORDING ====================

async function loadBeatsForStudio() {
    try {
        const beats = await apiCall('/api/beats?sort=newest');
        const beatSelector = document.getElementById('beatSelector');
        
        beatSelector.innerHTML = beats.slice(0, 12).map(beat => `
            <div class="beat-card" onclick="openMultiTrackStudio('${beat.id}', '${escapeHtml(beat.title)}', '${API_URL}${beat.fileUrl}')">
                <div class="beat-title">${escapeHtml(beat.title)}</div>
                <div class="beat-info">by ${escapeHtml(beat.producerName)}</div>
                <div class="beat-info">${beat.genre} • ${beat.bpm} BPM</div>
                <audio controls onclick="event.stopPropagation()">
                    <source src="${API_URL}${beat.fileUrl}" type="audio/mpeg">
                </audio>
                <button class="btn-primary" style="margin-top: 10px;" onclick="event.stopPropagation(); openMultiTrackStudio('${beat.id}', '${escapeHtml(beat.title)}', '${API_URL}${beat.fileUrl}')">
                    🎙️ Open in 8-Track Studio
                </button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading beats for studio:', error);
    }
}

async function openMultiTrackStudio(beatId, beatTitle, beatUrl) {
    if (!currentUser) {
        alert('Please login to use the studio');
        return;
    }
    
    // Stop any playing audio
    stopPlayback();
    if (isRecording) {
        stopRecording();
    }
    
    // Close existing audio context
    if (audioContext) {
        await audioContext.close();
        audioContext = null;
    }
    
    currentSession.beatId = beatId;
    currentSession.beatTitle = beatTitle;
    currentSession.beatUrl = beatUrl;
    
    // Reset tracks
    initTracks();
    
    // Initialize audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Load beat into track 0
    try {
        const response = await fetch(beatUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        currentSession.beatBuffer = audioBuffer;
        currentSession.tracks[0].audioBuffer = audioBuffer;
        currentSession.tracks[0].name = `🎵 ${beatTitle}`;
        currentSession.tracks[0].isLoaded = true;
        currentSession.tracks[0].volume = 0.8;
        
        renderTrackInterface();
        drawWaveform(0, audioBuffer);
    } catch (error) {
        console.error('Error loading beat:', error);
        alert('Error loading beat file');
    }
    
    // Hide selector, show studio
    document.querySelector('.studio-selector').style.display = 'none';
    document.getElementById('multiTrackStudio').style.display = 'block';
}

function renderTrackInterface() {
    const trackContainer = document.getElementById('trackContainer');
    
    trackContainer.innerHTML = `
        <div class="transport-controls" style="background: #1a1a1a; padding: 15px; border-radius: 10px; margin-bottom: 20px; display: flex; gap: 15px; justify-content: center;">
            <button id="playBtn" onclick="startPlayback()" class="btn-primary" style="font-size: 18px; padding: 10px 30px;">▶️ Play All Tracks</button>
            <button id="stopBtn" onclick="stopPlayback()" class="btn-secondary" style="font-size: 18px; padding: 10px 30px;">⏹️ Stop</button>
        </div>
        ${currentSession.tracks.map(track => `
            <div class="track" data-track-id="${track.id}" style="opacity: ${track.muted ? 0.5 : 1}">
                <div class="track-header">
                    <div class="track-number">Track ${track.id === 0 ? 'BEAT' : track.id}</div>
                    <input type="text" class="track-name-input" value="${escapeHtml(track.name)}" 
                           onchange="updateTrackName(${track.id}, this.value)">
                    <div class="track-controls">
                        ${track.id !== 0 ? `
                            <button id="recordBtn-${track.id}" class="track-btn track-record" onclick="startRecordingToTrack(${track.id})" style="${track.isLoaded ? 'background: #f44336;' : 'opacity:0.5;'}">
                                🔴 Record
                            </button>
                            <button class="track-btn track-clear" onclick="clearTrack(${track.id})">🗑️ Clear</button>
                        ` : ''}
                    </div>
                </div>
                
                <div class="track-waveform" id="waveform-container-${track.id}">
                    <canvas id="waveform-${track.id}" width="100%" height="60"></canvas>
                    ${track.id !== 0 && !track.isLoaded ? '<div style="position: absolute; color: #666; margin-top: 20px;">Click record to record or load audio</div>' : ''}
                </div>
                
                <div class="track-volume">
                    <span>🔊</span>
                    <input type="range" min="0" max="1" step="0.01" value="${track.volume}" 
                           onchange="updateTrackVolume(${track.id}, this.value)">
                    <button class="track-btn track-solo" onclick="toggleSolo(${track.id})" style="background: ${track.solo ? '#4CAF50' : '#666'}">
                        ${track.solo ? '🔊 Solo' : 'Solo'}
                    </button>
                    <button class="track-btn track-mute" onclick="toggleMute(${track.id})" style="background: ${track.muted ? '#f44336' : '#666'}">
                        ${track.muted ? '🔇 Muted' : 'Mute'}
                    </button>
                </div>
                
                ${track.id !== 0 && track.isLoaded ? `
                    <audio controls style="width: 100%; margin-top: 10px;" src="${track.audioUrl}"></audio>
                ` : ''}
                
                ${track.id !== 0 && !track.isLoaded ? `
                    <input type="file" id="file-input-${track.id}" accept="audio/*" style="display: none;" 
                           onchange="loadTrackFile(${track.id}, this.files[0])">
                    <button class="btn-secondary" style="margin-top: 10px; width: 100%;" onclick="document.getElementById('file-input-${track.id}').click()">
                        📁 Or Upload Audio File
                    </button>
                ` : ''}
            </div>
        `).join('')}
    `;
    
    // Draw waveforms for loaded tracks
    currentSession.tracks.forEach(track => {
        if (track.audioBuffer && track.isLoaded) {
            drawWaveform(track.id, track.audioBuffer);
        }
    });
}

function drawWaveform(trackId, audioBuffer) {
    const canvas = document.getElementById(`waveform-${trackId}`);
    if (!canvas) return;
    
    const canvasContext = canvas.getContext('2d');
    const width = canvas.parentElement.clientWidth - 40;
    const height = 60;
    canvas.width = width;
    canvas.height = height;
    
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;
    
    canvasContext.fillStyle = '#1a1a1a';
    canvasContext.fillRect(0, 0, width, height);
    canvasContext.beginPath();
    canvasContext.strokeStyle = '#667eea';
    canvasContext.lineWidth = 2;
    
    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
            const index = Math.min(i * step + j, data.length - 1);
            const datum = data[index];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        const y1 = (1 + min) * amp;
        const y2 = (1 + max) * amp;
        canvasContext.moveTo(i, y1);
        canvasContext.lineTo(i, y2);
    }
    canvasContext.stroke();
}

function updateTrackName(trackId, name) {
    currentSession.tracks[trackId].name = name;
}

function updateTrackVolume(trackId, volume) {
    currentSession.tracks[trackId].volume = parseFloat(volume);
}

function toggleMute(trackId) {
    const track = currentSession.tracks[trackId];
    track.muted = !track.muted;
    
    if (track.muted) {
        track.solo = false;
    }
    
    renderTrackInterface();
}

function toggleSolo(trackId) {
    const track = currentSession.tracks[trackId];
    
    if (track.solo) {
        track.solo = false;
    } else {
        currentSession.tracks.forEach(t => {
            t.solo = (t.id === trackId);
        });
    }
    
    renderTrackInterface();
}

function clearTrack(trackId) {
    if (confirm(`Clear track ${trackId}? This will remove the audio.`)) {
        if (currentSession.tracks[trackId].audioUrl && currentSession.tracks[trackId].id !== 0) {
            URL.revokeObjectURL(currentSession.tracks[trackId].audioUrl);
        }
        currentSession.tracks[trackId].audioBuffer = null;
        currentSession.tracks[trackId].audioUrl = null;
        currentSession.tracks[trackId].isLoaded = false;
        renderTrackInterface();
    }
}

function clearAllTracks() {
    if (confirm('Clear ALL user tracks? The beat track will remain. This cannot be undone.')) {
        for (let i = 1; i < 8; i++) {
            if (currentSession.tracks[i].audioUrl) {
                URL.revokeObjectURL(currentSession.tracks[i].audioUrl);
            }
            currentSession.tracks[i].audioBuffer = null;
            currentSession.tracks[i].audioUrl = null;
            currentSession.tracks[i].isLoaded = false;
        }
        renderTrackInterface();
    }
}

function closeStudio() {
    if (confirm('Close studio? Unsaved recordings will be lost.')) {
        if (isRecording) {
            stopRecording();
        }
        stopPlayback();
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        document.querySelector('.studio-selector').style.display = 'block';
        document.getElementById('multiTrackStudio').style.display = 'none';
        initTracks();
    }
}

async function loadTrackFile(trackId, file) {
    if (!file) return;
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        currentSession.tracks[trackId].audioBuffer = audioBuffer;
        currentSession.tracks[trackId].audioUrl = URL.createObjectURL(file);
        currentSession.tracks[trackId].isLoaded = true;
        
        renderTrackInterface();
        drawWaveform(trackId, audioBuffer);
    } catch (error) {
        console.error('Error loading file:', error);
        alert('Error loading audio file. Make sure it\'s a valid audio file.');
    }
}

// ==================== PLAYBACK WITH SYNC ====================

async function startPlayback() {
    if (isPlaying) {
        stopPlayback();
        return;
    }
    
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    
    const hasContent = currentSession.tracks.some(track => track.isLoaded);
    if (!hasContent) {
        alert('No tracks to play. Load a beat and add some recordings!');
        return;
    }
    
    if (playbackInterval) {
        clearInterval(playbackInterval);
    }
    
    masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = 1;
    masterGainNode.connect(audioContext.destination);
    
    let maxDuration = 0;
    currentSession.tracks.forEach(track => {
        if (track.audioBuffer && track.isLoaded) {
            maxDuration = Math.max(maxDuration, track.audioBuffer.duration);
        }
    });
    
    trackSources = [];
    const startTime = audioContext.currentTime;
    
    currentSession.tracks.forEach((track) => {
        if (!track.audioBuffer || !track.isLoaded) return;
        
        const hasSolo = currentSession.tracks.some(t => t.solo === true);
        const shouldPlay = !track.muted && (!hasSolo || track.solo);
        
        if (!shouldPlay) return;
        
        const source = audioContext.createBufferSource();
        source.buffer = track.audioBuffer;
        
        const gainNode = audioContext.createGain();
        gainNode.gain.value = track.volume;
        
        source.connect(gainNode);
        gainNode.connect(masterGainNode);
        
        source.start(startTime);
        
        trackSources.push({
            source: source,
            gainNode: gainNode,
            trackId: track.id
        });
    });
    
    isPlaying = true;
    const playBtn = document.getElementById('playBtn');
    if (playBtn) playBtn.textContent = '⏸️ Pause';
    
    playbackStartTime = Date.now();
    playbackInterval = setInterval(() => {
        const elapsed = (Date.now() - playbackStartTime) / 1000;
        if (elapsed >= maxDuration) {
            stopPlayback();
        }
    }, 100);
}

function stopPlayback() {
    if (trackSources) {
        trackSources.forEach(track => {
            try {
                track.source.stop();
            } catch (e) {}
        });
        trackSources = [];
    }
    
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
    
    isPlaying = false;
    const playBtn = document.getElementById('playBtn');
    if (playBtn) playBtn.textContent = '▶️ Play All Tracks';
}

// ==================== PROPER RECORDING WITH BEAT PLAYBACK ====================

async function startRecordingToTrack(trackNumber) {
    if (!currentUser) {
        alert('Please login to record');
        return;
    }
    
    if (isRecording) {
        alert('Already recording! Stop the current recording first.');
        return;
    }
    
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    
    currentTrackNumber = trackNumber;
    
    // Ask for track name
    const trackName = prompt(`Name for Track ${trackNumber}:`, `Track ${trackNumber}`);
    if (trackName) {
        currentSession.tracks[trackNumber].name = trackName;
    }
    
    try {
        // Get microphone access
        recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create media recorder
        mediaRecorder = new MediaRecorder(recordingStream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            recordingBlob = new Blob(audioChunks, { type: 'audio/wav' });
            console.log('Recording complete, size:', recordingBlob.size);
            
            // Decode and save to track
            const arrayBuffer = await recordingBlob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // Save to track
            if (currentSession.tracks[currentTrackNumber].audioUrl) {
                URL.revokeObjectURL(currentSession.tracks[currentTrackNumber].audioUrl);
            }
            
            currentSession.tracks[currentTrackNumber].audioBuffer = audioBuffer;
            currentSession.tracks[currentTrackNumber].audioUrl = URL.createObjectURL(recordingBlob);
            currentSession.tracks[currentTrackNumber].isLoaded = true;
            
            renderTrackInterface();
            drawWaveform(currentTrackNumber, audioBuffer);
            
            alert(`Recording saved to Track ${currentTrackNumber}!`);
            
            // Clean up
            if (recordingStream) {
                recordingStream.getTracks().forEach(track => track.stop());
                recordingStream = null;
            }
        };
        
        // Start recording
        mediaRecorder.start();
        isRecording = true;
        
        // Change button to recording state
        const recordBtn = document.getElementById(`recordBtn-${trackNumber}`);
        if (recordBtn) {
            recordBtn.textContent = '⏹️ Stop Recording';
            recordBtn.style.background = '#ff9800';
            recordBtn.onclick = () => stopRecordingToTrack(trackNumber);
        }
        
        // Start beat playback for monitoring
        await startMonitoringPlayback();
        
        // Start timer
        recordingStartTime = Date.now();
        startRecordingTimer();
        
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Error accessing microphone. Please check permissions.');
        if (recordingStream) {
            recordingStream.getTracks().forEach(track => track.stop());
            recordingStream = null;
        }
    }
}

async function startMonitoringPlayback() {
    // Create a monitoring mix so the vocalist can hear the beat while recording
    if (!audioContext) return;
    
    const masterGain = audioContext.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(audioContext.destination);
    
    // Play the beat track only (for monitoring)
    if (currentSession.tracks[0].audioBuffer && !currentSession.tracks[0].muted) {
        const beatSource = audioContext.createBufferSource();
        beatSource.buffer = currentSession.tracks[0].audioBuffer;
        
        const beatGain = audioContext.createGain();
        beatGain.gain.value = currentSession.tracks[0].volume * 0.7; // Slightly lower for monitoring
        
        beatSource.connect(beatGain);
        beatGain.connect(masterGain);
        beatSource.start();
        
        // Store for cleanup
        if (!window.monitoringSources) window.monitoringSources = [];
        window.monitoringSources.push(beatSource);
    }
}

function stopMonitoringPlayback() {
    if (window.monitoringSources) {
        window.monitoringSources.forEach(source => {
            try {
                source.stop();
            } catch (e) {}
        });
        window.monitoringSources = [];
    }
}

function stopRecordingToTrack(trackNumber) {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        isRecording = false;
        
        // Reset button
        const recordBtn = document.getElementById(`recordBtn-${trackNumber}`);
        if (recordBtn) {
            recordBtn.textContent = '🔴 Record';
            recordBtn.style.background = '#f44336';
            recordBtn.onclick = () => startRecordingToTrack(trackNumber);
        }
        
        // Stop monitoring playback
        stopMonitoringPlayback();
        
        // Stop timer
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        // Stop all playback
        stopPlayback();
    }
}

function startRecordingTimer() {
    recordingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timerDisplay = document.getElementById('recordingTimerDisplay');
        if (timerDisplay) {
            timerDisplay.textContent = `Recording: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

// ==================== MIX AND EXPORT ====================

async function saveMultiTrackSession() {
    if (!currentSession.beatId) {
        alert('No beat selected');
        return;
    }
    
    const hasUserRecordings = currentSession.tracks.slice(1).some(track => track.isLoaded);
    if (!hasUserRecordings) {
        alert('No recordings to save. Please record something first!');
        return;
    }
    
    if (isRecording) {
        alert('Please stop recording before saving');
        return;
    }
    
    const title = prompt('Enter a title for your recording:', `${currentUser.displayName}'s version of ${currentSession.beatTitle}`);
    if (!title) return;
    
    const description = prompt('Enter a description (optional):', '');
    const tags = prompt('Enter tags (comma separated):', '');
    
    stopPlayback();
    
    const mixedBlob = await mixTracks();
    
    const formData = new FormData();
    formData.append('vocal', mixedBlob, 'mixed_recording.wav');
    formData.append('title', title);
    formData.append('description', description || '');
    formData.append('tags', tags || '');
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/beats/${currentSession.beatId}/record`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }
        
        alert('Recording saved successfully!');
        closeStudio();
        showPage('discover');
    } catch (error) {
        alert(error.message);
    }
}

async function mixTracks() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const sampleRate = 44100;
    const trackBuffers = [];
    
    for (const track of currentSession.tracks) {
        if (track.audioBuffer && track.isLoaded && !track.muted) {
            trackBuffers.push({
                buffer: track.audioBuffer,
                volume: track.volume
            });
        }
    }
    
    if (trackBuffers.length === 0) {
        throw new Error('No tracks to mix');
    }
    
    const maxDuration = Math.max(...trackBuffers.map(t => t.buffer.duration));
    const length = Math.ceil(maxDuration * sampleRate);
    
    const mixedBuffer = audioContext.createBuffer(2, length, sampleRate);
    
    for (const track of trackBuffers) {
        const buffer = track.buffer;
        const volume = track.volume;
        
        for (let channel = 0; channel < 2; channel++) {
            const mixedData = mixedBuffer.getChannelData(channel);
            const trackData = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
            
            const trackLength = Math.min(buffer.length, length);
            for (let i = 0; i < trackLength; i++) {
                mixedData[i] += trackData[i] * volume;
            }
        }
    }
    
    let maxVal = 0;
    for (let channel = 0; channel < 2; channel++) {
        const data = mixedBuffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            maxVal = Math.max(maxVal, Math.abs(data[i]));
        }
    }
    
    if (maxVal > 0) {
        const gain = 0.9 / maxVal;
        for (let channel = 0; channel < 2; channel++) {
            const data = mixedBuffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                data[i] *= gain;
            }
        }
    }
    
    return bufferToWav(mixedBuffer);
}

function bufferToWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1;
    const bitDepth = 16;
    
    let samples = 0;
    const channelData = [];
    for (let channel = 0; channel < numChannels; channel++) {
        channelData.push(audioBuffer.getChannelData(channel));
        samples += audioBuffer.length;
    }
    
    const dataLength = samples * (bitDepth / 8);
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);
    
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
            const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

async function exportMixedAudio() {
    try {
        const mixedBlob = await mixTracks();
        const url = URL.createObjectURL(mixedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentSession.beatTitle}_mixed.wav`;
        a.click();
        URL.revokeObjectURL(url);
        alert('Export complete!');
    } catch (error) {
        alert('Error mixing tracks: ' + error.message);
    }
}

// ==================== PROFILE FUNCTIONS ====================

async function viewProfile(username) {
    try {
        const user = await apiCall(`/api/users/${username}`);
        
        const profileContent = document.getElementById('profileContent');
        profileContent.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar">${(user.displayName?.[0] || user.username?.[0]).toUpperCase()}</div>
                <div class="profile-info">
                    <div class="profile-name">${escapeHtml(user.displayName || user.username)}</div>
                    <div>@${escapeHtml(user.username)}</div>
                    <div class="profile-stats">
                        <div class="stat">
                            <div class="stat-number">${user.uploadedBeatsCount || 0}</div>
                            <div class="stat-label">Beats</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">${user.recordingsCount || 0}</div>
                            <div class="stat-label">Recordings</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">${user.followers?.length || 0}</div>
                            <div class="stat-label">Followers</div>
                        </div>
                        <div class="stat">
                            <div class="stat-number">${user.points || 0}</div>
                            <div class="stat-label">Points</div>
                        </div>
                    </div>
                    ${user.bio ? `<div class="profile-bio">${escapeHtml(user.bio)}</div>` : ''}
                    <div style="margin-top: 15px; display: flex; gap: 10px;">
                        ${currentUser && currentUser.id !== user.id ? 
                            `<button onclick="followUser('${user.id}')" class="follow-btn">➕ Follow</button>` : ''}
                        ${currentUser && currentUser.id === user.id ? 
                            `<button onclick="deleteAccount()" class="btn-danger">🗑️ Delete Account</button>` : ''}
                    </div>
                </div>
            </div>
            <h3>Uploaded Beats</h3>
            <div class="beats-grid">
                ${user.uploadedBeats?.map(beat => `
                    <div class="beat-card" onclick="viewBeat('${beat.id}')">
                        <div class="beat-title">${escapeHtml(beat.title)}</div>
                        <div class="beat-info">${beat.genre} • ${beat.bpm} BPM</div>
                        <audio controls onclick="event.stopPropagation()">
                            <source src="${API_URL}${beat.fileUrl}" type="audio/mpeg">
                        </audio>
                        ${currentUser && currentUser.id === beat.producerId ? `
                            <button class="btn-danger" style="margin-top: 10px;" onclick="event.stopPropagation(); deleteBeat('${beat.id}')">
                                🗑️ Delete Beat
                            </button>
                        ` : ''}
                    </div>
                `).join('') || '<p>No beats uploaded yet</p>'}
            </div>
            <h3>Recordings</h3>
            <div class="beats-grid">
                ${user.recordings?.map(recording => `
                    <div class="beat-card" onclick="viewRecording('${recording.id}')">
                        <div class="beat-title">${escapeHtml(recording.title)}</div>
                        <div class="beat-info">⭐ ${recording.rating?.toFixed(1) || 0}/5</div>
                        <audio controls onclick="event.stopPropagation()">
                            <source src="${API_URL}${recording.fileUrl}" type="audio/mpeg">
                        </audio>
                        ${currentUser && currentUser.id === recording.vocalistId ? `
                            <button class="btn-danger" style="margin-top: 10px;" onclick="event.stopPropagation(); deleteRecording('${recording.id}')">
                                🗑️ Delete Recording
                            </button>
                        ` : ''}
                    </div>
                `).join('') || '<p>No recordings yet</p>'}
            </div>
        `;
        
        showPage('profile');
    } catch (error) {
        alert(error.message);
    }
}

async function loadProfile(username) {
    await viewProfile(username);
}

async function followUser(userId) {
    try {
        await apiCall(`/api/users/${userId}/follow`, { method: 'POST' });
        alert('Followed!');
        if (currentUser) {
            viewProfile(currentUser.username);
        }
    } catch (error) {
        alert(error.message);
    }
}

async function viewRecording(recordingId) {
    try {
        const recording = await apiCall(`/api/recordings/${recordingId}`);
        const beats = await apiCall('/api/beats');
        const beat = beats.find(b => b.versions.some(v => v.id === recordingId));
        if (beat) {
            viewBeat(beat.id);
        }
    } catch (error) {
        alert(error.message);
    }
}

// ==================== SEARCH FUNCTIONS ====================

async function handleGlobalSearch(event) {
    const query = event.target.value;
    const resultsDiv = document.getElementById('searchResults');
    
    if (query.length < 2) {
        resultsDiv.classList.remove('active');
        return;
    }
    
    try {
        const users = await apiCall(`/api/search/users?q=${query}`);
        
        if (users.length === 0) {
            resultsDiv.classList.remove('active');
            return;
        }
        
        resultsDiv.innerHTML = users.map(user => `
            <div class="search-result-item" onclick="viewProfile('${user.username}')">
                <div class="search-result-avatar">${(user.displayName?.[0] || user.username?.[0]).toUpperCase()}</div>
                <div>
                    <strong>${escapeHtml(user.displayName || user.username)}</strong><br>
                    <small>@${escapeHtml(user.username)}</small>
                </div>
            </div>
        `).join('');
        
        resultsDiv.classList.add('active');
    } catch (error) {
        console.error('Search error:', error);
    }
}

// ==================== HELPER FUNCTIONS ====================

function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
        }
    }
    return 'just now';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function showLoginModal() {
    showModal('loginModal');
}

function showRegisterModal() {
    showModal('registerModal');
}

// Make functions global
window.register = register;
window.login = login;
window.logout = logout;
window.uploadBeat = uploadBeat;
window.viewBeat = viewBeat;
window.downloadBeat = downloadBeat;
window.deleteBeat = deleteBeat;
window.deleteRecording = deleteRecording;
window.deleteAccount = deleteAccount;
window.voteForRecording = voteForRecording;
window.viewProfile = viewProfile;
window.followUser = followUser;
window.discoverMusic = discoverMusic;
window.loadTrending = loadTrending;
window.loadLeaderboard = loadLeaderboard;
window.showLoginModal = showLoginModal;
window.showRegisterModal = showRegisterModal;
window.closeModal = closeModal;
window.showPage = showPage;
window.handleGlobalSearch = handleGlobalSearch;
window.openMultiTrackStudio = openMultiTrackStudio;
window.startPlayback = startPlayback;
window.stopPlayback = stopPlayback;
window.startRecordingToTrack = startRecordingToTrack;
window.stopRecordingToTrack = stopRecordingToTrack;
window.saveMultiTrackSession = saveMultiTrackSession;
window.clearAllTracks = clearAllTracks;
window.closeStudio = closeStudio;
window.exportMixedAudio = exportMixedAudio;
window.updateTrackName = updateTrackName;
window.updateTrackVolume = updateTrackVolume;
window.toggleMute = toggleMute;
window.toggleSolo = toggleSolo;
window.clearTrack = clearTrack;
window.loadTrackFile = loadTrackFile;