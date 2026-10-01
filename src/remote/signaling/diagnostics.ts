// ============================================================
// 远程对局：建连诊断
//   - 输出每个信令后端的尝试结果与耗时，便于区分「中继不可达」与「ICE 打洞失败」
//   - 纯观测用途，不参与任何业务逻辑
// ============================================================

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** 记录一次信令尝试结果并输出到控制台 */
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
