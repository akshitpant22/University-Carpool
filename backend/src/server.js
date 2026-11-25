import express from 'express';
import http from 'http';
import { initializeSocket } from './config/socket.js';
import cors from 'cors';
import helmet from 'helmet';
import { supabaseAdmin } from './config/supabase.js';
import dotenv from 'dotenv';

// Import Routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import vehicleRoutes from './routes/vehicle.routes.js';
import rideRoutes from './routes/ride.routes.js';
import requestRoutes from './routes/request.routes.js';
import notificationRoutes from './routes/notification.routes.js';

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
const io = initializeSocket(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST']
  }
});

// Authenticate every Socket.IO connection using the Supabase access token.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication required.'));
    }

    const {
      data: { user },
      error
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return next(new Error('Invalid or expired token.'));
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (profileError || !profile) {
      return next(new Error('User profile not found.'));
    }

    // Identity comes from the verified token, never from client-supplied IDs.
    socket.data.userId = user.id;
    next();
  } catch (error) {
    console.error('[Socket.IO Authentication]', error);
    next(new Error('Socket authentication failed.'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.userId;

  // Every authenticated user automatically joins their own notification room.
  socket.join(`user_${userId}`);

  console.log(`[Socket.IO] Authenticated user joined: ${userId}`);

  // Only the driver or an accepted rider can join a ride room.
  socket.on('join_ride_room', async (rideId) => {
    try {
      if (typeof rideId !== 'string') return;

      const { data: ride, error: rideError } = await supabaseAdmin
        .from('rides')
        .select('id, driver_id, status')
        .eq('id', rideId)
        .is('deleted_at', null)
        .maybeSingle();

      if (rideError || !ride) {
        socket.emit('room_error', { message: 'Ride not found.' });
        return;
      }

      if (!['posted', 'departed'].includes(ride.status)) {
        socket.emit('room_error', {
          message: 'This ride is no longer available for coordination.'
        });
        return;
      }

      let isParticipant = ride.driver_id === userId;

      if (!isParticipant) {
        const { data: acceptedRequest, error: requestError } =
          await supabaseAdmin
            .from('ride_requests')
            .select('id')
            .eq('ride_id', rideId)
            .eq('rider_id', userId)
            .eq('status', 'accepted')
            .is('deleted_at', null)
            .maybeSingle();

        if (requestError) throw requestError;

        isParticipant = Boolean(acceptedRequest);
      }

      if (!isParticipant) {
        socket.emit('room_error', {
          message: 'You are not a participant in this ride.'
        });
        return;
      }

      await socket.join(`ride_${rideId}`);
      socket.emit('ride_room_joined', { rideId });

      console.log(`[Socket.IO] ${userId} joined ride_${rideId}`);
    } catch (error) {
      console.error('[Socket.IO] Ride room error:', error);
      socket.emit('room_error', {
        message: 'Unable to join this ride room.'
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] User disconnected: ${userId}`);
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/vehicles', vehicleRoutes);
app.use('/api/v1/rides', rideRoutes);
app.use('/api/v1/requests', requestRoutes);
app.use('/api/v1/notifications', notificationRoutes);

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
