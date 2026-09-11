# Tasks

To-do diaria para móvil. Instalable como app, funciona sin conexión y guarda los datos
solo en tu dispositivo.

**→ [diegomolinacatala.github.io/tasks](https://diegomolinacatala.github.io/tasks/)**

## Qué hace

- **Tareas**: una sola pantalla con lo atrasado (en rojo), lo de hoy con sus secciones, y
  lo que no tiene fecha.
- **Semana**: los siete días a la vista; arrastra una tarea de un día a otro.
- Escribe y pulsa Enter: la tarea nace **sin fecha**. El botón *Hoy* la manda al día de hoy.
- Deslizar a la derecha completa, a la izquierda borra (con deshacer).
- Arrastrar por el asa de la derecha para reordenar o cambiar de bloque.
- Exportar e importar una copia en JSON desde Ajustes.

## Instalar en el móvil

1. Abre la web en el navegador.
2. iOS: *Compartir → Añadir a pantalla de inicio*. Android: *⋮ → Instalar aplicación*.

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

Los datos se guardan en IndexedDB del navegador. No hay servidor, no hay cuentas y nada
sale del dispositivo. La única copia de seguridad es la exportación manual a JSON.

Detalles de arquitectura y convenciones: [CLAUDE.md](CLAUDE.md).
