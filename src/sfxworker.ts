// The sound worker: makes the sound effects away from the page (see sfx.ts) and sends them back.
import { normalized } from './sfxgen'
self.onmessage = (e: MessageEvent) => {
	const name = String(e.data)
	const s = normalized(name)
	;(self as unknown as Worker).postMessage({ name, s }, [s.buffer])
}
