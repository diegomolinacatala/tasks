/** Anchos de las líneas: variados, como títulos de verdad. */
const WIDTHS = ['46%', '68%', '38%', '57%', '30%', '62%']

/** Silueta de una vista mientras llega su código: cabecera y filas que laten. */
export function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Cargando">
      <i className="skeleton__bar skeleton__bar--kicker" />
      <i className="skeleton__bar skeleton__bar--title" />
      {WIDTHS.map((width) => (
        <div key={width} className="skeleton__row">
          <i className="skeleton__bar skeleton__dot" />
          <i className="skeleton__bar" style={{ width }} />
        </div>
      ))}
    </div>
  )
}
