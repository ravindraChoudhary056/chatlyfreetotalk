const express = require('express');
const http = require('http'); // Required for Socket.io
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');
require('dotenv').config();

const app = express();
const server = http.createServer(app); // Create HTTP server
const io = new Server(server, {
    cors: {
        origin: "*", // Adjust this to your frontend URL in production
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// Database Connection
connectDB(process.env.MONGO_URL);

// Socket.io Connection Logic
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a private room based on User ID
    socket.on('join', (userId) => {
        const userIdStr = String(userId);
        socket.join(userIdStr);
        console.log(`✅ User ${userIdStr} joined their private room`);
        console.log(`📋 Socket ${socket.id} is now in rooms:`, Array.from(socket.rooms));
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Make "io" accessible in our routes
app.set('socketio', io);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/messages', require('./routes/messages'));

const PORT = process.env.PORT || 5003;
server.listen(PORT, () => console.log(`Real-time server running on port ${PORT}`));