/**
 * Where the engine's API lives. Empty = same origin (everything on one server).
 * On the Vercel site set NEXT_PUBLIC_ENGINE_URL=https://engine.treeterminal.fun
 * so the browser talks to the always-on engine directly.
 */
export const ENGINE = (process.env.NEXT_PUBLIC_ENGINE_URL || '').replace(/\/$/, '');
export const api = (path: string) => `${ENGINE}${path}`;
