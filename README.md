# Tasks

To-do diaria para móvil. Instalable como app, funciona sin conexión y guarda los datos
solo en tu dispositivo.

**→ [diegomolinacatala.github.io/tasks](https://diegomolinacatala.github.io/tasks/)**

## Qué hace

- **Tareas**: una sola pantalla con lo atrasado (en rojo), lo de hoy con sus secciones, y
  lo que no tiene fecha.
- **Semana**: los siete días a la vista; arrastra una tarea de un día a otro.
- Escribe y pulsa Enter: la tarea nace **sin fecha**. El botón *Hoy* la manda al día de hoy.
- Escribe en lenguaje natural: *"llamar a Juan mañana a las 5"*, *"dentista el 15/10"*,
  *"sacar la ropa en 30 min"*. La fecha, la hora y el aviso se ponen solos.
- **Recordatorios**: tantos como quieras por tarea (a la hora, 15 min antes, mañana 9:00,
  otra hora…). Llegan como notificación aunque la app esté cerrada.
- **Dicta la tarea**: toca el micrófono y di *"llamar a Miguel hoy a las 17:00 y recuérdamelo
  10 minutos antes"*. Se crea sola, con su día, hora y aviso.
- Tocar el aviso abre la tarea para **posponerla** o marcarla hecha. El icono muestra lo
  pendiente de hoy.
- **Resumen del día** opcional: cada mañana, un aviso con lo que toca.
- **Avisos al llegar o salir de un sitio** (app de iPhone): *"comprar pan al pasar por
  Mercadona"*. Guarda tus lugares buscándolos en Mapas o con tu ubicación actual; el iPhone
  avisa aunque la app esté cerrada. También con Siri: *"Añade una tarea en Tasks"*.
- Deslizar a la derecha completa, a la izquierda borra (con deshacer).
- Arrastrar por el asa de la derecha para reordenar o cambiar de bloque.
- Exportar e importar una copia en JSON desde Ajustes.

## Instalar en el móvil

1. Abre la web en el navegador.
2. iOS: *Compartir → Añadir a pantalla de inicio*. Android: *⋮ → Instalar aplicación*.
3. Abre la app desde el icono → *Ajustes (···) → Activar avisos*. En iPhone los avisos solo
   funcionan con la app instalada (iOS 16.4 o posterior).

## Desarrollo

```bash
npm install
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor local en `/tasks/` |
| `npm test` | tests unitarios |
| `npm run coverage` | cobertura |
| `npm run build` | typecheck + build a `dist/` |

Las tareas se guardan en IndexedDB del navegador y no hay cuentas. La única copia de
seguridad es la exportación manual a JSON.

Para los avisos, un Worker de Cloudflare (`worker/`) guarda solo cuándo avisar y un texto
cifrado en el propio móvil con una clave que nunca sale de él: el servidor no puede leer
tus tareas. El dictado se transcribe con Whisper en ese mismo servidor y el audio no se
guarda.

Detalles de arquitectura y convenciones: [CLAUDE.md](CLAUDE.md).
