import {
  soundCapture,
  soundCheck,
  soundDefeat,
  soundMove,
  soundVictory,
} from '../assets/resourcePaths'

const sounds = {
  move: new Audio(soundMove),
  capture: new Audio(soundCapture),
  check: new Audio(soundCheck),
  victory: new Audio(soundVictory),
  defeat: new Audio(soundDefeat),
}

export type TutorialSoundName = keyof typeof sounds

/** 播放教程音效；enabled 为 false 时静默 */
export function playTutorialSound(name: TutorialSoundName, enabled: boolean): void {
  if (!enabled) return
  const audio = sounds[name]
  audio.currentTime = 0
  audio.play().catch(() => {})
}
