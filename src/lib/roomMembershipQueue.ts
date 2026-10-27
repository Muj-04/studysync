import { createSerialQueue } from './persistence/serialQueue';

// A stale join must finish its compensating leave before a new mount joins.
export const enqueueRoomMembership = createSerialQueue();
