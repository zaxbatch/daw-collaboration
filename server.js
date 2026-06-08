const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'daw-secret-key-2024';

// CORS configuration - Allow all origins for Render
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files with proper headers
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, filePath) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET');
    }
}));

// Ensure directories exist
const dirs = ['uploads/beats', 'uploads/vocals', 'data'];
dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
});

// Initialize data files with proper structure
const initializeDataFiles = () => {
    const files = {
        'beats.json': [],
        'users.json': [],
        'votes.json': [],
        'follows.json': []
    };
    
    for (const [file, defaultData] of Object.entries(files)) {
        const filePath = path.join(__dirname, 'data', file);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
        }
    }
};

initializeDataFiles();

// Helper functions
const readData = (file) => {
    try {
        const filePath = path.join(__dirname, 'data', file);
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${file}:`, error);
        return [];
    }
};

const writeData = (file, data) => {
    try {
        const filePath = path.join(__dirname, 'data', file);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing ${file}:`, error);
        return false;
    }
};

// File upload config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'beat') {
            cb(null, path.join(__dirname, 'uploads/beats/'));
        } else if (file.fieldname === 'vocal') {
            cb(null, path.join(__dirname, 'uploads/vocals/'));
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Auth middleware
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// ==================== USER ROUTES ====================

app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, displayName, bio } = req.body;
        const users = readData('users.json');
        
        if (users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        
        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: uuidv4(),
            username,
            email,
            displayName: displayName || username,
            bio: bio || '',
            password: hashedPassword,
            createdAt: new Date().toISOString(),
            points: 0,
            uploadedBeats: [],
            recordings: [],
            followers: [],
            following: [],
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff`
        };
        
        users.push(newUser);
        writeData('users.json', users);
        
        const token = jwt.sign({
            id: newUser.id,
            username: newUser.username,
            displayName: newUser.displayName
        }, SECRET_KEY);
        
        const { password: _, ...userWithoutPassword } = newUser;
        res.json({ token, user: userWithoutPassword });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = readData('users.json');
        const user = users.find(u => u.email === email);
        
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({
            id: user.id,
            username: user.username,
            displayName: user.displayName
        }, SECRET_KEY);
        
        const { password: _, ...userWithoutPassword } = user;
        res.json({ token, user: userWithoutPassword });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/users/:username', (req, res) => {
    try {
        const users = readData('users.json');
        const beats = readData('beats.json');
        const user = users.find(u => u.username === req.params.username);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userBeats = beats.filter(b => b.producerId === user.id);
        const userRecordings = beats.flatMap(b =>
            b.versions.filter(v => v.vocalistId === user.id)
        );
        
        const { password, ...userWithoutPassword } = user;
        res.json({
            ...userWithoutPassword,
            uploadedBeatsCount: userBeats.length,
            recordingsCount: userRecordings.length,
            uploadedBeats: userBeats,
            recordings: userRecordings
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:userId', authenticate, async (req, res) => {
    try {
        if (req.user.id !== req.params.userId) {
            return res.status(403).json({ error: 'Can only delete your own account' });
        }
        
        let users = readData('users.json');
        const beats = readData('beats.json');
        const userIndex = users.findIndex(u => u.id === req.params.userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = users[userIndex];
        
        // Delete all beats uploaded by user
        const userBeats = beats.filter(b => b.producerId === user.id);
        for (const beat of userBeats) {
            const beatPath = path.join(__dirname, beat.fileUrl);
            if (fs.existsSync(beatPath)) {
                fs.unlinkSync(beatPath);
            }
            for (const version of beat.versions) {
                const vocalPath = path.join(__dirname, version.fileUrl);
                if (fs.existsSync(vocalPath)) {
                    fs.unlinkSync(vocalPath);
                }
            }
        }
        
        // Delete all recordings by user
        const userRecordings = beats.flatMap(b => b.versions.filter(v => v.vocalistId === user.id));
        for (const recording of userRecordings) {
            const recordingPath = path.join(__dirname, recording.fileUrl);
            if (fs.existsSync(recordingPath)) {
                fs.unlinkSync(recordingPath);
            }
        }
        
        // Remove user from all follows
        for (const u of users) {
            if (u.followers) u.followers = u.followers.filter(id => id !== user.id);
            if (u.following) u.following = u.following.filter(id => id !== user.id);
        }
        
        // Remove all votes by user
        let votes = readData('votes.json');
        votes = votes.filter(v => v.userId !== user.id);
        writeData('votes.json', votes);
        
        // Filter out user's beats
        let updatedBeats = beats.filter(b => b.producerId !== user.id);
        updatedBeats = updatedBeats.map(beat => {
            beat.versions = beat.versions.filter(v => v.vocalistId !== user.id);
            return beat;
        });
        writeData('beats.json', updatedBeats);
        
        users.splice(userIndex, 1);
        writeData('users.json', users);
        
        res.json({ message: 'Account and all content deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/search/users', (req, res) => {
    try {
        const { q } = req.query;
        const users = readData('users.json');
        
        if (!q || q.length < 2) {
            return res.json([]);
        }
        
        const results = users.filter(user =>
            user.username.toLowerCase().includes(q.toLowerCase()) ||
            (user.displayName && user.displayName.toLowerCase().includes(q.toLowerCase())) ||
            (user.bio && user.bio.toLowerCase().includes(q.toLowerCase()))
        ).map(user => ({
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: user.avatar,
            bio: user.bio,
            points: user.points
        }));
        
        res.json(results.slice(0, 20));
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users/:id/follow', authenticate, (req, res) => {
    try {
        const users = readData('users.json');
        const targetId = req.params.id;
        const userId = req.user.id;
        
        if (targetId === userId) {
            return res.status(400).json({ error: 'Cannot follow yourself' });
        }
        
        const user = users.find(u => u.id === userId);
        const targetUser = users.find(u => u.id === targetId);
        
        if (!user || !targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (!user.following) user.following = [];
        if (!targetUser.followers) targetUser.followers = [];
        
        if (user.following.includes(targetId)) {
            return res.status(400).json({ error: 'Already following' });
        }
        
        user.following.push(targetId);
        targetUser.followers.push(userId);
        
        writeData('users.json', users);
        
        res.json({ message: 'Followed successfully' });
    } catch (error) {
        console.error('Follow error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== BEAT ROUTES ====================

app.post('/api/beats', authenticate, upload.single('beat'), async (req, res) => {
    try {
        const users = readData('users.json');
        const user = users.find(u => u.id === req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const { title, genre, bpm, description, tags } = req.body;
        const beats = readData('beats.json');
        
        const newBeat = {
            id: uuidv4(),
            title,
            genre: genre || 'Other',
            bpm: parseInt(bpm) || 120,
            description: description || '',
            tags: tags ? tags.split(',').map(t => t.trim()) : [],
            producerId: req.user.id,
            producerName: user.displayName || user.username,
            producerUsername: user.username,
            fileUrl: `/uploads/beats/${req.file.filename}`,
            filename: req.file.filename,
            size: req.file.size,
            createdAt: new Date().toISOString(),
            plays: 0,
            downloads: 0,
            versions: []
        };
        
        beats.push(newBeat);
        writeData('beats.json', beats);
        
        if (!user.uploadedBeats) user.uploadedBeats = [];
        user.uploadedBeats.push(newBeat.id);
        writeData('users.json', users);
        
        res.json(newBeat);
    } catch (error) {
        console.error('Upload beat error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/beats/:beatId', authenticate, (req, res) => {
    try {
        let beats = readData('beats.json');
        const beatIndex = beats.findIndex(b => b.id === req.params.beatId);
        
        if (beatIndex === -1) {
            return res.status(404).json({ error: 'Beat not found' });
        }
        
        const beat = beats[beatIndex];
        
        if (beat.producerId !== req.user.id) {
            return res.status(403).json({ error: 'Can only delete your own beats' });
        }
        
        const beatPath = path.join(__dirname, beat.fileUrl);
        if (fs.existsSync(beatPath)) {
            fs.unlinkSync(beatPath);
        }
        
        for (const version of beat.versions) {
            const vocalPath = path.join(__dirname, version.fileUrl);
            if (fs.existsSync(vocalPath)) {
                fs.unlinkSync(vocalPath);
            }
        }
        
        let users = readData('users.json');
        const user = users.find(u => u.id === req.user.id);
        if (user && user.uploadedBeats) {
            user.uploadedBeats = user.uploadedBeats.filter(id => id !== beat.id);
            writeData('users.json', users);
        }
        
        let votes = readData('votes.json');
        const recordingIds = beat.versions.map(v => v.id);
        votes = votes.filter(v => !recordingIds.includes(v.recordingId));
        writeData('votes.json', votes);
        
        beats.splice(beatIndex, 1);
        writeData('beats.json', beats);
        
        res.json({ message: 'Beat deleted successfully' });
    } catch (error) {
        console.error('Delete beat error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/beats/:id/download', authenticate, (req, res) => {
    try {
        const beats = readData('beats.json');
        const beat = beats.find(b => b.id === req.params.id);
        
        if (!beat) {
            return res.status(404).json({ error: 'Beat not found' });
        }
        
        beat.downloads = (beat.downloads || 0) + 1;
        writeData('beats.json', beats);
        
        const filePath = path.join(__dirname, beat.fileUrl);
        res.download(filePath, `${beat.title}.mp3`);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/beats', (req, res) => {
    try {
        let beats = readData('beats.json');
        const { sort, genre, search, user } = req.query;
        
        if (search) {
            const searchTerm = search.toLowerCase();
            beats = beats.filter(b =>
                (b.title && b.title.toLowerCase().includes(searchTerm)) ||
                (b.description && b.description.toLowerCase().includes(searchTerm)) ||
                (b.tags && b.tags.some(tag => tag.toLowerCase().includes(searchTerm))) ||
                (b.producerName && b.producerName.toLowerCase().includes(searchTerm))
            );
        }
        
        if (user) {
            beats = beats.filter(b => b.producerUsername === user);
        }
        
        if (genre && genre !== 'all') {
            beats = beats.filter(b => b.genre === genre);
        }
        
        if (sort === 'popular') {
            beats.sort((a, b) => ((b.plays || 0) + (b.downloads || 0)) - ((a.plays || 0) + (a.downloads || 0)));
        } else if (sort === 'most-downloaded') {
            beats.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        } else {
            beats.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        
        res.json(beats);
    } catch (error) {
        console.error('Get beats error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/beats/:id', (req, res) => {
    try {
        const beats = readData('beats.json');
        const beat = beats.find(b => b.id === req.params.id);
        
        if (!beat) {
            return res.status(404).json({ error: 'Beat not found' });
        }
        
        beat.plays = (beat.plays || 0) + 1;
        writeData('beats.json', beats);
        
        const users = readData('users.json');
        const versionsWithUserInfo = (beat.versions || []).map(version => {
            const user = users.find(u => u.id === version.vocalistId);
            return {
                ...version,
                vocalistName: user?.displayName || user?.username || 'Unknown',
                vocalistUsername: user?.username,
                vocalistAvatar: user?.avatar
            };
        });
        
        res.json({ ...beat, versions: versionsWithUserInfo });
    } catch (error) {
        console.error('Get beat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== RECORDING ROUTES ====================

app.post('/api/beats/:beatId/record', authenticate, upload.single('vocal'), async (req, res) => {
    try {
        const beats = readData('beats.json');
        const users = readData('users.json');
        const beatIndex = beats.findIndex(b => b.id === req.params.beatId);
        
        if (beatIndex === -1) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Beat not found' });
        }
        
        const user = users.find(u => u.id === req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const { title, description, tags } = req.body;
        const beat = beats[beatIndex];
        
        if (!beat.versions) beat.versions = [];
        
        const newVersion = {
            id: uuidv4(),
            beatId: req.params.beatId,
            beatTitle: beat.title,
            vocalistId: req.user.id,
            vocalistName: user.displayName || user.username,
            vocalistUsername: user.username,
            title: title || `${user.displayName || user.username}'s version`,
            description: description || '',
            tags: tags ? tags.split(',').map(t => t.trim()) : [],
            fileUrl: `/uploads/vocals/${req.file.filename}`,
            filename: req.file.filename,
            duration: req.body.duration || 0,
            createdAt: new Date().toISOString(),
            votes: [],
            rating: 0,
            plays: 0
        };
        
        beat.versions.push(newVersion);
        beats[beatIndex] = beat;
        writeData('beats.json', beats);
        
        if (!user.recordings) user.recordings = [];
        user.recordings.push(newVersion.id);
        writeData('users.json', users);
        
        res.json(newVersion);
    } catch (error) {
        console.error('Upload recording error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/recordings/:recordingId', authenticate, (req, res) => {
    try {
        let beats = readData('beats.json');
        let recordingFound = false;
        
        for (let i = 0; i < beats.length; i++) {
            const beat = beats[i];
            const versionIndex = beat.versions.findIndex(v => v.id === req.params.recordingId);
            
            if (versionIndex !== -1) {
                const recording = beat.versions[versionIndex];
                
                if (recording.vocalistId !== req.user.id) {
                    return res.status(403).json({ error: 'Can only delete your own recordings' });
                }
                
                const recordingPath = path.join(__dirname, recording.fileUrl);
                if (fs.existsSync(recordingPath)) {
                    fs.unlinkSync(recordingPath);
                }
                
                beat.versions.splice(versionIndex, 1);
                
                let users = readData('users.json');
                const user = users.find(u => u.id === req.user.id);
                if (user && user.recordings) {
                    user.recordings = user.recordings.filter(id => id !== recording.id);
                    writeData('users.json', users);
                }
                
                let votes = readData('votes.json');
                votes = votes.filter(v => v.recordingId !== recording.id);
                writeData('votes.json', votes);
                
                writeData('beats.json', beats);
                recordingFound = true;
                break;
            }
        }
        
        if (!recordingFound) {
            return res.status(404).json({ error: 'Recording not found' });
        }
        
        res.json({ message: 'Recording deleted successfully' });
    } catch (error) {
        console.error('Delete recording error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/recordings/:id', (req, res) => {
    try {
        const beats = readData('beats.json');
        let recording = null;
        
        for (const beat of beats) {
            const found = (beat.versions || []).find(v => v.id === req.params.id);
            if (found) {
                recording = found;
                break;
            }
        }
        
        if (!recording) {
            return res.status(404).json({ error: 'Recording not found' });
        }
        
        recording.plays = (recording.plays || 0) + 1;
        writeData('beats.json', beats);
        
        res.json(recording);
    } catch (error) {
        console.error('Get recording error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/vote', authenticate, async (req, res) => {
    try {
        const { recordingId, rating } = req.body;
        let votes = readData('votes.json');
        
        const existingVote = votes.find(v => v.userId === req.user.id && v.recordingId === recordingId);
        if (existingVote) {
            return res.status(400).json({ error: 'Already voted' });
        }
        
        votes.push({
            id: uuidv4(),
            userId: req.user.id,
            recordingId,
            rating,
            createdAt: new Date().toISOString()
        });
        writeData('votes.json', votes);
        
        const beats = readData('beats.json');
        let recording = null;
        
        for (const beat of beats) {
            const version = (beat.versions || []).find(v => v.id === recordingId);
            if (version) {
                recording = version;
                break;
            }
        }
        
        if (!recording) {
            return res.status(404).json({ error: 'Recording not found' });
        }
        
        const recordingVotes = votes.filter(v => v.recordingId === recordingId);
        recording.rating = recordingVotes.reduce((sum, v) => sum + v.rating, 0) / recordingVotes.length;
        recording.votes = recordingVotes;
        
        writeData('beats.json', beats);
        
        const users = readData('users.json');
        const vocalist = users.find(u => u.id === recording.vocalistId);
        if (vocalist) {
            vocalist.points = Math.floor(recording.rating * 10) + (recordingVotes.length * 5);
            writeData('users.json', users);
        }
        
        res.json({ message: 'Voted successfully', rating: recording.rating });
    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== SOCIAL & DISCOVERY ====================

app.get('/api/feed', authenticate, (req, res) => {
    try {
        const users = readData('users.json');
        const beats = readData('beats.json');
        const currentUser = users.find(u => u.id === req.user.id);
        
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const followingIds = currentUser.following || [];
        
        const feedItems = [];
        
        beats.forEach(beat => {
            if (followingIds.includes(beat.producerId)) {
                feedItems.push({
                    type: 'beat',
                    ...beat,
                    timestamp: beat.createdAt
                });
            }
            
            (beat.versions || []).forEach(version => {
                if (followingIds.includes(version.vocalistId)) {
                    feedItems.push({
                        type: 'recording',
                        beat: { id: beat.id, title: beat.title },
                        ...version,
                        timestamp: version.createdAt
                    });
                }
            });
        });
        
        feedItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json(feedItems.slice(0, 50));
    } catch (error) {
        console.error('Feed error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/trending', (req, res) => {
    try {
        const beats = readData('beats.json');
        
        const trending = beats.flatMap(beat => {
            const items = [];
            
            const popularity = (beat.plays || 0) + (beat.downloads || 0);
            if (popularity > 5) {
                items.push({
                    type: 'beat',
                    ...beat,
                    popularity: popularity
                });
            }
            
            (beat.versions || []).forEach(version => {
                if ((version.votes?.length || 0) > 2 && (version.rating || 0) > 3) {
                    items.push({
                        type: 'recording',
                        beat: { id: beat.id, title: beat.title, producerName: beat.producerName },
                        ...version,
                        popularity: version.votes?.length || 0
                    });
                }
            });
            
            return items;
        });
        
        trending.sort((a, b) => b.popularity - a.popularity);
        res.json(trending.slice(0, 30));
    } catch (error) {
        console.error('Trending error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/leaderboard/top-users', (req, res) => {
    try {
        const users = readData('users.json');
        const topUsers = users
            .sort((a, b) => (b.points || 0) - (a.points || 0))
            .slice(0, 20)
            .map(user => ({
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatar: user.avatar,
                points: user.points || 0,
                uploadedBeats: (user.uploadedBeats || []).length,
                recordings: (user.recordings || []).length,
                followers: (user.followers || []).length,
                bio: user.bio || ''
            }));
        
        res.json(topUsers);
    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message || 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`\n🎵 8-Track DAW Studio running on http://localhost:${PORT}`);
    console.log(`📁 Uploads: ${path.join(__dirname, 'uploads')}`);
    console.log(`💾 Data: ${path.join(__dirname, 'data')}`);
    console.log(`🌐 CORS enabled for all origins`);
    console.log('\n✨ Ready for Render deployment!\n');
});