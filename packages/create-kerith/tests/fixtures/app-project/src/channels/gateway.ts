import { Gateway } from '@kerith/identifiers';

// Registers a Gateway for real-time communication.
Gateway('chat', (socket) => {
  console.log('New connection');
}, { namespace: '/chat' });
