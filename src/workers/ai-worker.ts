// AI Web Worker —— UCI 传输层适配
// 复用与环境无关的 UciEngine：主线程与 Worker 之间只交换 UCI 文本行，
// 从而保证浏览器对局与离线 Elo 标定走完全相同的引擎代码路径。
import { UciEngine } from '../engine-uci/engine'
import { setSyzygyLoader } from '../models/engine/syzygy/store'
import { browserTableLoader } from '../models/engine/syzygy/browserLoader'

// 注册残局库文件加载器（按需 fetch，不会在启动时下载）
setSyzygyLoader(browserTableLoader)

// 引擎输出（id / readyok / bestmove / info ...）逐行回传主线程
const engine = new UciEngine({
  write: (line) => {
    self.postMessage(line)
  },
})

self.addEventListener('error', (evt) => {
  console.error('Worker global error:', evt.message)
})

self.addEventListener('unhandledrejection', (evt) => {
  console.error('Worker unhandled rejection:', evt.reason)
})

// 串行化命令：搜索会阻塞本 Worker，用队列保证同一时刻只执行一条命令
let queue: Promise<void> = Promise.resolve()

self.onmessage = (e: MessageEvent<string>) => {
  const line = e.data
  if (typeof line !== 'string') return

  queue = queue
    .then(async () => {
      await engine.feed(line)
    })
    .catch((err: unknown) => {
      console.error('UCI worker error:', err)
      self.postMessage('info string worker error')
    })
}
