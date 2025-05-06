import { Deferred } from "./deferred.js";

export class Lock {
    #pending: Deferred[];
    #locked: boolean = false;

    constructor() {
        this.#pending = [];
    }

    get locked(): boolean {
        return this.#locked;
    }

    async acquire(): Promise<boolean> {
        if (this.#pending.length === 0 && !this.#locked) {
            this.#locked = true;

            return true;
        }

        const task: Deferred = new Deferred();

        this.#pending.push(task);

        await task;

        this.#locked = true;

        return true;
    }

    release(): void {
        if (!this.#locked) {
            throw new Error("Lock is not acquired.");
        }

        this.#locked = false;
        this.#queueNext();
    }

    #queueNext(): void {
        const task: Deferred | undefined = this.#pending.shift();

        if (task === undefined) {
            return;
        }

        task.resolve();
    }
}

export class RWLock {
    #writeLock: Lock;
    #readCount: number;

    constructor() {
        this.#writeLock = new Lock();
        this.#readCount = 0;
    }

    async readAcquire(): Promise<boolean> {
        this.#readCount++;

        if (this.#readCount === 1) {
            await this.#writeLock.acquire();
        }

        return true;
    }

    readRelease(): void {
        if (this.#readCount <= 0) {
            throw new Error("Lock is not acquired.");
        }

        this.#readCount--;

        if (this.#readCount === 0) {
            this.#writeLock.release();
        }
    }

    async writeAcquire(): Promise<boolean> {
        return await this.#writeLock.acquire();
    }

    writeRelease(): void {
        this.#writeLock.release();
    }

    get locked(): boolean {
        return this.#writeLock.locked;
    }
}

export class Event {
    #value: boolean = false;
    #pending: Deferred[];

    constructor() {
        this.#pending = [];
    }

    get is_set(): boolean {
        return this.#value;
    }

    clear(): void {
        this.#value = false;
    }

    set(): void {
        if (this.#value) {
            return;
        }

        this.#value = true;
        
        for (const task of this.#pending) {
            task.resolve();
        }

        this.#pending = [];
    }

    async wait(): Promise<void> {
        if (this.#value) {
            return;
        }

        const task = new Deferred();

        this.#pending.push(task);

        await task;
    }
}

export class Semaphore {
    _value: number;
    #pending: Set<Deferred>;

    constructor(value?: number | undefined | null) {
        value ??= 1;

        this._value = value;
        this.#pending = new Set<Deferred>();
    }

    get locked(): boolean {
        return this._value === 0;
    }

    async acquire(): Promise<void> {
        if (!this.locked) {
            this._value -= 1;

            return;
        }

        const task = new Deferred();

        this.#pending.add(task);

        await task;

        this.#pending.delete(task);

        while (this._value > 0) {
            if (!this.#queueNext()) {
                break;
            }
        }
    }

    release(): void {
        this._value += 1;

        this.#queueNext();
    }

    #queueNext(): boolean {
        for (const task of this.#pending) {
            this._value -= 1;

            task.resolve()

            return true;
        }

        return false;
    }
}

export class BoundedSemaphore extends Semaphore {
    #boundValue: number;

    constructor(value: number = 1) {
        super(value);

        this.#boundValue = value;
    }

    release(): void {
        if (this._value >= this.#boundValue) {
            throw new Error("BoundedSemaphore released too many times");
        }

        super.release();
    }
}

export function sleep(timeMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (signal && signal.aborted) {
            reject(signal.reason);

            return;
        }

        let completed = false;
        const timerId = setTimeout(() => {
            resolve();

            completed = true;
        }, timeMs);

        if (signal) {
            signal.addEventListener("abort", () => {
                if (completed) {
                    return;
                }

                clearTimeout(timerId);
                reject(signal.reason);
            });
        }
    });
}
