import * as readline from 'node:readline'
import { UciEngine } from './engine'

const engine = new UciEngine({
  write: (line) => {
    process.stdout.write(`${line}\n`)
  },
})

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
      process.stderr.write(`uci adapter error: ${String(err)}\n`)
    })
})

rl.on('close', () => {
  if (!quitting) process.exit(0)
})
