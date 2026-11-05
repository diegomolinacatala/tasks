// La clave es la del buzón (`FEEDBACK_KEY`) y se guarda en el mismo sitio: quien ya entró en el buzón
// desde este navegador entra aquí sin volver a escribirla.
const STORAGE = 'tasks:buzon-key'

let key = null
try {
  key = localStorage.getItem(STORAGE)
} catch {
  key = null
}

export const hasKey = () => Boolean(key)

export function saveKey(value) {
  key = value
  try {
    localStorage.setItem(STORAGE, value)
  } catch {
    // Sin almacenamiento (modo privado), vale para esta visita.
  }
}

export function forgetKey() {
  key = null
  try {
    localStorage.removeItem(STORAGE)
  } catch {
    // Nada que borrar.
  }
}

export class AuthError extends Error {}

async function get(path) {
  const response = await fetch(path, { headers: { authorization: `Bearer ${key}` } })
  if (response.status === 401) {
    forgetKey()
    throw new AuthError('Clave incorrecta.')
  }
  if (response.status === 404) throw new AuthError('El panel no está activado en el servidor.')
  if (!response.ok) throw new Error(`El servidor respondió ${response.status}.`)
  return (await response.json()).data
}

const query = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, value]) => value !== null && value !== undefined && value !== ''))

export const fetchSummary = ({ from, to, version }) => get(`/v1/stats?${query({ from, to, version })}`)

export const fetchHeat = ({ from, to, version, screen }) => get(`/v1/stats/heat?${query({ from, to, version, screen })}`)
