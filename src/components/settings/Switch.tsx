interface SwitchProps {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}

/** Interruptor como el de iOS, en coñac: encendido, la bola se va a la derecha con un pequeño rebote. */
export function Switch({ checked, label, onChange }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="switch__knob" aria-hidden="true" />
    </button>
  )
}
