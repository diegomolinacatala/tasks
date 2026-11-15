import { useMemo } from 'react'
import { encode } from 'uqr'

interface QrCodeProps {
  value: string
  label: string
  size?: number
}

/**
 * Un QR en tinta sobre papel claro también de noche: las cámaras leen mal uno invertido. Un solo trazo
 * con todos los módulos: nítido a cualquier tamaño.
 */
export function QrCode({ value, label, size = 220 }: QrCodeProps) {
  const { path, cells } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 })
    let d = ''
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`
      })
    })
    return { path: d, cells: qr.size }
  }, [value])

  return (
    <svg className="qr" role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${cells} ${cells}`} shapeRendering="crispEdges">
      <rect width={cells} height={cells} className="qr__paper" />
      <path d={path} className="qr__ink" />
    </svg>
  )
}
