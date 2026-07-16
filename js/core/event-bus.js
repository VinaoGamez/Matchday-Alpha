/** Pub/sub leve entre setores do jogo. */
export function createEventBus() {
  const listeners = new Map();

  const on = (event, handler) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => listeners.get(event)?.delete(handler);
  };

  const emit = (event, payload) => {
    listeners.get(event)?.forEach(handler => {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[event-bus] ${event}`, error);
      }
    });
  };

  return { on, emit };
}
