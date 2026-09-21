const DEFAULT_SPACING_MS = 4000;

/**
 * Cola escalonada de refresco: procesa un ID cada vez, con espaciado fijo
 * entre peticiones, nunca en paralelo. Soporta prioridad (refresco manual
 * va al frente sin saltarse el espaciado).
 */
export class StaggeredQueue {
  constructor({ spacingMs = DEFAULT_SPACING_MS, processItem } = {}) {
    if (typeof processItem !== 'function') {
      throw new Error('StaggeredQueue requiere processItem(id)');
    }
    this.spacingMs = spacingMs;
    this.processItem = processItem;
    this.items = [];
    this.running = false;
  }

  get size() {
    return this.items.length;
  }

  /** Añade un ID al final de la cola (si no está ya presente). */
  enqueue(id) {
    if (!this.items.includes(id)) {
      this.items.push(id);
    }
    this._start();
  }

  /** Añade un ID al frente de la cola (refresco manual prioritario). */
  enqueueFront(id) {
    this.items = this.items.filter((existing) => existing !== id);
    this.items.unshift(id);
    this._start();
  }

  enqueueAll(ids) {
    for (const id of ids) this.enqueue(id);
  }

  async _start() {
    if (this.running) return;
    this.running = true;
    try {
      // Cede el turno para que llamadas síncronas a enqueue/enqueueFront
      // hechas en la misma tarea (p. ej. una ráfaga de altas) terminen de
      // reordenar la cola antes de procesar el primer elemento.
      await Promise.resolve();
      while (this.items.length > 0) {
        const id = this.items.shift();
        await this.processItem(id);
        if (this.items.length > 0) {
          await this._wait(this.spacingMs);
        }
      }
    } finally {
      this.running = false;
    }
  }

  _wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
