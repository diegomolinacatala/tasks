# Bienvenida, sugerencias, primitivas y avisos

Auditoría de experiencia (no de código) de: la bienvenida (`src/components/welcome/*`, `src/lib/welcome.ts`, `src/lib/boot.ts`), el modo sugerencia (`src/components/feedback/*`, `src/lib/feedback.ts`), las primitivas (`src/components/ui/*`), los avisos vistos desde quien los toca (`src/components/push/useNotificationActions.ts`, `useNotificationOpen.ts`, `src/components/task/SnoozeBar.tsx`, `src/lib/schedule.ts`, `src/lib/nativeEvents.ts`, `src/sw.ts`, `src/lib/platform/notifications.ts`) y todos los `toast(` de `src/`. Rama `capacitor`, 12/10/2026.

## Resumen (lo que más chirría)

1. **Los toasts viven por debajo de los paneles** (`.toast` z 50, `.sheet` z 60): «Esa hora ya ha pasado», «“el piso” ya lo usa Casa», «Sin permiso de ubicación → Ajustes», «No se pudo crear el calendario “Tasks”» y el **Deshacer** de *Convertir en rutina* salen detrás del panel que sigue abierto: el usuario toca y no pasa nada visible.
2. **Borrar todo** (dos toques en 4 s) e **Importar copia** son las dos únicas acciones destructivas de la app sin **Deshacer**, cuando hasta borrar una tarea lo tiene.
3. En el modo sugerencia, **tocar fuera del panel del mensaje** (o Escape, o tirar del asa) **tira la foto y lo rodeado**: hay que volver a Señalar y rodear. Es justo el gesto que la app enseña para soltar el teclado.
4. El aviso de cierre tocado sin botón se convierte en un toast «¿Has acabado X?» con **Sí** que dura 4,2 s y no tiene **Todavía no**: si se pasa, no hay dónde contestar, y la pregunta no vuelve.
5. Todos los toasts duran lo mismo (4,2 s), tengan Deshacer o no, no se pueden descartar y su posición da por hecho que hay barra de escribir (en Lugares y Ajustes flotan en el aire; en el modo sugerencia quedan detrás de la tarjeta).

## Hallazgos

### UI-01 · Toasts detrás de los paneles · [ALTO]
- **Dónde**: `src/components/ui/toast.css:7` (`z-index: 50`) frente a `src/components/ui/sheet.css:5` (`z-index: 60`). Casos: `src/components/task/ReminderPicker.tsx:77-78` («Esa hora ya ha pasado.» con el panel de la tarea o la ficha abiertos), `src/components/places/PlaceAliases.tsx:53-55` («“x” ya lo usa Y.» dentro del panel del lugar), `src/components/places/PlaceSheet.tsx:168-174` («Sin permiso de ubicación.» + **Ajustes**) y `:202-204` («No se ha podido abrir el mapa.»), `src/components/settings/CalendarExportSheet.tsx:64`, y `src/App.tsx:287-303` (*Convertir en rutina*: el toast «Rutina: X» con **Deshacer** sale a la vez que se abre `RoutineSheet`, que lo tapa).
- **Qué ve/hace el usuario**: elige «Otra…» y una hora pasada → se cierra la rueda y no pasa nada. Escribe un otro nombre repetido → desaparece sin explicación. Toca «Usar mi ubicación» sin permiso → nada (el botón **Ajustes** del toast nunca se ve). Convierte una tarea en rutina → se abre el panel de la rutina; el Deshacer pasó detrás.
- **Problema**: feedback invisible y Deshacer perdido (reglas: *visible feedback*, *undo-support*). `FeedbackSheet.tsx:45` ya reconoce el problema («un aviso suelto quedaría debajo del panel») y lo esquiva con un error en línea, pero solo ahí.
- **Propuesta**: (a) `.toast { z-index: 65 }` (por encima de los paneles, por debajo de la tarjeta de sugerencias, z 70) y, mientras haya un panel abierto, el toast arriba en vez de abajo para no pisar el botón del pie: `Sheet` ya toca `document.body.style.overflow` en `Sheet.tsx:65-66`; que ponga también `html.has-sheet`, y `html.has-sheet .toast { top: calc(var(--safe-t) + 12px); bottom: auto; }`. (b) Los tres errores de validación dentro de un panel (hora pasada, nombre repetido, calendario que no se pudo crear) como nota en línea `sheet__note` con `role="alert"`, igual que hace `FeedbackSheet.tsx:108-112`: es (es) «Esa hora ya ha pasado.» / (en) «That time has already passed.».
- **Esfuerzo**: S (a) + S (b)

### UI-02 · «Borrar todo» e «Importar copia» sin Deshacer · [CRÍTICO]
- **Dónde**: `src/components/settings/SettingsView.tsx:147-156` (`clearAll`: segundo toque en 4 s → `state/clear` → toast «Todo borrado.») y `:137-145` (`importBackup` → `state/import` → «Copia importada.»).
- **Qué ve/hace el usuario**: toca «Borrar todo», el botón cambia a «Toca otra vez para borrarlo todo»; un segundo toque (también el doble toque reflejo de iOS cuando parece que no ha respondido) borra tareas, rutinas, lugares y secciones. El toast lo confirma y no ofrece nada. Importar sustituye todo sin aviso previo ni vuelta atrás (la nota de abajo lo dice, pero ya es tarde).
- **Problema**: pérdida de datos con dos toques en el mismo sitio; toda la app deshace lo destructivo (borrar una tarea, una rutina, N hechas) y lo más destructivo no (*undo-support*).
- **Propuesta**: guardar el estado anterior en un ref y dar **Deshacer** en los dos toasts: `toast({ message: copy.cleared, actionLabel: copy.undo, onAction: () => dispatch({ type: 'state/replace', state: previous }) })`; lo mismo en importar: (es) «Copia importada.» + **Deshacer** / (en) «Backup imported.» + **Undo**. Mantener la doble confirmación. Con UI-06, estos dos toasts duran 6 s.
- **Esfuerzo**: S

### UI-03 · Cerrar el panel de la sugerencia tira lo rodeado · [ALTO]
- **Dónde**: `src/components/feedback/FeedbackMode.tsx:192` (`onClose={backToBrowse}`) y `:118-122` (`backToBrowse` pone `shot` y `mark` a `null`). El panel es un `Sheet` normal: se cierra tocando el velo (`Sheet.tsx:132-141`), con Escape (`:59-64`) o tirando del asa (`:110-128`).
- **Qué ve/hace el usuario**: rodea, sube el panel con el teclado (`FeedbackSheet.tsx:105` `autoFocus`). Toca fuera para soltar el teclado (es lo que la app enseña con el velo de la barra de escribir) y vuelve a la tarjeta de abajo: la foto y el círculo han desaparecido; tiene que tocar Señalar y rodear otra vez. El texto sí se conserva (`message` vive en `FeedbackMode`).
- **Problema**: una salida accidental destruye trabajo (*escape-routes* / *no accidental loss*). CLAUDE.md dice «Cerrar el panel vuelve a la píldora sin perder lo escrito»: lo escrito no, pero lo rodeado sí.
- **Propuesta**: cerrar el panel vuelve a la fase `draw` con `mark` y `shot` intactos (como «Rodear otra vez», `FeedbackMode.tsx:191`), con el círculo a la vista y la barra de abajo con **Cancelar** / **Sin rodear** más un tercer chip **Escribir** que reabre el panel. Solo **Cancelar** (o la × de la tarjeta) descarta la foto. Alternativa mínima: `onClose={() => setPhase('draw')}`.
- **Esfuerzo**: S

### UI-04 · «¿Has acabado?» dentro de la app: 4,2 s, solo «Sí» y sin «Todavía no» · [ALTO]
- **Dónde**: `src/components/push/useNotificationActions.ts:120-123` (`askAgain`: toast con **Sí**), `:136` (`ask ? askAgain(first) : onOpenTask(first.id)`), `src/components/ui/Toast.tsx:5` (`VISIBLE_MS = 4200`). El equivalente de rutina en `:85-86` («¿Hecha: X?» + **Sí**).
- **Qué ve/hace el usuario**: toca el cuerpo del aviso de cierre (sin mantener pulsado): la app se abre y abajo sale «¿Has acabado Reunión con Jorge?» con **Sí**. Si tarda más de 4 s en mirar (la app acaba de arrancar, hay bienvenida, está buscando la tarea), el toast se ha ido y no hay nada en pantalla que recuerde la pregunta; la tarea no se abre. Y si no ha acabado, no hay **Todavía no**: el siguiente aviso de cierre no se programa (`schedule.ts:150-151` descarta `end <= now`), así que nadie volverá a preguntar.
- **Problema**: la salida «de un toque» depende de una ventana de 4 s; falta la segunda respuesta que sí tiene el aviso (*consistency*, *recoverability*).
- **Propuesta**: para `ask`, abrir la tarea como desde cualquier aviso (`onOpenTask`, `fromNotification`) y que `SnoozeBar` enseñe, cuando la tarea tiene duración y ya acabó, una fila **¿Has acabado?** con **Sí, hecha** (`chip is-active`) y **Todavía no** (`task/extend`, el mismo de `extend` en `:110-117`), seguida de los atajos de posponer. Mantener además el toast con **Sí** (que con UI-06 dura 6 s). Textos: (es) «¿Has acabado?» · «Sí, hecha» · «Todavía no» / (en) «Finished?» · «Yes, done» · «Not yet», los mismos que los botones del aviso (`notifications.ts:30-31`).
- **Esfuerzo**: M

### UI-05 · Un aviso tocado con bienvenida pendiente pierde su toast · [MEDIO]
- **Dónde**: `src/App.tsx:170-172` (la bienvenida de novedades sale al abrir si hay láminas nuevas), `src/components/welcome/welcome.css:6` (z 80), `src/components/push/useNotificationActions.ts:120-123` y `:68-87` (toasts de pregunta), `toast.css:7` (z 50). `UpdatePrompt` sí espera (`App.tsx:468` `paused`).
- **Qué ve/hace el usuario**: acaba de actualizar; suena «¿Has acabado?» o el aviso de una rutina; lo toca; se abre la app con «Hay cosas nuevas». Tras las láminas, el toast con **Sí** ya se fue (4,2 s). El panel de la tarea (z 60) sí espera detrás, pero el toast no.
- **Problema**: la acción del aviso se pierde en silencio.
- **Propuesta**: que `useNotificationOpen` acepte `paused` (como `UpdatePrompt`) y retenga el evento mientras `welcome !== null`, entregándolo al cerrarla. Ya hay un patrón para esto en `NativeActions.retainUntilConsumed` (CLAUDE.md, «App de iPhone»).
- **Esfuerzo**: S

### UI-06 · Todos los toasts duran 4,2 s, con Deshacer o sin él · [MEDIO]
- **Dónde**: `src/components/ui/Toast.tsx:5` y `:35`.
- **Qué ve/hace el usuario**: «Tarea borrada · Deshacer», «12 hechas borradas · Deshacer», «Todo borrado» y «¿Has acabado X? · Sí» desaparecen igual de rápido que «Copia importada.». Un mensaje largo como «Ya hay 50 rutinas: borra alguna para añadir otra.» (`App.tsx:93`) o «Dictado agotado por hoy. Vuelve a las 02:00.» (`useVoice.ts:31`) apenas da tiempo a leerse.
- **Problema**: *toast-duration*: lo accionable y lo largo necesitan más (Material: 4–10 s; iOS Mail deja el Deshacer ~5 s).
- **Propuesta**: en `ToastProvider`, `VISIBLE_MS` = 6000 si hay `actionLabel` o el mensaje pasa de 60 caracteres, 4200 si no. Sin cambiar la API.
- **Esfuerzo**: S

### UI-07 · Un toast nuevo pisa un Deshacer vivo · [BAJO]
- **Dónde**: `src/components/ui/Toast.tsx:26-29` (`show` sustituye el `toast` actual).
- **Qué ve/hace el usuario**: borra una tarea (Deshacer) y en el acto escribe otra para mañana («X → Mañana · Ver»): el Deshacer se ha ido.
- **Problema**: *undo-support* en secuencias rápidas.
- **Propuesta**: si el toast vigente tiene acción y el nuevo no, encolar el nuevo (cola de 1) y enseñarlo al salir el primero. Si los dos tienen acción, manda el nuevo (como ahora).
- **Esfuerzo**: S

### UI-08 · El toast no se puede descartar · [BAJO]
- **Dónde**: `src/components/ui/Toast.tsx:42-58` (sin `onClick` en el texto ni gesto).
- **Qué ve/hace el usuario**: un aviso de error o informativo se queda 4 s sobre la lista aunque ya lo haya leído.
- **Problema**: *toast-dismiss*.
- **Propuesta**: tocar el texto lo descarta (`onClick={dismiss}` en `.toast__text`); nada de deslizar, para no chocar con las filas. Con acción, tocar el texto también descarta (la acción sigue siendo su botón).
- **Esfuerzo**: S

### UI-09 · El toast da por hecho que hay barra de escribir; en el modo sugerencia queda detrás de la tarjeta · [MEDIO]
- **Dónde**: `src/components/ui/toast.css:5` (`bottom: calc(var(--nav-h) + var(--composer-h) + …)`), `src/components/shell/shell.css:41-43` (solo las pestañas con `has-composer` tienen barra), `src/components/feedback/feedback.css:5-10` (tarjeta `fb-dock`, z 70, en la misma franja).
- **Qué ve/hace el usuario**: en Lugares y Ajustes, «Copia importada.» o «Sin permiso de ubicación.» flotan 64 px por encima de las pestañas, en el aire. En el modo sugerencia (que invita a seguir usando la app), deslizar para borrar una tarea produce «Tarea borrada · Deshacer»… detrás de la tarjeta «Ve a lo que quieras comentar».
- **Problema**: posición incoherente; Deshacer oculto.
- **Propuesta**: que `App` fije `--toast-lift` en `<html>`: `var(--composer-h)` solo con `writing` (`App.tsx:369`) y `0px` si no; y en `feedback.css`, `:root[data-suggesting] .toast { bottom: calc(var(--safe-b) + var(--nav-h) + 104px) }` (encima de la tarjeta) o `z-index: 75`.
- **Esfuerzo**: S

### UI-10 · Los errores en toast se anuncian como estado, no como alerta · [BAJO]
- **Dónde**: `src/components/ui/Toast.tsx:43` (`role="status"` para todo).
- **Qué ve/hace el usuario**: con VoiceOver, «No se pudo exportar la copia.» o «Sin acceso al micrófono.» pueden no anunciarse si el lector está ocupado.
- **Problema**: *aria-live* (los errores piden `assertive`).
- **Propuesta**: `ToastRequest.tone?: 'error'` → `role="alert"`; usarlo en los `toast(` de fallo (`SettingsView.tsx:124,143`, `useVoice.ts:119,162,174`, `PushProvider.tsx:99,113`, `PlaceSheet.tsx:169,203`, `PlacesView.tsx:129`, `NativePushProvider.tsx:69`).
- **Esfuerzo**: S

### UI-11 · Los paneles no reciben el foco ni dejan inerte la app · [MEDIO]
- **Dónde**: `src/components/ui/Sheet.tsx:130-131` (`role="dialog" aria-modal`), sin `focus()` al abrir ni devolverlo al cerrar; la app de debajo no lleva `inert` (la bienvenida sí: `App.tsx:407`, `Welcome.tsx:174-175`).
- **Qué ve/hace el usuario**: con teclado o VoiceOver, al abrir una tarea el foco sigue en la fila de la lista; Tab y el rotor siguen recorriendo la lista que hay detrás del velo. Al cerrar, el foco no vuelve a la fila.
- **Problema**: *modal focus management* (WCAG 2.4.3).
- **Propuesta**: en `Sheet`, al pasar a `shown`: `panel.current.focus({ preventScroll: true })` (con `tabIndex={-1}`) y guardar `document.activeElement` para devolvérselo en el cierre; mientras `open`, `document.getElementById('root')?.setAttribute('inert','')` (quitar al cerrar). Como el panel va en un portal fuera de `#root`, el `inert` no lo afecta.
- **Esfuerzo**: S

### UI-12 · El asa del panel tiene 28 px de alto · [BAJO]
- **Dónde**: `src/components/ui/sheet.css:45-51` (`padding: 12px 0 12px` + raya de 4 px).
- **Qué ve/hace el usuario**: para tirar del panel hay que atinar en una franja estrecha; muchos acaban tocando el velo (que cierra de golpe) en lugar de arrastrar.
- **Problema**: *touch-target-size* (44 pt).
- **Propuesta**: `.sheet__grab { position: relative } .sheet__grab::after { content:''; position:absolute; inset:-8px 25% -8px; }` (la misma técnica que `agenda.css:264-268` en el asa del mes), sin mover el contenido.
- **Esfuerzo**: S

### UI-13 · Píldoras y botón del toast por debajo de 44 pt · [BAJO]
- **Dónde**: `src/components/ui/sheet.css:105-110` (`.chip` `min-height: 38px`; las usan SnoozeBar, Recordatorios, Cuándo, la barra de rodear `FeedbackDraw.tsx:135-140`), `src/components/ui/toast.css:34` (`.toast__action` 36 px), `src/components/welcome/welcome.css:597-600` (`.scene__note-send` 32 px), `src/components/compose/composer.css:143,214` (36 px; la escena *Detalles* los reutiliza).
- **Qué ve/hace el usuario**: toques fallidos en las filas de chips, sobre todo «Deshacer» en el toast (36 px) y «Enviar» en la lámina *Sugerencias* (32 px).
- **Problema**: *touch-target-size*.
- **Propuesta**: `.chip { min-height: 42px }` y `gap: 10px` (el salto a 42 no rompe los paneles; 44 sí engorda las filas de Cuándo). `.toast__action { min-height: 44px; margin: -4px 0 }`. `.scene__note-send { min-height: 40px }`.
- **Esfuerzo**: S

### UI-14 · Posponer desde un aviso: falta «Pasar a hoy» y «Hecha» parece «elegida» · [MEDIO]
- **Dónde**: `src/components/task/SnoozeBar.tsx:24-57`; opciones en `src/lib/reminders.ts:138-146`.
- **Qué ve/hace el usuario**: toca el aviso de una tarea atrasada (el aviso sí tenía **Pasar a hoy**, `notifications.ts:49`); se abre con «Posponer: +10 min · +1 h · Mañana 9:00 · ✓ Hecha». Para pasarla a hoy tiene que ir a Cuándo más abajo. «Hecha» va en azul marino macizo, que en toda la app significa «lo elegido» (`sheet.css:126-131`), no «haz esto».
- **Problema**: incoherencia entre el aviso y su panel; semántica del chip.
- **Propuesta**: si `isOverdue(task, today)`, un chip **A hoy** (`toToday([task.id])`, con su Deshacer) delante de los de posponer; «Hecha» como `chip chip--reminder` (coñac, con el icono) en lugar de `is-active`. Tres posponer + Hecha (+ A hoy) sigue siendo una fila.
- **Esfuerzo**: S

### UI-15 · Acciones de aviso que acaban en silencio · [BAJO]
- **Dónde**: `src/components/push/useNotificationActions.ts:125-138`: si la tarea del aviso ya no existe (`found` vacío) no pasa nada; `:132` «Pasar atrasadas a hoy» sin atrasadas (`toToday` en `useTaskActions.ts:78-79` sale sin toast); aviso de lugar con varias tareas todas borradas (`:137`).
- **Qué ve/hace el usuario**: toca el aviso, la app se abre en la Agenda y nada le dice qué ha pasado con lo que tocó.
- **Problema**: *visible feedback*.
- **Propuesta**: toast sin acción: (es) «Esa tarea ya no existe.» / (en) «That task no longer exists.»; (es) «No queda nada atrasado.» / (en) «Nothing overdue left.».
- **Esfuerzo**: S

### UI-16 · «Hecha» abre la app en una tarea y no en una rutina · [MEDIO]
- **Dónde**: `src/lib/platform/notifications.ts:44-58`: `done` de `task`/`task-overdue` con `foreground: true`; el de `routine` y el «Sí, hecha» de `task-ask` sin él (los resuelve `NotificationResponder` + `headless.js`).
- **Qué ve/hace el usuario**: mantiene pulsado el aviso de una rutina → **Hecha** → se tacha sin abrir nada. Hace lo mismo con el aviso de una tarea → **Hecha** → la app se abre a pantalla completa (y pide desbloquear) para enseñar «Hecha: X». Mismo botón, dos comportamientos.
- **Problema**: *consistency*. La vía sin abrir ya existe para «Sí, hecha» (`answerAsk` con `reply: 'done'`): es la misma respuesta.
- **Propuesta**: quitar `foreground` al `done` de `task` y `task-overdue` y que `NotificationResponder.swift` lo trate como `task-ask`/`done` (entrada `ask { reply: 'done' }` en la bandeja; la web la aplica al volver). «+10 min» y «Pasar a hoy» siguen abriendo la app.
- **Esfuerzo**: M (Swift; probar en el iPhone)

### UI-17 · La tarjeta del modo sugerencia tapa el final de la lista · [MEDIO]
- **Dónde**: `src/components/feedback/feedback.css:5-20` (fija, ~84 px sobre las pestañas) y `src/components/shell/shell.css:32-43` (el relleno inferior de la lista es `--dock` = 64 px solo con barra de escribir; 0 en Ajustes).
- **Qué ve/hace el usuario**: entra desde Ajustes (`SettingsView.tsx:222-233`) y la tarjeta cubre justo las últimas filas de Ajustes (Soporte, Privacidad, la versión); en la Bandeja/Agenda tapa la última tarea, que es la que no puede rodear.
- **Problema**: contenido inaccesible bajo una capa fija.
- **Propuesta**: `:root[data-suggesting] .app__scroll { padding-bottom: calc(var(--kb, 0px) + 112px) }` (la tarjeta más su aire), junto a la regla que ya aparta la barra (`feedback.css:96-99`).
- **Esfuerzo**: S

### UI-18 · En el modo sugerencia no se puede comentar la barra de escribir ni su ficha · [BAJO]
- **Dónde**: `src/components/feedback/feedback.css:96-99` (`.app__dock` con `opacity: 0; pointer-events: none` mientras está la tarjeta) y `FeedbackDock.tsx:8` («Puedes cambiar de pestaña o abrir una tarea.»).
- **Qué ve/hace el usuario**: quiere sugerir algo del compositor o de la ficha de detalles (lo más nuevo de la app) y no existe mientras está en el modo.
- **Problema**: hueco en la cobertura de la herramienta que debe recoger opiniones sobre todo.
- **Propuesta**: no ocultar la barra; subir la tarjeta encima (`bottom: calc(… + var(--composer-h))` cuando `.app.has-composer`) y dejar escribir. La foto la incluye igual (la tarjeta se quita antes de la captura, `FeedbackMode.tsx:97-101`). O, como mínimo, decirlo en la nota: (es) «Puedes cambiar de pestaña o abrir una tarea (la barra de escribir no).»
- **Esfuerzo**: S

### UI-19 · «Cancelar» / «Sin rodear» pisan la zona de las pestañas al rodear · [BAJO]
- **Dónde**: `src/components/feedback/feedback.css:204-213` (`.fb-draw__bar` en `bottom: safe-b + 18px`, centrado) y `FeedbackDraw.tsx:134-141` (paran el `pointerdown`).
- **Qué ve/hace el usuario**: quiere rodear la pestaña «Lugares» o la barra de escribir y los chips están encima; el trazo que empieza ahí no sale.
- **Problema**: controles sobre lo que se quiere señalar.
- **Propuesta**: llevar los dos chips arriba, bajo la píldora «Rodea con el dedo…» (`.fb-draw__hint`), o fundirlos en ella: «Rodea con el dedo lo que quieras comentar · Sin rodear · ×».
- **Esfuerzo**: S

### UI-20 · El panel enseña el texto de lo rodeado aunque no se vaya a enviar · [BAJO]
- **Dónde**: `src/components/feedback/FeedbackMode.tsx:158` (`picked` sale de `mark.elements` siempre) frente a `:136,140` (sin captura no viajan textos ni panel) y `FeedbackSheet.tsx:84-85` («Sin captura: solo dónde estabas.»).
- **Qué ve/hace el usuario**: quita la captura con la × y debajo sigue leyéndose «Cena con Carlota»; la nota dice que solo va dónde estaba. No sabe qué se manda.
- **Problema**: lo que se ve no es lo que se envía (CLAUDE.md: «quien escribe ve exactamente qué se manda»).
- **Propuesta**: `picked = attached ? label : path ?? copy.whole`, o en la PWA y sin captura enseñar solo «Agenda · Horario» (la ruta de clases traducida a nombres de bloque, que ya se mandan).
- **Esfuerzo**: S

### UI-21 · Cerrar el panel mientras «Enviando…» · [BAJO]
- **Dónde**: `src/components/feedback/FeedbackMode.tsx:145-156` (`send`) y `FeedbackSheet.tsx:61-71` (el `Sheet` sigue teniendo `onClose` durante `sending`).
- **Qué ve/hace el usuario**: toca Enviar, el botón dice «Enviando…» (hasta 20 s con mala cobertura, `lib/feedback.ts:37`), toca fuera para ver qué pasa: vuelve a la tarjeta. Si falla, el error se escribe en un panel cerrado y nadie lo ve; si va bien, sale «Enviada» y el modo se cierra solo (desconcertante tras haber «cancelado»).
- **Problema**: estado de carga sin bloqueo del cierre.
- **Propuesta**: mientras `sending`, `onClose={undefined}` en el `Sheet` (sin velo clicable ni asa, como `DictationConsent`) y el botón con un spinner. Si se quiere permitir salir, abortar el envío.
- **Esfuerzo**: S

### UI-22 · «Enviar» deshabilitado sin decir por qué mientras se prepara la foto · [BAJO]
- **Dónde**: `src/components/feedback/FeedbackSheet.tsx:58` (`ready` exige `!waiting`) y `:67` (solo `disabled`).
- **Qué ve/hace el usuario**: escribe, toca Enviar y no responde durante el medio segundo (o más, en un móvil modesto) que tarda `composeShot`; la miniatura late pero nadie liga una cosa con la otra.
- **Problema**: estado de carga sin etiqueta.
- **Propuesta**: con `waiting`, el botón dice (es) «Preparando la captura…» / (en) «Preparing the screenshot…».
- **Esfuerzo**: S

### UI-23 · Salir del modo con la × tira el mensaje escrito · [BAJO]
- **Dónde**: `src/components/feedback/FeedbackDock.tsx:50-52` (× → `onClose` → `onDone`, `FeedbackMode.tsx:163`), `App.tsx:487` (desmonta `FeedbackMode` y con él `message`).
- **Qué ve/hace el usuario**: escribe tres líneas, cierra el panel para mirar algo (UI-03), toca la × por error (está pegada a la esquina de la tarjeta): el texto se ha ido.
- **Problema**: pérdida de lo escrito sin confirmación.
- **Propuesta**: si `message.trim()` no está vacío, la × pide confirmación con el mismo patrón de doble toque de la app (el botón pasa a «Toca otra vez para descartar»), o guarda el borrador en `sessionStorage` y lo recupera al volver a entrar.
- **Esfuerzo**: S

### UI-24 · «Señalar» / «Rodear» / «Mark» · [BAJO]
- **Dónde**: `FeedbackDock.tsx:9,16` («Señalar» / «Mark»), `FeedbackDraw.tsx:23-24` («Rodea…» / «Circle…»), `FeedbackSheet.tsx:12,23` («Rodear otra vez» / «Circle again»), `SettingsView.tsx:43,73` («Rodea con el dedo…»), `Welcome.tsx:71-72,112-113` («Rodéalo y cuéntalo» / «Circle it, say it»).
- **Qué ve/hace el usuario**: Ajustes y la bienvenida hablan de rodear; el botón dice Señalar; en inglés «Mark» no promete ningún dibujo. En español «Señalar» fue una decisión tras probarlo (CLAUDE.md), vale; en inglés «Mark» es más flojo.
- **Problema**: vocabulario (i18n) desigual.
- **Propuesta**: en inglés, «Point it out» para el botón (y «Stop suggesting» → «Leave suggestions» para la ×, que así casa con «Salir de las sugerencias»).
- **Esfuerzo**: S

### UI-25 · Lámina I (Escribir): la barra parece tocable y no lo es · [BAJO]
- **Dónde**: `src/components/welcome/WriteScene.tsx:112-150` (compositor `aria-hidden`, botón redondo y «Detalles» como `span`).
- **Qué ve/hace el usuario**: las láminas II–VI piden tocar (y lo dicen: «Pruébalo»); en la I el usuario toca «Detalles» o el botón de enviar y no pasa nada. Es la primera lámina: enseña que aquí no se toca, justo lo contrario de lo que viene después.
- **Problema**: *affordance* falsa en el primer contacto.
- **Propuesta**: en la lámina I quitar `composer__more` (Detalles se enseña en la II) y el botón redondo, o que tocar la barra pase a la lámina II (`onAdvance` desde `Welcome`).
- **Esfuerzo**: S

### UI-26 · Lámina Sugerencias con movimiento reducido: la mano de muestra no existe · [BAJO]
- **Dónde**: `src/components/welcome/welcome.css:541-561` (`.scene__demo-trace` solo animada) y `src/styles/base.css:101-109` (con `reduce`, duración 0,01 ms y una iteración → termina en el fotograma 100 %: `opacity: 0`). `feedback.css:429-438` sí lo contempla (trazo quieto al 60 %).
- **Qué ve/hace el usuario**: con «Reducir movimiento» activado, la lámina VI es una lista sin ninguna pista de qué hacer.
- **Problema**: *reduced-motion* debe quitar el movimiento, no la información.
- **Propuesta**: copiar la regla de `feedback.css`: `@media (prefers-reduced-motion: reduce) { .scene__demo-trace { animation: none; stroke-dashoffset: 0; opacity: 0.6 } }`.
- **Esfuerzo**: S

### UI-27 · Portada con movimiento reducido: todo aparece a trompicones durante 1,6 s · [BAJO]
- **Dónde**: `src/components/welcome/welcome.css:41,66,79,87,92` (retardos de 700 a 1580 ms con `both`) y `base.css:101-109` (anula duración, no retardo).
- **Qué ve/hace el usuario**: pantalla vacía con la señal; a los 0,7 s salta arriba; al 1,2 s aparece «Tasks» de golpe; al 1,6 s, los botones. Ni animación ni inmediatez.
- **Problema**: *reduced-motion* a medias.
- **Propuesta**: en `welcome.css`, `@media (prefers-reduced-motion: reduce) { .welcome__mark, .welcome__rule, .welcome__name, .welcome__tagline, .welcome__cover .welcome__foot { animation-delay: 0ms } }`.
- **Esfuerzo**: S

### UI-28 · «Ver la bienvenida» desde Ajustes hace esperar 1,6 s a que aparezca «Empezar» · [BAJO]
- **Dónde**: `src/components/welcome/welcome.css:34-93` (la coreografía está pensada para relevar al arranque) y `Welcome.tsx:218` (`is-back` solo al volver atrás). `SettingsView.tsx:244-247` → `App.tsx:434` (`FULL_WELCOME`).
- **Qué ve/hace el usuario**: toca «Ver la bienvenida» y durante más de un segundo solo ve la señal en el centro; los botones llegan al final.
- **Problema**: una entrada pensada para el arranque reutilizada a mitad de sesión.
- **Propuesta**: `WelcomeRun.quick?: true` desde Ajustes (y cuando `news`) → clase `is-quick` en `.welcome__cover` con los mismos tiempos cortos que `is-back` (`welcome.css:102-114`).
- **Esfuerzo**: S

### UI-29 · La barra de progreso es una lista vacía para el lector de pantalla · [BAJO]
- **Dónde**: `src/components/welcome/Welcome.tsx:247-251` (`<ol aria-label="Lámina 2 de 7">` con `<li>` vacíos).
- **Qué ve/hace el usuario**: VoiceOver anuncia «lista, 7 elementos» y luego nada; el «2 de 7» se lee solo al enfocar la lista.
- **Problema**: *aria* semántica.
- **Propuesta**: `<div role="progressbar" aria-valuemin={1} aria-valuemax={plates.length} aria-valuenow={step} aria-valuetext={copy.progress(step, total)}>` con los filetes `aria-hidden`.
- **Esfuerzo**: S

### UI-30 · Si el trozo de la bienvenida se cuelga, la app no arranca · [BAJO]
- **Dónde**: `src/App.tsx:69-74` (solo el rechazo de `import()` cae en `WelcomeUnavailable`) y `:182-191` (`finishBoot` lo llama la bienvenida vía `onReady`; sin ella, el `#boot` se queda).
- **Qué ve/hace el usuario**: primera apertura de la PWA con red muy lenta: señal y esqueleto para siempre (el `import` no rechaza, espera).
- **Problema**: *dead end* en el arranque.
- **Propuesta**: `Promise.race` con un temporizador de 8 s en el `lazy` de `Welcome` (resuelve a `WelcomeUnavailable`, que no la da por vista: saldrá la próxima vez).
- **Esfuerzo**: S

### UI-31 · Lámina Calendario: «Conectar mi calendario» no cambia mientras iOS pregunta · [BAJO]
- **Dónde**: `src/components/welcome/CalendarScene.tsx:79-83,85,119` (`busy` solo deshabilita; misma etiqueta).
- **Qué ve/hace el usuario**: toca, el botón se apaga un poco y nada más hasta que iOS enseña su diálogo (a veces medio segundo).
- **Problema**: estado de carga sin etiqueta.
- **Propuesta**: con `busy`, texto (es) «Pidiendo permiso…» / (en) «Asking for access…».
- **Esfuerzo**: S

### UI-32 · Lámina Detalles: quitar «A la hora» no tiene vuelta · [BAJO]
- **Dónde**: `src/components/welcome/DetailsScene.tsx:181-192` (los avisos se quitan con un toque; el único que se puede añadir es «30 min antes»).
- **Qué ve/hace el usuario**: prueba a tocar el chip «A la hora» (se quita), quiere devolverlo y no puede; la ficha de verdad sí deja (`ReminderPicker`).
- **Problema**: la lámina enseña una lógica distinta a la real en el mismo gesto.
- **Propuesta**: ofrecer también «A la hora» como `chip--option` cuando no esté (igual que el de 30 min).
- **Esfuerzo**: S

### UI-33 · «Rutina: X» con «Ver» en la Agenda y «Deshacer» en la Bandeja · [BAJO]
- **Dónde**: `src/App.tsx:272-284` (`actionLabel: tab === 'inbox' ? copy.undo : copy.view`).
- **Qué ve/hace el usuario**: escribe «tomar creatina cada día» en la Agenda, el toast dice «Rutina: 💊 Tomar creatina · Cada día» y solo ofrece **Ver**; para deshacer tiene que ir a la Bandeja y deslizar. En la Bandeja, lo contrario.
- **Problema**: *undo-support* desigual para la misma acción.
- **Propuesta**: siempre **Deshacer** (el texto ya dice qué se ha creado y lleva el icono de repetir); «Ver» solo cuando hace falta saber adónde ha ido (`addTask`, `App.tsx:306-319`).
- **Esfuerzo**: S

### UI-34 · El aviso de una rutina repite la hora que ya es · [BAJO]
- **Dónde**: `src/lib/schedule.ts:212` (`body: "10:00 · Cada día"`).
- **Qué ve/hace el usuario**: a las 10:00 recibe «Tomar creatina / 10:00 · Cada día». La hora no aporta; la racha o el emoji sí motivan.
- **Problema**: contenido de aviso sin valor.
- **Propuesta**: cuerpo = `[emoji, daysLabel, racha >= 2 ? "racha de N" : null]` → «💊 Cada día · racha de 12» / «💊 Every day · 12-day streak» (`streak` ya existe en `lib/routines.ts`).
- **Esfuerzo**: S

### UI-35 · Cuerpo «Sin fecha» en el aviso de una tarea sin día · [BAJO]
- **Dónde**: `src/lib/schedule.ts:111` (`if (!task.date) return text.noDate`).
- **Qué ve/hace el usuario**: puso «En 1 h» a una tarea de la Bandeja; el aviso dice «Llamar a Miguel / Sin fecha»: parece un error.
- **Problema**: texto que describe un estado interno, no lo que toca.
- **Propuesta**: sin fecha, solo la sección o nada (`[section?.name]`), o (es) «De la bandeja» / (en) «From your inbox».
- **Esfuerzo**: S

### UI-36 · Lámina Rutinas: la tarjeta del widget es un botón «invisible» · [BAJO]
- **Dónde**: `src/components/welcome/RoutineScene.tsx:139` (`<button aria-hidden tabIndex={-1}>` que también tacha).
- **Qué ve/hace el usuario**: con VoiceOver solo existe el anillo; con el dedo, los dos. Inofensivo, pero un botón oculto al lector es un olor.
- **Problema**: *aria* (control interactivo oculto).
- **Propuesta**: hacer de la tarjeta un `div` decorativo (`aria-hidden`) y que el `onClick` lo lleve el contenedor `.lock__widgets` con el anillo como único botón, o darle `aria-label` propio en vez de ocultarlo.
- **Esfuerzo**: S

### UI-37 · La salida del panel sigue interceptando toques 220 ms · [BAJO]
- **Dónde**: `src/components/ui/Sheet.tsx:54-56` (`mounted` hasta `EXIT_MS`) y `sheet.css:2-9` (`.sheet` sigue a `inset: 0`).
- **Qué ve/hace el usuario**: cierra un panel y toca enseguida una fila: el toque cae en el velo que se desvanece (`onClose` de nuevo, inocuo) y la fila no se abre; repite.
- **Problema**: fricción en cierres rápidos.
- **Propuesta**: `.sheet:not(.is-open) { pointer-events: none }`.
- **Esfuerzo**: S

### UI-38 · El panel se cierra con Escape también cuando hay un selector nativo abierto · [BAJO]
- **Dónde**: `src/components/ui/Sheet.tsx:59-64` (Escape → `onClose`) y `src/components/ui/PickerChip.tsx:76-78` (Enter → `blur`; Escape no se trata).
- **Qué ve/hace el usuario**: en el ordenador (PWA), abre «Otra…», pulsa Escape para cerrar el calendario del navegador: se cierra el panel entero. `PickerChip` guarda el borrador al desmontar (`:39-45`), así que no pierde el valor, pero sí el sitio.
- **Problema**: Escape con dos destinatarios.
- **Propuesta**: en `PickerChip`, `onKeyDown` Escape → `stopPropagation()` + `blur()` sin guardar (`setDraft(null)`).
- **Esfuerzo**: S

### UI-39 · La vista previa del aviso de cierre tocado sin botón abre un toast, no la tarea · [BAJO]
- **Dónde**: `src/components/push/useNotificationActions.ts:136` (con `ask`, `askAgain` y nada más).
- **Qué ve/hace el usuario**: toca «Reunión con Jorge / ¿Has acabado?» y la app se abre en la Agenda de hoy sin señalar la tarea; solo el toast. Cualquier otro aviso abre la tarea.
- **Problema**: *consistency* entre avisos. (Se resuelve con UI-04.)
- **Propuesta**: la de UI-04: abrir la tarea con la fila «¿Has acabado?».
- **Esfuerzo**: incluido en UI-04

### UI-40 · El toast «X → Mañana · Ver» no tiene Deshacer · [BAJO]
- **Dónde**: `src/App.tsx:306-319` (`addTask` cuando lo escrito cae fuera de lo que se ve).
- **Qué ve/hace el usuario**: escribe «cena mañana a las 9» mirando hoy; el toast dice adónde fue y ofrece ir. Si se equivocó (quería hoy), tiene que ir, abrir la tarea y cambiar el día.
- **Problema**: *undo-support*; «Ver» cubre el «¿adónde ha ido?» pero no el «no era eso».
- **Propuesta**: sin cambiar el `Toast` (una acción), que **Ver** abra la tarea recién creada en su día (`setDay(date)`, `go('agenda')`, `openTask(id)`): desde el panel se corrige o se borra en un toque. `addTasks` ya devuelve los ids (`App.tsx:324`).
- **Esfuerzo**: S

### UI-41 · Los iconos como único rótulo: casi todos bien, dos sin aria-label · [BAJO]
- **Dónde**: revisados `Icons.tsx:5-21` (todos `aria-hidden`, correcto); con etiqueta: `Welcome.tsx:244`, `FeedbackDock.tsx:50`, `FeedbackSheet.tsx:77`, `DetailsScene.tsx:111,140,150`, `RoutineScene.tsx:130`, `App.tsx:416,438`. Sin ella: `src/components/welcome/MonthScene.tsx:45-54` la tiene (`aria-label` del mes), bien; `src/components/task/SnoozeBar.tsx:43-53` «Hecha» lleva texto, bien. Único hueco: `src/components/welcome/SuggestScene.tsx:119-135` (`scene__screen` dibujable sin nombre ni rol para el lector: la lámina solo se puede probar con el dedo) y `src/components/feedback/FeedbackDraw.tsx:114-120` (la capa de dibujo tampoco).
- **Qué ve/hace el usuario**: con VoiceOver, en el modo sugerencia no hay forma de «rodear»: solo queda «Sin rodear». Aceptable, pero debería decirse.
- **Problema**: *aria-labels* en superficies gestuales.
- **Propuesta**: `role="img" aria-label="Zona para rodear con el dedo; sin rodear se envía toda la pantalla"` en `.fb-draw` y un `sr-only` en la lámina VI («Rodear necesita el dedo; con un lector, pasa a la siguiente»).
- **Esfuerzo**: S

### UI-42 · Modo oscuro: colores fuera de `tokens.css` en mi área · [BAJO]
- **Dónde**: `src/components/welcome/CalendarScene.tsx:26,28,40,42` (`#1a73e8`, `#34c759`: colores de calendarios de muestra, pasan por `.cal-tone`, `base.css:129-131`, así que de noche se apagan solos: correcto), `src/components/feedback/FeedbackMode.tsx:51` (`'#8a5a2c'` solo si falta `--accent`: correcto), `src/components/feedback/composeShot.ts:38` (halo blanco bajo el trazo en el JPEG, intencionado para los dos temas), `src/styles/tokens.css:38-39` (`--flash: #fff`, documentado) y `:56-60` (`--lock-*`, la pantalla de bloqueo siempre de noche, documentado). En `welcome.css`, `feedback.css`, `toast.css`, `sheet.css`, `slider.css` y `shell.css`: ninguno.
- **Qué ve/hace el usuario**: nada que corregir.
- **Problema**: ninguno; se deja constancia.
- **Propuesta**: mover `'#8a5a2c'` a una constante `FALLBACK_INK` con comentario, por si cambia el coñac.
- **Esfuerzo**: S

### UI-43 · El mensaje «Dictado agotado…» se queda sin ruta · [BAJO]
- **Dónde**: `src/components/compose/useVoice.ts:31,67` (503 → «Dictado agotado por hoy. Vuelve a las 02:00.», sin acción).
- **Qué ve/hace el usuario**: no puede dictar hasta mañana; el toast no le recuerda que puede escribir (ni que Siri sigue funcionando con el analizador local).
- **Problema**: *dead end* suave.
- **Propuesta**: acción **Escribir** que enfoca la barra (`focusRequest`), o texto (es) «Dictado agotado por hoy (vuelve a las 02:00). Mientras, escríbela.» / (en) «Dictation is used up for today (back at 2:00 AM). Type it meanwhile.».
- **Esfuerzo**: S

## Lo que está bien (para no tocarlo)

- **Bienvenida**: portada que releva al `#boot` sin salto (`welcome.css:34-48` + `MARK_PATH`), «Saltar» siempre a mano, atrás, Escape, el botón principal en el mismo sitio en todas las láminas (`min-height: 2.9em` del texto), numeración en romanos que empieza en I tras actualizar, láminas que **se usan** (SwipeRow, WeekStrip, DurationPicker, el analizador de verdad), portada de novedades con «Ver lo nuevo» / «Saltar» y «Listo» al final, nada se marca como visto si el trozo no carga (`WelcomeUnavailable`), `inert` en la app y foco en el diálogo. Textos es/en equivalentes y con el mismo tono en todas las tablas `COPY` revisadas.
- **Sugerencias**: un solo botón grande en la tarjeta, la × con área de 44 px (`::after`), mano de muestra hasta el primer toque, un toque = círculo, «Sin rodear» como salida, el trazo sin pasar por React, la miniatura con lo que de verdad se envía, el error en línea con `role="alert"`, mensajes de fallo concretos (sin conexión, demasiadas, buzón lleno, código), `maxLength`, 20 s de tope, nada identificable en el envío, `reduced-motion` tratado explícitamente (`feedback.css:417-439`).
- **Sheet**: velo que es un botón con nombre («Cerrar»), Escape, asa que sigue al dedo y cierra por velocidad, resistencia hacia arriba, pie fijo sobre el teclado, lo escrito se guarda al cerrar por cualquier vía (`TaskSheet.close`, `PickerChip` al desmontar), `DictationConsent` sin cierre por exigencia de Apple (documentado).
- **PickerChip**: guardar al cerrar y no en cada giro de la rueda; `showPicker` solo con ratón.
- **Slider**: se coge desde toda la pista (44 px), valor sobre el dedo, teclado y `aria-value*`.
- **Skeleton**: `aria-busy` + «Cargando».
- **Iconos**: todos `aria-hidden` por defecto; los botones de solo icono llevan `aria-label`.
- **Avisos**: textos de cuándo toca vistos desde la hora del aviso («En 10 min · 17:00», «Era a las 17:00», «Pendiente desde ayer»), el aviso de cierre con tramo, resumen diario con las más importantes y «+N», botones en el idioma del aviso, «Sí, hecha» / «Todavía no» / «Hecha» de rutina sin abrir la app, «Deshacer» en Hecha y en Pasar a hoy, aviso de lugar con varias tareas que abre un panel con todas (y lo marcado se queda a la vista para deshacer).
- **Toasts**: un patrón único (tarjeta marino, una acción), Deshacer en borrar tarea, borrar rutina, borrar hechas, pasar a hoy, mover de día, dictado y Siri; «Ver» cuando lo añadido cae fuera de la vista; el fallo del micrófono lleva a **Ajustes**.

## Inventario de toasts

Duración única: 4,2 s (`Toast.tsx:5`). Z 50. «Veredicto» mira acción, visibilidad y duración.

| Mensaje (es) | Mensaje (en) | Dónde sale | Acción | Veredicto |
|---|---|---|---|---|
| Ya hay 50 rutinas: borra alguna para añadir otra. | You already have 50 routines: delete one to add another. | `App.tsx:267` | — | OK (largo: UI-06) |
| Rutina: 💊 Tomar creatina · Cada día · 10:00 | Routine: … | `App.tsx:278-283` | Deshacer (Bandeja) / Ver (resto) | REVISAR (UI-33) |
| Rutina: X (desde *Convertir en rutina*) | Routine: X | `App.tsx:295-302` | Deshacer | REVISAR: detrás de RoutineSheet (UI-01) |
| X → Mañana / Esta semana / Bandeja | idem | `App.tsx:311-318` | Ver | REVISAR (UI-40) |
| Cena · Hoy 20:00 / 3 tareas: a, b, c | Dinner · Today 8:00 PM / 3 tasks: … | `App.tsx:326-333` | Deshacer | OK |
| No te he entendido. | I didn’t catch that. | `useVoice.ts:102` | — | OK |
| Sin acceso al micrófono. | No microphone access. | `useVoice.ts:112-116` | Ajustes | OK |
| Permite el acceso al micrófono… / No se encuentra ningún micrófono. / Dictado agotado por hoy. Vuelve a las HH:MM. / No se ha podido transcribir el audio. / No se pudo dictar. / error.message | … | `useVoice.ts:119,190,193` | — | REVISAR (UI-10 alert; UI-43) |
| No te he oído. | I didn’t hear you. | `useVoice.ts:162` | — | OK |
| El dictado está tardando demasiado. Prueba otra vez. | Dictation is taking too long. Try again. | `useVoice.ts:174` | — | OK |
| El dictado no está disponible en este navegador. / Activa los avisos en Ajustes para dictar tareas. | … | `useVoice.ts:201-203` | — | REVISAR: el segundo pide ir a Ajustes y no lleva (acción «Ajustes» → `go('settings')`) |
| Enviada. ¡Gracias! | Sent. Thank you! | `FeedbackMode.tsx:150` | — | OK |
| Ya hay un lugar llamado X. | There’s already a place called X. | `PlaceSheet.tsx:143` | — | OK (sale al cerrar el panel) |
| Sin permiso de ubicación. | No location permission. | `PlaceSheet.tsx:169-173` | Ajustes | REVISAR: detrás del panel (UI-01) |
| No se ha podido abrir el mapa. | Couldn’t open the map. | `PlaceSheet.tsx:203` / `PlacesView.tsx:129` | — | REVISAR en PlaceSheet (UI-01) |
| «x» ya lo usa Y. | “x” is already used by Y. | `PlaceAliases.tsx:54` | — | REVISAR: detrás del panel (UI-01) |
| Google: un calendario nuevo en la Agenda | Google: a new calendar in your Agenda | `CalendarProvider.tsx:126` | — | OK (podría llevar «Elegir» → CalendarPicker) |
| No se pudieron activar/desactivar los avisos. / error.message | … | `PushProvider.tsx:99,113`, `NativePushProvider.tsx:69` | — | REVISAR (UI-10) |
| Hecha: Tomar creatina (rutina, desde «Hecha» del aviso) | Done: … | `useNotificationActions.ts:78-82` | Deshacer | OK |
| ¿Hecha: Tomar creatina? | Done: …? | `useNotificationActions.ts:86` | Sí | REVISAR (UI-04/UI-06) |
| Hecha: X (tarea) | Done: X | `useNotificationActions.ts:94-98` | Deshacer | OK |
| Aviso: Hoy 17:40 (+10 min) | Reminder: Today 5:40 PM | `useNotificationActions.ts:106` | — | OK |
| Vuelvo a preguntar a las 18:15 | I’ll ask again at 6:15 PM | `useNotificationActions.ts:116` | — | OK |
| ¿Has acabado X? | Finished X? | `useNotificationActions.ts:122` | Sí | REVISAR (UI-04) |
| Listo: tu calendario ya sale en la Agenda. | Done: your calendar now shows up in the Agenda. | `CalendarBlock.tsx:76` | — | OK |
| No se pudo crear el calendario «Tasks». Elige uno tuyo. | The “Tasks” calendar couldn’t be created. Pick one of yours. | `CalendarExportSheet.tsx:64` | — | REVISAR: detrás del panel (UI-01) |
| Aviso: Mañana 9:00 (SnoozeBar) | Reminder: Tomorrow 9:00 AM | `SnoozeBar.tsx:35` | — | OK |
| Esa hora ya ha pasado. | That time has already passed. | `ReminderPicker.tsx:78` | — | REVISAR: detrás del panel (UI-01) |
| Tarea borrada | Task deleted | `useTaskActions.ts:55-59` | Deshacer | OK |
| A hoy: X / N tareas pasadas a hoy | To today: X / N tasks moved to today | `useTaskActions.ts:84-88` | Deshacer | OK |
| Rutina borrada | Routine deleted | `useTaskActions.ts:116-120` | Deshacer | OK |
| No se pudo exportar la copia. | The backup couldn’t be exported. | `SettingsView.tsx:124` | — | REVISAR (UI-10) |
| Copia importada. | Backup imported. | `SettingsView.tsx:141` | — | REVISAR: sin Deshacer (UI-02) |
| No se pudo importar el fichero. / error.message | … | `SettingsView.tsx:143` | — | REVISAR (UI-10) |
| Todo borrado. | Everything deleted. | `SettingsView.tsx:155` | — | REVISAR: sin Deshacer (UI-02) |
| X → Mañana (soltar en la tira) | idem | `AgendaView.tsx:107-111` | Deshacer | OK |
| X → Mañana (soltar en el muelle) | idem | `InboxView.tsx:84-88` | Deshacer | OK |
| Hecha borrada / N hechas borradas | Done task deleted / N done tasks deleted | `InboxView.tsx:111-115` | Deshacer | OK |

Destructivos sin Deshacer: **Todo borrado**, **Copia importada** (UI-02). Con Deshacer invisible: **Rutina: X** desde *Convertir en rutina* (UI-01). Sin acción cuando la necesitan: «Activa los avisos en Ajustes para dictar tareas.», «¿Has acabado X?» (necesita también «Todavía no», UI-04).

## Inventario de controles

| Control | Pantalla | Qué hace | Veredicto |
|---|---|---|---|
| Empezar / Ver lo nuevo | Bienvenida · portada (`Welcome.tsx:233`) | Pasa a la lámina I | OK |
| Ya la conozco / Saltar | Bienvenida · portada (`:236`) | Cierra y marca vista | OK |
| ‹ Atrás | Bienvenida · barra (`:244`) | Lámina anterior o portada | OK (44 px, aria-label) |
| Barra de progreso | Bienvenida · barra (`:247-251`) | Solo informa | REVISAR (UI-29) |
| Saltar | Bienvenida · barra (`:252`) | Cierra y marca vista | OK |
| Continuar / Empezar / Listo | Bienvenida · pie (`:270-271`) | Siguiente o cierre | OK (54 px) |
| Compositor de muestra (botón redondo, Detalles) | Lámina I (`WriteScene.tsx:124-148`) | Nada | REVISAR (UI-25) |
| Detalles / asa | Lámina II (`DetailsScene.tsx:89-92,140-143`) | Despliega la ficha | OK |
| × (quitar detalles) | Lámina II (`:108-118`) | Vuelve a la frase | OK |
| Plegar (chevron) | Lámina II (`:150`) | Pliega la ficha | OK (44 px) |
| Chips Cuándo | Lámina II (`:162-172`) | Cambia el día | OK |
| Regla de duración | Lámina II (`:175-177`) | Cambia la duración | OK |
| Chips de aviso (quitar) / +30 min antes | Lámina II (`:181-192`) | Quita / añade | REVISAR (UI-32) |
| Fila «Desliza a la derecha» (círculo y gesto) | Lámina III (`SwipeScene.tsx:43-59`) | Tacha / destacha | OK |
| Fila «Desliza a la izquierda» | Lámina III (`:60-70`) | Borra y vuelve en 1,5 s | OK |
| Mes (botón con flecha) | Lámina IV (`MonthScene.tsx:45-54`) | Despliega/recoge el mes | OK |
| Tira / asa / días | Lámina IV (`:56-58`) | La de verdad | OK |
| Círculo de rutina | Lámina V (`RoutineScene.tsx:91-99`) | Tacha hoy | OK |
| Anillo del widget | Lámina V (`:127-138`) | Tacha la primera | OK |
| Tarjeta del widget | Lámina V (`:139-149`) | Tacha la primera | REVISAR (UI-36) |
| Zona de rodear | Lámina VI (`SuggestScene.tsx:111-118`) | Rodea una fila | REVISAR (UI-41, a11y) |
| Enviar | Lámina VI (`:159-161`) | «Enviada. ¡Gracias!» y reinicio | REVISAR (32 px, UI-13) |
| Conectar mi calendario / Enseñarlo / Sin permiso: abrir Ajustes / Conectado | Lámina VII (`CalendarScene.tsx:118-123`) | Permiso de iOS / activa / Ajustes / nada | REVISAR (UI-31) |
| Sugerir una mejora | Ajustes (`SettingsView.tsx:225-229`) | Entra en el modo | OK (nota debajo explica) |
| Ver la bienvenida | Ajustes (`:244-247`) | Abre la bienvenida entera | REVISAR (UI-28) |
| Señalar | Sugerencias · tarjeta (`FeedbackDock.tsx:46-49`) | Foto + capa de dibujo | OK (48 px, halo) |
| × Salir de las sugerencias | Sugerencias · tarjeta (`:50-52`) | Sale del modo | REVISAR (UI-23) |
| Capa de dibujo | Sugerencias · rodear (`FeedbackDraw.tsx:114-120`) | Trazo; toque = círculo | OK |
| Cancelar | Sugerencias · rodear (`:135-137`) | Vuelve a la tarjeta | OK (posición: UI-19) |
| Sin rodear | Sugerencias · rodear (`:138-140`) | Toda la pantalla → panel | OK (posición: UI-19) |
| Escape | Sugerencias · rodear (`:58-65`) | = Cancelar | OK |
| Miniatura × | Sugerencias · panel (`FeedbackSheet.tsx:77-79`) | No adjuntar la captura | OK (aria-label; 26 px + ::after 44) |
| Adjuntar la captura | Sugerencias · panel (`:91-95`) | Vuelve a adjuntar | OK |
| Rodear otra vez | Sugerencias · panel (`:87-90`) | Vuelve a la capa con el trazo | OK |
| Mensaje (textarea) | Sugerencias · panel (`:99-107`) | 2000 caracteres | OK |
| Enviar / Enviando… | Sugerencias · panel (`:67-69`) | POST; deshabilitado sin texto o sin foto lista | REVISAR (UI-21, UI-22) |
| Velo / asa / Escape del panel | Sugerencias · panel (`Sheet`) | Cierra → tarjeta, pierde lo rodeado | REVISAR (UI-03) |
| Velo «Cerrar» | Sheet (`Sheet.tsx:132-141`) | Cierra | OK |
| Asa | Sheet (`:150-160`, `sheet.css:45-51`) | Arrastra / cierra | REVISAR (UI-12) |
| Escape | Sheet (`:59-64`) | Cierra | REVISAR con selector abierto (UI-38) |
| Acción del toast | Toast (`Toast.tsx:45-57`) | Ejecuta y descarta | REVISAR (36 px, UI-13) |
| Texto del toast | Toast (`:44`) | Nada | REVISAR (UI-08) |
| Píldora PickerChip | Panel de tarea / ficha / Bandeja (`PickerChip.tsx:66-80`) | Abre fecha/hora nativa; guarda al cerrar | OK |
| Pista del Slider | Panel del lugar (`Slider.tsx:77-98`) | Arrastra, teclado, vibra | OK |
| +10 min / +1 h / Mañana 9:00 | Panel de tarea desde aviso (`SnoozeBar.tsx:28-41`) | Pospone y cierra | OK |
| Hecha | Panel de tarea desde aviso (`:42-54`) | Tacha y cierra | REVISAR (UI-14) |
| Aviso de tarea: Hecha / +10 min / Pasar a hoy | iOS y push web (`notifications.ts:44-49`, `sw.ts:81-84`) | Abre la app y aplica con toast | REVISAR (UI-16) |
| Aviso de cierre: Sí, hecha / Todavía no | iOS y push web (`notifications.ts:51-57`, `sw.ts:83`) | Sin abrir (iOS) / abre y aplica (web) | OK |
| Aviso de rutina: Hecha | iOS (`notifications.ts:58`) | Sin abrir | OK |
| Resumen diario: Pasar atrasadas a hoy | iOS y web (`notifications.ts:50`, `sw.ts:85`) | Abre y pasa todo a hoy con Deshacer | OK (silencio si no queda nada: UI-15) |
| Tocar un aviso sin botón | Todos (`useNotificationActions.ts:136-137`) | Abre la tarea con Posponer / el lugar / la Bandeja / toast «¿Has acabado?» | REVISAR (UI-04, UI-39) |
