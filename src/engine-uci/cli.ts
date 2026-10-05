import { writeSync } from 'node:fs'
import * as readline from 'node:readline'
import { UciEngine } from './engine'

const writeLine = (line: string): void => {
  try {
    writeSync(1, `${line}\n`)
  } catch {
    // 管道已关闭时忽略写入错误
  }
}

const engine = new UciEngine({ write: writeLine })

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

let queue: Promise<void> = Promise.resolve()
let quitting = false

rl.on('line', (line) => {
  queue = queue
    .then(async () => {
      if (quitting) return
      const shouldContinue = await engine.feed(line)
      if (!shouldContinue) {
        quitting = true
        rl.close()
        process.exit(0)
      }
    })
    .catch((err: unknown) => {
      try {
        writeSync(2, `uci adapter error: ${String(err)}\n`)
      } catch {
        // 忽略
      }
    })
})

rl.on('close', () => {
  if (!quitting) process.exit(0)
})
