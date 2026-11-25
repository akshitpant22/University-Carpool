import { Server } from 'socket.io';

let io;

export const initializeSocket = (server, options) => {
  io = new Server(server, options);
  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized');
  }
  return io;
};
