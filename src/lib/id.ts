const RADIX = 36

/** Id corto, único y ordenable por tiempo. No necesita ser criptográfico. */
export function createId(): string {
  const time = Date.now().toString(RADIX)
  const rand = Math.random().toString(RADIX).slice(2, 8)
  return `${time}${rand}`
}
