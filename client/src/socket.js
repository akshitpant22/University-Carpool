import { io } from 'socket.io-client';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling']
});

export const connectSocket = (accessToken) => {
  if (!accessToken) {
    socket.disconnect();
    return;
  }

  socket.auth = { token: accessToken };
  socket.connect();
};