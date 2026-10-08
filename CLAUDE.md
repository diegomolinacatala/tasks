# Tasks

To-do diaria para móvil y sin cuentas: las tareas viven en el propio dispositivo. Un mismo
código se publica de dos formas: PWA en GitHub Pages desde este repo público y app de iPhone
con Capacitor (TestFlight / App Store). Un Worker mínimo de Cloudflare envía los avisos push de
la PWA (solo ve horas y contenido cifrado) y transcribe el dictado.

- Producción web: https://diegomolinacatala.github.io/tasks/
- App de iPhone: `io.github.diegomolinacatala.tasks`, en la App Store desde el 27/09/2026:
  https://apps.apple.com/es/app/tasks-tareas-y-lugares/id6812776586. Pasos de TestFlight, ficha de
  la App Store y cómo publicar una actualización en `docs/app-store.md`.
- Idioma de la interfaz: **español**. Sin textos explicativos ni microcopy de relleno.
- Formato objetivo: **móvil en vertical**. El escritorio no es un caso a optimizar.

## Estado actual (28/09/2026)

**Hecho**

- App de iPhone completa: avisos locales, lugares, Siri, accesos rápidos, vibración, fichero de
  estado, widget, acción "Nueva tarea" de Atajos, CI hacia TestFlight, política de privacidad y
  ficha de la App Store. Tests: 516 de la app y 146 del Worker; la PWA probada en el navegador sin
  cambios de comportamiento.
- `capacitor` unida a `main` por tercera vez (fast-forward) el 21/09/2026: la web pública y el
  Worker llevan ya todo lo de abajo. Cada push a cualquiera de las dos que toque la app sube una
  compilación a TestFlight.
- **El CI despliega el Worker** desde `main`: secreto `CLOUDFLARE_API_TOKEN` y variable
  `CLOUDFLARE_ACCOUNT_ID` configurados y comprobados con "Run workflow" el 17/09/2026. A mano sigue
  valiendo `npm --prefix worker run deploy` desde `main` (wrangler está autenticado en el portátil).
- Apple Developer Program activo (cuenta individual de Diego Molina Catalá, Team ID
  `APD54YM4F3`). En App Store Connect existe la app **Tasks: tareas y lugares** (Apple ID
  `6812776586`, SKU `tasks-ios`, bundle id `io.github.diegomolinacatala.tasks`). App Group e
  identificador del widget registrados en developer.apple.com.
- Secretos de GitHub configurados: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` y la variable
  `APPLE_TEAM_ID`.
- TestFlight: la 8 fue la primera desde `main`, la 9 trae el widget y la 10 la acción de Atajos.
  El usuario la tiene instalada en su iPhone.
- Probado en el iPhone (17/09/2026): la app a grandes rasgos («funciona medio decente», sin lista
  de fallos), el widget, Siri ("añade una tarea en Tasks"), los tres toques atrás y el aviso al
  salir de un lugar con la app cerrada a la fuerza. Todo funciona.
- **Apuntar sin abrir la app** (18/09/2026, TestFlight 12, sin probar aún en el iPhone): Siri y la
  acción "Añadir tarea" de Atajos ya no abren la app (ver "Apuntar sin abrir la app"). Endpoint
  `POST /v1/interpret` en el Worker, desplegado el 21/09/2026.
- TestFlight 13 (18/09/2026): los avisos por hora del iPhone suenan (antes llegaban en silencio).
- **Pasar a hoy e importancia** (20/09/2026, TestFlight 14, sin probar aún en el iPhone): ver
  "Pasar a hoy" e "Importancia". Probado en el navegador (PWA): mover, deshacer, la vista semana,
  el modo "Aa" con arrastre y la escala del panel.
- **Duración y aviso de cierre** (20/09/2026, TestFlight 15, sin probar aún en el iPhone): ver
  "Duración y aviso de cierre". Probado en el navegador (PWA): la píldora del compositor con el
  tramo, el panel de Duración con atajos y "Hasta…", el tramo en la fila, tocar el aviso (`?ask=1`)
  y tachar desde su toast, y "Todavía no" (`?action=again`) alargando la tarea.
- **Banco del dictado con la IA real** tras el prompt de duraciones, en dos mitades para no agotar
  la cuota del día (21 y 22/09/2026): **73/75**, duración 75/75 (las 4 de duración bien y ninguna
  inventada en las demás). Fallos:
  - `presupuesto` ("en una hora" sin "avísame") falla igual con el prompt anterior: las reglas de
    AVISOS piden que el aviso se pida expresamente y las de HORA dicen que "en X" es un aviso con
    `inMinutes`. Arreglarlo toca AVISOS y pide el banco entero.
  - `abuelos` ("al mediodía", "el sábado por la noche") salió 12:00 y 20:00 una vez; repetido con
    el mismo prompt pasa dos de dos, y con el anterior, una de una. Es variación del modelo, no una
    regla que falle: si vuelve a salir, mirar las franjas del prompt.
  Local: 72/75, los 3 fallos de siempre.
- TestFlight 16 (21/09/2026): la primera desde `main` con todo lo anterior. La 17 (`capacitor`) y la
  18 (`main`), el mismo commit, traen además el tramo con franja ("de 9 a 11 de la noche"). La 18
  es la que hay que instalar para probar y la que se envía a revisión.
- **Capturas de la App Store** (21/09/2026) en `docs/capturas/`: siete a 1320 × 2868, en orden de
  subida, generadas con la app real y `scripts/app-store-shots.mjs`.
- **Enviada a revisión** (21/09/2026, 23:29): la 1.0 con la compilación 18 y publicación manual.
  Ficha, privacidad, precio (gratis, 175 países) y capturas de 6,9" puestas en App Store Connect.
- **Rechazada** (22/09/2026) con *2.1 Information Needed*, lo habitual en una cuenta nueva: Apple
  pide un vídeo en un iPhone y seis respuestas (propósito, cómo probar, servicios externos e IA,
  regiones…). Antes de responder se añadió el **permiso del dictado** (ver "Dictado"), por la norma
  5.1.2(i) sobre compartir datos con una IA de terceros. Respuesta, notas en inglés y guion del vídeo
  en `docs/app-store.md` §5 y §7.
- **Rechazada otra vez** (23/09/2026, compilación 20) por dos cosas concretas, ya corregidas el
  24/09/2026: **5.1.1(iv)**, el panel del dictado pedía permiso por su cuenta (*Permitir* / *Ahora
  no*) antes del del micrófono: ahora solo tiene **Continuar** y lleva siempre al de iOS; y **1.5**,
  GitHub Issues no vale como URL de soporte: ahora es `public/soporte.html`, con el correo
  `diegomolinacatala+tasks@gmail.com`. Pasos y respuesta en `docs/app-store.md` §8.
- **Reenviada** (25/09/2026, 13:30) con la compilación 24 (`main`), la URL de soporte nueva, las
  notas del §5 y la respuesta del §8.2: *Esperando revisión*.
- **Aprobada y publicada** (27/09/2026, 17:29): la 1.0 (compilación 24) está en la App Store, gratis,
  también en la UE (el estado de comerciante está bien: sale en España, Francia y Alemania).
  `MARKETING_VERSION` subido a 1.1 el 28/09/2026, porque la 1.0 ya no admite compilaciones nuevas.
- **La 1.1 ya figura como aprobada** en App Store Connect (el CI del 30/09/2026 lo dijo al subir:
  *train version '1.1' is closed*): `MARKETING_VERSION` subido a **1.2**. Comprobar en App Store
  Connect qué hay publicado.
- **Rediseño "old money"** (28/09/2026, commit `a49c254`): papel marfil, tinta azul marino, coñac y
  oro viejo; fechas y titulares en New York (serif del sistema); icono nuevo; arranque en frío sin
  saltos (ver "Arranque"); filas que se deslizan al reordenarse. Además, **arreglado** que al elegir
  una hora a mano se guardara otra (`PickerChip`: la rueda de iOS lanza `input` en cada giro).
- **Estructura nueva** (29/09/2026, en la rama `capacitor`, **TestFlight 28** con la versión 1.2; el
  Swift compila en el CI; sin probar aún en el iPhone ni unida a `main`, así que la web pública sigue
  con la interfaz anterior):
  cuatro pestañas (**Bandeja**, **Agenda**, **Lugares**, **Ajustes**, ver "Pantallas"); la Agenda al
  estilo de Structured (día arriba, tira de la semana deslizable, horario con cápsulas por duración,
  tiempo libre y la marca de ahora); **rutinas** (lo que se repite, con racha y widget de la pantalla
  de bloqueo que las tacha de un toque, ver "Rutinas"); **modo oscuro** (Ajustes → Apariencia: claro,
  oscuro o automático, ver "Estilo visual"); Lugares con mapa de Apple Maps y deslizador de radio;
  Ajustes como página; deslizar filas sin pasar por React (se "rallaba" en móviles modestos, ver
  "Gestos de fila") y filas memorizadas. **Arreglado** también que el widget de la pantalla de inicio
  forzaba la paleta de noche (texto marfil sobre marfil en modo claro), y que al hacer scroll el
  contenido pasara por detrás del reloj (ahora un velo de papel bajo la barra de estado). Probado en
  el navegador (PWA y `npm run dev`), en claro y en oscuro. **Capturas nuevas** en `docs/capturas/`:
  ocho (agenda, rutinas con el widget de bloqueo, lugares, "¿has acabado?", escribir, importancia,
  modo oscuro y widgets), con el reloj de la página fijado a las 11:20.
- **Emoji, barra de escribir, mes y bienvenida** (30/09/2026, commit `14fe2f2` en `capacitor`,
  **TestFlight 29**; el Swift compila en el CI; sin probar aún en el iPhone ni unida a `main`): las
  rutinas llevan **emoji** (ver
  "Rutinas"), que sale en la fila, el horario y los widgets en lugar de las iniciales; la **barra de
  escribir** es una píldora flotante que al tocarla aparta las pestañas y enseña los destinos (ver
  "Alta de tareas"); la tira de la semana **se despliega en el mes** (ver "Pantallas"); y la primera
  vez se abre una **bienvenida** interactiva en lugar de las tareas de ejemplo (ver "Bienvenida").
  Probado con Edge sin ventana y dedo simulado (claro, oscuro y 375 × 667); 620 tests. En el iPhone
  queda por ver el teclado con la barra nueva y los widgets con emoji.
- **Ficha de la 1.2 preparada** (30/09/2026): **nueve capturas** nuevas en `docs/capturas/` (entra
  `4-mes`; las rutinas y los widgets salen con emoji), y en `docs/app-store.md` la descripción y las
  palabras clave nuevas (§3), las notas para la revisión con la bienvenida y la barra nueva (§5) y
  las novedades y los pasos de la 1.2 (§9.4). La compilación que se envía es la **1.2 (29)**.
  `scripts/edge.mjs` ya cierra el navegador al acabar (`Browser.close`): antes quedaban Edge sin
  ventana vivos y la siguiente ejecución hablaba con uno viejo (su service worker servía la web de
  entonces); `app-store-shots.mjs` además limpia el origen antes de empezar.

- **Publicada la 1.2** (30/09/2026) con la compilación 29. `MARKETING_VERSION` subido a **1.3**.
- **Bienvenida también tras actualizar** (01/10/2026, en `capacitor`, **TestFlight 30**, la 1.3): a unos amigos
  no les salió. La 1.2 (29) solo la enseña en una instalación nueva (`loadState().fresh`), así que quien
  tenía la 1.1 y actualizó no la ve nunca. Ahora sale también al actualizar si trae láminas que ese
  dispositivo no ha visto (ver "Bienvenida"). Ningún estado guardado hasta ahora sabe nada de ella, así
  que con la 1.3 la ve entera todo el mundo, también quien ya la vio en la 1.2. `SCHEMA_VERSION` 11.
- **Ficha del compositor** (01/10/2026, en `capacitor`, **TestFlight 30**, la 1.3): **Detalles** o tirar del asa de
  la barra de escribir la despliega en una ficha con todo lo de una tarea (ver "Ficha del compositor"),
  como el mini reproductor de Spotify se abre en el reproductor. Lámina nueva en la bienvenida
  (*Detalles*, versión 2). Los campos del panel de la tarea se sacaron a piezas compartidas
  (`task/fields.tsx`, `DurationPicker` y `ReminderPicker` controlados) sin cambiar su comportamiento.
  Probado con Edge sin ventana y dedo simulado (claro, oscuro, 390 × 844 y 375 × 667: escribir,
  desplegar, cambiar campos, plegar, añadir tarea y rutina, el asa, la ×, y el panel de una tarea); 665
  tests.
- **Regla de la duración** (01/10/2026, en `capacitor`, **TestFlight 30**, la 1.3): los atajos de duración (dos
  filas de píldoras) pasan a ser una regla que se arrastra y se estira manteniendo el dedo al final (ver
  "Duración y aviso de cierre"), en el panel de la tarea, la ficha y la lámina *Detalles*. Y los
  ejemplos de la bienvenida nombran a Carlota. Probado con dedo simulado (arrastrar, estirar dos veces,
  soltar, quitarla, tocar, la ×; claro y oscuro, 390 × 844 y 375 × 667); 676 tests.
- **La 1.3 está aprobada** (compilación 30): el 03/10/2026 la subida respondió *train version '1.3' is
  closed*. `MARKETING_VERSION` subido a **1.4**.
- **Inglés, widget de la Bandeja y fluidez** (03/10/2026, en `capacitor`, **TestFlight 32**, la **1.4**; el Worker ya
  desplegado desde `main`). Lo pidió el usuario en una sola petición:
  - **Idioma** (Ajustes → *Idioma*: Automático, Español, English): toda la app, los avisos, los widgets,
    lo que dice Siri, la bienvenida y un **analizador en inglés** ("call mom tomorrow at 5pm, remind me
    15 minutes before", "every monday at 7am", "when I get to Walmart"). Ver "Idioma". `SCHEMA_VERSION`
    12. Páginas `public/support.html` y `public/privacy.html` en inglés.
  - **Widget Bandeja** (`InboxWidget.swift`): lo que no tiene fecha, con su círculo para tacharlo sin
    abrir la app; pequeño, mediano, grande y rectangular de bloqueo. Ver "App de iPhone".
  - **Fluidez en móviles modestos**: ver "Rendimiento". Medido con `scripts/perf.mjs` (CPU 6× más
    lenta, 230 tareas): en reposo ya no repinta (antes, cada fotograma), desplegar el mes pasa de 542 a
    ~130 ms de peor fotograma, volver a la Agenda de 216 a ~50 ms de respuesta, tachar de 64 a ~20.
  - Probado con Edge sin ventana y dedo simulado (inglés y español, instalación nueva con el sistema en
    inglés, la tira deslizando nada más desplegar el mes, arrastrar en la Agenda); 804 tests de la app y
    150 del Worker. Revisado por un segundo agente. El Swift nuevo (widget, textos, `en.lproj`)
    **compila en el CI** (el archivo salió bien; falló solo la subida, por la versión 1.3 cerrada).
  - **Probada en el iPhone** por el usuario con la TestFlight 32: «va bien».
- **Sugerencias** (03/10/2026, en `capacitor`, **TestFlight 33**, la 1.4; el buzón en el Worker de
  `main`): Ajustes → *Sugerir una mejora* deja ir a cualquier sitio de la app, rodear algo con el dedo
  sobre la pantalla congelada y escribir qué cambiarías. Llega con la captura y lo rodeado al **buzón**
  (https://tasks-push.diegomolina.workers.dev/buzon, con la clave de `worker/.feedback-key`) y se baja
  con `npm --prefix worker run feedback`. Ver "Sugerencias". Lo pidió el usuario para sus amigos.
  Probado con Edge sin ventana y dedo simulado contra el Worker local (español y claro, inglés y
  oscuro, rodear otra vez, cerrar y seguir, enviar, el buzón y la descarga); la captura del iPhone
  (`TasksNative.screenshot`) solo se puede probar allí.
  - **Probada en el iPhone** por el usuario con la TestFlight 33: la primera sugerencia llegó bien, con la
    captura y el círculo en su sitio. Pero le costó entender que primero había que tocar la píldora y
    luego rodear: ver la siguiente.
- **Sugerencias más claras y hora de inicio del día de las rutinas** (03/10/2026, en `capacitor`,
  **TestFlight 34**, la 1.4), las dos pedidas por el usuario tras probar la 33:
  - La píldora de arriba pasa a ser una **tarjeta abajo** ("Ve a lo que quieras comentar", con un solo
    botón grande, **Señalar**, que late un par de veces), y al dibujar una **mano de muestra** traza una
    vuelta en el centro hasta el primer toque. Además, el tamaño de pantalla que se manda es el de
    cuando se rodeó (antes salía encogido por el teclado). Ver "Sugerencias".
  - Bajo las rutinas de la Bandeja, una nota discreta: *Se renuevan a las 00:00*; tocar la hora la
    cambia (`Settings.dayStart`, `SCHEMA_VERSION` 13). Con "04:00", lo tachado a la 1 de la madrugada
    cuenta para la víspera. Ver "Rutinas". Sin opción en Ajustes: lo pidió así, integrado.
- **Lista para enviar la 1.4** (03/10/2026, en `capacitor`, **TestFlight 35**): el usuario probó la 34 y
  pidió subir la actualización con capturas que vendan de verdad.
  - **Bienvenida**: lámina nueva *Sugerencias* (`SuggestScene`, versión 3): una lista de mentira con
    «Cena con Carlota» arriba, que una mano de muestra rodea hasta que se toca; al rodear una fila sale
    la sugerencia lista para enviar. Quien venga de la 1.3 ve *Hay cosas nuevas* y solo esa lámina.
  - **Capturas nuevas**, diez en español (`docs/capturas/`) y diez en inglés (`docs/capturas/en/`),
    numeradas `01-…`/`10-…` para que se arrastren en orden. Ordenadas para vender: primero lo que la
    hace distinta (escribir como se habla, con la cena con Carlota; avisos por lugar; el día de un
    vistazo), después hábitos, widgets, el aviso de cierre, la ficha, el mes, la importancia y la
    privacidad. Textos en `scripts/store-copy.mjs`; datos de ejemplo en los dos idiomas.
  - **Ficha**: descripción reescrita en el mismo orden (§3 y §3.1 de `docs/app-store.md`), texto
    promocional y novedades nuevos, y el paso a paso para enviarla en §9.6.
- **La 1.4 está aprobada** (05/10/2026): `MARKETING_VERSION` subido a **1.5**.
- **Plazos, otros nombres de lugar, elegir en el mapa e historial de rutinas editable** (05/10/2026, en
  `capacitor`, **TestFlight 37**, la 1.5; el CI compiló `MapPicker.swift` y el widget sin errores). Lo
  pidió el usuario en una sola petición; lo del mapa real también lo pidió un amigo por el buzón (04/10/2026).
  - **Plazos** (`Task.until`, `lib/period.ts`, `SCHEMA_VERSION` 14): "esta semana", "hasta el viernes",
    "del lunes al viernes" (con artículos; sin ellos es una rutina). La tarea va sola con hoy hasta
    hacerla y solo queda atrasada pasado el último día. Ver "Plazos".
  - **Otros nombres** de un lugar (`Place.aliases`: "el piso", "casa de mis padres") y lo dictado con
    otra grafía ("Carrefur") casa con el guardado (`matchPlace`). Ver "Lugares".
  - **Elegir en el mapa** (`MapPicker.swift`, `TasksNative.pickLocation`): Apple Maps a pantalla
    completa, chincheta fija, tocar un punto o un comercio (da su nombre), círculo del radio. Desde el
    panel del lugar y tocando el mapa de la pestaña (añade uno nuevo). Sin lugares y con permiso, la
    pestaña enseña el barrio en lugar del dibujo.
  - **Historial de rutinas editable** (`RoutineLog.tsx`): en *Constancia*, tocar un día lo marca o
    desmarca, pasar el dedo de lado marca varios y las flechas van a semanas anteriores (un año). Para
    rehacer una rutina borrada sin querer. Ver "Rutinas".
  - Probado con Edge sin ventana y dedo simulado (claro y oscuro, 390 × 844): la fila con "Hasta el
    jueves" y "Último día", el panel con "Hasta…", la barra con "La semana que viene", la ficha, pintar
    una semana en la rutina (racha 7), las flechas, los otros nombres. 896 tests. Revisado por un segundo
    agente (sin errores de compilación de Swift a la vista; arreglado lo que encontró: "Todavía no" en un
    plazo, "el viernes de esta semana", "Piso 1" frente a "Piso 2", la dirección vieja al confirmar el
    mapa). El mapa nativo solo se puede probar en el iPhone.
- **Lo del buzón** (05/10/2026, en `capacitor`, la 1.5): tres sugerencias de amigos, todas hechas.
  - *"…al aguantar encima de la tarea un tiempo se coja y la puedas arrastrar"* (un diestro reordenaba
    sin querer al hacer scroll con el pulgar por el borde): **fuera el asa**, las tareas y las secciones se
    cogen manteniéndolas pulsadas. Ver "Drag & drop". En la TestFlight 37.
  - *"Debería estar por defecto también cada semana…"*: atajo **"Los martes"** (una vez por semana, el día
    de la tarea o el de hoy) en el panel de la rutina y en la ficha, y "cada semana" al escribir. En la 37.
  - *"…que no tuviera una lista que tiende a infinito en mis tareas tachadas"*: en la Bandeja, lo tachado
    otros días se pliega en **"12 hechas"** (`foldDone`); lo de hoy sigue a la vista. Después de la 37.
  - Probado con Edge sin ventana y dedo simulado: un deslizamiento rápido no coge la fila, mantenerla y
    arrastrar la recoloca sin abrirla, el pliegue se abre. 899 tests.
- **Ficha de la 1.5 preparada** (05/10/2026): **diez capturas** nuevas en `docs/capturas/` y `en/`, con
  una nueva, `04-plazos` («Para esta semana, no para un día»), en lugar de la del mes; los datos de
  ejemplo llevan dos tareas con plazo y otros nombres en Casa. En `docs/app-store.md`: descripción y
  texto promocional nuevos (§3 y §3.1), notas para la revisión (§5, mantener pulsado, plazos, mapa; 3934
  caracteres) y el paso a paso con las novedades en §9.7. Se envía la **1.5 (38)**.
- **El calendario del iPhone en la Agenda y el + de cada sección** (08/10/2026, en `capacitor`, la 1.5; sin
  probar aún en el iPhone). Lo pidió el usuario "muy orgánico, que no abrume", con un tutorial claro para
  añadir Google u Outlook al Calendario de iOS (casi nadie lo tiene) y plegado en Ajustes:
  - **Calendario** (`lib/calendar.ts`, `CalendarBridge.swift`, `CalendarReader.swift`): EventKit, solo
    lectura, en el propio iPhone. Los eventos salen en el **horario** con el color de su calendario
    apagado y cuentan para el tiempo libre; los de todo el día, como cintas encima del día; un **punto** en
    los días de la tira y del mes que tienen algo; tocar uno abre la ficha de Calendario de iOS. En
    **Ajustes → Calendario**: conectar, encender o apagar, elegir calendarios y, plegado en una fila,
    **Añadir Google u Outlook** (paso a paso con la ruta de Ajustes y un dibujo de lo que hay que tocar).
    El **widget Hoy** enseña lo siguiente (uno en el mediano, dos en el grande, una línea en el de
    bloqueo). Lámina nueva en la bienvenida (*Calendario*, versión 4, solo en el iPhone) con el botón
    para conectarlo. Ver "Calendario del iPhone". `SCHEMA_VERSION` 15.
  - **+ en cada sección** de la Agenda: abre la barra con esa sección como destino ("Añadir a Compra").
  - Probado con Edge sin ventana y el calendario de muestra (`calendarDemo.ts`): conectar, el tutorial,
    elegir calendarios, los eventos en el horario y de todo el día, los puntos del mes, el + de una
    sección, la lámina en español e inglés, claro y oscuro. 934 tests. Revisado por un segundo agente (sin
    errores de compilación a la vista; arreglado lo que encontró: la foto que escribe `headless.js` borraba
    el calendario del widget, el widget no se enteraba de cambios hechos en otro dispositivo, y la PWA cargaba
    la bienvenida solo para cerrarla). El Swift solo se puede compilar en
    el CI y probar en el iPhone.

**Pendiente, en este orden**

0. **Probar el calendario en el iPhone** con la TestFlight que salga de este push: Ajustes → Calendario →
   conectar (sale el permiso de iOS), que los eventos salgan en el horario y los de todo el día arriba,
   tocar uno (se abre la ficha de Calendario y se puede editar; al cerrarla, la Agenda se pone al día),
   ocultar un calendario, añadir una cuenta de Google siguiendo el paso a paso y volver (aviso de
   calendarios nuevos), el widget Hoy mediano y grande con un evento próximo, y la lámina *Calendario*
   tras actualizar. Y el + de una sección: que salga el teclado en el mismo toque. Si el widget no
   enseñara eventos (EventKit en la extensión), la foto lleva una copia de la semana: mirar `WidgetStore.events`.
   Después, **enviar la 1.5** con `docs/app-store.md` §9.7.
1. **Probar la 1.5 (38)**. Antes, **probar la 1.5 en TestFlight** (plazos, otros nombres, mapa, historial editable, mantener pulsado para
   arrastrar, atajo "Los martes" en rutinas, tachadas plegadas en la Bandeja). En el iPhone: mantener
   pulsada una tarea (que vibre y se coja, que el scroll por el borde ya no la mueva); "Elegir en el mapa" en un lugar
   (arrastrar, tocar un punto, tocar un comercio y que dé su nombre, "Mi ubicación", el círculo del
   radio, claro y oscuro), tocar el mapa de la pestaña Lugares para añadir uno; una tarea "esta semana"
   en el widget de hoy (que al día siguiente siga sin salir en rojo); una con plazo y hora, que avise
   cada día; dictar "al llegar al piso…" con el otro nombre puesto.
1. **Enviar la 1.4 (35)** siguiendo `docs/app-store.md` §9.6 (lo hace el usuario: capturas, descripción,
   ficha en inglés, privacidad con *Atención al cliente*, notas, compilación 35). Antes, en la 35, la
   lámina *Sugerencias* tras actualizar. Lo de abajo, si no se probó en la 34:
   **Probar la TestFlight 34**: Ajustes → *Sugerir una mejora*, ir a otra pestaña, tocar **Señalar** en
   la tarjeta de abajo (destello, pantalla congelada con marco de coñac y la mano de muestra), rodear algo, ver la miniatura
   con el trazo en el panel, quitarla y volver a ponerla, enviar, y que llegue al buzón con la captura.
   Abrir el buzón en el iPhone (Safari → la dirección de arriba → pegar la clave → Compartir → *Añadir a
   pantalla de inicio*). Si va bien, enviar la 1.4 (`docs/app-store.md` §9.3 y §9.6: **privacidad con
   *Atención al cliente***, notas nuevas de §5 y ficha en inglés de §3.1). Las rutinas: tocar la hora de
   *Se renuevan a las 00:00* en la Bandeja, ponerla a las 4:00, y que el widget de rutinas siga
   tachado pasada la medianoche hasta las 4:00. Mirar también lo de la 1.3, que ya está aprobada: en la barra de escribir: tocar
   **Detalles** con el teclado fuera (se tiene que soltar y subir la ficha), tirar del asa, elegir hora
   en la rueda dentro de la ficha, plegar y añadir desde la barra con el resumen, y una rutina desde
   la ficha. La regla de la duración: que arrastrar no mueva el panel, que la vibración de cada paso no
   canse y que mantener al final se note (halo de oro y vibración al estirarse). Después, unir
   `capacitor` a `main` para que la web pública lleve la misma interfaz (`main` ya tiene el commit del
   Worker, cogido aparte: la unión será un merge, no un fast-forward).
2. Subir a TestFlight (push a `main`) y **comprobar que el CI compila el Swift nuevo** (widget de
   rutinas, `ToggleRoutineIntent`, `setAppearance`, `mapSnapshot`, `NotificationResponder`). Probar en
   el iPhone: las cuatro pestañas; deslizar filas y la tira de la semana; el modo oscuro (también la
   pantalla de carga, la rueda de la hora y el teclado); una rutina con hora ("tomar creatina todos
   los días a las 10") y su aviso con **Hecha** sin abrir la app; el widget **Rutinas** en la
   pantalla de bloqueo (tocarlo la tacha; al día siguiente amanece sin tachar); el mapa de Lugares;
   el widget de hoy en claro y en oscuro. iOS guarda en caché la pantalla de carga: si sale la
   antigua, reiniciar el iPhone.
3. Probar en el iPhone lo de `docs/app-store.md` §2 "Apuntar sin abrir la app" (el usuario crea el
   atajo *Dictar tarea* con los pasos de §2.1), "Pasar a hoy", "Importancia" y el aviso de cierre.
   Lo más delicado: el botón **A hoy** del widget corre en el proceso de la app
   (`LiveActivityIntent`); si no hiciera nada, ver "Pasar a hoy". Del aviso de cierre, mirar si
   **Sí, hecha** y **Todavía no** salen al mantener pulsada la notificación (la categoría
   `task-ask` se registra al abrir la app: hay que abrirla una vez tras instalar) y, desde la
   compilación con `NotificationResponder`, que respondan **sin abrir la app**, también con el
   iPhone bloqueado. Si no hicieran nada, sospechar del delegado (que Capacitor lo recoloque).
4. Concretar qué falla en el iPhone («medio decente») y confirmar lo que queda del checklist de
   `docs/app-store.md` §2: aviso al llegar a un lugar, tocar avisos con la app cerrada y que las
   tareas sigan ahí tras forzar el cierre.

Cualquier cambio de la app llega a la App Store con una versión nueva: `docs/app-store.md` §9. En
cuanto Apple apruebe una, subir `MARKETING_VERSION` (1.4 → 1.5…) antes del siguiente push que toque
la app: App Store Connect rechaza compilaciones de una versión aprobada (también fallaría la
ejecución programada).

**Ideas aplazadas**: sincronización por iCloud (CloudKit), refresco en segundo plano para
reprogramar avisos, rutinas desde Siri y el dictado con IA (hoy solo el analizador local reconoce
"todos los días"), la IA del dictado entendiendo plazos (hoy los pone el analizador del móvil, ver
"Plazos") y un mapa que se mueva dentro de la pestaña Lugares (hoy es una foto que abre el de verdad).

## Trabajar en este repo

- **Sin Mac.** El usuario solo tiene un portátil Windows y un iPhone. Lo nativo se compila en
  GitHub Actions y se prueba en su iPhone con TestFlight. Guíale con pasos exactos, clic a clic.
- **No hay `gh`** en esta máquina. Para seguir el CI: API pública sin autenticar (60 peticiones
  por hora: sondear cada 60 s como poco), `/actions/runs?branch=…&head_sha=…`, `/runs/<id>/jobs`
  y los errores en `/check-runs/<job>/annotations` (`scripts/xcodebuild.sh` los emite como
  anotaciones). Si se agota el límite, leer la página de Actions con WebFetch.
- **Antes de commitear**: `npm test && npm run typecheck && npm run build` encadenado con `&&`.
  Un `;` en la cadena llegó a subir un commit que no compilaba.
- **Editar con Edit/Write** o con un script en un fichero. `node -e` dentro de bash rompe los
  textos con backticks o `${…}`.
- El usuario escribe en español y quiere respuestas en español.

## Comandos

```bash
npm run dev        # servidor local en http://localhost:5173/tasks/ (sin service worker)
npm test           # tests unitarios (vitest, entorno node)
npm run coverage   # cobertura de src/lib y src/state
npm run typecheck  # tsc de la app y del service worker (tsconfig.sw.json)
npm run build      # typecheck + build de producción a dist/
npm run build:native  # typecheck + web para la app (dist-native/) + headless.js + cap sync ios
npm run build:headless  # solo dist-native/headless.js, comprobado sin navegador (scripts/check-headless.mjs)
npm run icons      # regenera public/icons/*, los iconos de iOS (claro y oscuro) y la señal de carga (Edge sin ventana)
node scripts/app-store-shots.mjs  # capturas de la App Store en docs/capturas/ (compila con --mode shots en dist-shots/); --en, las inglesas en docs/capturas/en/
node scripts/perf.mjs 6 3         # fluidez con la CPU 6× más lenta, mediana de 3 pasadas (antes: build + preview en :4173)

node scripts/vapid-keys.mjs     # par de claves VAPID nuevo (la privada solo a wrangler secret)

cd worker
npm test                        # tests del Worker
npm run dev                     # wrangler dev en :8787 con D1 local (las alarmas también funcionan)
npm run db:init:local           # crea las tablas en la D1 local
npm run db:init:query           # crea las tablas en remoto si --file falla por red ("fetch failed")
npx wrangler tail               # registros en vivo: PUT /v1/schedule, "avisos {...}", "push no enviado"
npm run eval -- --local         # banco de frases dictadas contra el analizador local (gratis)
npm run eval -- cena vuelo      # esos casos contra Workers AI real (EVAL_MODEL=@cf/... para otro modelo)
npm run feedback                # baja el buzón de sugerencias a feedback/ (-- --archive las borra después)
npm run eval -- --all           # todos: ~10.500 neuronas, más que la cuota gratuita de un día: mejor en dos mitades, una tras las 00:00 UTC (ver Dictado)
```

Para probar avisos en local: `worker/.dev.vars` con la salida de `vapid-keys.mjs` más
`VAPID_SUBJECT` (ignorado por git), `.env.local` con `VITE_PUSH_API=http://localhost:8787`, y `npm run build && npm run preview`
(el service worker solo existe en el build).

## Stack

| Pieza | Elección | Motivo |
|---|---|---|
| UI | React 19 + TypeScript + Vite | estándar, estático, build simple |
| Drag & drop | dnd-kit (core + sortable) | sensores táctiles resueltos: pulsación mantenida, auto-scroll, teclado |
| Persistencia | IndexedDB vía `idb-keyval`, con `localStorage` de reserva | offline real, sin servidor |
| PWA | `vite-plugin-pwa` con `injectManifest` (`src/sw.ts`) | instalable, offline y receptor de push |
| Avisos | Cloudflare Worker + D1 + alarma de Durable Object, `@block65/webcrypto-web-push` | iOS solo despierta una PWA cerrada con Web Push desde un servidor |
| App de iPhone | Capacitor 8 con Swift Package Manager + plugin propio `TasksNative` | mismo código que la PWA; lo que la web no puede (avisos por lugar, notificaciones locales, Siri) |
| Siri sin abrir la app | JavaScriptCore con `headless.js` | la misma lógica TypeScript fuera del WebView, sin reescribirla en Swift |
| Tests | Vitest en entorno node | la lógica pura es lo que se testea |

Sin router (cuatro pestañas en una sola pantalla), sin librería de estado, sin framework CSS,
sin fuentes externas (la serif es la del sistema). El JS principal de la PWA debe seguir en ~130 kB
gzip (147,9 el 08/10/2026, con el calendario: lo del iPhone va aparte en `calendarNative.ts`; 144,7 antes;
143,9 el 05/10/2026, con los plazos; 141,8 el 03/10/2026, con los textos en inglés; el analizador en inglés y las sugerencias van aparte. 134,2 el
01/10/2026 con `npm run build`, con la barra que se despliega en la ficha; 132,6 el
30/09/2026, con el mes desplegable, los destinos de la barra y el emoji): lo que solo existe en el
iPhone (adaptadores de `lib/platform`, `NativePushProvider`, `inboxFile.ts`) y lo que se abre poco
(Lugares, Ajustes, el panel de la rutina, el mando del modo "Aa", la bienvenida, la ficha del
compositor) se carga con `import()` o `lazy`. Los campos de tarea (`task/fields.tsx` y los pickers)
van en un trozo que comparten el panel de la tarea y la ficha.
La Bandeja y los paneles de tarea y sección van en su propio trozo, pedido nada más pintar la Agenda
(`loadSheets` en `App.tsx`): no esperan al toque.

## Arquitectura

```
src/
├── types.ts              # Task, Reminder, Section, Place, Routine, Theme, LanguageSetting, TabId, AppState
├── sw.ts                 # precache + push + notificationclick
├── headless.ts           # entrada de headless.js (JavaScriptCore): Siri sin abrir la app
├── lib/                  # lógica pura + adaptadores de navegador
│   ├── i18n.ts           # idioma vigente (es/en), automático según el sistema, `pick` de textos
│   ├── date.ts           # ISO local YYYY-MM-DD / HH:MM, semana que empieza en lunes, nombres en los dos idiomas
│   ├── compose.ts        # destinos del compositor ("Hoy", "Mañana", "Jue 2", "Sin fecha") y "Añadir a…"
│   ├── details.ts        # la ficha del compositor: campos, reglas entre ellos, resumen y lo que se añade
│   ├── emoji.ts          # emoji de una rutina: sanearlo, los del selector y el que le pega a un nombre
│   ├── order.ts          # scopes, reordenación, pasar a otro día (`rescheduled`) y deshacerlo
│   ├── period.ts         # plazos: el día en que se ve una tarea, cuándo queda atrasada, cómo se dicen
│   ├── importance.ts     # escala 1–10: tamaño del título, arrastre del mando
│   ├── duration.ts       # cuánto dura, cuándo acaba y cuánto se alarga al decir "todavía no"
│   ├── ruler.ts          # la regla de la duración: tramos que se estiran, paso, minutos en un punto y marcas
│   ├── routines.ts       # rutinas: qué días tocan, diario de hechos, racha, constancia, puntos
│   ├── repeat.ts         # "todos los días a las 10", "los lunes y jueves" → rutina
│   ├── timeline.ts       # horario de un día: lo que tiene hora (también los eventos), tiempo libre y "ahora"
│   ├── calendar.ts       # calendario del iPhone: validar lo de EventKit, repartirlo por días, ventana, widget
│   ├── theme.ts          # apariencia: claro, oscuro o del sistema; cambio con un círculo de tinta
│   ├── mapFrame.ts       # dónde van las chinchetas en el plano dibujado (sin Apple Maps)
│   ├── reminders.ts      # resolver avisos, agenda futura, atajos, posponer
│   ├── parse.ts          # lenguaje natural del compositor ("mañana a las 5"); elige analizador por idioma
│   ├── parseCore.ts      # el motor que comparten los dos: escáner de tramos y montaje de la tarea
│   ├── parseEn.ts        # el analizador en inglés (trozo aparte), con su título y sus lugares
│   ├── when.ts           # piezas de parse.ts: horas, plazos y días
│   ├── whenEn.ts         # lo mismo en inglés: "5pm", "an hour and a half", meses y días
│   ├── title.ts          # título limpio: muletillas, "tengo que acudir a una cena" → "Cena"
│   ├── interpret.ts      # valida en el móvil las tareas que devuelve la IA del Worker
│   ├── normalize.ts      # minúsculas, sin tildes, números en palabras → dígitos
│   ├── schedule.ts       # agenda de avisos: contenido, resumen diario, aviso de cierre, rutinas, badge
│   ├── places.ts         # lugares: nombres y otros nombres, coincidencia tolerante, saneado, distancia y regiones
│   ├── placePhrase.ts    # "al pasar por Mercadona", "cuando salga de casa" (lo usa parse.ts)
│   ├── nativeSchedule.ts # plan de notificaciones del iPhone: 64 pendientes, 20 regiones, ids
│   ├── nativeEvents.ts   # valida lo que llega de Siri, accesos rápidos, avisos y el widget
│   ├── widget.ts         # foto de tareas y rutinas para los widgets y cambios hechos desde ellos
│   ├── inbox.ts          # bandeja de lo hecho fuera de la web (altas, pasar a hoy) y cómo aplicarlo
│   ├── inboxFile.ts      # el fichero de la bandeja (solo iPhone): validarlo y cuándo vaciarlo
│   ├── headless.ts       # apuntar o pasar a hoy sin abrir la app: bandeja, avisos, icono y widget
│   ├── platform/         # adaptadores de Capacitor (solo iPhone): avisos, fichero, vibración, el mapa para elegir (`mapPicker.ts`),
│   │                     # el calendario (`calendar.ts`; `calendarNative.ts` en el iPhone, `calendarDemo.ts` en local)…
│   ├── voice/            # WAV, captura de micrófono, Web Speech API
│   ├── backup.ts         # exportar/importar y saneado (= migración de esquema)
│   ├── persistence.ts    # IndexedDB + fallback; en iPhone, además un fichero; escrituras en serie
│   ├── transition.ts     # View Transitions API con degradación
│   ├── boot.ts           # funde el arranque (#boot de index.html) y hace entrar la app; el trazo de la señal
│   ├── welcome.ts        # qué bienvenida toca al abrir: entera la primera vez, lo nuevo tras actualizar
│   ├── feedback.ts       # sugerencias: el trazo, la zona rodeada, qué se cuenta de ella y el envío al buzón
│   ├── flip.ts           # filas que se deslizan a su sitio al completar, añadir, borrar o pasar a hoy
│   └── push/             # cifrado, cliente HTTP, suscripción, claves, sincronización
├── state/                # reducer, acciones, selectores, provider; LanguageProvider (idioma y `useCopy`)
└── components/           # por dominio:
    ├── shell/            # TabBar (pestañas), teclado, acciones nativas, bandeja de Siri
    ├── views/            # AgendaView (+ WeekStrip y StripDay, Timeline, AllDayEvents, useDayBoard), InboxView (+ DayDock)
    ├── calendar/         # CalendarProvider: permiso, calendarios y eventos del mes que se mira (`useCalendar`, `useDayEvents`)
    ├── routines/         # RoutinesBlock, RoutineRow (puntos de la semana), RoutineSheet, RoutineLog (constancia editable), EmojiPicker
    ├── welcome/          # Welcome (portada y láminas) y sus escenas: escribir, detalles, gestos, mes, rutinas, sugerencias y calendario
    ├── compose/          # Composer (la barra), ComposeSheet (la ficha), usePullUp (el asa), dictado
    ├── task/             # SwipeRow + useSwipe (gesto), TaskShell, TaskRow, TaskSheet, rowActions, fields (campos compartidos)
    ├── places/           # PlacesView (mapa + tarjetas), MapSnapshot, PlaceSheet (radio con deslizador), PlaceAliases
    ├── settings/         # SettingsView (página), AppearancePicker, LanguagePicker, avisos, CalendarBlock (+ CalendarPicker, CalendarGuide, Switch), dictado
    ├── feedback/         # FeedbackMode (píldora y fases), FeedbackDraw (rodear), FeedbackSheet, describe, composeShot
    └── ui/ …             # Sheet, Slider, Toast, PickerChip, iconos; importance, section, push, dnd
ios/App/App/              # proyecto de Xcode: TasksNativePlugin.swift, AppIntents.swift, MapPicker.swift, CalendarBridge.swift, Info.plist…
                          # QuickAdd, HeadlessCore, InboxStore, DictationServer, NotificationPlan: Siri sin abrir la app
ios/App/TasksWidget/      # widgets Hoy, Bandeja (InboxWidget) y Rutinas; WidgetStore, WidgetText, CalendarReader y
                          # MoveOverdueWidgetIntent se compilan también en la app
ios/App/*/en.lproj/       # inglés de lo que enseña iOS por su cuenta: Siri, Atajos, permisos, accesos rápidos
docs/app-store.md         # TestFlight, secretos, ficha, privacidad y pasos para publicar
docs/capturas/            # capturas de la App Store (1320 × 2868), en orden de subida
public/privacidad.html    # política de privacidad (URL que pide la App Store); privacy.html, en inglés
public/soporte.html       # página de soporte con correo de contacto (URL de soporte de la App Store); support.html
scripts/perf.mjs          # fluidez con la CPU frenada: tareas largas, respuesta a cada toque y peor fotograma
scripts/xcodebuild.sh     # xcodebuild con log completo y errores como anotaciones del CI
scripts/sign-archive.sh   # firma ad hoc del archivo con los entitlements antes de exportar
scripts/brand.mjs         # la marca (señal a pluma) en SVG: icono, favicon, pantalla de carga y #boot
scripts/edge.mjs          # Edge sin ventana por CDP y PNG sin dependencias (iconos y capturas)
scripts/app-store-shots.mjs # capturas de la App Store; plantillas en store-frames.mjs y store-widgets.mjs
worker/                   # Cloudflare Worker de avisos (paquete npm independiente)
├── src/prompt.ts         # reglas, calendario y ejemplos que recibe la IA del dictado
├── src/interpret.ts      # esquema JSON, llamada al modelo y validación de su salida
├── src/inbox.ts          # la página del buzón de sugerencias (/buzon)
├── scripts/feedback.mjs  # baja el buzón a feedback/ (fuera de git), una ficha .md y su captura por sugerencia
└── eval/                 # banco de frases dictadas con la respuesta esperada (`npm run eval`)
```

### Estado

Un único `useReducer` con `AppState` inmutable en `src/state/reducer.ts`, expuesto por
`StoreProvider`. Cada cambio se persiste con debounce de 250 ms y se fuerza el guardado en
`pagehide` y `visibilitychange` (el sistema puede matar la pestaña sin avisar).

**Nunca mutar**: todas las operaciones devuelven objetos nuevos. Los tests lo comprueban.
Las acciones que dependen de la hora (`task/snooze`) llevan `now` dentro para que el
reducer siga siendo puro.

Cambiar el esquema = subir `SCHEMA_VERSION` y rellenar los campos nuevos en
`normalizeState` (`src/lib/backup.ts`), que se aplica tanto al cargar como al importar.

### Orden de las tareas (`src/lib/order.ts`)

`Task.order` es relativo a un *scope*:

- tarea con fecha → un scope por `(día, sección)`
- tarea sin fecha → un único scope plano `backlog`

Por eso `tasksOn()` solo garantiza que lo pendiente va antes que lo completado: el orden
entre secciones distintas no es comparable. Cada vista ordena lo que muestra.

### Pantallas

Cuatro pestañas (`TabId`) en la barra inferior, con un filete de oro que se desliza bajo la elegida
(`TabBar`). Cada una se monta la primera vez que se abre y después se conserva con `<Activity>` de
React (su estado y su scroll, que `App` guarda al salir). Tocar la pestaña en la que ya estás vuelve
arriba y, en la Agenda, a hoy. Se abre en la **Agenda**.

- **Bandeja** (`InboxView`): lo que no tiene día. Arriba, **Rutinas** (ver "Rutinas"); debajo,
  **Tareas** sin fecha, ordenables manteniéndolas pulsadas. Al arrastrar una sube un **muelle** con los
  próximos siete días (`DayDock`): soltarla en uno la planifica. Lo tachado otros días se pliega en una
  línea ("12 hechas", `foldDone`) que se abre al tocarla; con más de una hecha, "Borrar las N hechas".
- **Agenda** (`AgendaView`), como Structured: el mes arriba, el día elegido en grande ("Hoy martes
  29", "Mañana miércoles 30", "Jueves 1 octubre") y la **tira de la semana** (`WeekStrip`): letra,
  número y un anillo que se cierra con lo hecho; lo pasado con pendientes, en ladrillo. Se desliza
  a los lados para cambiar de semana (conserva el día de la semana) y cada día es un sitio donde
  soltar una tarea arrastrada. **Se despliega en el mes entero** (ver "El mes desplegado"). Debajo, el
  filete con el avance del día y:
  1. `Atrasadas` (solo hoy), en rojo, con **Pasar a hoy**. Se puede sacar de aquí pero no soltar
     dentro: sus tareas conservan la fecha hasta que se mueven.
  2. `Horario` (`Timeline`, `lib/timeline.ts`): lo que tiene hora (tareas, rutinas y los eventos del
     calendario del iPhone, ver "Calendario del iPhone") a lo largo de una línea. Cada tarea es una cápsula tan alta como lo que dura, que se rellena al completarla y,
     si está en curso, se va llenando; entre medias, "1 h 30 libres" (desde ahora, si el hueco ya
     empezó); hoy, una marca de coñac con la hora actual. No se reordena a mano (manda la hora).
  3. `Sin hora`: lista raíz más las secciones del usuario, con arrastre. Cada sección lleva un **+** en
     su cabecera: abre la barra con ella como destino ("Añadir a Compra", la píldora en versalitas), en el
     mismo toque para que salga el teclado (`focusRef`), y la despliega si estaba plegada. Un día pasado con
     pendientes lleva **Pasar a hoy**. Un día sin tareas ni eventos con hora dice "Día libre." (las rutinas
     y lo de todo el día no cuentan).
  El compositor añade al día elegido ("Añadir al jueves 2"); sus destinos llevan a otro sitio.
- **Lugares** (`PlacesView`, ver "Lugares").
- **Ajustes** (`SettingsView`): página con grupos a lo iOS: Apariencia, Idioma, Avisos, Calendario,
  Dictado, Datos y Tasks (ver la bienvenida, valorar, soporte, privacidad, versión).

`Atrasadas`, `Rutinas` y las secciones se pliegan y ese estado se guarda (`AppState.collapsed`,
`Section.collapsed`). Si algo añadido cae fuera de lo que se ve (una tarea para mañana escrita en
hoy), un aviso dice adónde ha ido y ofrece **Ver**.

Arriba a la derecha, en la Bandeja y la Agenda, el modo importancia: una **A con una flecha doble**
(se desliza para agrandar), que al activarse sube y baja una vez.

### El mes desplegado

Para ir a dentro de dos meses sin pasar semana a semana, la tira se abre en el mes, como el
calendario que baja en Google Calendar. Tres formas, las tres a la vista: **tirar de la tira hacia
abajo** (sigue al dedo), el **asa** que tiene debajo y el **mes de la cabecera**, que es un botón con
una flecha que se da la vuelta. Desplegada, a los lados se pasa **de mes** (conserva el día del mes,
`addMonths`); **elegir un día la recoge** en su semana; tirar hacia arriba, el asa o el mes también.
Siempre seis semanas (`monthWeeks`): no cambia de alto al pasar de mes; los días de los meses vecinos
asoman atenuados. Cada día del mes es también un sitio donde soltar una tarea arrastrada.

- `AgendaView` guarda si está abierta (`monthOpen`, no se persiste) y cuenta lo de todos los días
  (`loads`) para los anillos.
- **Sin animar alturas**: al desplegar, el mes ocupa su sitio de golpe y lo que se mueve son un
  recorte (`clip-path` en `.strip`) y tres `transform` (las semanas, el asa y `.agenda__below`, el
  bloque con todo lo de debajo), que `WeekStrip` pinta con `paint(p)` sin pasar por React. Al recoger,
  se anima a 0 y entonces vuelve el `layout` de semana, en el mismo fotograma en que se quitan los
  estilos. Al tirar con el dedo el mes se pinta antes con `flushSync`.
- `open` (lo pedido) y `layout` (lo pintado) van separados: el segundo se queda atrás mientras dura
  la animación de recoger. Un tirón (0,35 px/ms) o un tercio del recorrido cambian de estado.
- El bloque entero (`.cal`) lleva `touch-action: none`: en vertical es del gesto, así que desde la
  tira no se hace scroll de la página.

### Bienvenida

La primera vez (no hay nada guardado: `useFirstRun`, que sale de `loadState().fresh`) se abre
`Welcome` en lugar de tareas de ejemplo: la app empieza vacía. También desde Ajustes → *Ver la
bienvenida*. Va en su propio trozo (`lazy`); si no cargara, la app se abre igual (y no se da por vista).

- **Tras actualizar** también sale (`lib/welcome.ts`): cada lámina lleva la versión de la bienvenida en
  que entró (`PLATE_SINCE`) y el dispositivo guarda la última que cerró (`Settings.welcome`, 0 =
  ninguna; los estados de antes de la 1.3 no la traen, así que con la 1.3 la ve entera todo el mundo).
  Al abrir, `welcomeOnLaunch`: entera si es la primera vez; si hay láminas posteriores a lo visto, solo
  esas, numeradas desde la I y con la **portada de novedades** ("Hay cosas nuevas", **Ver lo nuevo** /
  **Saltar**, y **Listo** al final); si no, nada. Acabarla o saltarla la da por vista
  (`settings/welcome`, que nunca baja). Es del dispositivo, como la apariencia: importar una copia o
  borrarlo todo no la cambia.
- **Lámina nueva, o una que cambie para enseñar algo nuevo**: en `PLATE_SINCE` con la versión siguiente
  a la mayor que haya (`WELCOME_VERSION` sale sola). Sin eso, quien actualiza no la ve.
- El estado de ejemplo de las capturas (`scripts/sample-state.mjs`) la da por vista (`welcome: 999`)
  para que no tape las capturas.

- **Portada**: la señal en el centro exacto y a 92 px, donde la deja `#boot` (`MARK_PATH` en
  `lib/boot.ts` lee su trazo antes de que se retire), así que el relevo no se nota; después sube y
  entran el nombre, la frase y **Empezar**. Con bienvenida, `finishBoot` lo llama ella al pintarse
  (`onReady`): no llega a verse la app vacía.
- **Siete láminas** que no explican: dejan hacerlo. *Escribir* (la barra se teclea sola y la píldora
  sale cuando el analizador de verdad entiende la frase), *Detalles* (versión 2, la 1.3: tocar
  Detalles o tirar del asa sube una ficha pequeña con los campos y la lógica de verdad,
  `lib/details.ts`; al plegarla queda el resumen), *Gestos* (dos `SwipeRow` reales: tachar y
  borrar), *Agenda* (el `WeekStrip` real: tirar y desplegar el mes), *Rutinas* (tacharlas; en el
  iPhone, con el widget de la pantalla de bloqueo, que se tacha a la vez) y *Sugerencias* (versión 3,
  la 1.4: rodear una fila de una lista de mentira, con la cena con Carlota arriba, y "enviar") y
  *Calendario* (versión 4, la 1.5, solo donde hay calendario: un día con tareas en el que entran los
  eventos con su color, y **Conectar mi calendario**). En la PWA no existe: `welcomeOnLaunch` recibe las
  láminas de la plataforma (`availablePlates`) y lo que no hay ahí no cuenta como nuevo. Hasta que se tocan, las
  escenas se mueven un poco para decir por dónde se cogen. Las escenas usan las clases de la app
  (`composer__foot`, `composer__more`…): si cambia la barra de escribir, mirarlas.
- Nada obliga: **Continuar**, atrás, **Saltar** y Escape. Con `prefers-reduced-motion`, la primera
  lámina enseña el resultado sin teclear. Mientras está abierta, la app de debajo va con `inert`.
- Es la única pantalla con texto explicativo: un titular y una frase por lámina.
- Los ejemplos nombran a **Carlota** ("Cena con Carlota…", "Cine con Carlota…", la cena que se rodea en
  *Sugerencias*), la novia del usuario: lo pidió él. No cambiarlo. También sale en las capturas de la
  App Store (la frase de la primera, el widget de Siri) y en los datos de ejemplo (`sample-state.mjs`).

### Arranque

Los primeros segundos no deben saltar: cada relevo es invisible y la entrada, suave.

1. **Pantalla de carga nativa** (`LaunchScreen.storyboard`): papel marfil y la señal
   (`LaunchMark`, 92 pt, @1x/@2x/@3x) en el centro exacto de la pantalla, con restricciones de
   Auto Layout. Antes era una imagen de 2732 px escalada con *aspect fill*: de ahí el logo "bugueado".
   El plugin SplashScreen la mantiene encima del WebView (`launchAutoHide: false`).
2. **`#boot` en `index.html`**: la misma pantalla, pintada antes que el JS (CSS en línea, la señal
   inyectada desde `brand.mjs` por el plugin `tasks-boot-mark` de `vite.config.ts`). Un script en
   línea quita la carga nativa en cuanto `#boot` está pintado (`Capacitor.nativePromise`), sin
   esperar al paquete: como son iguales al píxel, no se nota. `showApp` la quita igualmente por si
   acaso.
3. Si la app tarda más de 450 ms, la señal cede el sitio a un **esqueleto** de la pantalla (cabecera,
   filas y barra que laten).
4. Con el estado pintado, `finishBoot` (`lib/boot.ts`) funde `#boot` y la app entra escalonada
   (`.is-entering` en `shell.css`: cabecera, bloques y barra suben unos píxeles). Se puede tocar
   desde el primer momento.

En un iPhone normal la señal da paso a la app en unos 200 ms y el esqueleto no llega a verse. Una
pestaña que se abre antes de cargarse su trozo enseña su propio esqueleto (`Skeleton`).

**Con el modo oscuro**: la apariencia se copia en `localStorage` (`tasks:theme`) y un script en
`<head>` pone `data-theme` antes de pintar, así que `#boot` (con variables `--boot-*`) ya sale en su
tema. La pantalla de carga nativa usa el color `LaunchBackground` y la señal `LaunchMark` con
variante oscura (Assets.xcassets), y `SceneDelegate` fija la apariencia guardada
(`TasksNative.setAppearance`, en `UserDefaults`) antes de crear la vista: con "Oscuro" o "Claro"
distinto del iPhone, la pantalla del sistema sale un instante en el tema del iPhone.

### Idioma

Español e inglés, en Ajustes → **Idioma**: **Automático** (el del sistema: el primero de sus idiomas que
la app habla; si no habla ninguno, inglés), **Español** o **English** (`Settings.language`). Es del
dispositivo, como la apariencia: importar una copia o borrarlo todo no lo cambia. Una instalación nueva
empieza en automático; lo guardado antes del inglés (sin el campo) sigue en español (`normalizeSettings`).

- **El idioma vigente vive en `lib/i18n.ts`** y no se pasa de función en función: la lógica pura lo lee
  al componer un texto (`pick({ es, en })`). La web lo fija al pintar (`LanguageProvider`, que además
  pone `<html lang>`); `headless.js`, al empezar cada petición de Siri (`speakAs`, con
  `Locale.preferredLanguages` que manda Swift para el automático).
- **Cada módulo guarda sus textos en los dos idiomas, junto al código** que los usa: en la lógica,
  tablas `TEXT`/`WORDS` con `pick`; en los componentes, `const COPY = { es: {…}, en: {…} } as const` y
  `const copy = useCopy(COPY)`. `useCopy` lee el contexto del idioma: así las filas memorizadas se
  repintan al cambiarlo. En una función que se llama después (un toast), `pick` en el momento.
- **Texto nuevo = en los dos idiomas.** Inglés de Estados Unidos: horas de 12 h ("5:30 PM", el tramo
  "5:30–6:30 PM"), fechas "Thu, Sep 18", fechas numéricas mes/día. Apóstrofo curvo (’) en los textos.
- **Analizador en inglés** (`parseEn.ts` + `whenEn.ts`) sobre el mismo motor que el español
  (`parseCore.ts`: escáner de tramos y montaje de la tarea; las reglas, iguales: una hora sin día que
  ya pasó es de mañana, con hora y sin avisos se avisa a la hora, "at 5" es por la tarde…). `parseTask`
  y `parseSpoken` eligen por idioma. Va en su **propio trozo**: lo pide `LanguageProvider` al estar en
  inglés (y el selector antes de cambiar); hasta que llega, lo escrito se queda literal. `headless.js`
  lo lleva dentro (`provideEnglish`). Las rutinas en inglés están en `repeat.ts` ("every day",
  "weekdays", "on mondays", "every mon, wed and fri"); los emojis sugeridos, en `emoji.ts`.
- **Dictado en inglés**: la app manda `lang: 'en'` y no manda el contexto (`api.ts`), así que el Worker
  transcribe con Whisper en inglés y **no pasa por la IA**, cuyo prompt solo entiende español: el
  texto lo entiende el analizador del móvil. Siri en inglés tampoco va a la IA (`sharesDictation`). Sin
  `lang` (versiones anteriores), español como siempre.
- **Avisos**: el texto sale ya en su idioma; los botones del iPhone se registran de nuevo al cambiarlo
  (`registerTaskActions`) y los del push web van en el idioma del aviso (`lang` en el contenido cifrado,
  `sw.ts`).
- **Widgets**: siguen el idioma de la app, no el del iPhone: la foto lleva `language` y Swift elige los
  textos con `WidgetText` (`WidgetText.swift`, también para los fallos de Siri). Lo que enseña iOS por su
  cuenta (las frases de Siri, los títulos de Atajos, los permisos, los accesos rápidos del icono) sigue
  el idioma del iPhone: `ios/App/App/en.lproj` (`Localizable.strings`, `AppShortcuts.strings`,
  `InfoPlist.strings`) y `ios/App/TasksWidget/en.lproj`. Las claves son los textos en español del Swift:
  si cambia uno, cambiar su clave. `CFBundleLocalizations` lleva `es` y `en`.
- **Tests**: los de siempre van en español (el idioma por defecto); los de inglés fijan
  `setLanguage('en')` y lo devuelven al acabar (`parseEn.test.ts`, `i18n.test.ts`).

### Rendimiento

Tiene que ir fluida en un iPhone de hace unos años. Se mide con `scripts/perf.mjs` (versión de
producción, CPU 6× más lenta, 230 tareas, mediana de varias pasadas); comparar antes y después de un
cambio que toque listas, la Agenda o las pestañas. Reglas que salieron de medir:

- **Nada se anima en reposo si obliga a repintar**: el punto de "ahora" latía animando una sombra y la
  pantalla se repintaba en cada fotograma, también sin tocar nada. Lo que se mueve solo, con
  `transform` u `opacity` (lo hace la GPU).
- **Nada de `localeCompare`** para ordenar fechas, horas o ids: en JavaScriptCore cada llamada monta un
  cotejador. `compareText` (`order.ts`); para nombres escritos, `compareNames` (un `Intl.Collator`).
- **Lo que tarda en pintarse no bloquea el toque**: la pestaña nueva (`shownTab`) y el día nuevo de la
  Agenda (`shown`) van con `useDeferredValue`: la barra de pestañas y la tira cambian al momento y lo
  de debajo llega en cuanto está (si tarda, lo de antes se apaga un poco: `.agenda__below.is-stale`).
  Mientras se arrastra, el día de debajo queda fijo (`dragDay`): lo que se confirma al soltar es suyo.
- **Las filas fuera de la pantalla no se diseñan ni se pintan** (`content-visibility: auto` en `.swipe`,
  iOS 18 en adelante). Ya recortaban su contenido, así que a la vista no cambia nada. Su alto estimado
  (`contain-intrinsic-size`) es el medido: 49 px una tarea, 65 una del horario, 64 una rutina. Mientras
  se arrastra (`.view.is-dragging`) se pintan todas, para que el arrastre mida bien.
- **La tira pinta solo lo que se ve**: los paneles de los lados (la semana o el mes de antes y de
  después) llegan pasado el despliegue (`SIDES_DELAY_MS`) o al empezar a deslizar.
- El analizador compila sus expresiones en un rato libre tras el arranque (`warmUpParser`), y no corre
  con la barra vacía.
- Volver a una pestaña que estaba arriba no toca `scrollTop` (escribirlo obliga a diseñar de golpe).

### Calendario del iPhone

Lo que hay en la app Calendario del iPhone (iCloud, Google, Outlook… las cuentas de Ajustes → Apps →
Calendario) sale en la Agenda, **solo para leer**: Tasks no es un calendario, pero enseña el tuyo. Con
EventKit, en el propio iPhone: los eventos no se guardan en el estado, ni en las copias, ni salen del
dispositivo. Pensado para que no abrume: nada de pestañas ni vistas nuevas.

- **Dónde se ve**: en el `Horario`, entre las tareas, con una cápsula rellena del color de su calendario
  (`.cal-tone`: el color de iOS a medias con la tinta tenue, para que no chille) y el título un punto por
  debajo de las tareas; la hora y el sitio debajo; lo que ya acabó, apagado; cuenta para el tiempo libre
  y se va llenando si está en curso. Lo de todo el día (y lo que cubre el día entero aunque tenga hora,
  un viaje), como **cintas** encima del día (`AllDayEvents`; con más de tres, dos y "+N"). En la tira y
  en el mes, un **punto** bajo el número de los días con algo (`eventDays`). Tocar un evento abre la ficha
  de Calendario de iOS (`EKEventViewController`, se puede editar; al cambiar algo, iOS avisa y se vuelve a
  leer). No se desliza ni se tacha.
- **Estado** (`Settings.calendar`: `enabled` y `hidden`, los ids de los calendarios ocultos): es del
  dispositivo, como la apariencia (importar una copia o borrarlo todo no lo cambia). Se enciende al
  conceder el permiso.
- **`CalendarProvider`** (`components/calendar/`): pregunta el permiso al arrancar, lee los calendarios y
  los eventos de la ventana del día que se mira (`eventWindow`: su mes, una semana antes y dos después;
  `useDayEvents` la mueve al cambiar de mes) y vuelve a leer cuando iOS avisa de un cambio
  (`calendarChanged`), al volver a la app y al ocultar calendarios. Si al volver hay calendarios nuevos (se
  acaba de añadir Google en Ajustes), un aviso lo dice.
- **Ajustes → Calendario** (`CalendarBlock`): sin permiso, **Ver mi calendario en la Agenda** (pide el
  acceso completo de iOS: el de "solo añadir" no deja leer); negado, abre los Ajustes del iPhone; con él,
  un interruptor **En la Agenda**, **Calendarios** ("Todos" / "3 de 5", `CalendarPicker`, por cuentas) y,
  siempre, **Añadir Google u Outlook** → `CalendarGuide`: pestañas Google / Outlook / Otro, la ruta de
  Ajustes como botones (Apps › Calendario › Cuentas de calendario › Añadir cuenta), la lista de cuentas
  de iOS con lo que hay que tocar marcado, *Calendarios* activado y *Guardar*, y una nota para iOS 17 o
  para buscar «Cuentas». **Abrir Ajustes** abre la página de Tasks (es lo único que deja Apple; las rutas
  `App-prefs:` son privadas y arriesgan el rechazo): desde ahí, atrás hasta Apps.
- **Nativo**: `CalendarBridge.swift` (solo la app: permiso con `requestFullAccessToEvents`, calendarios,
  eventos fuera del hilo principal, la ficha) y `CalendarReader.swift` (app y widget: leer, colores en
  `#rrggbb`, `WidgetEvent`). La ocurrencia de un evento que se repite se distingue por su inicio (`key` =
  id@inicio). `Info.plist` lleva `NSCalendarsFullAccessUsageDescription` (y la antigua), también el del
  widget.
- **Widget Hoy**: lee él mismo EventKit (si hay permiso y la foto dice que está encendido, con sus
  ocultos: `WidgetSnapshot.calendar`); si no pudiera, usa la copia de la semana que lleva la foto
  (`events`, que solo escribe la app; la foto de `headless.js` lleva `calendar` sin `events`). Mediano: el
  siguiente evento de hoy encima de las tareas; grande: dos; bloqueo rectangular: si sobra una línea.
  Entradas al empezar y acabar cada evento de hoy y mañana y, con calendario, se vuelve a leer cada media
  hora (`.after`): lo que se crea en otro dispositivo no avisa al widget.
- **En local** (`npm run dev`) y en las capturas, `calendarDemo.ts`: tres calendarios (Google, iCloud,
  suscritos) y eventos que se repiten, para verlo sin iPhone. En la PWA publicada no hay calendario.

### Sugerencias

Para que quien usa la app (los amigos del usuario) diga qué cambiaría señalando el sitio exacto. Ajustes
→ **Sugerir una mejora** (solo si hay servidor: `VITE_PUSH_API`) pone la app en **modo sugerencia**
(`components/feedback/`, en su propio trozo):

1. **Ir a donde sea**: la app sigue usándose (pestañas, paneles) con una **tarjeta abajo**, sobre las
   pestañas y al alcance del pulgar (`FeedbackDock`, z 70): *Ve a lo que quieras comentar* y un solo botón
   grande, **Señalar**, con un halo que late un par de veces; la × sale del modo. La barra de escribir se
   aparta mientras (`data-suggesting` en `<html>`). Antes era una píldora arriba que ya decía *Rodea…*:
   en el iPhone el usuario intentaba rodear sin tocarla primero.
2. **Señalar** quita la tarjeta un fotograma y hace la **foto** (`captureScreen` →
   `TasksNative.screenshot`, `WKWebView.takeSnapshot`): destello y la pantalla congelada con un marco de
   coñac (`FeedbackDraw`, z 90). En la PWA no hay foto (una página no puede fotografiarse): se rodea
   sobre la app en vivo. Hasta el primer toque, una **mano de muestra** dibuja una vuelta en el centro
   (`fb-demo`: el trazo se dibuja y un dedo lo recorre con `offset-path`). **Se rodea con el dedo** (el
   trazo se pinta sin pasar por React); un toque rodea un círculo; *Sin rodear* es la pantalla entera;
   Cancelar o Escape vuelve a la tarjeta. La pantalla (`Mark.viewport`) se guarda al rodear.
3. **Al soltar**, `describe.ts` mira qué hay debajo (`elementsFromPoint` en una rejilla de la zona, del
   centro hacia fuera): el texto de cada cosa y sus clases ("Cena — tl-row › row__title"), y el panel
   abierto. `composeShot` pinta el trazo sobre la foto, estirada a la pantalla como en la capa (JPEG a
   2× como mucho, ~500 KB tope; si no sale, se envía sin foto).
4. **El panel** (`FeedbackSheet`, z 95) enseña la miniatura, la pantalla y lo rodeado, *Rodear otra
   vez*, y el mensaje. **Sin foto no van los textos** de lo rodeado ni el título del panel (son las
   tareas de quien escribe), solo las clases: al quitar la miniatura (×), si no se pudo hacer y siempre en
   la PWA. Cerrar el panel vuelve a la píldora sin perder lo escrito. **Enviar** (espera a que la foto
   esté lista) → `POST /v1/feedback` (`postFeedback`, `lib/feedback.ts`, 20 s como mucho) → toast y fuera
   del modo; si falla, el porqué sale en el panel (un toast quedaría debajo).

- **Lo que viaja** (`FeedbackReport`): mensaje (2000 como mucho), foto opcional y contexto: pestaña (en
  español, para quien lo lee), panel, zona rodeada y tamaño de pantalla, lo rodeado, versión,
  plataforma, idioma, tema y "iPhone · iOS 18.5" (`deviceLabel`). Nada que identifique a nadie.
- **Worker**: `POST /v1/feedback` sin cuenta, 10 por hora y IP, 200 guardadas como mucho (comparten la
  D1 con los avisos), lo de más de un año lo borra el cron; valida y sanea el contexto
  (`parseFeedback`) y guarda en D1 (`feedback`). El **buzón** es `GET /buzon` (`inbox.ts`): una página sin datos que los pide con la
  clave (`FEEDBACK_KEY`, secret de Cloudflare; copia en `worker/.feedback-key`, fuera de git) a
  `GET /v1/feedback`, `GET /v1/feedback/<id>/shot` y `DELETE /v1/feedback/<id>` (archivar = borrar).
  Todo lo del usuario se pinta con `textContent`; CSP con nonce; las capturas se piden al acercarse
  (todas de golpe toparían con el límite de 60 por minuto y IP). *Copiar* deja la sugerencia en texto
  para pegársela a Claude; `npm run feedback` (en `worker/`) las baja a `feedback/` con su captura.
- **Privacidad**: es lo único que el servidor guarda con contenido; va en la política (`#sugerencias`),
  en `PrivacyInfo.xcprivacy` (atención al cliente) y en App Store Connect (`docs/app-store.md` §4).

### Pasar a hoy

Lo que queda sin hacer de días anteriores pasa a hoy de un toque (como el *Reschedule* de Todoist
o el *Postpone* de TickTick). Cada tarea va **arriba de su sección** de hoy, en el orden en que
estaba en `Atrasadas` (lo más antiguo primero): la lista apenas se mueve bajo el dedo, solo deja de
estar en rojo. Conserva la hora; lo hecho no se mueve (es historia).

- `tasks/reschedule { ids, date }` (`rescheduled` en `order.ts`) ignora lo hecho y lo que ya es de
  ese día, así que repetirlo no cambia nada. "Deshacer" (toast) es `tasks/place` con los sitios de
  antes (`placementsOf`): cada tarea vuelve a su día, su sección y su puesto.
- Dónde está: la cabecera de `Atrasadas`; la de `Sin hora` de un día pasado con pendientes en la
  Agenda (solo los de ese día); los avisos (el resumen diario con algo atrasado trae *Pasar atrasadas a hoy*, y el aviso
  de una tarea cuyo día ya pasó, *Pasar a hoy* entre *Hecha* y *+10 min*: `ScheduleEntry.overdue`,
  categorías `task-overdue` y `digest-overdue`); Siri y Atajos (*«Pasa lo atrasado a hoy en
  Tasks»*, `MoveOverdueIntent`, sin abrir la app; sirve para una automatización cada mañana,
  `docs/app-store.md` §2.2); y el botón **A hoy** del widget.
- Fuera de la web es una entrada de la bandeja con `move: { date, taskIds }` que calcula
  `moveOverdue` (`headless.js`) con lo atrasado del fichero de estado, la bandeja y lo marcado en el
  widget. Queda resuelta cuando lo guardado ya las tiene en ese día (`entryInState`).
- El botón del widget (`WidgetMoveOverdueIntent`) es un `LiveActivityIntent`: así iOS lo ejecuta en
  el proceso de la app (arrancándola en segundo plano) y no en el del widget, que no tiene el
  fichero de estado ni `headless.js`. Se compila en los dos objetivos; en el widget, `OverdueMover`
  es un hueco que no llega a correr. Si en el iPhone no hiciera nada, la alternativa es la de
  `ToggleTaskIntent`: apuntarlo en `widget-changes.json` y que la web lo aplique al volver (los
  avisos de esas tareas se programarían al abrir la app).

### Plazos

Lo que hay que hacer "esta semana" o "de tal día a tal día" no es de un día ni se repite: tiene un
**plazo** (`Task.until`, `lib/period.ts`). Vale cualquier día entre `date` y `until` (los dos
incluidos) y, **mientras siga pendiente, va con hoy**: pasa sola de un día al siguiente, arriba de su
bloque como lo que se pasa a hoy, sin quedar atrasada ni tener que traerla cada mañana. Pasado el
último día sí está atrasada (en rojo, en `Atrasadas`, desde su último día). Se hace una vez: no es una
rutina.

- **Nada se reescribe al cambiar de día**: el día en que se ve sale de la fecha de hoy (`shownDay`:
  hoy dentro del plazo; antes de empezar, su primer día; hecha, el día en que se hizo) y lo atrasado,
  del último día (`lastDay`, que usa `isOverdue`). Así el widget, el resumen diario y los avisos
  programados para los días siguientes aciertan aunque no se abra la app.
- **Dónde se ve**: la fila dice hasta cuándo ("Hasta el jueves", "Hasta el 15 oct"; el último día,
  "Último día" en coñac: `periodTag`), también en el horario. En el panel de la tarea y en la ficha del
  compositor, bajo **Cuándo**, la píldora **Hasta…** abre el selector de fecha (desde el día siguiente)
  y, elegida, dice "Hasta el viernes" con su × (`WhenField`, `task/until`). Nada más: ni opciones
  aparte ni otra lista.
- **Escribiendo o dictando**: "esta semana", "durante la semana", "la semana que viene" (sin un día
  detrás: "la semana que viene, el martes" es ese día), "este fin de semana", "este mes", "hasta el
  viernes", "hasta el 15 de octubre", "hasta mañana", "del lunes al viernes", "entre el lunes y el
  jueves", "del 5 al 9", "del 28 de septiembre al 3 de octubre". **"De lunes a viernes" (sin
  artículos) sigue siendo una rutina**: el lenguaje ya distingue los días concretos de los de cada
  semana. En inglés: "this week", "next week", "this weekend", "this month", "until/by friday", "until
  Oct 15", "between monday and thursday". Se leen antes que los días sueltos (`readPeriodEs`,
  `readPeriodEn`). La píldora, la ficha y el aviso de "adónde ha ido" dicen el plazo entero
  (`periodLabel`: "Esta semana", "La semana que viene", "Del 6 al 10 oct").
- **Tres clases de plazo** (`DayRange.kind`): `until` ("hasta el viernes"), `range` ("del lunes al
  viernes", como mucho 62 días: más sería leer mal el mes) y `loose` ("esta semana", "este mes"). Con
  un día dicho, uno `loose` solo dice cuál: "el viernes de esta semana" es el viernes, sin plazo. Con
  hora, uno `until` es una hora límite: "hasta el viernes a las 5" es el viernes a las 17:00, sin plazo
  (`assemble` en `parseCore.ts`).
- **La IA del dictado no sabe de plazos** (su prompt no se ha tocado): si devuelve una sola tarea y lo
  dicho trae un plazo, el día y el final los pone el analizador del móvil sobre el texto
  (`draftsFromInterpreted(…, text)`); con varias tareas, manda la IA.
- **Mover**: llevarla a un día dentro del plazo lo conserva; más allá (o sin fecha), pasa a ser solo de
  ese día (`cleanUntil` en `moveTask`). "Pasar a hoy" lo atrasado de un plazo acabado lo deja solo para
  hoy, y deshacer le devuelve el plazo (`Placement.until`). Soltarla al reordenar el día que se ve la
  deja en ese día con el mismo final (`board/commit`).
- **Con hora**: es la de cada día del plazo. El horario la pone a esa hora en hoy y los avisos "antes"
  suenan **cada día que quede** hasta hacerla (7 como mucho, ids `<aviso>-AAAAMMDD`); el aviso de cierre,
  el del día en que está. Un aviso sin hora dice "Hasta el domingo" o "Último día".
- **Widget**: la foto lleva `until` en lo pendiente con plazo (`WidgetTask.until`, opcional en Swift) y
  el widget la enseña cada día de él (`shows(on:)`) y solo después en rojo (`lastDay`).

### Importancia

`Task.importance`, del 1 (normal) al 10, se ve como **tamaño del título**: sin etiquetas, colores
ni "urgente". Más importante = más grande, con más peso y más apretado, hasta el doble
(`--fs-task-max`); la progresión es geométrica (`importanceScale`) para que cada punto se note
igual. No reordena nada.

- **Modo "Aa"** (arriba): cada fila cambia el asa de mover por su mando, un número del 1 al 10.
  Arrastrarlo hacia arriba o a la derecha agranda y hacia abajo o a la izquierda encoge (18 px por
  punto, vibra en cada uno, el título cambia en vivo); tocarlo sube uno y pasado el 10 vuelve al 1.
  En el modo no se reordena (no hay asa). El estado del modo no se guarda.
- **Panel de la tarea**: la escala del 1 al 10 bajo el título, cada número del tamaño que dará.
- Lo **hecho** vuelve al tamaño normal (se conserva el valor por si se desmarca) y no lleva mando.
- Donde no hay sitio para tamaños, la importancia elige: el widget de la pantalla de bloqueo enseña
  las dos pendientes más importantes y el resumen diario adelanta las más importantes en su vista
  previa. En el resto del widget los títulos crecen poco (las filas son de alto fijo).
- Lo que llega sin importancia (copias antiguas, Siri, la bandeja) es normal (`normalizeImportance`).

### Rutinas

Lo que se repite ("tomar creatina", cada día a las 10:00) no es una tarea: es una `Routine`
(`AppState.routines`, `lib/routines.ts`) con los días de la semana en que toca (1 = lunes … 7 =
domingo), una hora opcional, un **emoji** opcional y un **diario** de días hechos (`done`, los 400
más recientes). No hay nada que reiniciar a medianoche: "hecha hoy" es que el diario tenga hoy, así
que cada día amanece pendiente él solo (en la app, en los avisos y en el widget).

- **Emoji** (`Routine.emoji`, `lib/emoji.ts`): su seña. Sale delante del nombre en la fila, dentro de
  la cápsula del horario y en los widgets en lugar de las iniciales. Se elige en el panel, tocando el
  **sello** que hay junto al nombre: una lámina de 28 (`ROUTINE_EMOJIS`), "sin emoji" y un hueco para
  teclear **otro** con el teclado de emojis (se guarda uno solo: `cleanEmoji`). Al crear una rutina
  (escribiendo, dictando, desde una tarea o en el panel) se propone el que le pega al nombre
  ("creatina" → 💊, `suggestEmoji`); en el panel, hasta que se elige uno a mano. **Entonados**: la
  clase `.emoji` les pone `--emoji-tone` (medio color y un velo sepia, distinto en cada tema) para que
  no desentonen con el papel; en el widget de inicio, `RoutineEmoji` (`.saturation(0.55)`), y en la
  pantalla de bloqueo iOS ya los pinta en un tono.
- **Dónde**: bloque `Rutinas` de la Bandeja (las que tocan hoy arriba, lo hecho después y las que hoy
  no tocan, atenuadas), con "2/3" de hoy y **+**. Al pie, una nota: *Se renuevan a las 00:00*.
- **Cuándo empieza el día** (`Settings.dayStart`, `00:00` por defecto): se cambia tocando la hora de esa
  nota (`PickerChip`, la rueda de iOS), sin opción en Ajustes: casi nadie lo toca. Con "04:00", lo que se
  tacha a la 1 de la madrugada cuenta para la víspera y la racha no se rompe; una hora de la tarde
  ("22:00") adelanta el día a la víspera por la noche. `routineDay` (`lib/routines.ts`) da el día de las
  rutinas: lo usan la Bandeja y el panel (`useRoutineDay` en `App`), los avisos (`routineEntries`, con
  `occurrenceDate`: el aviso de la 1:00 de un día que empieza a las 4:00 suena la madrugada siguiente)
  y el widget (la foto lleva `dayShift`; `WidgetDay.routineDay` y una entrada en cada cambio de día). El
  horario de la Agenda sigue el calendario. Es de los datos: va en la copia y se borra con *Borrar todo*. Las que tienen hora salen también en el horario
  de la Agenda de cada día que tocan (cápsula de trazo discontinuo con su emoji o el icono de repetir).
- **Fila** (`RoutineRow`): el círculo o deslizar a la derecha la tacha hoy; a la izquierda, borra (con
  deshacer). A la derecha, **los últimos siete días**: punto lleno, hecha; hueco, no; raya, no tocaba
  (antes de crearla tampoco). Debajo del título, la hora, los días y "racha de N" (desde 2).
- **Panel** (`RoutineSheet`): emoji y nombre, días (L M X J V S D y atajos: cada día, entre semana,
  fines de semana y una vez por semana, "Los martes": `weeklyPreset`, el día que ya tiene si es uno
  solo, si no el de hoy; en la ficha, el de la tarea), aviso a una hora, y **Constancia** (`RoutineLog`): racha, mejor racha, % de los
  últimos 30 días y cinco semanas día a día con su número, como un cuaderno de asistencia. **Se puede
  corregir**: tocar un día pasado lo marca o desmarca (`routine/set`) y pasar el dedo de lado marca (o
  desmarca) varios seguidos; las flechas van de cinco en cinco semanas hacia atrás, hasta lo que guarda
  el diario. Sirve para rehacer una rutina borrada sin querer (marcar días de antes de crearla los
  cuenta para la racha) o los días que se olvidó tachar. En vertical, el dedo es del scroll del panel
  (`touch-action: pan-y`). Una nueva se crea al cerrar si tiene nombre ("Añadir rutina").
- **Escribiendo**: `parseRoutine` (`lib/repeat.ts`) reconoce "todos los días", "cada día", "a
  diario", "entre semana", "de lunes a viernes", "los fines de semana", "los lunes y jueves", "cada
  martes", "todas las mañanas" (09:00)… La hora sale del analizador de siempre ("a las 7" es 19:00,
  como en las tareas). La píldora dice "Cada día · 10:00" con el icono de repetir; tocarla la deja
  como tarea. También al dictar (antes de la IA). "El lunes" es un día; "los lunes", todos.
- **Desde una tarea**: panel → **Convertir en rutina** (cada día, con su hora; deshacer).
- **Avisos**: `routineEntries` (`schedule.ts`) programa uno a su hora cada día que toca en los
  próximos 7, mientras no esté hecha (id `routine-<id>-AAAAMMDD`). No cuentan para el número del
  icono. En el iPhone, si no cabe todo en los 64 avisos, las rutinas se llevan como mucho un tercio
  del hueco (`fitSchedule`, `ROUTINE_SHARE`): lo que falte se programa al volver a abrir la app. En el iPhone llevan **Hecha** (categoría `routine`), que la tacha **sin abrir la app**:
  `NotificationResponder` lo apunta en el App Group como el widget y la web lo aplica al volver
  (o al momento si está delante: acción `widget`). Tocar el aviso sin botón abre la Bandeja y pregunta
  "¿Hecha?". En la PWA no llevan botones.
- **Widget Rutinas** (pantalla de bloqueo redonda y rectangular, y pequeño de inicio): ver "App de
  iPhone".

### Duración y aviso de cierre

Tachar una tarea obliga a abrir la app, y esa es la fricción que sobra. Con `Task.duration`
(minutos, `lib/duration.ts`), al acabar llega un aviso que lo pregunta: **«Reunión con Jorge /
¿Has acabado? · 17:30–18:30»**, con **Sí, hecha** y **Todavía no**. Así se tacha desde la propia
notificación, sin entrar.

- **El aviso no se guarda**: sale de la duración (`checkInEntries` en `schedule.ts`, id `ask-<id>`),
  así que quitar la duración lo quita y cambiar la hora o la duración lo mueve. No cuenta para el
  tope de 20 recordatorios ni aparece en la lista de avisos de la tarea.
- **Solo con fecha y hora**, como la hora solo cuenta con fecha. De 5 min a 12 h (`MAX_DURATION`):
  más de medio día deja de ser un rato acotado y preguntar no dice nada. Con hora y duración
  siguen siendo dos avisos: el de "a la hora" al empezar y la pregunta al acabar (como Structured).
- **«Todavía no» alarga la tarea** (`task/extend`, `extendedDuration`): el final pasa a 15 min
  desde *ahora*, no desde el final previsto, así que responder tarde no deja la siguiente pregunta
  en el pasado. Como efecto, el tramo guardado acaba reflejando lo que de verdad duró.
- **Tocar el aviso sin botón** abre la app y repite la pregunta en un toast con **Sí**: en iOS los
  botones de una notificación piden mantener pulsado, y así la salida sigue siendo un toque. La
  marca viaja en `extra.ask` (nativo) y en `?ask=1` (web).
- Se escribe hablando o tecleando: "durante una hora", "que dura media hora", "una reunión de dos
  horas", "de 17:30 a 18:30", "de las 5 a las 7", "hasta las 19:00". Un tramo fija hora y duración
  a la vez, y la franja del final vale para el inicio si el tramo sigue hacia delante ("de 9 a 11
  de la noche" es 21:00–23:00; "de 10 a 2 de la tarde", 10:00–14:00). Lo que no se dice no dura:
  nunca se supone.
- En el panel (y en la ficha del compositor), **Duración** va debajo de Hora y es una **regla**
  (`DurationPicker`, `lib/ruler.ts`): una regla de papelería con las horas en oro, la tinta marina de
  la hora de empezar a la de acabar y un sello en la punta. Se arrastra o se toca (5 en 5 min en la de
  dos horas); **mantener el dedo al final** (480 ms) llena de oro un halo alrededor del sello y la regla
  se estira (2 h → 4 h → 8 h → medio día, con vibración; las marcas se aprietan desde donde estaban) y
  marca todo lo que abarca ahora; seguir manteniendo la vuelve a estirar. Al soltar, la regla vuelve al
  tramo que le queda holgado (`spanFor`), así que lo corto se ajusta con precisión. A la izquierda del
  todo o con la ×, sin duración; arriba, la duración en serif y "17:00 → 18:30", donde la hora de
  acabar abre la rueda para ponerla exacta. Debajo, la línea que dice a qué hora será la pregunta. La
  fila enseña el tramo (`17:30–18:30`) en lugar de la hora suelta.
- Categoría de botones `task-ask` en el iPhone; en la PWA, acciones `done` y `again` del push.
- **En el iPhone los botones no abren la app** ni piden desbloquear (sin `foreground`): iOS la arranca
  en segundo plano, sin WebView, y `NotificationResponder.swift` (delegado de notificaciones, puesto
  en `AppDelegate` y recolocado delante del de Capacitor al cargar) lo resuelve con `QuickAdd.answer`
  → `answerAsk` de `headless.js` → entrada `ask` en la bandeja (`{ taskId, reply: 'done' }` o
  `{ reply: 'again', duration }` con la duración ya alargada, para que releerla no sume otro rato),
  más avisos, icono y widget al día; "Todavía no" deja así programada la siguiente pregunta. El resto
  de toques pasa al `NotificationRouter` de Capacitor (los que llegan antes de que exista, se
  guardan). Sin `headless.js`, "Sí, hecha" se apunta igual y quita sus avisos, y "Todavía no" repite
  el mismo aviso a los 15 min.

### Drag & drop

- **Se coge manteniendo pulsado** (300 ms, tolerancia 8 px; `useDragSensors`): la tarea o la cabecera de
  una sección. Antes era un asa en el borde derecho, donde el pulgar de un diestro hace scroll, y un amigo
  reordenaba sin querer (buzón, 05/10/2026). Moverse antes de tiempo es scroll o deslizar. Mientras se
  mantiene, la fila se hunde (`pressCue`); al soltar sin moverse no se abre. Con teclado, el botón "Mover"
  oculto de cada fila.
- **Agenda** (`useDayBoard`): mantiene una copia (`preview`) del tablero del día elegido durante el
  gesto y confirma todo con una sola acción `board/commit` al soltar. La copia vive además en un
  ref: al soltar hay que leer el estado real del gesto, no el del último render. Cada columna del
  commit lleva su propio destino: `root` y las secciones van al día elegido, y `overdue` (solo hoy)
  se excluye del commit. Solo entra lo que no tiene hora: lo que la tiene va al horario y no se
  arrastra. Los días de la tira son `useDroppable` (`type: 'day'`): soltar ahí lleva la tarea a ese
  día con su sección y su hora, con deshacer.
- **Bandeja**: una sola lista (`scope/reorder` en `backlog`); los días del muelle (`DayDock`) son
  droppables como los de la tira. Como el muelle sube al empezar el arrastre, su `DndContext` mide
  los droppables siempre (`MeasuringStrategy.Always`).
- `scopedCollision` (`dnd.ts`): un día solo cuenta si el dedo está encima (`pointerWithin`); si no,
  `closestCorners` entre lo demás. Así reordenar cerca de la tira no se lleva la tarea a otro día.
- Ids con prefijo para no colisionar: `col:<clave>` (columna), `sec:<id>` (sección), `day:<fecha>`
  (día), el id pelado de la tarea para las tareas. Ver `src/components/dnd/ids.ts`.

### Gestos de fila (`SwipeRow` + `useSwipe`)

Deslizar a la derecha completa, a la izquierda borra (con deshacer en un toast), como en Mail. El
gesto se bloquea en un eje según el primer movimiento. **No pasa por React**: cada `pointermove`
escribe el `transform` de la superficie en el siguiente fotograma y `--swipe` (0 a 1) en la fila, que
hace crecer el icono de detrás; antes era un render por evento y en móviles modestos iba a saltos.
Al pasar el umbral (84 px) el icono se rellena, da un saltito y vibra; al soltar cuenta también la
velocidad (un golpe rápido de 36 px basta). Hacia un lado sin acción solo ofrece resistencia. El
`click` que llega tras deslizar se descarta. El asa detiene la propagación del `pointerdown` para no
disparar también el deslizamiento.

Las filas están **memorizadas** (`TaskShell`, `SortableTask`, las del horario y las rutinas): las
acciones llegan por contexto (`RowActionsContext`) y no cambian entre renders (`useTaskActions` lee
el estado de un ref), así que tachar una tarea solo repinta esa fila.

Los paneles (`Sheet`) se arrastran por el asa igual: el panel sigue al dedo sin renders, el fondo se
aclara a la vez, un tirón corto (por velocidad) lo cierra y sigue bajando desde donde se soltó; hacia
arriba solo cede con resistencia. El deslizador (`Slider`) se coge desde cualquier punto de la pista,
enseña el valor encima del dedo y vibra en cada paso.

### Alta de tareas

La **barra de escribir** (`Composer`) es, en reposo, una píldora que flota sobre el final de la lista
(`.app__dock`, como el reproductor de Spotify sobre sus pestañas: lo que pasa por debajo se desvanece
en el papel). **Al tocarla** (con el foco, sin esperar a que el teclado termine de subir) la app pasa
a `is-composing`: las pestañas se quitan, la lista queda tras un velo de papel (`.app__veil`; tocarlo
suelta el teclado) y la barra crece en una tarjeta con los **destinos** en el sitio de las pestañas,
como los filtros de una búsqueda: "Hoy", "Mañana", "Sin fecha" y, si se mira otro día, ese
(`composeTargets`). El primero es donde se está mirando y va elegido; tocar otro manda ahí lo que se
añada mientras la barra siga abierta. Se envía con Intro o con el botón redondo de la derecha, y la
barra **sigue abierta** para la siguiente; se suelta tocando el velo, con Escape o con Intro sin nada
escrito. Vacía, el micrófono dicta.

Crea donde se está mirando: **sin fecha** en la Bandeja y **en el día elegido** en la Agenda. Si dice
que se repite, es una rutina (ver "Rutinas"). `parseTask` reconoce día,
hora, plazos y duración en español ("mañana a las 5", "el lunes", "15/10", "en 30 min",
"durante una hora", "de las 5 a las 7"): si detecta algo lo aplica y enseña una píldora en lugar de
los destinos (lo entendido manda); tocarla deja el texto literal y vuelven los destinos. Con hora →
aviso a la hora; con "en X min/horas" → aviso absoluto. Un número
suelto nunca es una hora ("comprar 5 manzanas") ni una duración ("comprar de 5 a 7 manzanas": un
tramo necesita "las" o minutos).

También entiende avisos dentro de la frase ("y recuérdamelo 10 minutos antes", "avísame a
las 9", "el día antes") y números en palabras: `normalize.ts` los pasa a dígitos guardando de
qué parte del original viene cada carácter, para recortar bien el título. Si la frase pide
avisos concretos, no se añade el de "a la hora".

### Ficha del compositor

Para decidirlo todo antes de añadir, sin tener que añadir la tarea y abrirla después. La referencia es
Spotify: la barra es su mini reproductor y la ficha, el reproductor que se abre al tocarlo.

- **Cómo se abre**: **Detalles** (a la derecha de los destinos, quieto mientras las píldoras se deslizan)
  o el **asa** de arriba de la tarjeta: tirar hacia arriba (sigue al dedo con resistencia, `usePullUp`)
  o tocarla. La ficha (`ComposeSheet`, en su propio trozo, pedido en cuanto se toca la barra) es un
  `Sheet` con pie fijo (`footer`): arriba, como "Reproduciendo" en Spotify, la flecha para plegar y qué
  se crea y adónde va ("Nueva tarea · Mañana"); el título en grande; **Cuándo**, **Hora**,
  **Duración**, **Recordatorios**, **Repetir**, **Sección** e **Importancia** (los mismos campos que el
  panel de la tarea: `task/fields.tsx`, `DurationPicker`, `ReminderPicker`, `ImportanceScale`); y abajo,
  siempre a mano, **Añadir a mañana** / **Añadir a la bandeja** / **Crear rutina** (`addLabel`). La
  barra sube y se desvanece mientras la ficha ocupa su sitio (`.composer.is-expanded`).
- **Lo que ya decía la frase pasa a los campos** al desplegarla (`detailsFrom`) y del texto queda solo
  el título: lo que se ve es lo que se va a crear. Desde ese momento la frase ya no se interpreta (la
  ficha manda) hasta que se añade o se quita con la ×.
- **Plegarla** (la flecha, el asa, tocar fuera) no pierde nada: la barra enseña lo decidido en píldoras
  (`detailsSummary`: "Mañana · 17:00–18:00", "A la hora", la sección, la importancia; o "Cada día ·
  10:00"), que vuelven a abrir la ficha, una **×** que lo quita (vuelven los destinos y, si el título
  no se tocó, la frase entera tal como se escribió) y Detalles solo con su icono. Se añade igual con
  Intro o el botón redondo. Borrar todo el texto de la barra quita también la ficha (es empezar otra).
  En una rutina el último día no se puede quitar (como en su panel); una rutina que no cabe (50) deja
  la ficha como estaba.
- **Reglas** (`lib/details.ts`, puras y con tests): sin fecha no hay hora, duración, sección ni avisos
  "antes"; poner hora trae el aviso "a la hora" (como al escribirla) salvo que ya haya uno relativo;
  quitar la hora quita la duración. **Repetir** (cada día, entre semana, fines de semana o días
  sueltos) la convierte en rutina: la ficha se queda con los días y el **Aviso** (su hora, sin día), y
  al añadir se crea con `onRoutine` y su emoji. La importancia y la sección viajan en el `TaskDraft`
  hasta `task/add` (también por la bandeja: `InboxTask.importance` y `sectionId`, opcionales).
- Intro en el título suelta el teclado (deja ver los campos); añadir es el botón de abajo. Tras añadir,
  la ficha baja y la barra queda vacía.

### Elegir fecha u hora a mano (`PickerChip`)

Las píldoras de fecha y hora (Otro día, Elegir hora, Hasta…, Otra…, el resumen diario) abren el
selector nativo con un `<input>` oculto. **Nunca guardar en `onChange`**: iOS lanza `input` con
cada giro de la rueda, y guardar ahí fijaba valores de paso (un recordatorio con la primera hora por
la que pasaba; un "Hasta…" anterior al inicio que se recortaba a 12 h y hacía saltar la rueda). Lo
elegido queda en borrador y se guarda al cerrar el selector (`blur`, o al desmontar).

### Dictado

Con la barra vacía aparece el micrófono. Al hablar se crea la tarea sola (`parseSpoken`) y un
toast enseña lo entendido con "Deshacer".

- **Con los avisos activos** graba PCM con un `ScriptProcessor` (`voice/capture.ts`), corta al
  detectar 1,5 s de silencio, lo pasa a WAV de 16 kHz y lo transcribe el Worker con Whisper
  (`POST /v1/transcribe`, Workers AI). Es la única vía que funciona en la app instalada de
  iPhone: allí la Web Speech API existe pero no devuelve nada.
- **Interpretación con IA**: junto al audio va la fecha y hora local del móvil. El Worker pasa
  el texto a Nemotron 3 120B (Workers AI) con salida forzada por esquema JSON. Para cada tarea
  el modelo copia primero los tres fragmentos de la frase (`tema`, `cuando`, `avisos`) y luego
  los convierte en título, día, hora, duración y recordatorios: "bueno, hoy tengo que acudir a una
  cena a las 20:00, me gustaría que me lo recordaras media hora antes" → `Cena`, hoy, 20:00, 30 min
  antes; "el jueves tengo reunión con Jorge de 17:30 a 18:30" → `Reunión con Jorge`, jueves, 17:30,
  60 min (`durationMinutes`), que es lo que hace saltar la pregunta al acabar.
  - `prompt.ts`: reglas del título (evento sin verbo de ir: "Cena", "Boda de Carlos"; acción en
    infinitivo: "Llamar a Miguel"), calendario de tres semanas agrupado por semanas y ejemplos
    resueltos con las fechas del día.
  - Las cuentas las hace el código, no el modelo: `date` es `null` si la frase no dice día (el
    móvil aplica "hoy si la hora no ha pasado, si no mañana") y "en 20 minutos" llega como
    `inMinutes` y el Worker lo pasa a hora local.
  - Se valida en el Worker y otra vez en el móvil (`lib/interpret.ts`). Si la IA falla, tarda más
    de 8 s o no devuelve nada válido, se usa `parseSpoken` sobre el texto.
  - **Permiso**: nada dicho sale del dispositivo sin `settings.dictation` (App Store, norma
    5.1.2(i): IA de terceros). La primera vez que se toca el micrófono, `DictationConsent` (trozo
    aparte) dice adónde va el audio con un solo botón, **Continuar**, que graba en ese mismo toque
    (iOS solo abre el audio dentro de un gesto) y así lanza el permiso del micrófono. El panel no se
    cierra de otra forma: Apple (norma 5.1.1(iv)) rechaza un aviso previo que pida permiso por su
    cuenta ("Permitir") o deje aplazar el del sistema ("Ahora no"). `settings.dictation` se guarda
    cuando iOS concede el micrófono; si lo niega, un toast lleva a Ajustes y el panel vuelve la
    próxima vez. Siri sin permiso usa el analizador local (`sharesDictation`, que
    `QuickAdd` consulta antes de llamar al servidor). Se retira en Ajustes → *Dictado*. Es del
    dispositivo: importar una copia (`state/import`) no lo trae ni lo quita.
  - Lugar: el modelo copia también el fragmento `lugar` y devuelve solo el nombre dicho
    (`placeName`, `placeOn`). El móvil lo empareja con sus lugares guardados: la lista nunca
    se envía al servidor.
  - El modelo se eligió con `npm run eval` (66 frases, ahora 75 con las de lugar y duración) entre
    los del plan gratuito: Nemotron acertó 46/48 con ~1,2 s; Qwen 3.8 y Gemma 4 aciertan parecido pero tardan
    hasta 15–50 s en algunas frases, y Llama 3.3 se quedaba en 37–40/48. Cualquier cambio en el
    prompt se mide con el banco antes y después, y cada fallo nuevo se añade como caso.
  - Cuota: el plan gratuito de Workers AI da 10.000 neuronas al día, compartidas entre la app y
    `npm run eval`. Un dictado gasta ~140 (Whisper + prompt de ~2.000 tokens); si se agota, el
    dictado deja de funcionar hasta las 00:00 UTC. Workers AI lo indica con el error `4006`: el
    Worker responde 503 y la app avisa de a qué hora vuelve.
- **Analizador local** (`parseSpoken`, respaldo y única vía sin avisos): entiende las mismas
  frases salvo varias tareas a la vez. Quita muletillas y verbos de ir (`title.ts`), y reconoce
  "un cuarto de hora antes", "con media hora de antelación", "el día antes a las 8",
  "recuérdamelo por la mañana", "y otra vez a las…", "el 22", "el jueves 24", "la semana que
  viene, el martes", "a primera hora", "a las 20.00" y las duraciones ("durante una hora",
  "que dura media hora", "de las 5 a las 7", "hasta las 19:00").
- **Sin avisos** usa la Web Speech API del navegador si la hay (`voice/speech.ts`), siempre con
  el analizador local.
- El audio no se guarda ni se registra; el Worker descarta las alucinaciones típicas de
  Whisper con silencio ("Subtítulos realizados por…").

### Recordatorios

`Task.time` es opcional (`HH:MM`, solo cuenta con fecha). `Task.reminders` admite varios:

- `at`: instante absoluto (epoch ms).
- `before`: minutos antes de fecha + hora de la tarea. Sigue a la tarea si cambia de día;
  sin fecha u hora queda inactivo (se pinta atenuado y no se envía).

- `place`: al llegar a un lugar guardado o al salir (solo en la app de iPhone). No tiene
  instante: suena cada vez que se cruza el radio mientras la tarea siga pendiente y su día haya
  llegado (una tarea para mañana no avisa hoy).

Posponer (`task/snooze`) descarta los `at` que ya sonaron y añade uno nuevo. Máximo 20 por
tarea. Aparte de estos, una tarea con duración tiene su aviso al acabar, que no se guarda:
ver "Duración y aviso de cierre".

### Lugares

`AppState.places`: globales como las secciones, con nombre único (sin tildes ni artículo:
`placeKey`), **otros nombres** (`aliases`, hasta 8), ubicación (`null` hasta elegirla) y radio
(100–1000 m). Borrar un lugar quita sus avisos de las tareas.

- **Otros nombres** ("el piso", "casa de mis padres" para Casa): al escribir o dictar valen como el
  nombre (`findPlace`, `placeKeys`, las expresiones de `placePhrase.ts` y `parseEn.ts`). Ninguno
  repite el nombre ni otro nombre de otro lugar (`nameTaken`, `cleanAliases`; el reducer y
  `normalizeState` descartan los que chocan). Se ponen en el panel del lugar (`PlaceAliases`: píldoras
  con ×, "+ Otro nombre").
- **Lo dictado con otra grafía** (`matchPlace`): si no hay uno que se llame así, el que se le parece
  mucho (una letra cambiada, de más o de menos; dos desde 9 letras; nada por debajo de 5, que "casa" y
  "caja" no son lo mismo). Si dos se parecen igual, ninguno. Lo usan la IA (`interpret.ts`), un nombre
  sin guardar al escribir (`readPlacePhrase`) y la bandeja de Siri. Para comprobar que un nombre está
  libre, `findPlace` (exacto).
- **Elegir en el mapa** (`MapPicker.swift`, `TasksNative.pickLocation`, `pickOnMap`): Apple Maps a
  pantalla completa con una chincheta fija en el centro (sube al arrastrar y cae con un saltito), el
  círculo del radio a escala, los demás lugares con el suyo, "Mi ubicación" y abajo la dirección y
  **Usar este punto**. Tocar un punto lleva la chincheta allí; tocar un comercio del mapa
  (`selectableMapFeatures`) además da su nombre, que pasa al lugar si aún no tiene. Los textos llegan
  de la web, en el idioma de la app. En la web no hay mapa: `pickOnMap` devuelve `null`.

- **Pestaña Lugares** (`PlacesView`), al estilo de Google Maps: arriba un **mapa** de Apple Maps con
  tus sitios (`MapSnapshot`: `TasksNative.mapSnapshot` hace una foto con `MKMapSnapshotter`, estilo
  apagado y sin comercios, en el tema de la app, y devuelve dónde cae cada punto); encima, en HTML,
  una chincheta por lugar con el número de tareas pendientes allí, que lo abre. Mientras llega la
  foto, o si falla, un plano dibujado con los puntos en su sitio relativo (`lib/mapFrame.ts`). Un
  buscador flota sobre el borde ("Buscar o añadir un lugar") y debajo va una tarjeta por lugar:
  nombre, dirección, **distancia** (solo si ya hay permiso de ubicación: abrir la pestaña no lo
  pide), radio y sus tareas pendientes. **Tocar el mapa** (o su esquina con las dos flechas) abre el
  mapa de verdad para **añadir un lugar señalándolo**: lo elegido abre el panel de un lugar nuevo con
  la ubicación puesta (`PlaceRequest.location`) para ponerle nombre. Sin lugares y con permiso de
  ubicación, la foto es del barrio donde estás, no el dibujo. En la PWA la pestaña dice que es cosa
  del iPhone y lleva a la App Store (en `npm run dev` enseña la de verdad, con el plano dibujado, para
  poder probarla).
- **Panel del lugar** (`PlaceSheet`): nombre y otros nombres, mapa centrado con el radio a escala (se
  toca para abrir el de verdad y atinar), buscar en Apple Maps, **Elegir en el mapa** o usar la
  ubicación actual, **deslizador de radio** (100 m–1 km, de 50 en 50, el círculo lo sigue en
  vivo), las tareas con aviso allí y borrar.
- **Alta**: el buscador de la pestaña, o al escribir o dictar un sitio nuevo ("al pasar por
  Mercadona"): `parseTask` devuelve `newPlace`, `useAddTasks` crea el lugar y abre su editor
  buscando ese nombre en Apple Maps (ordenado por cercanía) o con la ubicación actual.
- **Frases**: `placePhrase.ts` reconoce "al llegar a / al pasar por / cuando esté en / al salir
  de". Un nombre sin guardar se queda con la primera palabra y las siguientes en mayúscula ("El
  Corte Inglés"). `parseTask(texto, ahora, null)` desactiva los lugares: así funciona la PWA, que
  no puede avisar por lugar y deja esas frases literales.
- **Regiones**: `placeAlerts` hace un aviso por lugar y sentido con todas sus tareas en el
  cuerpo; iOS vigila como mucho 20, con prioridad para lo de hoy o atrasado. Un aviso con varias
  tareas abre `PlaceTasksSheet`.

### App de iPhone

Capacitor carga `dist-native/` (build con `--mode native`: rutas relativas, sin service worker)
desde `capacitor://localhost`. `isNative` (`lib/platform`) decide el adaptador; la lógica pura es
la misma.

- **Avisos**: notificaciones locales, sin servidor. `useNativeSchedule` calcula `nativePlan` y lo
  aplica entero tras cada cambio y al volver a primer plano (huella para no repetir). iOS guarda
  como mucho **64 pendientes** entre hora y lugar: las regiones restan del hueco y se programan
  los avisos por hora más próximos. Ids numéricos estables (FNV-1a): por debajo de
  `PLACE_ID_BASE` hora, por encima lugar, para que cada lado limpie solo lo suyo.
- **Sonido**: el plugin de notificaciones programa en silencio si no recibe `sound`; `applyPlan`
  pasa `'default'` (un nombre sin fichero = sonido del sistema). Los de lugar y los que programa
  Siri (`NotificationPlanner`) usan `.default`.
- **Avisos por lugar**: `TasksNativePlugin.syncPlaceAlerts` crea `UNLocationNotificationTrigger`
  con `repeats: true` y permiso de ubicación **solo mientras se usa** (la región la vigila iOS).
  No re-añade los que no han cambiado: hacerlo estando dentro podría repetir el aviso. Se crean
  con id numérico y `userInfo.cap_extra` para que el plugin de notificaciones entregue el toque
  a la web como cualquier otro aviso.
- **Botones** "Hecha" y "+10 min" con `foreground: true`: el estado vive en la web y con la app
  en segundo plano iOS no garantiza que el WebView ejecute nada.
- **Almacenamiento**: fichero `tasks-state.json` en Library (entra en las copias de iCloud del
  dispositivo y iOS no lo borra al liberar espacio) más IndexedDB de respaldo. No comparte datos
  con la PWA: se pasa con Exportar/Importar.
- **Dictado**: igual que la PWA, pero el dispositivo se da de alta solo para dictar
  (`POST /v1/devices { voice: true }`, sin suscripción push); si el servidor lo olvida (401) se
  da de alta otra vez y se reintenta.
- **Siri y accesos rápidos**: "Añadir tarea" ("Apunta en Tasks") y "Pasar atrasadas a hoy" ("Pasa
  lo atrasado a hoy en Tasks") no abren la app: ver "Apuntar sin abrir la app" y "Pasar a hoy". "Mi
  semana en Tasks", "Nueva tarea" y `UIApplicationShortcutItems` sí la abren y
  pasan por `NativeActions`, que guarda la acción hasta que la web escucha (`retainUntilConsumed`).
  La web la valida con `parseNativeAction`.
- **Tres toques atrás**: las apps no pueden detectarlos, solo lanzar un atajo. Para dictar, el atajo
  *Dictar tarea* ("Dictar texto" + "Añadir tarea"). Para escribir, `ComposeTaskIntent` ("Nueva
  tarea", sin frase de Siri para no chocar con la de añadir), que abre la app con el teclado: envía
  `compose`, igual que el acceso rápido del icono.
- **Vibración** (`haptic`) al completar, borrar, elegir sitio, pasar el umbral al deslizar, cambiar
  de semana y en cada paso de los deslizadores.
- **Apariencia**: `lib/theme.ts` llama a `TasksNative.setAppearance` (fija
  `overrideUserInterfaceStyle` de las ventanas, así la rueda de la hora, el teclado y los menús van
  en el mismo tema; `auto` lo deja al sistema, y se guarda en `UserDefaults` para el próximo
  arranque) y pone la barra de estado con la tinta que toca (`Style.Light` de día, `Style.Dark` de
  noche). `Info.plist` ya no fuerza el modo claro y su `UIStatusBarStyle` es el del sistema. La
  pantalla de carga, en "Arranque".
- **Widget Hoy** (`ios/App/TasksWidget`, pequeño, mediano, grande y dos de pantalla de bloqueo): el
  bloque Hoy con lo atrasado en rojo y el número del icono. Con algo atrasado, **A hoy** (ver "Pasar
  a hoy"). Los títulos crecen con la importancia (`RowStyle.titleFont`). Mismos colores que
  `tokens.css` (`Palette`) y la cifra en New York; en la pantalla de inicio sigue el modo del iPhone
  (azul noche en oscuro); en la de bloqueo va siempre con la paleta de noche, porque iOS pinta por
  luminosidad y la tinta marino desaparecería. Datos por el App Group, con un fichero para cada lado:
  - La app escribe `widget-snapshot.json` con `widgetSnapshot` (`NativeWidget`, debounce 400 ms y
    al instante al pasar a segundo plano) y pide recargar. La foto trae lo atrasado y 7 días por
    delante: el widget tiene una entrada por medianoche y cambia de día sin abrir la app.
  - Tocar el círculo ejecuta `ToggleTaskIntent` en la extensión: apunta el cambio en
    `widget-changes.json`, quita los avisos pendientes de esa tarea y pone el número del icono. La
    web no corre ahí, así que al volver a primer plano `widgetChanges()` devuelve lo apuntado (y lo
    vacía), la web lo aplica con `task/toggle` y, si el widget quitó avisos, lanza
    `RESCHEDULE_EVENT` para reprogramar aunque la huella del plan no haya cambiado.
  - Enlaces `io.github.diegomolinacatala.tasks://today|compose|routines|task/<id>` (`WidgetLink`,
    `CFBundleURLTypes`) llegan a la web como acciones `today`, `compose`, `routines` y `open`.
  - Sin App Group (compilación sin firmar) el widget dice "Abre Tasks" y la web ignora el error.
- **Widget Bandeja** (`InboxWidget.swift`, pequeño, mediano, grande y rectangular de bloqueo): lo que
  no tiene fecha, en el orden de la app y lo pendiente primero, con la cifra de pendientes. El círculo
  lo tacha sin abrir la app (`ToggleTaskIntent`, el mismo de Hoy: `WidgetStore.toggle` busca también en
  la Bandeja), tocar una tarea la abre, el + abre la barra de escribir en la Bandeja (`://compose/inbox`
  → acción `compose` con `inbox`) y el resto, la Bandeja (`://backlog` → acción `backlog`). La foto lleva
  `inbox` (40 como mucho, `WIDGET_MAX_INBOX`); una foto anterior no la trae y el widget pide abrir la
  app. Una sola entrada (`policy: .never`): sin fecha no hay medianoche que cruzar, y la app recarga
  todos los widgets al escribir la foto.
- **Widget Rutinas** (`RoutinesWidget` en `TasksWidget.swift`, vistas en `TasksWidgetViews.swift`):
  pantalla de bloqueo redonda (anillo con lo hecho hoy y el **emoji** de la rutina; sus iniciales si
  no tiene, o la marca si ya está hecha) y rectangular (el emoji en el sitio del círculo, la rutina,
  su hora y "1 de 3 hoy"), y pequeño de inicio (las de hoy con su círculo y su emoji).
  **Un toque la tacha** sin abrir la app, también bloqueado (`ToggleRoutineIntent`, en
  `ToggleTaskIntent.swift`, `authenticationPolicy = .alwaysAllowed`). Se configura
  (`AppIntentConfiguration` + `RoutineWidgetIntent`, `RoutineEntity`/`RoutineQuery` leen la foto): una
  rutina concreta o "la siguiente que queda por hacer". Una entrada por medianoche: cada día amanece
  sin tachar sin abrir la app.
  - La foto (`widgetSnapshot`) lleva `routines` (emoji, días que tocan y diario de la última semana).
    `WidgetRoutine.emoji` es opcional en Swift: una foto de antes del emoji se lee igual, y sin él
    salen las iniciales (`badge`).
    Tacharla apunta `routines[id][día]` en `widget-changes.json` (`WidgetStore.setRoutine`), quita su
    aviso de hoy (pendiente y ya entregado) y, si se destacha, pide reprogramar. La web lo recoge con
    `widgetChanges()` (en la misma lista que las tareas: `{ routineId, date, done }`,
    `parseRoutineChanges`) y aplica `routine/set`. `headless.js` también lo cuenta (`projected`).
  - `WidgetChanges` se lee con `decodeIfPresent`: un fichero de una versión anterior no trae
    `routines` y no debe perder lo marcado.
- **Permisos**: el de notificaciones se pide solo la primera vez que hay algún recordatorio
  (`tasks:notifications-asked` en localStorage); después manda Ajustes de iOS. El de ubicación, al
  buscar un sitio o usar la ubicación actual (`LocationRequester.swift`). La pestaña Lugares avisa
  si está bloqueado.
- **Plugins**: app, filesystem, haptics, local-notifications, share, splash-screen y status-bar.
  **No** usar `@capacitor/geolocation`: la ubicación va por el plugin propio y su presencia
  provocó ITMS-90683. `Info.plist` lleva igualmente `NSLocationAlwaysAndWhenInUseUsageDescription`
  (Apple la exige si cualquier librería menciona esa API), aunque nunca se pide "siempre".
- **Privacidad**: `PrivacyInfo.xcprivacy` declara el identificador de dispositivo del dictado y, desde
  la 1.4, la atención al cliente (las sugerencias), los dos sin vínculo ni rastreo. Tiene que coincidir
  con las respuestas de App Store Connect (`docs/app-store.md` §4).
- **Sin Mac**: se compila en GitHub Actions (`macos-26`, gratis en repo público). No hay
  simulador ni Safari Web Inspector: lo nativo se prueba en el iPhone vía TestFlight. Los errores
  de compilación salen como anotaciones del workflow.
- **Cambios en Swift**: el compilado lo valida el CI en unos 2 minutos, pero cualquier cambio de
  comportamiento hay que pedir al usuario que lo pruebe en el iPhone.
- Swift nuevo = añadirlo a mano en `project.pbxproj` (PBXBuildFile, PBXFileReference, grupo y
  fase Sources) con ids de 24 hex únicos. Lo compartido con el widget lleva un PBXBuildFile en cada
  fase Sources.

### Apuntar sin abrir la app

Siri ("Apunta en Tasks") y la acción "Añadir tarea" de Atajos crean la tarea en segundo plano,
también con el iPhone bloqueado (`authenticationPolicy = .alwaysAllowed`). Pasar lo atrasado a hoy
(Siri, Atajos y el widget) va por el mismo camino: `QuickAdd.moveOverdue` → `moveOverdue` de
`headless.js` → entrada `move` en la bandeja, con avisos, icono y widget al día. Van en la misma cola
que las altas.

- **Escucha el sistema, no la app.** iOS no deja activar el micrófono desde segundo plano (Apple,
  DTS: *privacy block*); `AudioRecordingIntent` solo sirve si la sesión de audio ya se abrió con la
  app delante. Por eso no hay botón propio que grabe: el atajo *Dictar tarea* ("Dictar texto" +
  "Añadir tarea") hace de botón en tocar atrás, botón de acción, pantalla de bloqueo, centro de
  control y widget de Atajos (pasos en `docs/app-store.md` §2.1).
- **Flujo** (`QuickAdd.swift`): el intent corre en el proceso de la app, sin WebView →
  `HeadlessCore` carga `public/headless.js` en JavaScriptCore → con el permiso del dictado,
  `DictationServer` pide la interpretación a la IA (`POST /v1/interpret`, 6 s como mucho; sin
  permiso o si no responde, el analizador local) →
  `addFromText` (`src/lib/headless.ts`) con el fichero de estado, la bandeja y lo marcado en el
  widget → la entrada va a la bandeja y se aplican el plan de avisos (`NotificationPlanner`, con el
  mismo formato que el plugin de notificaciones para que los toques lleguen a la web), el número
  del icono y la foto del widget. Siri dice el mensaje: "Apuntada: Cena, hoy 20:00, 30 min antes".
- **La web sigue siendo la única que escribe el estado.** La bandeja (`Library/tasks-inbox.json`,
  `InboxStore.swift`, `src/lib/inbox.ts`) se aplica al cargar (`loadState`, antes de pintar: tocar
  el aviso de una de esas tareas ya la encuentra) y, con la app viva, al volver a primer plano o con
  la acción `inbox` (`NativeInbox`). Aplicar es idempotente por id: el reducer ignora un `task/add`
  con un id que ya existe. Una entrada sale de la bandeja cuando un estado que la contiene se ha
  escrito en el fichero (`settleInbox`, tras `writeStateFile`).
- **Sin fichero de estado** (la app aún no se ha abierto) solo se apunta: sin estado no se sabe qué
  avisos hay, y aplicar un plan vacío los borraría todos.
- **Si `headless.js` falla**, se guarda solo el texto y la web lo interpreta al aplicarlo, con la
  hora a la que se dijo e ids derivados del de la entrada (releerla no duplica).
- `headless.js` se construye aparte (`vite.headless.config.ts`, IIFE `TasksHeadless`) y
  `scripts/check-headless.mjs` lo ejecuta sin navegador: en lo que importe `src/lib/headless.ts` no
  puede haber `window`, `fetch`, `console` ni `setTimeout`. El contrato lleva `version` en los dos
  lados (5 desde el idioma: las entradas llevan `languages` y `consent` los recibe aparte).
- Swift se da de alta solo para el dictado (token en el llavero, distinto del de la web) y la URL
  del servidor la lleva `headless.js` (`VITE_PUSH_API` al compilar).
- Un lugar nuevo dicho a Siri nace sin ubicación; el mensaje pide abrir Tasks para ubicarlo.

### Avisos push

```
móvil: estado → upcomingSchedule() → cifra {taskId,title,body,badge,at} (AES-GCM) → PUT /v1/schedule
worker: PUT arma la alarma del DO al aviso más próximo → alarm() envía los vencidos por Web Push
        (payload = texto cifrado), borra y rearma para el siguiente
sw.ts: push → descifra con la clave local → showNotification → tocar abre /tasks/?task=<id>[&action=]
```

- **El móvil es la fuente de verdad.** `useScheduleSync` sube la agenda completa (debounce
  600 ms, huella para no repetir, reintento en `online` y al volver a primer plano). Al pasar
  a segundo plano sube al instante con `keepalive`: iOS congela la página en cuanto sales. Reemplazar
  entera hace que editar, completar, borrar o importar se resuelva solo.
- **El servidor no lee nada.** La clave AES es `CryptoKey` no exportable en IndexedDB,
  compartida con el service worker. Si no se puede descifrar, se muestra "Recordatorio":
  iOS retira el permiso a las webs que reciben push sin enseñar notificación.
- **Sin cuentas.** `POST /v1/devices` devuelve un token de 256 bits; el Worker guarda su
  SHA-256. El Worker solo hace peticiones a hosts de push conocidos (anti-SSRF).
- **Abuso**: límites nativos de Cloudflare (`[[ratelimits]]` en `wrangler.toml`) por IP
  anonimizada con `IP_HASH_SALT` en todas las rutas, por dispositivo en las escrituras y
  10/min para el dictado; altas máximas por IP y hora en D1; cuerpos cortados al
  leer el stream, sin fiarse de `content-length`.
- **Códigos del servicio push**: 404/410 borra el dispositivo; 400/413 descarta ese aviso;
  401/403 es VAPID mal configurado y **nunca** borra nada; el resto se reintenta 3 veces.
- **Por qué alarma y no cron**: los cron triggers de Cloudflare no llegaron a dispararse en
  producción. La alarma del DO `Scheduler` salta a la hora exacta y nunca se solapa consigo
  misma (sin envíos duplicados). El cron queda cada 5 min solo para rearmarla; no envía.
- `VAPID_SUBJECT` tiene que ser `mailto:` o `https://` con dominio real: Apple responde
  403 `BadJwtToken` a `localhost`.
- iOS: push solo con la app instalada en pantalla de inicio (iOS 16.4+) y el permiso se
  pide dentro de un gesto (`Notification.requestPermission` va lo primero en `enablePush`).
- **Contenido** (`lib/schedule.ts`): título = tarea; cuerpo = cuándo toca visto desde la hora
  del aviso ("En 10 min · 17:00", "Para hoy", "Pendiente desde ayer") y la sección.
- **Resumen del día** (opcional, `settings.digest`): un aviso diario a la hora elegida con las
  tareas de ese día y las que estarán atrasadas. Se programa para los próximos 7 días con ids
  `digest-AAAAMMDD` y se recalcula en cada sincronización.
- **Botones** "Hecha" y "+10 min" en la notificación (Android y escritorio; iOS no los
  muestra), más "Pasar a hoy" si la tarea ya es de un día anterior; el resumen diario con algo
  atrasado lleva "Pasar atrasadas a hoy" (`?action=today` sin tarea), y el aviso de cierre,
  "Sí, hecha" y "Todavía no" (`done` y `again`). El SW no toca el estado: abre la app con
  `?action=` y `useNotificationActions` lo aplica con un toast. Tocar el aviso sin botón abre la
  tarea con **Posponer**, salvo el de cierre (`?ask=1`), que repite la pregunta en un toast.
- Número en el icono: pendientes de hoy + atrasadas (`badgeCount`), actualizado por la app
  y por cada push.

## Estilo visual

"Old money": papelería de casa antigua. Papel marfil (`--bg`), tinta azul marino
(`--text`), coñac (`--accent`) para lo interactivo y lo completado, azul marino macizo
(`--primary`) para lo elegido y la acción principal, y oro viejo (`--gold`) solo para filetes.

**Modo oscuro** ("noche de biblioteca"), en Ajustes → Apariencia: **Claro**, **Oscuro** o
**Automático** (sigue al iPhone; es lo que trae una instalación nueva o una copia antigua). Azul
medianoche en vez de papel (`#121828`), tinta marfil (14:1), y los mismos acentos en pastel: camel
(9:1), rosa terracota para lo atrasado, oro pálido; lo elegido pasa a marfil macizo con tinta de
noche. Son los mismos tokens redefinidos en `:root[data-theme='dark']` (`tokens.css`): ningún
componente sabe en qué tema está (salvo las miniaturas de Ajustes, que enseñan cada uno a propósito).
Cambiar de tema extiende el nuevo en un círculo desde el dedo (View Transitions, `switchTheme`). La
apariencia es del dispositivo: importar una copia o borrarlo todo no la cambia.

- Letra: fechas, bloques (Atrasadas, Horario, Sin hora, Rutinas), títulos de panel, nombres de lugar
  y vacíos en **New York**
  (`--font-serif`: `ui-serif`, la serif del sistema, sin descargar nada); el resto, San Francisco.
  Secciones y etiquetas en versalitas espaciadas.
- Tokens en `src/styles/tokens.css`. **No hardcodear colores, espaciados ni duraciones.** Contrastes
  comprobados: tinta 13:1, secundario 6,5:1, terciario 4,6:1, coñac 5:1 sobre el papel; de noche,
  tinta 14:1, secundario 8:1, terciario 5,7:1, camel 9:1. Cualquier color nuevo, en los dos temas.
- `--danger` (ladrillo) significa una sola cosa: atrasado (o borrar). No se usa de adorno.
- Movimiento: completar rellena el círculo con rebote (`--ease-pop`), dibuja la marca y tacha a
  pluma; las filas se deslizan a su sitio (`lib/flip.ts`, solo las que se ven); los paneles suben
  con la curva de iOS y bajan más deprisa; los avisos entran y salen; el filete de oro de las
  pestañas se desliza; el día nuevo entra por el lado hacia el que se va; la marca de "ahora" late.
- La marca (señal a pluma en tinta, doble filete de oro en el icono) sale de `scripts/brand.mjs`:
  cambiarla ahí y `npm run icons`.
- CSS por componente, junto al componente. Clases en kebab-case estilo BEM ligero.
- Animar solo `transform` y `opacity`.
- Respetar `prefers-reduced-motion` y las safe areas (`--safe-t`, `--safe-b`, `--kb`).
- Los `inputs` van a 16px para que iOS no haga zoom al enfocar.

## Convenciones

- Ficheros pequeños y por dominio (200–400 líneas; 800 es el techo).
- Comentarios solo donde el *porqué* no se deduce del código, y en español.
- Nada de `console.log` en el código final.
- Los tests cubren `src/lib` y `src/state` (umbral 80%). El pegamento de React y de
  navegador (`push/client.ts`, `push/keystore.ts`, `voice/capture.ts`, `voice/speech.ts`,
  `sw.ts`) se prueba en el dispositivo.
- En `worker/` el acceso a datos va detrás de la interfaz `Store`: los tests usan
  `memoryStore()` y un `Sender` falso; `store.ts`, `push.ts` e `index.ts` son adaptadores.

## Decisiones cerradas

- **Sin cuentas ni login.** El repo es público: nunca añadir claves privadas. Los secrets
  del Worker viven en Cloudflare (`wrangler secret put`) y en GitHub Actions, igual que la clave
  de App Store Connect.
- **Un solo código para PWA y app de iPhone.** La PWA sigue publicándose; lo nativo va detrás de
  `isNative` y no cambia el comportamiento de la web. Lo que Swift necesite de la lógica (Siri sin
  abrir la app) se ejecuta con JavaScriptCore, no se reescribe en Swift.
- **La web es la única que escribe el estado.** Lo que nace fuera (widget, Siri) se apunta aparte y
  la web lo aplica al cargar o al volver a primer plano.
- **El Worker sirve a todas las versiones instaladas.** Se despliega al momento y la gente no
  actualiza a la vez: sus rutas y respuestas cambian solo de forma compatible hacia atrás.
- **Backend solo para avisos, dictado y sugerencias**, sin acceso a lo guardado: nada de guardar
  tareas en claro en el servidor. El audio del dictado se transcribe al momento y no se conserva. Una
  sugerencia es lo único que se guarda con contenido, porque quien la manda lo decide y lo ve antes.
- **Sin sincronización entre dispositivos.** El trasvase es manual: exportar/importar JSON
  desde Ajustes.
- **Sin subtareas ni notas** por ahora. Lo que se repite no son tareas recurrentes sino **rutinas**:
  no generan copias por día ni se "reinician"; cada día se tachan en su diario.
- Las secciones son globales y agrupan dentro del día, no son listas independientes.
- Al completar una tarea baja al final de su bloque; no se oculta.
- La importancia es tamaño, no orden ni etiqueta: nada se reordena solo por ser importante.
- La duración existe para poder preguntar al acabar, no para planificar el día: no hay bloques de
  tiempo ni se avisa de solapes. Lo que no se dice no dura.
- Tasks no es un calendario, pero enseña el tuyo: los eventos del calendario del iPhone se leen y se
  enseñan en la Agenda, nunca se crean ni se cambian desde la app (para eso, su ficha de Calendario) ni se
  guardan. Sin cuentas de Google ni Microsoft: lo que no esté en el Calendario del iPhone se añade allí.
- Pasar a hoy nunca es automático dentro de la app: lo decide el usuario (o su automatización de
  Atajos). Lo único que va solo con hoy es una tarea con plazo, porque el plazo lo puso el usuario.
- Un plazo no es una rutina ni una tarea recurrente: se hace una vez. "De lunes a viernes" es rutina;
  "del lunes al viernes", plazo.
- Una tarea sin fecha no tiene sección: al mandarla a `Sin fecha` se le quita.
- Lo atrasado y completado no se muestra: es historia, no deuda.
- Dos idiomas, español e inglés, y ninguno más por ahora. La IA del dictado solo en español: en inglés
  entiende el analizador del móvil.
- Modo oscuro sí, pero con la misma identidad: colores apagados y pastel, nada chillón. El papel
  marfil sigue siendo la cara de la app (icono, capturas).
- Cuatro pestañas y ninguna más (Bandeja, Agenda, Lugares, Ajustes). Lo que no es de primer nivel
  va en paneles.

## Despliegue

- **App**: `.github/workflows/deploy.yml` construye y publica en cada push a `main`
  (tests → typecheck → build → Pages). Lee la variable de repo `VITE_PUSH_API`; sin ella la
  app sale igual, sin avisos. La `base` de Vite es `/tasks/`: si el repo se renombra, hay
  que cambiarla en `vite.config.ts` (afecta también a `start_url` y `scope` del manifiesto)
  y en `ALLOWED_ORIGINS` de `worker/wrangler.toml`.
- **App de iPhone**: `.github/workflows/ios.yml` en `macos-26` al tocar la app (`src`, `ios`,
  `public`, dependencias…) en `main` o `capacitor`. Sin secretos solo compila; con ellos firma y
  sube a TestFlight en `main`, `capacitor`, a mano y en la ejecución programada.
  - Se archiva **sin firmar** y la firma de distribución la pone `-exportArchive` con el
    certificado que Apple gestiona en la nube. Firmar al archivar usa el modo desarrollo, que exige
    iPhones registrados en la cuenta ("Your team has no devices").
  - La exportación copia los entitlements de la firma que ya tiene cada binario: por eso
    `scripts/sign-archive.sh` firma el archivo ad hoc con `App.entitlements` y
    `TasksWidget.entitlements` antes de exportar. Sin eso, el App Group no llega a TestFlight. El
    paso "Comprobar la firma subida" lee `DistributionSummary.plist`, pero al exportar con
    `destination: upload` no aparece y solo avisa: la prueba real es que el widget vea las tareas.
  - El App Group y el identificador `io.github.diegomolinacatala.tasks.widget` tienen que existir en
    developer.apple.com con el grupo asignado a los dos identificadores (`docs/app-store.md` §1.7).
  - "Run workflow" solo aparece cuando el workflow está en `main`.
  - Se relanza el día 1 de cada dos meses (solo desde `main`) porque TestFlight caduca a los 90 días.
  - Número de compilación = `github.run_number`; versión = `MARKETING_VERSION` del proyecto (1.4,
    cuatro veces en `project.pbxproj`: app y widget, Debug y Release). Tiene que ser mayor que la
    última aprobada, o la subida falla (`ITMS-90186`/`ITMS-90062`): tras cada aprobación se sube.
    Pasos de una actualización en `docs/app-store.md` §9.
  - Tras subir, Apple procesa 5–30 min y avisa por correo de problemas del binario (`ITMS-…`).
  - Si "Firmar y subir a TestFlight" falla con *exportArchive The request timed out* seguido de *No
    profiles for … were found*, es Apple que no respondió al pedir los perfiles (pasó con la 30): sin
    tocar nada, en la ejecución fallida **Re-run jobs → Re-run failed jobs** (lo hace el usuario: sin
    `gh` no se puede relanzar).
- **Worker**: `.github/workflows/deploy-worker.yml` al tocar `worker/` (typecheck → tests →
  esquema D1 → `wrangler deploy`). Usa el secret `CLOUDFLARE_API_TOKEN` (plantilla *Edit Cloudflare
  Workers* más *Account → D1 → Edit*) y la variable `CLOUDFLARE_ACCOUNT_ID`; sin el token solo
  valida. Para relanzarlo sin cambios: Actions → Deploy worker → Run workflow.
