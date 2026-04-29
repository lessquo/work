import { EventEmitter } from 'node:events';

const emitters = new Map<number, EventEmitter>();
const abortControllers = new Map<number, AbortController>();

export function getSessionEmitter(sessionId: number): EventEmitter {
  let em = emitters.get(sessionId);
  if (!em) {
    em = new EventEmitter();
    em.setMaxListeners(20);
    emitters.set(sessionId, em);
  }
  return em;
}

export function emitSessionLog(sessionId: number, chunk: string): void {
  getSessionEmitter(sessionId).emit('log', chunk);
}

export function emitSessionEnd(sessionId: number): void {
  getSessionEmitter(sessionId).emit('end');
  emitters.delete(sessionId);
}

export function registerSessionAbort(sessionId: number, controller: AbortController): void {
  abortControllers.set(sessionId, controller);
}

export function unregisterSessionAbort(sessionId: number): void {
  abortControllers.delete(sessionId);
}

export function abortSession(sessionId: number): boolean {
  const c = abortControllers.get(sessionId);
  if (!c || c.signal.aborted) return false;
  c.abort();
  return true;
}
