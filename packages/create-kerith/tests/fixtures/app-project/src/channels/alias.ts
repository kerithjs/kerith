import { Client } from '@kerith/identifiers';

// Registers a named client instance as a resolvable alias @client/Database
Client('Database', () => ({ connected: true }));
