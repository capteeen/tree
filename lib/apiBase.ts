/**
 * Where the engine's API lives. Empty = same origin (everything on one server).
 * On the Vercel site set NEXT_PUBLIC_ENGINE_URL=https://engine.treeterminal.fun
 * so the browser talks to the always-on engine directly.
 */
// On Vercel the engine always lives on its own host, so default to it there.
const onVercel = !!process.env.NEXT_PUBLIC_VERCEL_ENV;
export const ENGINE = (process.env.NEXT_PUBLIC_ENGINE_URL || (onVercel ? 'https://engine.treeterminal.fun' : '')).replace(/\/$/, '');
export const api = (path: string) => `${ENGINE}${path}`;
