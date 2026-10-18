import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Import Routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import vehicleRoutes from './routes/vehicle.routes.js';
import rideRoutes from './routes/ride.routes.js';

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/vehicles', vehicleRoutes);
app.use('/api/v1/rides', rideRoutes);

// System Health Check
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      service: 'campus-carpool-backend',
      timestamp: new Date().toISOString()
    }
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url} does not exist.` }
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Something went wrong.' }
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Campus Carpool API running on http://localhost:${PORT}`);
});

export { app, io };
