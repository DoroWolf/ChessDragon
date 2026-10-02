const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const reportSignalingAttempt = (
  provider: string,
  role: 'host' | 'guest',
  startedAt: number,
  error?: unknown,
): void => {
  const elapsedMs = Date.now() - startedAt
  if (error === undefined) {
    console.info(`[remote] ${role} 信令 ${provider} 成功：${elapsedMs}ms`)
    return
  }
  console.info(`[remote] ${role} 信令 ${provider} 失败：${elapsedMs}ms（${describeError(error)}）`)
}

/** 输出一句话汇总，便于用户一键复制上报 */
export const reportFailureSummary = (errors: unknown[]): void => {
  if (errors.length === 0) return
  console.error(`[remote] 所有信令均失败：${errors.map(describeError).join(' | ')}`)
}
