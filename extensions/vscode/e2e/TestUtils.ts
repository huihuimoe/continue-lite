export class TestUtils {
  public static async waitForSuccess<T>(
    operation: () => Promise<T>,
    timeoutMs = 15_000,
    intervalMs = 100,
  ): Promise<T> {
    const startedAt = Date.now();
    let lastError: unknown;

    while (Date.now() - startedAt < timeoutMs) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        await TestUtils.waitForTimeout(intervalMs);
      }
    }

    if (lastError instanceof Error) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for success. Last error: ${lastError.message}`,
      );
    }

    throw new Error(`Timed out after ${timeoutMs}ms waiting for success.`);
  }

  public static async waitForTimeout(timeoutMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  }

  public static generateTestMessagePair(index: number): {
    userMessage: string;
    llmResponse: string;
  } {
    const normalizedIndex = Math.max(0, Math.floor(index));

    return {
      userMessage: `TEST_USER_MESSAGE_${normalizedIndex}`,
      llmResponse: `TEST_LLM_RESPONSE_${normalizedIndex}`,
    };
  }
}
