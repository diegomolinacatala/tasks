# Compositor, ficha y dictado

Auditoría de experiencia de la barra de escribir (`Composer`), sus destinos y la píldora de lo entendido, la ficha (`ComposeSheet`), el dictado (`useVoice`, `VoiceBar`, `DictationConsent`) y lo que pasa justo después de añadir (toasts, "Ver", "Deshacer"). Rama `capacitor`, 12/10/2026. Todo lo afirmado sale de leer el código; se cita fichero:línea.

## Resumen (lo que más chirría)

1. **Lo que eliges se pierde sin avisar**: elegir "Mañana" o entrar por el **+** de una sección y después soltar el teclado (tocar el velo) devuelve el destino a "Hoy" y quita la sección; la tarea acaba donde no querías (`Composer.tsx:261-265`, `App.tsx:385-388`).
2. **El destino se ignora cuando se entiende algo sin día**: "reunión de una hora" o "comprar pan al llegar a Mercadona" (iPhone) van a la Bandeja aunque la barra diga "Añadir a hoy", y las píldoras de destino desaparecen justo en ese momento (`Composer.tsx:209-215`, `details.ts:58`).
3. **Dictar no respeta el día que miras**: lo dictado sin día va siempre a "Sin fecha", mientras que lo mismo tecleado va al día de la Agenda (`App.tsx:322-334`).
4. **En la PWA, dictar un lugar borra el lugar**: la IA separa "al pasar por Mercadona" del título y la app lo descarta porque la PWA no tiene lugares (`interpret.ts:78-87`): queda "Comprar pan" y nadie se entera.
5. **Callejones del dictado**: la ficha de permiso no se puede cerrar (tampoco en la PWA, donde no manda Apple), con el micrófono denegado vuelve a salir en cada toque, y el micrófono se enseña aunque no pueda funcionar.

## Hallazgos

### CO-01 · En la PWA, dictar un lugar hace desaparecer el lugar del título · [CRÍTICO]
- **Dónde**: dictado en la PWA › `src/lib/interpret.ts:78-87`, `src/App.tsx:143` (`places = null` en la PWA), `src/App.tsx:345`.
- **Qué ve/hace el usuario**: dicta "comprar pan al pasar por Mercadona". El Worker devuelve `title: "Comprar pan"` y `place: { name: "Mercadona", on: "arrive" }` (el prompt separa el fragmento `lugar` del `tema`). Como en la PWA `places` es `null`, `spokenPlace` es `null` (línea 78) y el lugar se tira. El toast dice "Comprar pan · Sin fecha". Mercadona no está en ningún sitio.
- **Problema**: pérdida silenciosa de parte de lo dicho (undo-support / error-recovery). El analizador local, en cambio, deja la frase entera en el título cuando `places === null` (`parse.ts:191-197`): la IA y el local se comportan distinto en el mismo caso.
- **Propuesta**: en `draftsFromInterpreted`, cuando `places === null` y `item.place` traiga nombre, conservar la intención en el título: `title = \`${title} (${placeTriggerLabel(name, on)})\`` → "Comprar pan (al pasar por Mercadona)" / "Buy bread (arriving at Mercadona)". Alternativa: con `places === null`, si la IA devuelve `place`, usar `parseSpoken(text)` (que deja la frase literal). Añadir el caso al banco `worker/eval`.
- **Esfuerzo**: S

### CO-02 · El destino elegido se pierde al soltar el teclado · [ALTO]
- **Dónde**: barra › destinos › `src/components/compose/Composer.tsx:261-265` (`onBlur` → `setChosen(undefined)`), `:171-173`; el + de sección: `src/App.tsx:385-388` (`onComposing(false)` → `setComposeSection(null)`).
- **Qué ve/hace el usuario**: en la Agenda (hoy) escribe "leche", toca **Mañana** (se pone en azul marino), toca el velo para esconder el teclado y mirar la lista. La bandeja de píldoras sigue a la vista (`tray` es `true` con texto, `:296`) pero **Hoy** vuelve a estar elegido. Toca la flecha de enviar: la tarea va a hoy. Con el **+** de "Compra" es peor: la píldora COMPRA desaparece de la bandeja y el placeholder vuelve a "Añadir a hoy"; lo que añada va a la raíz del día.
- **Problema**: el estado visible cambia sin que el usuario haya hecho nada sobre él (visibility-of-system-status, error-prevention). CLAUDE.md dice "mientras la barra siga abierta", pero la barra *parece* abierta: las píldoras siguen ahí.
- **Propuesta**: que `chosen` y `composeSection` vivan mientras haya texto en la barra, no mientras haya foco: quitarlos en `reset()` y en el `onChange` que vacía el texto (`:328`), y en `onBlur` solo `setActive(false)`. En `App.tsx`, vaciar `composeSection` cuando el compositor avise de que la barra está vacía (nuevo callback `onEmpty`) o al cambiar de pestaña/día, no en `onComposing(false)`.
- **Esfuerzo**: S

### CO-03 · Lo entendido sin día manda la tarea a la Bandeja aunque la barra diga "Añadir a hoy" · [ALTO]
- **Dónde**: barra › `src/components/compose/Composer.tsx:209-215` (`date` del analizador, que puede ser `null`, sustituye al destino) y `:387-400` (los destinos se ocultan en cuanto `applied`); ficha: `src/lib/details.ts:57-58` (`blankDetails(parsed.date)` ignora el destino).
- **Qué ve/hace el usuario**: en la Agenda mirando el jueves escribe "reunión de una hora" → sale la píldora "1 h", las píldoras de destino desaparecen, pulsa Intro y aparece el toast "reunión → Bandeja · Ver". En el iPhone, "comprar pan al llegar a Mercadona" → píldora "Al llegar a Mercadona" → Bandeja. Si abre **Detalles**, la ficha dice "Sin fecha" cuando él estaba mirando el jueves.
- **Problema**: la etiqueta de la barra promete un destino y el sistema lo cambia sin decirlo hasta después (match-between-system-and-world). Que la duración sin hora llegue a una tarea sin fecha además no sirve de nada (sin hora no hay aviso de cierre).
- **Propuesta**: cuando el analizador no da día, aplicar el destino: en `submit`, `date: parsedNow.date ?? target` y `inSection` sobre esa fecha; en `expand`, `detailsFrom(parsedNow, repeat, target)` con `blankDetails(parsed.date ?? date)`. Y en la bandeja de píldoras, seguir enseñando los destinos cuando `parsed.date === null` (solo ocultarlos cuando lo entendido ya fija un día). Para el lugar sin día, si se prefiere "sin fecha" a propósito, que se vea: píldora "Sin fecha" junto a "Al llegar a…".
- **Esfuerzo**: S

### CO-04 · Lo dictado no va al día que se está mirando · [ALTO]
- **Dónde**: `src/App.tsx:322-334` (`addSpoken`), `:338-347`; `src/components/compose/Composer.tsx:39` (`onVoice` no lleva destino).
- **Qué ve/hace el usuario**: en la Agenda del jueves, con el placeholder "Añadir al jueves 2", toca el micrófono y dice "llamar al dentista". Toast: "Llamar al dentista · Sin fecha · Deshacer". La tarea está en la Bandeja; en la Agenda no aparece nada. Tecleando lo mismo, habría ido al jueves.
- **Problema**: el micrófono vive en la misma barra que promete un destino; dictar y teclear deberían caer en el mismo sitio (consistency). Y el toast no ofrece **Ver** para ir a la Bandeja.
- **Propuesta**: `onVoice(text, interpreted, target)` con el destino vigente (`targetItem.date`, `targetSection`); en `addSpoken`, para cada borrador con `date === null` y sin plazo, `date = target` (y la sección si la hay). El toast del dictado, cuando lo añadido no se ve en la pantalla actual, que lleve **Ver** además de **Deshacer** (o "Deshacer" y que el texto diga "→ Bandeja").
- **Esfuerzo**: M

### CO-05 · La ficha del permiso de dictado no tiene salida · [ALTO]
- **Dónde**: `src/components/compose/DictationConsent.tsx:35` (`<Sheet>` sin `onClose`: ni velo, ni asa, ni Escape), `src/components/compose/useVoice.ts:199`.
- **Qué ve/hace el usuario**: toca el micrófono sin querer (está al lado del campo). Sube "Dictado · Para convertir lo que dices… · Continuar". No hay × ni forma de bajarla. En la PWA de escritorio, Escape tampoco. Para salir tiene que pulsar **Continuar** y decir "Bloquear" al navegador; a partir de ahí el navegador recuerda el bloqueo y el dictado queda roto hasta que el usuario lo arregle en los ajustes del sitio.
- **Problema**: callejón sin salida (user-control-and-freedom). La decisión de un solo botón viene del rechazo de Apple (CLAUDE.md, "Dictado"), pero Apple no manda en la PWA, y en el iPhone un panel que se puede bajar con el velo no es un botón "Ahora no".
- **Propuesta**: pasar `onClose` (velo, asa, Escape) al `Sheet` al menos cuando `!isNative`; cerrar = no pedir nada y volver a la barra. Mantener un solo botón **Continuar**. Si se quiere ser conservador en el iPhone, dejarlo como está allí y documentarlo en el componente.
- **Esfuerzo**: S

### CO-06 · Con el micrófono denegado, la ficha de permiso vuelve a salir en cada toque · [MEDIO]
- **Dónde**: `src/components/compose/useVoice.ts:197-204` (`allowed ? record() : setAsking(true)`), `:210-213` (`settings/dictation` solo se guarda si el sistema concede), `:108-122`.
- **Qué ve/hace el usuario**: la primera vez negó el micrófono. Ahora cada toque en el micrófono abre otra vez "Dictado … Continuar"; al continuar no sale el diálogo de iOS (ya está decidido) y llega el toast "Sin acceso al micrófono · Ajustes". Dos pasos para llegar al aviso útil, siempre.
- **Problema**: la ficha de permiso explica algo que ya no es la pregunta (error-recovery).
- **Propuesta**: recordar en `localStorage` (`tasks:mic-denied`) que el sistema denegó; con esa marca, saltar la ficha y mostrar directamente el toast con **Ajustes**. En la PWA, `navigator.permissions.query({ name: 'microphone' })` donde exista. Borrar la marca cuando `getUserMedia` vuelva a funcionar.
- **Esfuerzo**: S

### CO-07 · El micrófono se enseña aunque el dictado no pueda funcionar · [MEDIO]
- **Dónde**: `src/components/compose/Composer.tsx:337-341` (siempre con la barra vacía), `src/components/compose/useVoice.ts:200-203` (toast "Activa los avisos en Ajustes para dictar tareas." / "El dictado no está disponible en este navegador.").
- **Qué ve/hace el usuario**: PWA instalada en el iPhone con los avisos apagados: toca el micrófono y recibe un toast que le manda a Ajustes, sin botón para ir. Sin servidor (`VITE_PUSH_API` vacío) o en un navegador sin Web Speech, el micrófono está ahí y solo da un toast.
- **Problema**: affordance que no funciona (broken-affordance); el toast no lleva acción (error-recovery).
- **Propuesta**: (a) ocultar el micrófono cuando `push.status` sea `unconfigured`/`unsupported` y no haya `speechSupported()`; (b) en el caso "avisos apagados", toast con acción **Ajustes** → `go('settings')` (hace falta pasar un `onSettings` o un evento); texto: es "Para dictar, activa los avisos." · en "Turn on reminders to dictate."
- **Esfuerzo**: S

### CO-08 · Rutina creada desde la Agenda: el toast ofrece "Ver" pero no "Deshacer" · [MEDIO]
- **Dónde**: `src/App.tsx:278-282` (`actionLabel: tab === 'inbox' ? undo : view`).
- **Qué ve/hace el usuario**: en la Agenda escribe "gimnasio los lunes y jueves a las 7" (o lo dicta). Toast "Rutina: 🏋️ Gimnasio · Lun y jue · 19:00 · Ver". Si era un error (quería una tarea), tiene que ir a la Bandeja, encontrarla y deslizarla a la izquierda. Desde la Bandeja sí hay Deshacer.
- **Problema**: deshacer debe estar donde se produce el error, no depender de la pestaña (undo-support, consistency).
- **Propuesta**: siempre **Deshacer**; el mensaje ya dice adónde fue ("Rutina: …"). Si se quiere conservar "Ver", que el toast admita dos acciones o que el texto diga "→ Bandeja".
- **Esfuerzo**: S

### CO-09 · Lugar nuevo dictado en el iPhone: el panel del lugar tapa el "Deshacer" y deshacer deja el lugar · [MEDIO]
- **Dónde**: `src/components/compose/useAddTasks.ts:22-23` (abre `PlaceSheet` al instante), `src/App.tsx:326-333` (toast z 50 bajo el panel z 60, `toast.css:7`, `sheet.css:5`), `:332` (deshacer solo quita tareas).
- **Qué ve/hace el usuario**: dicta "comprar pilas al pasar por Leroy Merlin"; sube el panel del lugar con el buscador de Mapas; el toast con **Deshacer** queda detrás del velo y se va a los 4,2 s. Si cierra el panel y la tarea estaba mal entendida, ya no puede deshacer; y si llegara a deshacer, el lugar "Leroy Merlin" sin ubicación se queda en Lugares.
- **Problema**: la acción de recuperación queda inaccesible (undo-support); residuo tras deshacer.
- **Propuesta**: abrir el panel del lugar al cerrar el toast o tras 1 s, y dejar el toast por encima del velo (z 65) cuando lleva acción. En `onAction` de `addSpoken`, borrar también los lugares creados por la entrada (`entry.places`) si ninguna otra tarea los usa.
- **Esfuerzo**: M

### CO-10 · La ficha enseña Importancia (10 botones) y Repetir (5 píldoras) siempre, aunque casi nunca se tocan · [MEDIO]
- **Dónde**: `src/components/compose/ComposeSheet.tsx:217-232` (Repetir) y `:258-259` (`ImportanceScale`, `importance.css:59-62`).
- **Qué ve/hace el usuario**: con día y hora, la ficha apila: título, Cuándo (5 píldoras), Hora (2), Duración (regla con cabecera y nota), Recordatorios (1–3 + "+ Añadir"), Repetir (5), Sección (N+2) e Importancia (10 cuadros). Son ~30 controles antes del botón de añadir para "poner la cena del jueves".
- **Problema**: progressive-disclosure. La importancia por defecto es 1 y una rutina rara vez nace de la ficha; los dos bloques compiten con lo que sí se decide siempre (cuándo, hora, aviso).
- **Propuesta**: plegar los dos bajo una fila discreta al final: "Importancia · Normal" y "Repetir · No" (`sheet__row`), que al tocarse despliegan la escala o las píldoras (y quedan desplegados si ya tienen valor distinto del normal). Textos: es "Importancia" / "Normal", "Repetir" / "No se repite"; en "Importance" / "Normal", "Repeat" / "Doesn’t repeat". Mismo patrón que `foldDone` en la Bandeja.
- **Esfuerzo**: M

### CO-11 · Abrir Detalles con la barra vacía deja la ficha sin foco y el teclado se va · [MEDIO]
- **Dónde**: `src/components/compose/Composer.tsx:240` (`input.current?.blur()` siempre) y `ComposeSheet.tsx:161-177` (el `textarea` no recibe el foco).
- **Qué ve/hace el usuario**: toca la barra (sube el teclado), toca **Detalles** sin haber escrito: la ficha sube, el teclado baja, el título está vacío con "Qué hay que hacer" y el botón de abajo deshabilitado. Tiene que tocar el título para volver a sacar el teclado.
- **Problema**: fricción en el flujo "decidirlo todo antes": dos teclados por una tarea.
- **Propuesta**: si `value` está vacío al desplegar, dar el foco al `textarea` de la ficha en cuanto se monta (`autoFocus` condicionado) en lugar de hacer `blur` del campo de la barra. En el iPhone (Capacitor) el teclado se mantiene; en la PWA puede no reaparecer, pero no empeora lo de ahora.
- **Esfuerzo**: S

### CO-12 · Con la ficha abierta, lo que se teclea después ya no se interpreta y nada lo dice · [MEDIO]
- **Dónde**: `src/components/compose/Composer.tsx:130` (`detected` exige `!details`), `:127-128`.
- **Qué ve/hace el usuario**: abre Detalles para una tarea, pliega, y escribe al final "a las 5". No sale ninguna píldora; la tarea se crea con "a las 5" dentro del título y sin hora. Antes de abrir la ficha, lo mismo habría puesto la hora.
- **Problema**: la misma frase hace cosas distintas según se haya abierto la ficha (consistency); es una regla documentada en CLAUDE.md, pero invisible.
- **Propuesta**: mantener que la ficha manda, pero si con `details` el analizador detecta algo nuevo, enseñar una píldora de sugerencia en coñac "Aplicar 17:00" / "Apply 5:00 PM" que al tocarla pase lo detectado a los campos (`withTime`, `withDate`) y limpie el título como en `expand`.
- **Esfuerzo**: M

### CO-13 · Tocar la píldora de lo entendido la tacha: no se entiende qué ha pasado · [MEDIO]
- **Dónde**: `src/components/compose/Composer.tsx:368-386`, `composer.css:278-283` (`.is-off`: transparente y tachada).
- **Qué ve/hace el usuario**: escribe "cena mañana a las 9", ve "Mañana 21:00" en coñac. La toca por curiosidad: se queda tachada y aparecen Hoy/Mañana/Sin fecha. No hay texto que diga "se dejará tal cual escrito". El `aria-label` ("Ignorar Mañana 21:00") lo explica, pero solo a quien use lector.
- **Problema**: input-helper-text; el tachado se parece a "hecho" en el resto de la app (las tareas tachadas).
- **Propuesta**: en el estado `is-off`, sustituir el tachado por el texto "Tal cual" / "As written" con un icono de comillas, en gris y con borde discontinuo (como `chip--option`), y al primer toque un toast corto: es "Se guardará tal cual lo escribes." · en "It’ll be saved as written." (una vez por dispositivo).
- **Esfuerzo**: S

### CO-14 · Errores del servidor que llegan tal cual al toast, en minúsculas y siempre en español · [MEDIO]
- **Dónde**: `src/components/compose/useVoice.ts:62-70` (`error.message` para todo lo que no sea 503/502), `src/lib/push/api.ts:106-109`, `worker/src/app.ts:43-44,120`; también `api.ts:101` ("Sin conexión con el servidor de avisos.").
- **Qué ve/hace el usuario**: dicta once veces en un minuto → toast "demasiadas peticiones, prueba más tarde" (minúsculas); con la app en inglés, en español. Audio demasiado largo (413) → "cuerpo demasiado grande". Token caducado (401) → "no autorizado" y además se olvida el dispositivo (`PushProvider.tsx:127`), con lo que en la PWA los avisos pasan a "off". Sin red → "Sin conexión con el servidor de avisos." cuando lo que falla es el dictado.
- **Problema**: i18n y error-messages: el usuario no sabe qué es un "cuerpo" ni qué "servidor de avisos" tiene que ver con dictar.
- **Propuesta**: mapear por estado en `errorMessage`: 429 → es "Demasiados dictados seguidos. Espera un momento." · en "Too many dictations in a row. Wait a moment."; 413 → es "Ha sido demasiado largo: dicta frases más cortas." · en "That was too long: dictate shorter sentences."; 401 → es "Hay que volver a conectar el dictado: prueba otra vez." · en "Dictation needs to reconnect: try again."; red (status 0) → es "Sin conexión. El dictado necesita internet." · en "No connection. Dictation needs internet." Dejar el mensaje del Worker solo como último recurso.
- **Esfuerzo**: S

### CO-15 · Áreas de toque por debajo de 44 px en los controles más usados · [MEDIO]
- **Dónde**: `composer.css:89-100` (enviar 36×36), `:138-153` (Detalles alto 36), `:170-181` (× 36×36), `:210-223` y `:244-260` (destinos y lo entendido, alto 36), `:328-338` (× y ✓ del dictado 36×36), `:27-37` (asa 22 px de alto); `sheet.css:105-119` (todas las píldoras de la ficha, alto 38), `:268-275` (× del plazo 32×32); `section.css:113-121,136-140` (+ de sección 32 de ancho, 44 de alto gracias al `::after`); `importance.css:59-62` (cada número ≈ 31 px de ancho en 375 px).
- **Qué ve/hace el usuario**: pulgares que fallan la flecha de enviar y acaban en el campo, o la × del dictado cuando quería el ✓.
- **Problema**: touch-target-size (44 pt en iOS HIG).
- **Propuesta**: subir `min-height` de `.chip`, `.composer__target`, `.composer__parsed` y `.composer__more` a 40 y añadir un `::after` con `inset: -4px` (como ya hace `.section__icon--add`) a enviar, ×, ✓, micrófono y × del plazo; el asa, `height: 28px`. En la escala de importancia, `height: 48` ya está; el ancho lo da el sitio, se deja.
- **Esfuerzo**: S

### CO-16 · El toast del dictado dura 4,2 s para leer una frase larga y decidir si deshacer · [MEDIO]
- **Dónde**: `src/components/ui/Toast.tsx:5` (`VISIBLE_MS = 4200`), `src/App.tsx:326-333`.
- **Qué ve/hace el usuario**: "Reunión con Jorge · jue 18 sept 17:30–18:30 · 1 h antes · Deshacer": mientras lo lee, se va. Si la IA entendió mal, ya no puede deshacer desde ahí.
- **Problema**: undo-support; un toast con acción es una decisión, no un aviso.
- **Propuesta**: cuando el toast lleva `actionLabel`, 7 s (o hasta que se toque la pantalla); sin acción, los 4,2 s de ahora. En `ToastProvider`, `VISIBLE_MS` según `request.actionLabel`.
- **Esfuerzo**: S

### CO-17 · El botón de la ficha y su cabecera no mencionan la sección elegida · [BAJO]
- **Dónde**: `src/components/compose/ComposeSheet.tsx:131-132,145` (`addLabel(view.date, today)` sin `section`), `src/lib/compose.ts:51-58`.
- **Qué ve/hace el usuario**: entra por el + de "Compra", despliega la ficha: arriba "NUEVA TAREA · Hoy" y abajo "Añadir a hoy", mientras la barra decía "Añadir a Compra" y en Sección está "Compra" en azul.
- **Problema**: consistency entre la barra y la ficha.
- **Propuesta**: en la ficha, `addLabel(view.date, today, sectionName)` → "Añadir a Compra" / "Add to Groceries", y en `where`, "Hoy · Compra".
- **Esfuerzo**: S

### CO-18 · Textos en inglés poco idiomáticos: "Fold", "Add to Thursday 8" · [BAJO]
- **Dónde**: `src/components/compose/ComposeSheet.tsx:75` (`fold: 'Fold'`), `src/lib/compose.ts:57` (`Add to ${dayNameLong} ${dayNumber}`), `:39` (`Thu 2`).
- **Qué ve/hace el usuario**: en inglés, el `aria-label` de la flecha dice "Fold" y el placeholder "Add to Thursday 8".
- **Problema**: i18n (tono y naturalidad).
- **Propuesta**: "Collapse"; "Add to Thu, Oct 8" (usar `relativeLabel`, que ya da "Thu, Oct 8"); el destino, "Thu 8" vale.
- **Esfuerzo**: S

### CO-19 · Mayúsculas inconsistentes en los días lejanos: "jue 18 sept" junto a "Hoy" · [BAJO]
- **Dónde**: `src/lib/details.ts:196` (`relativeLabel` sin capitalizar en la píldora del resumen), `src/App.tsx:312` (toast "Cena → jue 18 sept"), `src/lib/parseCore.ts:210` (píldora de lo entendido); la ficha sí capitaliza (`ComposeSheet.tsx:131`).
- **Qué ve/hace el usuario**: píldoras "Hoy", "Mañana" y "jue 18 sept · 17:00" en la misma fila.
- **Problema**: consistency tipográfica.
- **Propuesta**: capitalizar en `relativeLabel` cuando empieza frase o píldora (o un `relativeLabelCap`), y usarlo en `detailsSummary`, `draftLabel` y el toast.
- **Esfuerzo**: S

### CO-20 · Con texto escrito y el teclado bajado, la tarjeta tapa las últimas filas de la lista · [BAJO]
- **Dónde**: `src/components/shell/shell.css:38-43` (`padding-bottom` fijo a `--composer-h` = 64 px) y `:139-147` (el dock crece con la bandeja de píldoras, ~104 px más 28 de relleno, opaco desde 26 px).
- **Qué ve/hace el usuario**: escribe "leche", toca el velo, baja la lista hasta el final: la última fila y media quedan bajo la tarjeta.
- **Problema**: contenido inalcanzable en un estado legítimo.
- **Propuesta**: que el compositor publique su alto real en `--dock` (un `ResizeObserver` sobre `.composer` o una clase `has-tray` en `.app`), igual que `--kb`.
- **Esfuerzo**: S

### CO-21 · El toast "→ Mañana · Ver" se posa encima del campo cuando el teclado está bajado · [BAJO]
- **Dónde**: `src/components/ui/toast.css:5` (altura fija `nav-h + composer-h + 10`), `composer.css:52-58,114-120`.
- **Qué ve/hace el usuario**: con la bandeja de píldoras abierta y las pestañas visibles, el toast (52 px, entre 74 y 126 px sobre la barra) cubre la línea del campo (54–102 px) durante 4 s.
- **Problema**: el aviso tapa justo lo que se está usando.
- **Propuesta**: lo mismo que CO-20: posicionar el toast con `--dock` real.
- **Esfuerzo**: S

### CO-22 · La × de "Quitar los detalles" se lee como "borrar" o "cancelar" · [BAJO]
- **Dónde**: `src/components/compose/Composer.tsx:347-351`, `composer.css:170-181` (a la izquierda de las píldoras).
- **Qué ve/hace el usuario**: una × gris a la izquierda del resumen. Tocarla no borra nada (restaura la frase), pero no se sabe hasta probar. En la píldora de lo entendido, en cambio, se "quita" tocando la píldora misma: dos idiomas para la misma idea.
- **Problema**: consistency, recognition-over-recall.
- **Propuesta**: mover la × al final de la fila (donde van las × de los chips de aviso) o convertirla en la última píldora "Quitar" / "Clear" con icono; mantener el `aria-label`.
- **Esfuerzo**: S

### CO-23 · El asa de la tarjeta es una franja de 22 px pegada al campo · [BAJO]
- **Dónde**: `composer.css:27-37` (`height: 22px; margin-bottom: -12px`), `usePullUp.ts:8` (`TAP_PX = 6`: un toque la abre).
- **Qué ve/hace el usuario**: va a tocar el campo por su borde superior y se le abre la ficha (el asa pisa el borde de la línea y un toque sin arrastre la despliega).
- **Problema**: touch-target-size y conflicto de zonas.
- **Propuesta**: que el toque sin arrastre no abra (solo tirar, `dy > OPEN_PX` o velocidad); abrir con toque ya lo hace **Detalles**. Dejar el asa como gesto puro.
- **Esfuerzo**: S

### CO-24 · Quitar el último día de una rutina no hace nada ni lo dice · [BAJO]
- **Dónde**: `src/components/compose/ComposeSheet.tsx:138` (`if (has && days.length === 1) return`).
- **Qué ve/hace el usuario**: en "Los martes" toca la M para quitarla: no pasa nada, sin vibración ni explicación.
- **Problema**: feedback.
- **Propuesta**: `haptic('warning')` y, mejor, que quitar el último día equivalga a "No se repite" (ya existe esa píldora y es el resultado natural).
- **Esfuerzo**: S

### CO-25 · "+ Nueva" sección se crea al momento y el nombre se pierde al tocar fuera · [BAJO]
- **Dónde**: `src/components/task/fields.tsx:154-160` (`section/add` al pulsar Intro, antes de añadir la tarea), `:190` (`onBlur` descarta).
- **Qué ve/hace el usuario**: escribe "Casa", toca otra parte de la ficha: el nombre desaparece. Si pulsa Intro, la sección existe aunque luego pliegue y quite los detalles con la ×.
- **Problema**: error-prevention; residuo.
- **Propuesta**: en `onBlur`, crear si hay nombre (es lo que el usuario quería); y `enterKeyHint="done"` en ese input.
- **Esfuerzo**: S

### CO-26 · Límites de grabación invisibles (8 s sin voz, 1,5 s de silencio, 30 s máximo) · [BAJO]
- **Dónde**: `src/lib/voice/capture.ts:5-10,94-100`; `VoiceBar.tsx:21` solo dice "Escuchando…".
- **Qué ve/hace el usuario**: hace una pausa de dos segundos para pensar y la grabación se cierra sola; si habla 35 s, se corta a los 30 sin aviso y se crea media tarea.
- **Problema**: visibility-of-system-status.
- **Propuesta**: en la barra de voz, cuando `heard` y el nivel baja, un texto "Enviando en…" no; más simple: al cerrar por silencio con texto largo, nada; y a los 25 s enseñar "5 s" junto a la onda. Y en el toast de resultado ya se ve lo que llegó (hay Deshacer).
- **Esfuerzo**: S

### CO-27 · "Al llegar" / "Al salir" es una píldora que cambia de texto al tocarla, no parece un conmutador · [BAJO]
- **Dónde**: `src/components/task/ReminderPicker.tsx:155-162` (dentro de la ficha, en "+ Añadir", solo iPhone).
- **Qué ve/hace el usuario**: ve "Al llegar" en azul marino, toca "Casa" y se añade "Al llegar a Casa". Para "Al salir de Casa" tiene que descubrir que "Al llegar" se toca.
- **Problema**: recognition-over-recall.
- **Propuesta**: dos píldoras lado a lado ("Al llegar" · "Al salir", `aria-pressed` cada una), como Hoy/Mañana.
- **Esfuerzo**: S

### CO-28 · La píldora de importancia en la barra es solo un número ("7") · [BAJO]
- **Dónde**: `src/lib/details.ts:209`, `Composer.tsx:352-367` (icono "Aa↕" + "7").
- **Qué ve/hace el usuario**: tras elegir 7 en la ficha, en la barra aparece "⇕ 7". Sin contexto no se sabe qué es.
- **Problema**: input-helper-text.
- **Propuesta**: etiqueta "Importancia 7" / "Importance 7", o pintar el "7" con el tamaño que dará (`--imp`), que es la idea de la escala.
- **Esfuerzo**: S

### CO-29 · La tecla Intro dice "OK" (`enterKeyHint="done"`) pero añade la tarea · [BAJO]
- **Dónde**: `src/components/compose/Composer.tsx:323,252-259`.
- **Qué ve/hace el usuario**: el teclado de iOS enseña "OK"; con texto, pulsar añade y deja la barra abierta; sin texto, baja el teclado.
- **Problema**: pequeña incoherencia entre la etiqueta de la tecla y el efecto.
- **Propuesta**: `enterKeyHint={ready ? 'send' : 'done'}` ("Enviar"/"OK" según haya texto).
- **Esfuerzo**: S

### CO-30 · Un aviso "Mañana 9:00" añadido en la ficha sin fecha deja la tarea en la Bandeja; escrito, la fecha la pone solo · [BAJO]
- **Dónde**: `src/lib/details.ts:98-103` (no toca `date`) frente a `src/lib/parseCore.ts:170-171` (`if (!date && firstAt) date = …`).
- **Qué ve/hace el usuario**: en la Bandeja abre Detalles, "+ Añadir" → "Mañana 9:00". La tarea queda sin fecha con un aviso para mañana. Escribiendo "en 30 min" la misma app le pone fecha.
- **Problema**: consistency entre las dos vías.
- **Propuesta**: en `addDetailReminder`, si `date === null` y el aviso es `at`, poner `date = isoOfInstant(at)` (como el analizador). O al revés, no inferir fecha en ninguna de las dos; pero que sea igual.
- **Esfuerzo**: S

### CO-31 · En la PWA, "al llegar a casa" se queda escrito en el título sin explicar por qué · [BAJO]
- **Dónde**: `src/App.tsx:143` (`places = null`), `src/lib/parse.ts:191-197`.
- **Qué ve/hace el usuario**: en la web escribe "comprar pan al llegar a casa": sin píldora, tarea literal. No sabe que los avisos por lugar son cosa del iPhone (la pestaña Lugares sí lo dice).
- **Problema**: input-helper-text, una sola vez.
- **Propuesta**: en la PWA, si `placePhraseRegex` casa en el texto, una píldora apagada "Lugares: en la app del iPhone" / "Places: in the iPhone app" que al tocarla abre la pestaña Lugares. Solo la primera vez por dispositivo.
- **Esfuerzo**: M

### CO-32 · La ficha de permiso no anticipa que iOS va a pedir el micrófono · [BAJO]
- **Dónde**: `src/components/compose/DictationConsent.tsx:8-18,39`.
- **Qué ve/hace el usuario**: lee de dónde sale el audio y toca **Continuar**; entonces aparece el diálogo del sistema, que no esperaba.
- **Problema**: expectation-setting.
- **Propuesta**: una línea más al final del texto, solo en esta ficha (no en Ajustes): es "Al continuar, el sistema te pedirá permiso para usar el micrófono." · en "When you continue, the system will ask for microphone access."
- **Esfuerzo**: S

### CO-33 · Títulos recortados a 500 caracteres sin aviso · [BAJO]
- **Dónde**: `src/state/reducer.ts:41-43` (`MAX_TITLE = 500`, `slice`), la barra (`Composer.tsx:317`) y el título de la ficha (`ComposeSheet.tsx:161`) sin `maxLength`.
- **Qué ve/hace el usuario**: pega un párrafo largo; la tarea aparece cortada.
- **Problema**: input-validation visible.
- **Propuesta**: `maxLength={500}` en los dos campos (iOS lo respeta al pegar) y nada más.
- **Esfuerzo**: S

### CO-34 · Al pasar a rutina en la ficha, los avisos ya puestos se esconden y se tiran sin decirlo · [BAJO]
- **Dónde**: `src/lib/details.ts:122-127` (`withRepeat` conserva `reminders`), `:166-169` (`toRoutineDraft` los ignora), `ComposeSheet.tsx:179-215` (el bloque de avisos desaparece).
- **Qué ve/hace el usuario**: pone "1 h antes", toca "Cada día": el aviso desaparece de la vista; al crear la rutina no existe. Si vuelve a "No se repite", reaparece.
- **Problema**: visibility; pérdida menor y recuperable.
- **Propuesta**: aceptable como está si el bloque "Aviso" de la rutina dice "Las rutinas avisan a su hora" (nota `sheet__note`) cuando había avisos antes. O limpiar `reminders` en `withRepeat` para que no "vuelvan".
- **Esfuerzo**: S

### CO-35 · Añadir a un día pasado desde la Agenda crea una tarea atrasada al instante, sin aviso · [BAJO]
- **Dónde**: `src/lib/compose.ts:37-42` (el día que se mira es siempre el primer destino), `src/App.tsx:446` (placeholder "Añadir al miércoles 1").
- **Qué ve/hace el usuario**: mira ayer para ver qué quedó, escribe algo y aparece en rojo en Atrasadas.
- **Problema**: error-prevention leve.
- **Propuesta**: con `day < today`, el primer destino sigue siendo ese día (es lo que mira), pero el placeholder dice "Añadir al miércoles 1 (pasado)" / "Add to Wed, Oct 1 (past)". Nada más.
- **Esfuerzo**: S

### CO-36 · Con el dictado del servidor no se ve lo que se va oyendo · [BAJO]
- **Dónde**: `src/components/compose/VoiceBar.tsx:21` (`partial` solo con Web Speech), `useVoice.ts:125-181`.
- **Qué ve/hace el usuario**: en el iPhone habla "a ciegas": onda y "Escuchando…", luego "Creando tarea…", y solo al final el toast. Si se equivocó, ya está creada.
- **Problema**: inherente a Whisper (no hay parcial). Se mitiga con CO-16.
- **Propuesta**: en "Creando tarea…", en cuanto llegue `text` y antes de aplicar la IA (son la misma respuesta, así que no aplica)… dejar como está y alargar el toast (CO-16). Registrado para no volver a plantearlo.
- **Esfuerzo**: —

### CO-37 · Tres vías para la misma ficha (Detalles, asa y píldoras del resumen) · [BAJO]
- **Dónde**: `Composer.tsx:309-312,352-367,403-414`.
- **Qué ve/hace el usuario**: funciona, y Spotify hace lo mismo. Solo el toque en el asa (CO-23) sobra.
- **Problema**: ninguno real; redundancia deliberada.
- **Propuesta**: ver CO-23.
- **Esfuerzo**: —

## Lo que está bien (para no tocarlo)

- **La barra en reposo** es una sola píldora con el destino en el placeholder ("Añadir al jueves 2", "Añadir a Compra"): se entiende que es para escribir y adónde va. El + en círculo discontinuo y el micrófono a la derecha bastan.
- **Abierta**, las pestañas se apartan y los destinos ocupan su sitio: no hay cromo de más, y el velo que suelta el teclado es evidente. Intro añade y deja la barra abierta para la siguiente; Intro vacío y Escape la sueltan.
- **La píldora de lo entendido** dice exactamente qué se va a crear ("Mañana 17:00–18:00 · 1 h antes", "Esta semana", "Cada día · 10:00" con icono de repetir, "Al llegar a Mercadona" con chincheta) y en inglés sale con "5:30 PM" y "Thu, Sep 18".
- **La ficha** ya practica la revelación progresiva donde importa: Hora solo con día, Duración solo con hora, Sección solo con día, "+ Añadir" plegado y lugares limitados a cinco; el botón de abajo siempre a mano, deshabilitado sin título; plegar nunca pierde nada y la × devuelve la frase original tal cual. La línea "A las 18:30 te pregunto si has acabado." explica la duración sin manual.
- **Una rutina que no cabe** (50) deja la ficha y el texto como estaban, con su aviso.
- **El dictado** se puede cancelar en cualquier fase; hay tope de 25 s para no quedarse en "Creando tarea…"; la cuota agotada dice a qué hora vuelve; 404 del Worker viejo tiene mensaje propio; el micrófono denegado en el iPhone lleva a Ajustes con un toque.
- **El permiso** está escrito en lenguaje llano y es el mismo texto que en Ajustes; Siri sin permiso usa el analizador local.
- **Teclado**: la barra, la ficha (`inset: 0 0 var(--kb)`) y el toast suben con él; el pie de la ficha queda pegado al teclado.
- **Accesibilidad**: todos los botones de solo icono llevan `aria-label`; la píldora de lo entendido tiene `aria-pressed`; la barra de voz es `role="status"`; la ficha es `role="dialog"`.
- **Idiomas**: todas las tablas `COPY` de la zona tienen `es` y `en` completos y en el mismo tono (salvo CO-18).
- **Modo oscuro**: ningún color fijo en `composer.css`, `compose-sheet.css`, `consent.css`, `ruler.css` ni `importance.css`. El `#000` de `composer.css:134` es la máscara de desvanecimiento (`mask-image`, solo cuenta el alfa): correcto en los dos temas.

## Inventario de controles

| Control | Pantalla | Qué hace | Veredicto |
|---|---|---|---|
| Píldora de la barra (campo) `composer__input` | Bandeja / Agenda | Escribir; al foco abre la tarjeta y aparta las pestañas | OK |
| Micrófono `composer__mic` | Barra vacía | Dictar (permiso → grabar → transcribir) | REVISAR (CO-05, CO-06, CO-07) |
| Flecha de enviar `composer__send` | Barra con texto | Añade (Intro también); la barra sigue abierta | REVISAR (CO-15 tamaño) |
| Velo `app__veil` | Barra abierta | Suelta el teclado | REVISAR (CO-02: resetea el destino) |
| Destinos Hoy / Mañana / Sin fecha / `Jue 2` / sección | Tarjeta | Eligen adónde va lo escrito | REVISAR (CO-02, CO-03) |
| Píldora de lo entendido `composer__parsed` | Tarjeta | Alterna aplicar lo entendido o dejar el texto literal | REVISAR (CO-13) |
| Botón Detalles `composer__more` | Tarjeta | Despliega la ficha | REVISAR (CO-11) |
| Asa `composer__grab` | Tarjeta | Tirar (o tocar) despliega la ficha | REVISAR (CO-23) |
| × `composer__clear` | Tarjeta con detalles | Quita lo decidido; devuelve la frase original | REVISAR (CO-22) |
| Píldoras del resumen `is-detail` | Tarjeta con detalles | Reabren la ficha | REVISAR (CO-19, CO-28) |
| × cancelar dictado `composer__voice-btn` | Barra de voz | Cancela en cualquier fase | OK (CO-15 tamaño) |
| ✓ terminar dictado `--done` | Barra de voz (escuchando) | Cierra la grabación y transcribe | OK |
| Continuar | Ficha de permiso | Graba en el mismo toque y lanza el permiso del sistema | REVISAR (CO-05, CO-32) |
| Flecha plegar `compose-head__fold` | Ficha | Pliega sin perder nada | OK (44 px) |
| Asa / velo / Escape del `Sheet` | Ficha | Pliegan | OK |
| Título (`textarea`) | Ficha | Edita el mismo texto que la barra; Intro suelta el teclado | REVISAR (CO-11, CO-33) |
| Cuándo: Hoy / Mañana / Sin fecha / Otro día / Hasta… (+ × del plazo) | Ficha (tarea) | Día y plazo | OK (CO-15 tamaño) |
| Hora: Sin hora / Elegir hora | Ficha (con día) | Hora; trae "A la hora" | OK |
| Duración: regla, hora de fin, × | Ficha (con hora) | Minutos; la nota dice cuándo pregunta | OK |
| Recordatorios: chips con ×, + Añadir, atajos, Otra…, Al llegar/Al salir, lugares, Otro lugar… | Ficha | Avisos | REVISAR (CO-27, CO-30) |
| Chip del lugar nuevo (`leading`) | Ficha (iPhone) | Quita el lugar dictado/escrito | OK |
| Activar avisos / notas de push (`PushHint`) | Ficha con avisos | Activa push si está apagado | OK |
| Repetir: No se repite / Cada día / Entre semana / Fines de semana / Los <día> | Ficha | Convierte en rutina | REVISAR (CO-10) |
| L M X J V S D | Ficha (rutina) | Días | REVISAR (CO-24) |
| Aviso: Sin aviso / Elegir hora | Ficha (rutina) | Hora del aviso diario | OK |
| Sección: Ninguna / secciones / + Nueva | Ficha (con día) | Sección del día | REVISAR (CO-25) |
| Importancia 1–10 | Ficha (tarea) | Tamaño del título | REVISAR (CO-10) |
| Botón Añadir a… / Crear rutina | Pie de la ficha | Crea y cierra | REVISAR (CO-17 etiqueta) |
| + de una sección `section__icon--add` | Agenda | Abre la barra con esa sección como destino | REVISAR (CO-02 se pierde al soltar) |
| Toast "→ Mañana · Ver" | Tras añadir fuera de la vista | Va al día/pestaña | OK (CO-21 posición) |
| Toast "Rutina: … · Ver/Deshacer" | Tras crear rutina | Según pestaña | REVISAR (CO-08) |
| Toast "<título> · <etiqueta> · Deshacer" | Tras dictar | Borra lo creado | REVISAR (CO-04, CO-09, CO-16) |
| Toasts de error del dictado | Dictado | Informan (Ajustes en el iPhone) | REVISAR (CO-14) |
