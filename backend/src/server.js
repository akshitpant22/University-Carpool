import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Security & Parsing Middleware
app.use(helmet());
app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));
app.use(express.json());

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  // User personal room for instant notifications
  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`[Socket.IO] User ${userId} joined personal room`);
  });

  // Ride room for coordination chat & live GPS relay
  socket.on('join_ride_room', (rideId) => {
    socket.join(`ride_${rideId}`);
    console.log(`[Socket.IO] Joined ride room: ride_${rideId}`);
  });

  // Ephemeral live GPS relay
  socket.on('send_location', ({ rideId, coords }) => {
    socket.to(`ride_${rideId}`).emit('location_update', coords);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString()
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Campus Carpool API running on port ${PORT}`);
});

export { app, io };
