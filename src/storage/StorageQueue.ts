/** Serialize storage mutations; a rejected operation must not poison the queue. */
export class StorageQueue {
    private pending: Promise<unknown> = Promise.resolve();

    run<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.pending.then(operation);
        this.pending = result.catch(() => {});
        return result;
    }

    async drain(): Promise<void> {
        await this.pending;
    }
}
