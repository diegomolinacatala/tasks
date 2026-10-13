# Lugares y Ajustes

Auditoría de experiencia (no de código) de la pestaña **Lugares** (`src/components/places/*`) y la pestaña **Ajustes** entera (`src/components/settings/*`, `update/*`, `calendar/*`, `push/*`). Rama `capacitor`, 12/10/2026. Todo lo que se afirma está leído en el código; donde algo solo se puede comprobar en el iPhone se dice.

## Resumen (lo que más chirría)

1. **El panel del lugar pierde cambios en silencio**: si el nombre queda vacío al cerrar (lo borró sin querer, o eligió un punto del mapa sin comercio), no se guarda *nada*, ni la ubicación ni el radio ni los otros nombres (`PlaceSheet.tsx:139`). Y crear un lugar con un nombre que ya existe **sobrescribe la ubicación** del que había sin avisar (`PlaceSheet.tsx:148-152`).
2. **Importar copia sustituye todo sin confirmar y sin deshacer**; Borrar todo y Borrar lugar tampoco se deshacen (`SettingsView.tsx:137-156`, `PlaceSheet.tsx:209-219`). El resto de la app deshace casi todo con un toast; aquí, donde más duele, no.
3. **Los toasts que salen con un panel abierto no se ven**: `.toast` va en z 50 y `.sheet` en z 60. "Sin permiso de ubicación → Ajustes", "No se ha podido abrir el mapa", "«el piso» ya lo usa Casa" y "No se pudo crear el calendario «Tasks»" se disparan con el panel delante y quedan detrás del velo (`toast.css:7`, `sheet.css:5`).
4. **Ajustes mezcla cinco maneras de elegir una opción** (tarjetas, lista con marca, píldoras "No | Cada mañana", interruptor, control segmentado) y enseña ~21 cosas tocables de golpe. Idioma, Resumen del día y Dictado pueden plegarse a una fila cada uno con el mismo interruptor que ya usa Calendario.
5. **"Abrir Ajustes" dentro de la pestaña Ajustes** (avisos, calendario, ubicación) y una guía que promete "tus eventos salen solos en la Agenda" antes de conceder el permiso (`CalendarGuide.tsx:54`): el usuario no sabe a qué Ajustes va ni por qué no sale nada al volver.

## Hallazgos

### LA-01 · El panel del lugar no guarda nada si el nombre queda vacío · [CRÍTICO]
- **Dónde**: Lugares › panel del lugar › cerrar (`src/components/places/PlaceSheet.tsx:137-158`)
- **Qué ve/hace el usuario**: Abre un lugar, cambia el radio, añade "el piso" como otro nombre, toca el mapa y mueve el punto… y en algún momento borra el nombre (o lo selecciona para reescribirlo y cierra). Al bajar el panel no pasa nada visible. Al volver a abrirlo, todo está como antes. Lo mismo si viene del mapa de la pestaña: "Tocar el mapa → Añadir aquí" en un punto sin comercio llega con `name: ''` (`PlacesView.tsx:127`), y si cierra sin escribir un nombre la ubicación elegida se pierde sin un aviso.
- **Problema**: `close()` solo despacha dentro de `if (request && name)`: con nombre vacío se descartan *todos* los cambios del borrador, no solo el nombre. No hay acción principal ("Añadir lugar") como sí tienen la rutina (`RoutineSheet.tsx:255`) y la ficha del compositor (`ComposeSheet.tsx:144`), así que nada indica que el panel está "a medias". Regla: data-loss-prevention, primary-action, consistency.
- **Propuesta**:
  - Lugar existente: si el nombre queda vacío, conservar el anterior y guardar el resto (`name: cleanPlaceName(draft.name) || place.name`).
  - Lugar nuevo: pie fijo con `sheet__primary` **Añadir lugar** / **Add place**, deshabilitado sin nombre (como "Añadir rutina"); al abrir con ubicación y sin nombre (`request.location && !request.name`), `autoFocus` en el campo del nombre. Si aun así se cierra con ubicación y sin nombre, toast "Ponle nombre para guardarlo" / "Give it a name to save it" con acción **Volver** / **Back** que reabre el mismo `request`.
- **Esfuerzo**: S (existente) + M (pie y reapertura)

### LA-02 · Un lugar nuevo con un nombre que ya existe pisa el que había · [ALTO]
- **Dónde**: Lugares › "Buscar o añadir un lugar" › cerrar (`src/components/places/PlaceSheet.tsx:146-154`)
- **Qué ve/hace el usuario**: Tiene "Casa" (su piso). Añade otro lugar, escribe "Casa", busca la casa de sus padres, la elige, cierra. No sale ningún aviso. En la lista sigue habiendo una sola "Casa", ahora en la dirección de sus padres: `location: draft.location ?? existing.location` y `radius: draft.radius` sobrescriben el lugar existente y se le suman los otros nombres.
- **Problema**: El reducer no admite dos lugares con el mismo nombre (`reducer.ts:273`), y el panel resuelve el choque fusionando en silencio. Para un rename sí avisa (`copy.clash`, línea 143), para un alta no. Regla: error-prevention, feedback.
- **Propuesta**: Al cerrar un lugar nuevo cuyo nombre choca con uno existente (`findPlace`), no fusionar: toast "Ya tienes un lugar llamado Casa" / "You already have a place called Casa" con acción **Ver** / **View** que abre el existente; el borrador nuevo se descarta (o, mejor, se reabre con el nombre marcado para cambiarlo). Dejar la fusión solo para el caso en que el existente no tenga ubicación (es el flujo de "al pasar por Mercadona" dictado).
- **Esfuerzo**: S

### LA-03 · Importar copia sustituye todo sin confirmar ni deshacer · [CRÍTICO]
- **Dónde**: Ajustes › Datos › Importar copia (`src/components/settings/SettingsView.tsx:137-145`, `197-200`, `206-216`)
- **Qué ve/hace el usuario**: Toca "Importar copia", elige un `.json` en Archivos y, sin más preguntas, todas sus tareas, rutinas, secciones y lugares pasan a ser los del fichero. Toast "Copia importada." sin Deshacer. La única advertencia es la nota gris de 12 px al pie del grupo ("Importar sustituye lo que haya ahora."), después de tres filas.
- **Problema**: Es la acción más destructiva de la app (puede borrar meses de datos) y es la única que no pide un segundo toque ni ofrece deshacer. Un usuario que quiera "traer" las tareas de la PWA al iPhone (el trasvase es manual, decisión cerrada) pierde las del iPhone. Regla: confirmation-dialogs, undo-support, destructive-nav-separation.
- **Propuesta**: Tras parsear el fichero y antes de despachar, confirmar con el mismo patrón de dos toques que ya usa Borrar todo, con la cifra: fila en coñac "Sustituir 14 tareas y 2 rutinas por las de la copia (42 tareas)" / "Replace 14 tasks and 2 routines with the backup’s (42 tasks)". Y tras importar, toast "Copia importada: 42 tareas, 3 rutinas" con **Deshacer** (`state/replace` con el estado anterior, guardado en un ref durante los 4,2 s del toast). Con el estado actual vacío (0 tareas, 0 rutinas, 0 lugares) importar directamente, sin confirmar.
- **Esfuerzo**: S

### LA-04 · Borrar todo no se puede deshacer y no dice qué se queda · [ALTO]
- **Dónde**: Ajustes › Datos › Borrar todo (`src/components/settings/SettingsView.tsx:147-156`, `201-204`; `src/state/reducer.ts:430-440`)
- **Qué ve/hace el usuario**: Toca "Borrar todo" (la fila se pone en ladrillo y dice "Toca otra vez para borrarlo todo"); un segundo toque en 4 s lo borra: toast "Todo borrado." y nada más. Apariencia, idioma, calendario y bienvenida se conservan (bien), pero no se dice.
- **Problema**: El segundo toque cae en el mismo sitio que el primero: un toque doble por error (o un rebote al hacer scroll) lo borra. Sin deshacer. Regla: undo-support, destructive-nav-separation.
- **Propuesta**: Mantener los dos toques pero (a) que el texto del segundo lleve la cifra ("Borrar 14 tareas, 2 rutinas y 3 lugares" / "Delete 14 tasks, 2 routines and 3 places") y (b) toast "Todo borrado." con **Deshacer** (`state/replace` con el estado anterior). Además, la fila de confirmación podría moverse a un `sheet__row--danger` dentro de un panel pequeño con **Cancelar**, que es como lo hace iOS; el patrón de dos toques vale, pero no para lo que no se puede deshacer.
- **Esfuerzo**: S

### LA-05 · Borrar un lugar quita avisos de las tareas sin deshacer · [ALTO]
- **Dónde**: Lugares › panel del lugar › Borrar lugar y sus avisos (`src/components/places/PlaceSheet.tsx:209-219`, `332-340`; `src/state/reducer.ts:302-309`)
- **Qué ve/hace el usuario**: Toca "Borrar lugar y sus avisos", el texto cambia a "Toca otra vez para borrar", segundo toque: vibra, el panel se cierra, el lugar desaparece de la lista y las tareas que tenían "Al llegar a Mercadona" se quedan sin ese aviso. Ningún toast, ningún Deshacer.
- **Problema**: Borrar una tarea o una rutina se deshace desde un toast; borrar un lugar (que además toca varias tareas) no. El texto de confirmación no dice cuántas tareas se ven afectadas aunque el panel las acaba de listar en "Avisos aquí". Regla: undo-support, consistency.
- **Propuesta**: Segundo toque con la cifra: "Borrar y quitar 3 avisos" / "Delete and remove 3 reminders" (0 → "Borrar lugar"). Tras borrar, toast "Mercadona borrado" con **Deshacer**: nueva acción `place/restore { place, reminders: [{ taskId, reminder }] }` que devuelve el lugar y los avisos quitados (el reducer ya sabe qué tareas tocó: basta guardarlo antes de despachar).
- **Esfuerzo**: M

### LA-06 · Los toasts disparados con un panel abierto quedan detrás · [ALTO]
- **Dónde**: `src/components/ui/toast.css:7` (`z-index: 50`) frente a `src/components/ui/sheet.css:5` (`z-index: 60`). Disparos afectados: `PlaceSheet.tsx:169-173` (sin permiso de ubicación, con acción **Ajustes**), `PlaceSheet.tsx:203` (no se pudo abrir el mapa), `PlaceAliases.tsx:54` («el piso» ya lo usa Casa), `CalendarExportSheet.tsx:64` (no se pudo crear «Tasks»), `ReminderPicker.tsx:78` ("Esa hora ya ha pasado", fuera de mi área pero mismo fallo).
- **Qué ve/hace el usuario**: Con la ubicación denegada, abre un lugar y toca "Usar mi ubicación actual": el botón se atenúa un instante y no pasa nada. El toast con la salida ("Sin permiso de ubicación · Ajustes") existe, pero está debajo del panel y del velo. Lo mismo al escribir un otro nombre que ya usa otro lugar: la píldora no aparece y no sabe por qué.
- **Problema**: El propio CLAUDE.md lo reconoce para las sugerencias ("un toast quedaría debajo"), y por eso `FeedbackSheet` pinta el error dentro. Pero el resto de paneles siguen usando `useToast`. Regla: feedback, error-recovery.
- **Propuesta**: La más barata y general: `.toast { z-index: 65 }` y `bottom` con margen sobre `--safe-b` cuando hay panel (el toast ya es una tarjeta marino que se lee sobre el papel del panel). Alternativa por panel: una línea `sheet__note` en coñac bajo el control que falló (como ya hace `search.failed` en `PlaceSheet.tsx:294`) con el enlace a Ajustes en línea. Hacer una de las dos y revisar los cinco disparos.
- **Esfuerzo**: S

### LA-07 · Tocar el mapa de Lugares abre "Nuevo lugar", no el mapa · [MEDIO]
- **Dónde**: Lugares › mapa (`src/components/places/PlacesView.tsx:149-193`; `places.css:227-242`)
- **Qué ve/hace el usuario**: Ve un mapa con sus chinchetas y una esquina con dos flechas (⤢, aria "Abrir el mapa"). Toca el mapa para mirarlo o acercarlo (es lo que hace en Google Maps) y se le abre Apple Maps a pantalla completa titulado "Nuevo lugar" con un botón "Añadir aquí". Para salir sin añadir tiene que encontrar "Cerrar".
- **Problema**: La foto no se mueve (idea aplazada), así que cualquier toque en 230 px de mapa es "crear". El icono de expandir promete "ver más grande", no "añadir". Regla: match-expectations, affordance.
- **Propuesta**: Que el toque diga lo que hace: cambiar la esquina ⤢ por una píldora pequeña con icono + texto, como el buscador: **"+ En el mapa"** / **"+ On the map"** (`aria-label` "Añadir un lugar en el mapa"), y que el toque en el resto de la foto haga lo mismo pero que el picker se abra con título "Añadir un lugar" / "Add a place" (ya lo lleva `copy.newPlace`: basta renombrarlo) y el botón de confirmar "Añadir aquí" como está. Nada más: no hace falta mapa interactivo.
- **Esfuerzo**: S

### LA-08 · "Buscar o añadir un lugar" abre un formulario con el buscador en tercer lugar y sin teclado · [MEDIO]
- **Dónde**: Lugares › píldora del buscador → panel "Nuevo lugar" (`PlacesView.tsx:195-201`; `PlaceSheet.tsx:222-267`)
- **Qué ve/hace el usuario**: Toca "Buscar o añadir un lugar". Sube un panel con: campo "Nombre" (sin foco), "OTROS NOMBRES · + Otro nombre", "DÓNDE", y por fin el campo "Buscar en Mapas". El teclado no sale; tiene que tocar otra vez, y lo natural es tocar "Nombre", que no busca nada.
- **Problema**: La píldora dice "Buscar" y lo primero que se ofrece es poner un nombre a algo que aún no existe. Dos toques y un scroll para empezar a buscar. Regla: primary-action, progressive-disclosure.
- **Propuesta**: En un lugar nuevo sin nombre ni ubicación, `autoFocus` en el campo "Buscar en Mapas" (`enterKeyHint="search"` ya está) y que ese campo vaya **antes** que el nombre mientras no haya ubicación (elegir un resultado ya rellena el nombre: `PlaceSheet.tsx:279`). El nombre se queda arriba una vez hay ubicación. Y ver LA-09 para los otros nombres.
- **Esfuerzo**: S

### LA-09 · "Otros nombres" se enseña en un lugar que aún no tiene nombre · [MEDIO]
- **Dónde**: panel del lugar (`src/components/places/PlaceSheet.tsx:232`; `PlaceAliases.tsx:63-107`)
- **Qué ve/hace el usuario**: Antes de escribir "Casa" ya le ofrecen "+ Otro nombre". Es una función para quien dicta ("al llegar al piso"), que descubre un amigo por el buzón, no algo que haga falta al crear el lugar.
- **Problema**: Ocupa un bloque entero (título en versalitas + píldora) en el panel más largo de la app, antes de lo esencial (dónde está). Regla: progressive-disclosure.
- **Propuesta**: Enseñar el bloque solo cuando `cleanPlaceName(draft.name)` no esté vacío **y** haya ubicación (o sea, en un lugar ya hecho), y como una fila plegada bajo el nombre: "Otros nombres · el piso, casa de mis padres ›" que al tocarla despliega las píldoras. Sin otros nombres: "+ Otro nombre" como una línea pequeña bajo el campo del nombre, no como bloque con título.
- **Esfuerzo**: S

### LA-10 · Buscar no dice "buscando" ni "nada con ese nombre" · [MEDIO]
- **Dónde**: panel del lugar › Buscar en Mapas (`src/components/places/PlaceSheet.tsx:269-294`; `usePlaceSearch.ts:27-68`)
- **Qué ve/hace el usuario**: Escribe "mercadona ruzafa"; durante 350 ms de espera más la petición no cambia nada; si Apple no devuelve nada, tampoco: la lista sigue vacía y no sabe si está buscando, si no hay red o si no existe. `searching` se calcula (`usePlaceSearch.ts:67`) pero no se pinta. Solo el fallo de red tiene texto ("No se ha podido buscar. Revisa la conexión.").
- **Problema**: Sin estado de carga ni vacío. Regla: feedback, empty-states.
- **Propuesta**: Bajo el campo, una línea `sheet__note`: mientras `searching` → "Buscando…" / "Searching…"; con consulta ≥ 2 letras, sin resultados y sin fallo → "Nada con ese nombre. Elígelo en el mapa." / "Nothing by that name. Choose it on the map." (la fila "Elegir en el mapa" está justo debajo: queda como salida natural).
- **Esfuerzo**: S

### LA-11 · Con ubicación puesta, tres controles hacen lo mismo que el mapa · [MEDIO]
- **Dónde**: panel del lugar › DÓNDE (`src/components/places/PlaceSheet.tsx:234-303`)
- **Qué ve/hace el usuario**: En un lugar ya ubicado ve: el mapa (tocable: "abrir el mapa para ajustar el punto"), la dirección, el campo "Buscar en Mapas", la fila "Elegir en el mapa" (hace exactamente lo mismo que tocar el mapa: ambos `chooseOnMap`) y "Usar mi ubicación actual". Cinco cosas para una decisión que ya está tomada.
- **Problema**: Redundancia (mapa y fila) y controles de "cambiar" al mismo nivel que la información. Regla: progressive-disclosure, redundancy.
- **Propuesta**: Con `draft.location`: mapa + dirección y, debajo, una sola fila "Cambiar ubicación ›" / "Change location ›" que despliega el buscador y "Usar mi ubicación actual". Quitar la fila "Elegir en el mapa" cuando el mapa está a la vista (es su esquina ⤢). Sin `draft.location`: como ahora (buscador, Elegir en el mapa, Mi ubicación).
- **Esfuerzo**: S

### LA-12 · Lugares vacío en el iPhone no dice para qué sirve · [MEDIO]
- **Dónde**: Lugares sin lugares (`src/components/places/PlacesView.tsx:140-246`, estado vacío en `177-181`); la bienvenida no tiene lámina de lugares (`src/components/welcome/*`: ninguna escena los nombra)
- **Qué ve/hace el usuario**: Kicker "0 SITIOS", título "Lugares", un plano dibujado con un icono de mapa en oro y la píldora "Buscar o añadir un lugar". Nada dice que esto sirve para que le avise al pasar por el súper. La PWA, en cambio, sí lleva la frase (`copy.pitch`, línea 37), pero ahí no se puede usar.
- **Problema**: La única pantalla donde una frase sí ayuda (el vacío) no la tiene, y la bienvenida tampoco cubre lugares. Regla: empty-states.
- **Propuesta**: Con `places.length === 0`, bajo la píldora, la misma `places__pitch` que ya existe para la PWA: «Avisos al llegar o al salir de un sitio: "al pasar por Mercadona, comprar leche".» / “Reminders when you arrive at or leave a place: ‘when I get to Walmart, buy milk’.” Es texto que ya está escrito y aprobado; solo cambia dónde sale. Y kicker "Sin lugares" / "No places" en lugar de "0 sitios".
- **Esfuerzo**: S

### LA-13 · La distancia y el orden por cercanía no aparecen hasta reiniciar la app · [MEDIO]
- **Dónde**: `src/components/places/PlacesView.tsx:79-96` (permiso y posición se leen una vez al montar; la pestaña se conserva con `<Activity>`), `usePlaceSearch.ts:32,46` (`origin` se cachea; tras un `null` nunca se vuelve a pedir)
- **Qué ve/hace el usuario**: Entra en Lugares sin permiso de ubicación: sin distancias (correcto). Añade un lugar, busca y iOS pide el permiso; lo concede. Vuelve a la pestaña: sigue sin distancias y las tarjetas no se reordenan; los resultados de búsquedas siguientes salen sin "350 m" y sin ordenar. Hasta que mate la app.
- **Problema**: Un estado que cambia fuera (el permiso) no se vuelve a leer. Regla: state-freshness, match-expectations.
- **Propuesta**: En `PlacesList`, repetir la lectura en `visibilitychange` (como hace `NativePushProvider`) y cuando `permission` pase a `granted`. En `usePlaceSearch`, no cachear el `null`: si `origin.current === null`, volver a intentar `nearby()` en la siguiente búsqueda (barato: `currentPosition` falla al instante sin permiso).
- **Esfuerzo**: S

### LA-14 · Un lugar dictado sin ubicar no avisa de que el aviso no sonará · [MEDIO]
- **Dónde**: escribir/dictar "al pasar por Mercadona" → `useAddTasks.ts:22-23` abre el panel del lugar nuevo; si se cierra sin ubicación queda `location: null`. Se ve después en `PlacesView.tsx:228` ("Sin ubicación: toca para elegirla", en ladrillo) y en `ReminderPicker.tsx:179-184` ("Elegir dónde está Mercadona").
- **Qué ve/hace el usuario**: Dicta, se le abre un panel con resultados de Mapas, pero tiene prisa y lo baja. La tarea existe, la píldora dice "Al llegar a Mercadona" y nada le dice en ese momento que ese aviso no puede sonar. Lo descubre si abre la tarea o la pestaña Lugares.
- **Problema**: La recuperación existe (dos sitios la señalan) pero el momento en que se pierde no da feedback. Regla: feedback, error-recovery.
- **Propuesta**: Si `PlaceSheet` se cierra con `placeId` nuevo (o `request.name` dictado) y `draft.location === null`, toast "Mercadona sin ubicación: el aviso no sonará" / "Mercadona has no location: the reminder won’t go off" con acción **Ubicar** / **Set it** que reabre el panel. El toast sale ya sin panel delante (ver LA-06).
- **Esfuerzo**: S

### LA-15 · Ajustes: cinco controles distintos para la misma clase de decisión, y ~21 cosas tocables a la vez · [ALTO]
- **Dónde**: Ajustes entero (`src/components/settings/SettingsView.tsx:168-264`): Apariencia = tres tarjetas (`AppearancePicker.tsx:29-58`), Idioma = lista con marca de tres filas (`LanguagePicker.tsx:38-62`), Resumen del día = píldoras "No | Cada mañana" (`NotificationsBlock.tsx:105-127`), Calendario = interruptor (`CalendarBlock.tsx:134-141`), Dictado = control segmentado "No enviar la voz | Permitido" (`DictationBlock.tsx:23-42`).
- **Qué ve/hace el usuario**: En un iPhone con todo concedido ve, de arriba abajo: 3 tarjetas, 3 filas de idioma, 3 filas de avisos (una con dos píldoras), 4 filas de calendario, un segmentado con un párrafo legal de tres líneas, una línea de cifras + 3 filas de datos, y 6 filas de "Tasks" con otra nota. Unas 21 cosas tocables y 5 notas. Cada grupo le pide aprender un control nuevo: en Idioma se toca una fila y sale una marca; en Resumen del día hay que entender que "No" es una píldora y "Cada mañana" otra que además abre una rueda; en Dictado, que "No enviar la voz" y "Permitido" son los dos extremos de una sola cosa.
- **Problema**: Falta un lenguaje común de controles y sobra lo que puede plegarse. Regla: consistency, progressive-disclosure.
- **Propuesta**: Usar el `Switch` (ya existe, 44 px, iOS) para todo lo que es sí/no, y una fila con valor › para lo que tiene más de dos opciones:
  - **Idioma**: una fila "Idioma · Automático (Español) ›" que abre un `Sheet` con las tres opciones y su marca (la lista actual, tal cual, dentro del panel). Dos filas menos.
  - **Resumen del día**: fila con `Switch`; encendido, aparece debajo la fila "Hora · 08:30 ›" (`PickerChip`). Fuera "No" y "Cada mañana" como píldoras. Mismo patrón que "En la Agenda → Calendarios".
  - **Dictado**: fila "Dictado con IA" con `Switch` y la nota debajo solo mientras esté encendido o plegada en "Qué se envía ›" (el texto de `dictationNotice()` lo exige Apple para el consentimiento, no para Ajustes).
  - **Apariencia** se queda como está: las tarjetas son el único control que de verdad necesita verse (enseñan el tema).
  - Resultado: ~14 tocables y 3 notas, y solo dos tipos de control (tarjeta y fila/interruptor).
- **Esfuerzo**: M

### LA-16 · "Abrir Ajustes" dentro de la pestaña Ajustes · [MEDIO]
- **Dónde**: `NotificationsBlock.tsx:16-17` ("Bloqueados: abrir Ajustes", "…en Ajustes → Notificaciones → Tasks"), `CalendarBlock.tsx:21-22` ("Sin permiso: abrir Ajustes", "En Ajustes, toca Calendarios…"), `CalendarGuide.tsx:31,56-57` ("Abre Ajustes…", "Abrir Ajustes"), `PlaceSheet.tsx:46` (acción del toast "Ajustes"), `PlacesView.tsx:203-213`
- **Qué ve/hace el usuario**: Está en la pestaña **Ajustes** de Tasks y lee "Bloqueados: abrir Ajustes". ¿Estos? Toca y la app se va a los Ajustes del iPhone, a la página de Tasks, donde tiene que encontrar "Notificaciones". La guía del calendario le dice "Abre Ajustes y ve tocando: Apps › Calendario…" y el botón "Abrir Ajustes" le deja en otra página distinta (lo explica una nota en 12 px).
- **Problema**: Mismo nombre para dos sitios, en la pantalla donde más se confunden. Regla: clarity, i18n-terms.
- **Propuesta**: Siempre que se refiera a iOS, decir **"Ajustes del iPhone"** / **"iPhone Settings"**: "Bloqueados: abrir Ajustes del iPhone", "Sin permiso: Ajustes del iPhone", botón de la guía "Abrir Ajustes del iPhone", acción del toast "Ajustes del iPhone". En la PWA (Safari), "ajustes del sistema" ya está bien en `ReminderPicker`.
- **Esfuerzo**: S

### LA-17 · La guía del calendario promete que los eventos "salen solos" aunque no esté conectado · [ALTO]
- **Dónde**: Ajustes › Calendario › "Añadir Google u Outlook" con `calendar.status === 'prompt'` o `'denied'` (`CalendarBlock.tsx:100-126` enseña `guideRow` en los tres estados; `CalendarGuide.tsx:54,91`: "Vuelve a Tasks: tus eventos salen solos en la Agenda.")
- **Qué ve/hace el usuario**: No ha tocado "Ver mi calendario en la Agenda". Abre la guía, añade su cuenta de Google en iOS (cinco pasos), vuelve a Tasks… y la Agenda sigue igual, porque el permiso no está pedido. La guía le dijo que saldrían solos. Callejón sin salida hasta que, por casualidad, toque la fila de conectar.
- **Problema**: Un paso final falso según el estado. Regla: error-recovery, flow-coherence.
- **Propuesta**: El último paso según `status`: con `granted` el texto actual; con `prompt`/`denied`: "Vuelve a Tasks y toca **Ver mi calendario en la Agenda**." / "Come back to Tasks and tap **Show my calendar in the Agenda**." Mejor aún: en `prompt`, que el pie de la guía ofrezca directamente **Conectar el calendario** además de Abrir Ajustes (son dos botones, pero solo en ese estado). Y en `prompt`, ordenar las filas al revés: primero conectar, debajo la guía (ya es así, bien).
- **Esfuerzo**: S

### LA-18 · "Programados 23 · sin sincronizar": una cifra de desarrollador y un error sin salida · [MEDIO]
- **Dónde**: Ajustes › Avisos (estado `on`) (`src/components/settings/NotificationsBlock.tsx:55-59, 96-104`; `useNativeSchedule.ts:40-43`, `useScheduleSync.ts:62-68`)
- **Qué ve/hace el usuario**: Una fila fija "Programados · 23". No es tocable y no sabe qué cuenta (en el iPhone incluye una entrada por cada día de cada rutina: 3 rutinas → 21). Si algo falló, al número se le pega " · sin sincronizar", sin decir qué significa ni qué hacer; se reintenta solo en el próximo cambio o al volver a la app, pero eso no se dice.
- **Problema**: Información interna en la cara del usuario y un estado de error sin acción. Regla: error-recovery, plain-language.
- **Propuesta**: Quitar la fila en estado normal (no aporta nada que no diga ya cada tarea). Si `syncFailed`, una fila en ladrillo tocable "Los avisos no se han podido programar · Reintentar" / "Reminders couldn’t be scheduled · Retry" (PWA: "…no se han podido subir"), que fuerce `sync()` (hoy no está expuesto en el contexto: añadir `retry()` a `PushContextValue`).
- **Esfuerzo**: S

### LA-19 · "Añadir mis tareas" muestra "…" si el calendario elegido ya no existe · [MEDIO]
- **Dónde**: Ajustes › Calendario › Añadir mis tareas (`src/components/settings/CalendarBlock.tsx:84`; `CalendarExportSheet.tsx:88-100`; `CalendarExportSync.tsx:22-35`)
- **Qué ve/hace el usuario**: Eligió "Calendario «Tasks»". Un día lo borra desde la app Calendario de iOS (o desconecta la cuenta de iCloud). En Ajustes la fila dice "Añadir mis tareas · …" y en el panel no hay nada marcado. Mientras, `CalendarExportSync` sigue mandando las tareas a un `calendarId` muerto; lo que haga Swift con eso no se ve.
- **Problema**: Un estado roto representado con tres puntos. Regla: error-recovery, empty-states.
- **Propuesta**: Cuando `calendars` ya haya cargado y `settings.export` no esté entre ellos: valor de la fila "No encontrado" / "Not found" en ladrillo y, al abrir el panel, una nota arriba "El calendario elegido ya no está en el iPhone. Elige otro." / "The chosen calendar is no longer on this iPhone. Pick another." con la opción «Tasks» lista para volver a crearlo. Y que `CalendarExportSync` no envíe nada a un id que no existe.
- **Esfuerzo**: S

### LA-20 · Si las tareas no llegan al calendario, nadie lo dice · [MEDIO]
- **Dónde**: `src/components/calendar/CalendarExportSync.tsx:29-32` (`catch` silencioso: "Se reintenta con el próximo cambio")
- **Qué ve/hace el usuario**: Elige el calendario del trabajo para que su secretaria vea sus tareas. Si EventKit falla (calendario de solo lectura que cambió, cuota, permiso degradado), no pasa nada visible: Ajustes sigue diciendo "Añadir mis tareas · Trabajo".
- **Problema**: Fallo silencioso de una función cuyo único valor es que lo de fuera esté al día. Regla: feedback, error-recovery.
- **Propuesta**: Un estado `exportFailed` (en `CalendarApi` o un store pequeño como `updateState.ts`) que `CalendarBlock` enseñe como nota en ladrillo bajo la fila: "No se han podido añadir al calendario. Se volverá a intentar." / "They couldn’t be added to the calendar. It’ll try again." Sin toast (puede fallar en segundo plano).
- **Esfuerzo**: S

### LA-21 · "Sugerir una mejora" está al final de una página larga · [MEDIO]
- **Dónde**: Ajustes › grupo "Tasks", última sección (`src/components/settings/SettingsView.tsx:220-233`)
- **Qué ve/hace el usuario**: Un amigo al que le han dicho "dime qué cambiarías" abre Ajustes y tiene que bajar hasta el final (Apariencia, Idioma, Avisos, Calendario, Dictado, Datos…) para encontrarlo.
- **Problema**: Es la función que el dueño quiere que sus amigos descubran, y está donde iOS pone "Acerca de". Regla: discoverability, information-hierarchy.
- **Propuesta**: Grupo propio **"Ayuda"** / **"Help"** justo encima de "Datos" con "Sugerir una mejora" (y su nota) y "Soporte"; dejar en "Tasks" (abajo) Ver la bienvenida, Valorar, Privacidad, Actualizar y la versión. Con LA-15 aplicado la página es más corta y el problema se reduce, pero la jerarquía sigue mandando.
- **Esfuerzo**: S

### LA-22 · El aviso de versión nueva puede saltar mientras se escribe · [BAJO]
- **Dónde**: `src/components/update/UpdatePrompt.tsx:71-73, 101-111, 145` (`paused` solo con bienvenida o modo sugerencia; se comprueba 3 s tras abrir y en cada `visibilitychange`)
- **Qué ve/hace el usuario**: Abre la app, toca la barra, está escribiendo "cena con Carlota ma…" y a los 3 s sube la ficha "Tasks 1.7 ya está aquí" encima del teclado. Si la aparta con el asa, no vuelve a salir nunca (se marca como "Ahora no": línea 145).
- **Problema**: Interrumpe y además un gesto de "quítate" cuenta como decisión definitiva. Regla: interruption, undo-support.
- **Propuesta**: `paused` también mientras `composing` o con un `Sheet` abierto; si se cierra con el asa o el velo, no guardar `DISMISSED_KEY` (solo con el botón **Ahora no**): así reaparece en la siguiente apertura.
- **Esfuerzo**: S

### LA-23 · "Avisos aquí" lista tareas que no se pueden abrir · [BAJO]
- **Dónde**: panel del lugar › Avisos aquí (`src/components/places/PlaceSheet.tsx:321-330`; `places.css:478-491`)
- **Qué ve/hace el usuario**: Ve "Comprar leche", "Devolver el libro" como texto plano. Toca una y no pasa nada. Desde el aviso de lugar sí se abren (`PlaceTasksSheet`), desde aquí no.
- **Problema**: Lista que parece de filas y no lo es. Regla: affordance, consistency.
- **Propuesta**: Reutilizar `TaskRow` como en `PlaceTasksSheet` (tachar desde aquí y abrir), o al menos `sheet__row` con chevron que cierre el panel y abra la tarea (`PlaceRequest.onOpenTask`).
- **Esfuerzo**: S

### LA-24 · Un título "ACCIONES" para una sola fila de borrar · [BAJO]
- **Dónde**: `src/components/places/PlaceSheet.tsx:332-340`
- **Qué ve/hace el usuario**: Al final del panel, un rótulo en versalitas "ACCIONES" y debajo solo "Borrar lugar y sus avisos" en ladrillo.
- **Problema**: Rótulo que no agrupa nada. Regla: noise.
- **Propuesta**: Quitar el título; la fila en ladrillo al final, separada por `margin-top: var(--sp-5)`, como en iOS.
- **Esfuerzo**: S

### LA-25 · "RADIO" sin decir radio de qué · [BAJO]
- **Dónde**: `src/components/places/PlaceSheet.tsx:305-319` (título visible `copy.radius` "Radio"; "Radio del aviso" solo en `aria-label`)
- **Qué ve/hace el usuario**: Un deslizador de 100 m a 1 km bajo "RADIO". El círculo del mapa crece con él (bien), pero nada dice qué pasa al entrar o salir de ese círculo.
- **Propuesta**: Título "RADIO DEL AVISO" / "REMINDER RADIUS" (el texto ya existe en `copy.radiusLabel`) y, bajo el deslizador, una `sheet__note` corta: "Avisa al entrar o salir de este círculo." / "Alerts when you enter or leave this circle." Es la única línea explicativa del panel y responde a la pregunta que todos se hacen.
- **Esfuerzo**: S

### LA-26 · El radio desaparece de la tarjeta cuando hay tareas · [BAJO]
- **Dónde**: `src/components/places/places.css:407-409` (`.place-card__tasks ~ .place-card__radius { display: none }`), `PlacesView.tsx:240`
- **Qué ve/hace el usuario**: Unas tarjetas enseñan "150 m" abajo a la derecha y otras no; la diferencia es que tengan tareas, no que el radio importe menos.
- **Propuesta**: O siempre (en la línea de la dirección: "Calle Ruzafa 12 · 150 m") o nunca (es un detalle de edición). Nunca es más limpio.
- **Esfuerzo**: S

### LA-27 · Áreas de toque por debajo de 44 px · [BAJO]
- **Dónde**: esquina ⤢ del mapa 32 × 32 (`places.css:452-459`, botón real en `234-242`); cabeza de la chincheta 30 px (`places.css:181-186`); píldoras `.chip` 38 px de alto (`sheet.css:109`: otros nombres, "No | Cada mañana", "+ Otro nombre"); segmentado 40 px (`settings.css:134-136`: Dictado, pestañas de la guía).
- **Qué ve/hace el usuario**: En la pestaña Lugares, atinar a la esquina o a una chincheta entre otras cuesta; a veces se abre el picker en vez del lugar.
- **Propuesta**: `::after` con `inset: -6px` en `.map__expand.places__expand` y en `.pin` (como ya hace `.switch::after`, `calendar.css:51-55`); `.chip { min-height: 40px }` y `.segmented__option { min-height: 44px }` no rompen nada.
- **Esfuerzo**: S

### LA-28 · Colores fijos fuera de `tokens.css` · [BAJO]
- **Dónde**: `src/components/settings/CalendarExportSheet.tsx:90` (`'#8a5a2c'` para el punto del calendario «Tasks»); `src/components/settings/calendar.css:70` (sombra de la bola del interruptor en `rgba(0,0,0,…)`); `settings.css:187-231` (tarjetas de Apariencia: fijos a propósito y comentados, correcto).
- **Qué ve/hace el usuario**: En modo oscuro el punto de «Tasks» es coñac oscuro sobre azul noche (lo apaga `.cal-tone`, se ve, pero no es el camel del tema). Si en el iPhone ya existe el calendario, su color real (`own.color`) se ignora.
- **Propuesta**: En el panel, `own?.color ?? FALLBACK` y, para el fallback, leer `--accent` (`getComputedStyle`) o pasar la clase `.calpick__dot--own { --cal: var(--accent) }`. La sombra del interruptor puede usar `var(--shadow-card)`.
- **Esfuerzo**: S

### LA-29 · "sitio" en el kicker, "lugar" en todo lo demás · [BAJO]
- **Dónde**: `src/components/places/PlacesView.tsx:24` ("1 sitio" / "3 sitios") frente a "Lugares", "Nuevo lugar", "Lugar", "Buscar o añadir un lugar" (`PlacesView.tsx:25-31`, `PlaceSheet.tsx:47-48`). En inglés es "place" siempre.
- **Propuesta**: Kicker "1 lugar" / "3 lugares"; con 0, "Sin lugares" (ver LA-12). Como repite la palabra del título justo debajo, también valdría quitar la cifra del kicker y poner "Avisos por lugar" / "Place reminders" como membrete.
- **Esfuerzo**: S

### LA-30 · En inglés, "Reminders" es a la vez el grupo de avisos y los recordatorios de la tarea · [BAJO]
- **Dónde**: `src/components/settings/NotificationsBlock.tsx:29` (grupo "Reminders", "Turn on reminders", "Notification settings") frente a `ReminderPicker.tsx:43` ("Reminders" en la tarea). En español están separados: "Avisos" / "Recordatorios".
- **Qué ve/hace el usuario**: En inglés, "Reminders: Scheduled 12 / Daily summary / Notification settings" parece hablar de los recordatorios de sus tareas, y "Turn off reminders" suena a borrar los de las tareas (solo da de baja el dispositivo).
- **Propuesta**: Grupo "Notifications" en inglés ("Turn on notifications", "Turn off notifications"); "Reminders" queda para la tarea. En español, dejar "Avisos".
- **Esfuerzo**: S

### LA-31 · Textos en inglés que no suenan a inglés · [BAJO]
- **Dónde**: `DictationBlock.tsx:8` ("Don’t send my voice" | "Allowed": no son paralelos; en español tampoco: "No enviar la voz" | "Permitido"); `CalendarExportSheet.tsx:32` ("One just for your tasks, apart from yours"); `SettingsView.tsx:71` ("See the welcome"); `NotificationsBlock.tsx:38` ("Off") frente a `CalendarBlock.tsx:43` ("Off") y el español "No" en ambos (`NotificationsBlock.tsx:22`, `CalendarBlock.tsx:27`).
- **Propuesta**: Con el interruptor de LA-15 el segmentado desaparece; si se mantiene, "Off" | "On" / "No" | "Sí". "A separate calendar, just for your tasks." / "Uno aparte, solo para tus tareas." "See the intro again" / "Ver la bienvenida otra vez". Para el valor apagado, "Off" en inglés y "No" en español están bien, pero que sea el mismo criterio en las dos filas (hoy ya lo es).
- **Esfuerzo**: S

### LA-32 · "Exportar copia · .json" · [BAJO]
- **Dónde**: `src/components/settings/SettingsView.tsx:192-196`
- **Qué ve/hace el usuario**: Una fila con el valor ".json" a la derecha, como si fuera un ajuste. En la PWA, además, tras tocar no hay ninguna confirmación (el navegador descarga en silencio).
- **Propuesta**: Quitar ".json". En la PWA, toast "Copia guardada: tasks-2026-10-12.json" / "Backup saved: …". En el iPhone la hoja de compartir ya es la confirmación.
- **Esfuerzo**: S

### LA-33 · La línea de cifras de Datos no cuenta los lugares · [BAJO]
- **Dónde**: `src/components/settings/SettingsView.tsx:181-190` (pendientes, tareas, rutinas, secciones)
- **Propuesta**: Añadir lugares en el iPhone ("3 lugares"); y "pendientes" ⊂ "tareas" se entiende, pero "12 tareas (3 pendientes)" lo deja más claro.
- **Esfuerzo**: S

### LA-34 · La versión solo se ve en el iPhone · [BAJO]
- **Dónde**: `src/components/settings/SettingsView.tsx:102-108, 263` (`App.getInfo()` nativo; en la PWA nada)
- **Qué ve/hace el usuario**: Quien escriba a soporte desde la PWA no puede decir qué versión usa.
- **Propuesta**: En la PWA, la fecha del build (`define` en `vite.config.ts`: `__BUILD_DATE__`) como "Versión del 8 oct 2026" / "Build Oct 8, 2026".
- **Esfuerzo**: S

### LA-35 · Iconos que dicen otra cosa · [BAJO]
- **Dónde**: `NotificationsBlock.tsx:128-132` (campana tachada `IconBellOff` en "Ajustes de notificaciones": en el iPhone no desactiva nada, abre iOS); `CalendarBlock.tsx:158-163` (una marca de verificación `IconCheck` en "Añadir mis tareas", que en el resto del panel significa "elegido").
- **Propuesta**: "Ajustes de notificaciones" con `IconArrowUpRight` (sale de la app, como Soporte); "Añadir mis tareas" con `IconCalendar` o el icono de la tarea (círculo).
- **Esfuerzo**: S

### LA-36 · La pestaña Lugares en la PWA manda a la App Store también desde Android · [BAJO]
- **Dónde**: `src/components/places/PlacesView.tsx:251-273`
- **Qué ve/hace el usuario**: En un Android, "Solo en iPhone · Lugares · Descargar en la App Store": un botón que no le sirve de nada.
- **Propuesta**: Mantener la frase (`pitch`) y enseñar el botón solo si `/iPhone|iPad/.test(navigator.userAgent)`. En Android, en su lugar: "Por ahora, solo en la app de iPhone." / "For now, iPhone app only."
- **Esfuerzo**: S

### LA-37 · "Desactivar avisos" en la PWA también apaga el dictado sin decirlo · [BAJO]
- **Dónde**: `src/components/settings/NotificationsBlock.tsx:128-132` → `PushProvider.tsx:105-117` (`disable` da de baja el dispositivo) y `canTranscribe: status === 'on'` (`PushProvider.tsx:138`): el grupo Dictado desaparece de Ajustes y el micrófono vuelve al reconocimiento del navegador.
- **Propuesta**: Nota bajo la fila: "Sin avisos, el dictado usa el del navegador." / "Without notifications, dictation uses the browser’s." (solo PWA).
- **Esfuerzo**: S

### LA-38 · A los 50 lugares, añadir uno no hace nada · [BAJO]
- **Dónde**: `src/lib/places.ts:11` (`MAX_PLACES = 50`), `src/state/reducer.ts:274` (`place/add` devuelve el estado sin cambios); ningún componente lo comprueba (`grep MAX_PLACES src/components`: sin resultados).
- **Propuesta**: En `PlaceSheet.close()`, si `state.places.length >= MAX_PLACES` y es nuevo, toast "Ya hay 50 lugares: borra alguno para añadir otro." (mismo patrón que `routineLimit` en `App.tsx:93`).
- **Esfuerzo**: S

### LA-39 · Tocar un otro nombre lo quita · [BAJO]
- **Dónde**: `src/components/places/PlaceAliases.tsx:67-78` (la píldora entera es el botón de quitar; la × es decorativa); añadir uno repetido o igual al nombre no dice nada (`48-61`)
- **Qué ve/hace el usuario**: Toca "el piso" para corregirlo y desaparece. Escribe "Casa" como otro nombre de Casa, Intro, y no pasa nada.
- **Propuesta**: Es el mismo patrón que las píldoras de recordatorio, así que es coherente; al menos `haptic('selection')` al quitar y, al descartar por repetido, un `sheet__note` breve "Ya está" / "Already there". Si se quiere editar, tocar = campo con el texto, × = quitar.
- **Esfuerzo**: S

### LA-40 · `PlaceTasksSheet` repite el nombre del lugar dos veces · [BAJO]
- **Dónde**: `src/components/places/PlaceTasksSheet.tsx:39-40` (`title` del `Sheet` y `<p className="sheet__title">` con el mismo nombre en versalitas)
- **Propuesta**: Quitar el `<p>` o poner en él algo útil: "3 pendientes aquí" / "3 pending here". Y un pie con **Hecho** no hace falta (el asa basta), pero sí que al tachar la última diga "No quedan tareas en este lugar." (ya lo hace: bien).
- **Esfuerzo**: S

### LA-41 · "Resumen del día": tocar "Cada mañana" lo activa aunque se cancele la rueda · [BAJO]
- **Dónde**: `src/components/settings/NotificationsBlock.tsx:115-125` (`onOpen` despacha `enabled: true` antes de elegir; por defecto 08:30, `reducer.ts:20`)
- **Qué ve/hace el usuario**: Toca por curiosidad, cierra la rueda sin elegir, y el resumen queda activado a las 08:30; la píldora pasa a "Cada día a las 08:30". Es defendible (eso es "cada mañana"), pero con el interruptor de LA-15 el comportamiento queda explícito.
- **Propuesta**: Cubierto por LA-15 (interruptor + fila de hora).
- **Esfuerzo**: S

### LA-42 · "Añadir mis tareas" sigue activo con "En la Agenda" apagado · [BAJO]
- **Dónde**: `src/components/settings/CalendarBlock.tsx:128-165` (la fila de exportar no depende de `settings.enabled`)
- **Qué ve/hace el usuario**: Apaga "En la Agenda" pensando "desconectar el calendario" y sus tareas siguen yendo al calendario del trabajo. Funciona así a propósito (son dos cosas), pero la fila no lo dice.
- **Propuesta**: Con `enabled === false` y `export !== null`, nota bajo el grupo: "Tus tareas siguen añadiéndose a «Trabajo»." / "Your tasks are still being added to ‘Work’."
- **Esfuerzo**: S

### LA-43 · La nota de avisos bloqueados en la PWA da la ruta de iOS en cualquier navegador · [BAJO]
- **Dónde**: `src/components/settings/NotificationsBlock.tsx:17` ("Actívalos en Ajustes → Notificaciones → Tasks.")
- **Propuesta**: Solo si `/iPhone|iPad/.test(navigator.userAgent)`; si no, "Permítelos en los ajustes del sitio de tu navegador." / "Allow them in your browser’s site settings."
- **Esfuerzo**: S

### LA-44 · Mientras se activan los avisos no se ve que algo pasa · [BAJO]
- **Dónde**: `src/components/settings/NotificationsBlock.tsx:84-92` (`disabled={push.busy}`, opacidad 0,5 y nada más)
- **Propuesta**: Texto "Activando…" / "Turning on…" mientras `busy` (la petición al Worker puede tardar un par de segundos).
- **Esfuerzo**: S

### LA-45 · El panel del lugar no tiene un orden pensado para leerlo · [MEDIO]
- **Dónde**: `src/components/places/PlaceSheet.tsx:221-341`: Nombre › Otros nombres › Dónde (mapa, dirección, buscador, Elegir en el mapa, Mi ubicación) › Radio › Avisos aquí › Acciones.
- **Qué ve/hace el usuario**: Para un lugar hecho, la información útil (dónde, qué tareas tiene) está mezclada con los controles de "cambiar", y lo que mira primero (el mapa) está debajo de un bloque de píldoras.
- **Problema**: Sin jerarquía entre ver y editar. Es la suma de LA-08, LA-09, LA-11, LA-23, LA-24 y LA-25; se enumera aparte porque la solución es un solo reordenado.
- **Propuesta** (lugar existente): Nombre · mapa (tap = ajustar) · dirección · "Cambiar ubicación ›" (plegado) · Radio del aviso (deslizador + nota) · Avisos aquí (filas tocables) · "Otros nombres · el piso ›" (plegado) · Borrar (ladrillo, sin rótulo). Lugar nuevo: buscador con foco · Elegir en el mapa · Mi ubicación · (al tener ubicación) nombre, mapa, radio · pie "Añadir lugar".
- **Esfuerzo**: M

## Lo que está bien (para no tocarlo)

- **Calendario en Ajustes** es el grupo mejor resuelto: una acción principal clara en cada estado (conectar / abrir Ajustes / interruptor), lo secundario en paneles (Calendarios, Añadir mis tareas) y el tutorial plegado en una fila. Las notas son cortas y dicen lo que importa ("Todo queda en este iPhone"). El toast "Listo: tu calendario ya sale en la Agenda." cierra el ciclo.
- **CalendarGuide**: pestañas por proveedor, la ruta como migas, la lista de cuentas de iOS con el dedo donde hay que tocar y la nota para iOS 17. La explicación de por qué "Abrir Ajustes" cae en la página de Tasks es honesta y útil.
- **CalendarExportSheet**: el aviso de que un calendario compartido lo verán otros está en el lead, antes de elegir; «Tasks» recomendado y explicado en una línea; la nota del sentido único.
- **CalendarPicker**: agrupado por cuenta, un toque = ver/ocultar, y la nota "En el iPhone siguen igual" quita el miedo.
- **UpdatePrompt**: sello con el número, titular, "Tus tareas se quedan como están", novedades tal cual, Actualizar / Ahora no, y la fila en Ajustes como recuerdo. Es un modelo de aviso que no abruma.
- **Apariencia**: tres tarjetas que enseñan el tema, marca al elegir, el círculo de tinta. **Idioma** nombra cada idioma en sí mismo y dice cuál es el del sistema.
- **Estados denegados** (avisos, calendario, ubicación en la pestaña Lugares) siempre tienen una fila/botón que lleva a iOS, en ladrillo. Solo falta decir "del iPhone" (LA-16).
- **Patrón de dos toques** para borrar, coherente entre Borrar todo y Borrar lugar, con el texto que cambia; solo le falta el deshacer.
- **Tarjetas de lugar**: nombre en serif, distancia en coñac, dirección o "Sin ubicación: toca para elegirla" en ladrillo (la pista de recuperación está en el sitio), las tareas como píldoras con "+N". Orden por cercanía.
- **Buscador que flota sobre el mapa** y resultados ordenados por distancia con dirección: se entiende a la primera.
- **La PWA explica Lugares en una frase** y lleva a la app, sin fingir que funciona.
- **El flujo "al pasar por Mercadona"**: crea el lugar, abre el panel ya buscando ese nombre y, si se queda sin ubicar, la tarea y la tarjeta lo señalan (solo falta el toast del momento, LA-14).
- `Switch` con 44 px de toque, `Slider` que se coge desde cualquier punto con el valor sobre el dedo y vibración por paso.
- Importar/borrar conservan apariencia, idioma, calendario y bienvenida (son del dispositivo): bien decidido, aunque haya que decirlo (LA-04).

## Inventario de controles

| Control | Pantalla | Qué hace | Veredicto |
|---|---|---|---|
| Mapa (toda la foto) | Lugares | Abre el picker de Apple Maps como "Nuevo lugar" | REVISAR (LA-07) |
| Esquina ⤢ del mapa | Lugares | Lo mismo que el mapa; 32 px | REVISAR (LA-07, LA-27) |
| Chincheta de un lugar | Lugares › mapa | Abre el panel de ese lugar; cifra = tareas pendientes allí | OK (toque 30 px: LA-27) |
| Píldora "Buscar o añadir un lugar" | Lugares | Abre el panel de lugar nuevo (sin foco, nombre primero) | REVISAR (LA-08) |
| Aviso "Ubicación bloqueada…" | Lugares (permiso denegado y ≥1 lugar) | Abre Ajustes del iPhone | OK (texto: LA-16) |
| Tarjeta de lugar | Lugares | Abre el panel del lugar | OK |
| Enlace "Descargar en la App Store" | Lugares (PWA) | apps.apple.com en pestaña nueva | OK en iOS; REVISAR en Android (LA-36) |
| Campo "Nombre" | Panel del lugar | Nombre; vacío al cerrar = no se guarda nada | REVISAR (LA-01) |
| Píldoras de otros nombres + "+ Otro nombre" | Panel del lugar | Tocar = quitar; campo que añade al salir | REVISAR (LA-09, LA-39) |
| Mini mapa (tap) | Panel del lugar (con ubicación) | Abre el picker para ajustar el punto | OK (redundante con la fila: LA-11) |
| Campo "Buscar en Mapas" | Panel del lugar | Busca en Apple Maps al escribir (≥2 letras, 350 ms) | REVISAR (LA-10) |
| Resultado de búsqueda | Panel del lugar | Fija ubicación (y nombre si estaba vacío) | OK |
| Fila "Elegir en el mapa" | Panel del lugar | Abre el picker | REVISAR (LA-11) |
| Fila "Usar mi ubicación actual" | Panel del lugar | `currentPosition`; sin permiso, toast con "Ajustes" (oculto) | REVISAR (LA-06) |
| Deslizador "Radio" | Panel del lugar | 100 m–1 km de 50 en 50; el círculo lo sigue | OK (título/nota: LA-25) |
| Lista "Avisos aquí" | Panel del lugar | Solo texto | REVISAR (LA-23) |
| Fila "Borrar lugar y sus avisos" | Panel del lugar | Dos toques en 4 s; borra lugar y quita avisos; sin deshacer | REVISAR (LA-05, LA-24) |
| Asa / velo / Escape | Panel del lugar | Cierra y guarda (o no: LA-01) | REVISAR (LA-01) |
| Fila de tarea (`TaskRow`) | PlaceTasksSheet | Tachar o abrir la tarea | OK (título doble: LA-40) |
| Tarjetas Claro / Oscuro / Automático | Ajustes › Apariencia | Cambia el tema con círculo de tinta | OK |
| Filas Automático / Español / English | Ajustes › Idioma | Cambia el idioma con fundido | OK (plegar en una fila: LA-15) |
| Nota "En iPhone: Compartir → Añadir…" | Ajustes › Avisos (needs-install) | Informativa | OK |
| Fila "Activar avisos" | Ajustes › Avisos (off) | Pide permiso / registra el dispositivo | OK (busy: LA-44) |
| Fila "Bloqueados: abrir Ajustes" | Ajustes › Avisos (denied, iPhone) | Abre Ajustes del iPhone | OK (texto: LA-16) |
| Nota "Bloqueados. Actívalos en Ajustes → …" | Ajustes › Avisos (denied, PWA) | Informativa | REVISAR (LA-43) |
| Fila "Programados · N" | Ajustes › Avisos (on) | Estática; " · sin sincronizar" si falló | REVISAR (LA-18) |
| Píldoras "No" / "Cada mañana" (resumen) | Ajustes › Avisos (on) | Apaga / enciende y abre la rueda de hora | REVISAR (LA-15, LA-41) |
| Fila "Ajustes de notificaciones" (iPhone) / "Desactivar avisos" (PWA) | Ajustes › Avisos (on) | Abre iOS / da de baja el dispositivo | OK (icono: LA-35; nota PWA: LA-37) |
| Fila "Ver mi calendario en la Agenda" | Ajustes › Calendario (prompt) | Pide permiso, enciende, toast | OK |
| Fila "Sin permiso: abrir Ajustes" | Ajustes › Calendario (denied) | Abre Ajustes del iPhone | OK (texto: LA-16) |
| Interruptor "En la Agenda" | Ajustes › Calendario (granted) | Enciende/apaga los eventos en la Agenda | OK |
| Fila "Calendarios · 3 de 5" | Ajustes › Calendario | Abre CalendarPicker | OK |
| Fila de cada calendario | CalendarPicker | Ver/ocultar con marca | OK |
| Fila "Añadir mis tareas · No / «Tasks» / …" | Ajustes › Calendario | Abre CalendarExportSheet | REVISAR (LA-19, LA-35, LA-42) |
| Opciones "No añadirlas" / «Tasks» / uno tuyo | CalendarExportSheet | Elige destino; crea «Tasks» si no existe | OK (toast de fallo oculto: LA-06; color: LA-28) |
| Fila "Añadir Google u Outlook · Paso a paso" | Ajustes › Calendario (3 estados) | Abre CalendarGuide | OK (último paso: LA-17) |
| Pestañas Google / Outlook / Otro | CalendarGuide | Cambia los pasos | OK |
| Botón "Abrir Ajustes" (pie) | CalendarGuide (iPhone) | Abre la página de Tasks en Ajustes de iOS | OK (texto: LA-16) |
| Segmentado "No enviar la voz" / "Permitido" | Ajustes › Dictado | Cambia `settings.dictation` | REVISAR (LA-15, LA-31) |
| Fila "Exportar copia · .json" | Ajustes › Datos | Hoja de compartir (iPhone) / descarga (PWA) | OK (valor y feedback PWA: LA-32) |
| Fila "Importar copia" | Ajustes › Datos | Selector de fichero → sustituye el estado | REVISAR (LA-03) |
| Fila "Borrar todo" | Ajustes › Datos | Dos toques en 4 s; sin deshacer | REVISAR (LA-04) |
| Fila "Sugerir una mejora" | Ajustes › Tasks | Entra en el modo sugerencia | OK (sitio: LA-21) |
| Fila "Actualizar a la 1.7" | Ajustes › Tasks (si hay versión nueva) | Abre la App Store | OK |
| Fila "Ver la bienvenida" | Ajustes › Tasks | Abre la bienvenida entera | OK (EN: LA-31) |
| Fila "Valorar en la App Store" | Ajustes › Tasks (iPhone) | `?action=write-review` en pestaña nueva | OK (comprobar en el iPhone que `target=_blank` abre la App Store) |
| Filas "Soporte" / "Privacidad" | Ajustes › Tasks | Páginas públicas en el navegador | OK |
| Nota "Versión 1.6 (41)" | Ajustes › Tasks (iPhone) | Informativa | OK (PWA: LA-34) |
| Botón "Actualizar" | UpdatePrompt | Abre la App Store y cierra | OK |
| Botón "Ahora no" / asa / velo | UpdatePrompt | Aparta esa versión | REVISAR (LA-22) |
