/** Lo que viaja en cada push: versión y contenido cifrado tal cual lo subió el móvil. */
export const pushData = (payload: string): string => JSON.stringify({ v: 1, p: payload })
