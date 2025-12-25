import { logger } from './logger.js';

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
                logger.debug(
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

/**
 * Retries a function with exponential backoff on timeout or network errors
 * @param fn The function to retry
 * @param options Retry options
 * @returns The result of the function
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options?: {
        maxRetries?: number;
        baseDelayMs?: number;
        maxDelayMs?: number;
        retryableErrors?: string[];
    }
): Promise<T> {
    const maxRetries = options?.maxRetries ?? 5;
    const baseDelayMs = options?.baseDelayMs ?? 1000;
    const maxDelayMs = options?.maxDelayMs ?? 30000;
    const retryableErrors = options?.retryableErrors ?? [
        'TIMEOUT',
        'timeout',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
    ];

    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (error: any) {
            const errorMessage = error?.message || '';
            const errorCode = error?.code || '';
            const isRetryable =
                retryableErrors.some(
                    (retryableError) =>
                        errorMessage.toUpperCase().includes(retryableError.toUpperCase()) ||
                        errorCode.toUpperCase().includes(retryableError.toUpperCase())
                ) && attempt < maxRetries;

            if (isRetryable) {
                const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
                logger.debug(
                    `Error: ${errorMessage || errorCode}. Retrying (attempt ${attempt + 1}/${maxRetries}, waiting ${delay}ms)...`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
                attempt++;
                continue;
            }
            throw error;
        }
    }
}
