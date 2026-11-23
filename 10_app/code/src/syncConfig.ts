// The address of Horizon's account server (40_sync_server), set when it is deployed; a build can override it with
// VITE_SYNC_URL (the local checks point it at a server on this machine).
export const SYNC_URL: string = import.meta.env.VITE_SYNC_URL ?? 'https://horizon-sync.horizon-sync.workers.dev';
