'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Keep the server and hydration render identical before reading browser storage. */
export function useClientReady() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
