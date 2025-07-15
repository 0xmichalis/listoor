export async function withRateLimitRetry<T>(
    fn: () => Promise<T>,
    options?: {
        maxRetries?: number;
        baseDelayMs?: number;
        maxDelayMs?: number;
    }
): Promise<T> {
    const maxRetries = options?.maxRetries ?? 5;
    const baseDelayMs = options?.baseDelayMs ?? 1000;
    const maxDelayMs = options?.maxDelayMs ?? 30000;

    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (error: any) {
            if ('retryAfter' in error && attempt < maxRetries) {
                const retryAfter = Number(error.retryAfter) || 1;
                const delay = Math.min(baseDelayMs * 2 ** attempt * retryAfter, maxDelayMs);
                console.log(
                    `Rate limited. Retry after ${retryAfter} seconds (attempt ${attempt + 1}/${maxRetries}, waiting ${delay}ms)`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
                attempt++;
                continue;
            }
            throw error;
        }
    }
}
