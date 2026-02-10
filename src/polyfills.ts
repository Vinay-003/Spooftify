/**
 * Hermes runtime polyfills for web APIs required by youtubei.js.
 *
 * MUST be imported at the very top of index.ts — before any other import
 * that could transitively pull in youtubei.js.
 */

// ── EventTarget / Event / CustomEvent ────────────────────────────────────────
// Hermes does not expose these as globals. youtubei.js extends EventTarget
// in its EventEmitterLike class and uses CustomEvent in its emit() method.

if (typeof globalThis.EventTarget === 'undefined') {
  type Listener = EventListenerOrEventListenerObject;

  class Slot {
    capture: Listener[] = [];
    bubble: Listener[] = [];
  }

  class EventTargetPolyfill implements EventTarget {
    private __listeners: Map<string, Slot> = new Map();

    addEventListener(
      type: string,
      callback: Listener | null,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (!callback) return;
      const capture =
        typeof options === 'boolean' ? options : !!options?.capture;
      let slot = this.__listeners.get(type);
      if (!slot) {
        slot = new Slot();
        this.__listeners.set(type, slot);
      }
      const list = capture ? slot.capture : slot.bubble;
      if (!list.includes(callback)) list.push(callback);
    }

    removeEventListener(
      type: string,
      callback: Listener | null,
      options?: boolean | EventListenerOptions,
    ): void {
      if (!callback) return;
      const capture =
        typeof options === 'boolean' ? options : !!options?.capture;
      const slot = this.__listeners.get(type);
      if (!slot) return;
      const list = capture ? slot.capture : slot.bubble;
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    }

    dispatchEvent(event: Event): boolean {
      const slot = this.__listeners.get(event.type);
      if (!slot) return true;

      const invoke = (listener: Listener) => {
        if (typeof listener === 'function') {
          listener.call(this, event);
        } else {
          listener.handleEvent(event);
        }
      };

      for (const l of [...slot.capture]) invoke(l);
      for (const l of [...slot.bubble]) invoke(l);
      return !(event as any)._defaultPrevented;
    }
  }

  (globalThis as any).EventTarget = EventTargetPolyfill;
}

if (typeof globalThis.Event === 'undefined') {
  class EventPolyfill {
    readonly type: string;
    readonly bubbles: boolean;
    readonly cancelable: boolean;
    readonly composed: boolean;
    readonly timeStamp: number;
    _defaultPrevented = false;

    get defaultPrevented() {
      return this._defaultPrevented;
    }

    constructor(type: string, init?: EventInit) {
      this.type = type;
      this.bubbles = init?.bubbles ?? false;
      this.cancelable = init?.cancelable ?? false;
      this.composed = init?.composed ?? false;
      this.timeStamp = Date.now();
    }

    preventDefault() {
      if (this.cancelable) this._defaultPrevented = true;
    }
    stopPropagation() {}
    stopImmediatePropagation() {}
  }

  (globalThis as any).Event = EventPolyfill;
}

if (typeof globalThis.CustomEvent === 'undefined') {
  class CustomEventPolyfill<T = any> extends (globalThis as any).Event {
    readonly detail: T;

    constructor(type: string, init?: CustomEventInit<T>) {
      super(type, init);
      this.detail = init?.detail as T;
    }
  }

  (globalThis as any).CustomEvent = CustomEventPolyfill;
}

// ── ReadableStream ───────────────────────────────────────────────────────────
// youtubei.js references globalThis.ReadableStream in its platform shim.
// Hermes may not have it. If missing, install a minimal stub so the module
// loads — actual streaming is not used by our audio playback path.

if (typeof globalThis.ReadableStream === 'undefined') {
  // web-streams-polyfill could be used here for a full implementation,
  // but for now a no-op class is sufficient since we only use
  // getBasicInfo() which returns JSON, not streams.
  (globalThis as any).ReadableStream = class ReadableStream {
    constructor() {}
    getReader() {
      return {
        read: async () => ({ done: true, value: undefined }),
        releaseLock: () => {},
        cancel: async () => {},
        closed: Promise.resolve(),
      };
    }
    pipeThrough() {
      return this;
    }
    pipeTo() {
      return Promise.resolve();
    }
    cancel() {
      return Promise.resolve();
    }
    tee(): [any, any] {
      return [this, this];
    }
  };
}

// ── globalThis.mmkvStorage ──────────────────────────────────────────────────
// youtubei.js's RN platform shim expects `globalThis.mmkvStorage` to be
// a class constructor: `new globalThis.mmkvStorage({ id: '...' })`.
// react-native-mmkv v4 exports `createMMKV()` instead of a class.
// We bridge the gap here.

if (typeof (globalThis as any).mmkvStorage === 'undefined') {
  try {
    const { createMMKV } = require('react-native-mmkv');
    (globalThis as any).mmkvStorage = class MMKVStorageBridge {
      private _store: any;
      constructor(config: { id: string }) {
        this._store = createMMKV(config);
      }
      set(key: string, value: any) {
        this._store.set(key, value);
      }
      getString(key: string) {
        return this._store.getString(key);
      }
      getBuffer(key: string) {
        // react-native-mmkv v4 uses getBuffer or getArrayBuffer
        if (typeof this._store.getBuffer === 'function') {
          return this._store.getBuffer(key);
        }
        // Fallback: try to read as string and convert
        const str = this._store.getString(key);
        if (str) {
          const encoder = new TextEncoder();
          return encoder.encode(str);
        }
        return undefined;
      }
      delete(key: string) {
        this._store.delete(key);
      }
    };
  } catch {
    // MMKV not available — provide a no-op in-memory fallback
    (globalThis as any).mmkvStorage = class MMKVMemoryFallback {
      private _map = new Map<string, any>();
      constructor(_config?: any) {}
      set(key: string, value: any) {
        this._map.set(key, value);
      }
      getString(key: string) {
        return this._map.get(key);
      }
      getBuffer(key: string) {
        return this._map.get(key);
      }
      delete(key: string) {
        this._map.delete(key);
      }
    };
  }
}

export {};
