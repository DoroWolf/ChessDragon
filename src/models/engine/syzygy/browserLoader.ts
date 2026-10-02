// Syzygy 残局库 - 浏览器端文件加载器（Vite 资源 URL）
// 只有真正需要某张表时才会请求对应文件，避免一次性下载数百 MB
import type { TableLoader } from './store'

// 构建期收集 src/data/endgame 下的全部表文件 URL（惰性：调用时才 import）
const wdlModules = import.meta.glob('/src/data/endgame/*.rtbw', {
  query: '?url',
  import: 'default',
}) as Record<string, () => Promise<string>>

const dtzModules = import.meta.glob('/src/data/endgame/*.rtbz', {
  query: '?url',
  import: 'default',
}) as Record<string, () => Promise<string>>

export const browserTableLoader: TableLoader = async (fileName) => {
  const path = `/src/data/endgame/${fileName}`
  const load = fileName.endsWith('.rtbz') ? dtzModules[path] : wdlModules[path]
  if (!load) return null

  try {
    const url = await load()
    const response = await fetch(url)
    if (!response.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    return null
  }
}
