# Auditoría de experiencia de Tasks (12/10/2026)

Auditoría completa de la app desde el punto de vista de quien la usa, sobre la rama `capacitor`
(la 1.6, commit `80aafdc`). No es una auditoría de código: es de botones, paneles, textos,
conexiones entre pantallas y de todo lo que confunde, sobra o falta.

## 1. Cómo se ha hecho

- **Siete auditorías en paralelo**, una por área, leyendo el código entero de cada una (componentes,
  CSS y la lógica que usan) y siguiendo cada flujo de principio a fin. Sus informes completos, con
  fichero y línea de cada hallazgo, están en `docs/auditoria/anexos/`:
  `agenda-bandeja.md` (AG), `compositor.md` (CO), `tarea-rutinas.md` (TA), `lugares-ajustes.md` (LA),
  `bienvenida-ui.md` (UI), `flujos.md` (FL) y `transversal.md` (TR). Cada hallazgo de este informe
  cita entre paréntesis los del anexo de donde sale, para ir al detalle.
- **Un recorrido real** de la app con Edge sin ventana y dedo simulado (390 × 844 y 375 × 667, claro
  y oscuro, español e inglés, con datos de ejemplo, vacía y tras actualizar): bienvenida, Agenda
  (hoy, ayer, mañana, día libre, mes), Bandeja, panel de tarea, ficha del compositor, dictado,
  rutinas, Lugares, Ajustes, gestos (deslizar, mantener pulsado, muelle). Lo que solo se ve ahí lleva
  la marca «visto».
- **Criterios**: los de las interfaces útiles (una acción principal por pantalla, revelación
  progresiva, nada que abrume, deshacer en lo destructivo, confirmar solo lo irreversible, toques de
  44 pt, el usuario siempre sabe adónde ha ido lo que hizo) y las decisiones cerradas de
  `CLAUDE.md` (cuatro pestañas, sin cuentas, sin subtareas, la importancia es tamaño, la duración no
  planifica), que no se discuten.
- **Severidad**: CRÍTICO = pérdida de datos o atasco; ALTO = confunde o no hace lo que se espera;
  MEDIO = fricción o incoherencia; BAJO = pulido. **Esfuerzo**: S (menos de una hora), M (una tarde),
  L (un día o más).
- **Numeración**: cada hallazgo tiene un número único (1–198) para que puedas decir «haz el 3, el 7 y
  del 40 al 52». Los duplicados entre anexos están fundidos aquí en uno solo.

## 2. Lo que más chirría

1. **Dos acciones pueden borrar meses de trabajo sin vuelta atrás**: *Importar copia* sustituye todo
   nada más elegir el fichero, sin confirmar ni deshacer; *Borrar todo* confirma con un segundo toque
   en el mismo sitio y tampoco se deshace. Hasta borrar una tarea tiene «Deshacer»; lo más grave, no.
2. **Los toasts viven debajo de los paneles** (capa 50 frente a 60). Todo aviso que sale con un panel
   abierto no se ve: el «Deshacer» de *Convertir en rutina*, «Esa hora ya ha pasado», «Sin permiso de
   ubicación → Ajustes» (y tocar donde debería estar el botón cierra el panel). Un solo número lo
   arregla.
3. **Lo que eliges al escribir se pierde**: tocas «Mañana» o entras por el «+» de una sección, sueltas
   el teclado para mirar la lista y el destino vuelve a «Hoy» mientras las píldoras siguen a la vista.
   Y lo entendido sin día («reunión de una hora») va a la Bandeja aunque la barra diga «Añadir a hoy».
4. **Los paneles abruman**: el de la tarea enseña unos 25 controles (la importancia, diez números,
   antes que *Cuándo*); la ficha al escribir, unos 30; Ajustes, 21 cosas tocables con cinco tipos de
   control distintos; el del lugar mezcla ver y editar. Lo que casi nunca se toca (importancia, sección,
   repetir, otros nombres, idioma, dictado) debería ir plegado en una fila.
5. **Dos «Hasta…»** a tres dedos de distancia en el mismo panel: uno es el plazo (abre un calendario) y
   otro la hora de acabar (abre una rueda). Y «Recordatorios» en el panel frente a «Avisos» en todo lo
   demás; «Ajustes» para la pestaña y para los del iPhone.
6. **No se puede tachar una tarea desde su panel**: la acción principal no está (solo si entras desde un
   aviso). La regla de la duración roba el scroll y cambia la tarea sin querer. Los avisos se quitan
   tocando la píldora entera, sin deshacer.
7. **Secciones**: borrar una no pide confirmación ni se deshace y afecta a todos los días; las vacías se
   repiten cada día con «Suelta una tarea aquí» (en español también en inglés) aunque no se arrastre
   nada; «Nada sin hora.» encima de una sección con tareas.
8. **Cerrar = guardar en los paneles de rutina y lugar nuevos**: bajar el panel para cancelar crea la
   rutina o el lugar igual, sin toast. Y un lugar que se cierra con el nombre vacío pierde todos los
   cambios en silencio; uno nuevo con nombre repetido pisa al que había.
9. **Gestos escondidos sin ninguna pista**: mantener pulsado para mover (se quitó el asa y no se
   sustituyó por nada, ni en la bienvenida), el modo «Aa», estirar la regla manteniendo el dedo, corregir
   días en *Constancia*, el asa del mes casi invisible.
10. **Accesibilidad y toque**: ningún botón enseña el foco de teclado (una regla de CSS pisa a otra),
    los paneles no mueven ni atrapan el foco, 24 controles por debajo de 44 pt (el «…» de las secciones,
    «Pasar a hoy», «Hoy», las asas, todas las píldoras de los paneles, «Deshacer» del toast).

## 3. Cifras

| Área | Anexo | CRÍTICO | ALTO | MEDIO | BAJO | Total |
|---|---|---|---|---|---|---|
| Agenda y Bandeja | AG | 1 | 6 | 12 | 22 | 41 |
| Compositor, ficha y dictado | CO | 1 | 4 | 11 | 21 | 37 |
| Tarea, importancia y rutinas | TA | 0 | 5 | 14 | 24 | 43 |
| Lugares y Ajustes | LA | 2 | 6 | 16 | 21 | 45 |
| Bienvenida, sugerencias, UI y avisos | UI | 1 | 3 | 9 | 30 | 43 |
| Flujos y conexiones | FL | 1 | 3 | 13 | 14 | 31 |
| Transversal | TR | 1 | 5 | 12 | 14 | 32 |
| **Bruto** | | **7** | **32** | **87** | **146** | **272** |
| **Fundidos en este informe** | | **5** | **31** | **66** | **96** | **198** |

Lo que está bien pesa más que esto: ver §7. La app tiene una base muy sólida (deshacer casi en todo,
todos los iconos con etiqueta, paridad total entre idiomas, modo oscuro sin un color fijo, zonas
seguras y teclado contemplados en todo lo fijo). Los hallazgos son, en su mayoría, de pulido sobre
algo que ya funciona.

## 4. Plan recomendado (orden de ataque)

Los diez primeros resuelven lo que más daño hace y casi todos son cambios de una línea o de un
componente:

| Orden | Hallazgos | Qué arregla | Esfuerzo |
|---|---|---|---|
| 1 | 1, 2 | Importar y Borrar todo con deshacer y cifra | S |
| 2 | 7 | Toasts por encima de los paneles | S |
| 3 | 26, 27 | El destino de la barra no se pierde; lo sin día va al día que se mira | S |
| 4 | 14, 12, 13 | Un solo «Hasta…»; «Ajustes del iPhone»; «Avisos» en todas partes | S |
| 5 | 68, 73, 90 | Tachar desde el panel; la regla no roba el scroll; avisos con × y deshacer | S+M |
| 6 | 6, 20, 21, 22 | Secciones: deshacer al borrar, vacías discretas, «Nada sin hora» corregido | M |
| 7 | 103, 4, 5 | Rutina y lugar nuevos: el pie crea, cerrar cancela; el lugar no pierde cambios | M |
| 8 | 70, 49, 115 | Plegar importancia/sección en el panel, importancia/repetir en la ficha, Ajustes con un solo tipo de control | M |
| 9 | 10, 11, 9 | Foco visible, paneles con foco, 24 toques a 44 pt | S+M |
| 10 | 30, 31, 28 | Pistas de los gestos: mantener pulsado en la bienvenida, el modo «Aa», el asa del mes | S |

Después, por pantallas (§5), en el orden en que la gente las usa: escribir, Agenda, panel, rutinas,
Ajustes, Lugares.

## 5. Hallazgos, uno a uno

Formato: **número · título** · severidad · esfuerzo · (anexo). Debajo, qué pasa y qué se propone.

### 5.1 Datos y acciones destructivas

**1 · Importar copia sustituye todo sin confirmar ni deshacer** · CRÍTICO · S · (LA-03, FL-01, UI-02)
Ajustes › Datos › *Importar copia*: al elegir el `.json`, todas las tareas, rutinas, secciones y
lugares pasan a ser los del fichero. El único aviso es la nota gris de 12 px al pie («Importar
sustituye lo que haya ahora»). Toast «Copia importada.» sin deshacer. Quien quiera «traer» la copia de
la PWA al iPhone pierde lo del iPhone.
→ Guardar el estado anterior en un `ref` y dar **Deshacer** en el toast («Copia importada: 42 tareas,
3 rutinas · Deshacer» / «Backup imported: 42 tasks, 3 routines · Undo»). Si lo actual no está vacío,
confirmar antes con el mismo patrón de dos toques que *Borrar todo*, con la cifra: «Sustituir 14 tareas
y 2 rutinas por las de la copia (42 tareas)». Con todo vacío, importar directo.

**2 · Borrar todo no se deshace, el segundo toque cae en el mismo sitio y no dice qué se queda** · ALTO · S · (LA-04, FL-16, UI-02)
Un doble toque reflejo (o un rebote al hacer scroll) lo borra; «Todo borrado.» es definitivo.
Apariencia, idioma, calendario y bienvenida se conservan, pero no se dice.
→ Mantener los dos toques, que el segundo lleve la cifra («Borrar 14 tareas, 2 rutinas y 3 lugares») y
toast con **Deshacer** (`state/replace` con el estado anterior). Con el 8, estos toasts duran 6–7 s.

**3 · Si el fichero del iPhone deja de escribirse, se pierde lo hecho desde entonces sin aviso** · CRÍTICO · M · (TR-01)
`saveToFile` falla con un `console.error` y el siguiente arranque prefiere el fichero (viejo) a IndexedDB
(al día). El usuario sigue trabajando y un día lo de las últimas horas no está.
→ Un sello `savedAt` en el estado y en `loadState` quedarse con la copia más reciente de las dos; si
guardar falla dos veces seguidas, toast persistente «No se está guardando. Libera espacio en el iPhone
o exporta una copia.» con acción **Exportar**.

**4 · El panel del lugar pierde todos los cambios si el nombre queda vacío al cerrar** · CRÍTICO · S · (LA-01)
Cambias radio, otros nombres y el punto del mapa; borras el nombre para reescribirlo y cierras: no se
guarda nada. Desde «Tocar el mapa → Añadir aquí» en un punto sin comercio llega sin nombre, y si se
cierra sin escribirlo la ubicación se pierde.
→ Lugar existente: si el nombre queda vacío, conservar el anterior y guardar el resto. Lugar nuevo: pie
fijo **Añadir lugar** deshabilitado sin nombre (como «Añadir rutina») y foco en el nombre cuando llega
con ubicación; si aun así se cierra sin nombre, toast «Ponle nombre para guardarlo · Volver».

**5 · Un lugar nuevo con un nombre que ya existe pisa al que había** · ALTO · S · (LA-02)
Tienes «Casa»; añades otro «Casa» (la de tus padres) y el existente cambia de dirección en silencio.
→ Al cerrar un lugar nuevo cuyo nombre choca, no fusionar: toast «Ya tienes un lugar llamado «Casa» ·
Ver». Fusionar solo si el existente no tiene ubicación (el caso del lugar dictado).

**6 · Borrar una sección: sin confirmación ni deshacer, y afecta a todos los días** · ALTO · M · (AG-01, FL-06)
Un toque en la fila roja y las tareas de «Compra» de varias semanas quedan sueltas en la raíz de cada
día. Es la única acción destructiva de la app sin «Deshacer». La nota habla «del día» en singular.
→ Acción `section/restore` y toast «Sección borrada · Deshacer»; si tiene pendientes, la fila dice
cuántas («Borrar sección · 7 tareas») y pide un segundo toque; nota en plural («…de cada día»).

### 5.2 Transversal: toasts, foco, toque, textos

**7 · Los toasts quedan detrás de los paneles** · ALTO · S · (UI-01, LA-06, FL-02, TR-03)
`.toast` z 50, `.sheet` z 60. Casos: el «Deshacer» de *Convertir en rutina* (se abre el panel de la
rutina encima), «Esa hora ya ha pasado» (panel de tarea y ficha), «Sin permiso de ubicación · Ajustes»
(tocar «Ajustes» toca el velo y cierra el panel), «No se ha podido abrir el mapa», ««el piso» ya lo usa
Casa», «No se pudo crear el calendario «Tasks»», un aviso tocado con un panel abierto.
→ `.toast { z-index: 65 }` y, con un panel abierto (`html.has-sheet` que ponga `Sheet`), anclarlo
arriba o sobre el pie del panel. Los tres errores de validación dentro de un panel (hora pasada, nombre
repetido, calendario que no se creó) además como nota en línea `sheet__note` con `role="alert"`, como ya
hace `FeedbackSheet`.

**8 · Todos los toasts duran 4,2 s, tengan Deshacer o no** · MEDIO · S · (CO-16, AG-30, UI-06)
«12 hechas borradas · Deshacer», «Reunión con Jorge · jue 18 sept 17:30–18:30 · 1 h antes · Deshacer»,
«Dictado agotado por hoy. Vuelve a las 02:00.» se van antes de leerse.
→ 6–7 s si hay acción o el mensaje pasa de 60 caracteres; 4,2 s si no. Sin cambiar la API.

**9 · Toast nuevo pisa un Deshacer vivo; no se puede descartar; su posición da por hecho la barra de escribir** · MEDIO · S · (UI-07, UI-08, UI-09, TA-05, CO-20, CO-21, TR-23)
Dos borrados seguidos pierden el primer deshacer. En Lugares y Ajustes el toast flota 64 px por encima de
las pestañas; con la barra abierta y el teclado bajado cubre el campo; en el modo sugerencia queda
detrás de la tarjeta.
→ Si el toast vigente tiene acción y el nuevo no, encolar; dos borrados en 4 s → «2 tareas borradas ·
Deshacer» (ya existe el patrón en «Borrar las N hechas»). Tocar el texto descarta. `--toast-lift` que
`App` fija según haya barra, pestañas o tarjeta de sugerencias.

**10 · Ningún botón enseña el foco de teclado** · ALTO · S · (TR-02)
`button:focus { outline: none }` (0,1,1) gana a `:focus-visible` (0,1,0): el anillo coñac no sale en
el 95 % de los controles.
→ `button:focus:not(:focus-visible)` (y lo mismo en `input`, `textarea`). Una línea.

**11 · Los paneles no mueven ni atrapan el foco** · ALTO · S · (UI-11, TR-05)
Con VoiceOver o teclado, al abrir una tarea el cursor sigue en la lista de detrás; al cerrar, el foco
se queda en `body`. La bienvenida sí lo hace bien.
→ En `Sheet`: guardar `activeElement`, `panel.focus()` con `tabIndex=-1`, `inert` en `#root` mientras
está abierto, devolver el foco al cerrar. ~15 líneas.

**12 · 24 controles por debajo de 44 pt** · MEDIO · M · (TR-13, AG-08, AG-09, TA-41, TA-31, CO-15, UI-12, UI-13, LA-27)
Los que más duelen: el «…» de cada sección (32), «Pasar a hoy» (32), «Hoy» de la Agenda (30), el asa de
los paneles (28), el asa de la barra (22), la × y la hora de acabar de la regla (32), todas las píldoras
de los paneles (38), enviar / × / ✓ / Detalles de la barra (36), «Deshacer» del toast (36), el «+» de
Rutinas (32), las flechas de Constancia (44 × 36), la chincheta y la esquina del mapa (30 y 32), el
«Aa» (42). La app ya resuelve diez con un `::after` invisible: es aplicar la misma receta.
→ Inventario completo con la regla exacta para cada selector en `transversal.md` («Inventario de áreas
de toque»).

**13 · «Ajustes» nombra la pestaña y los Ajustes del iPhone** · MEDIO · S · (LA-16, TR-07)
«Activa los avisos en Ajustes para dictar» (pestaña) frente a «Bloqueados: abrir Ajustes», «Sin permiso:
abrir Ajustes», acción «Ajustes» de los toasts (iOS). En la pestaña Ajustes de Tasks, «abrir Ajustes»
no se entiende.
→ Para iOS, siempre «Ajustes del iPhone» / «iPhone Settings» (siete sitios listados en TR-07). Para la
pestaña, mejor que el toast lleve la acción «Activar» y no mande a ningún sitio.

**14 · «Hasta…» significa plazo bajo *Cuándo* y hora de acabar bajo *Duración*** · ALTO · S · (TA-11, TR-09, visto)
Las dos píldoras, idénticas, en el mismo panel y en la ficha: una abre un calendario y otra una rueda.
→ La regla pasa a «Acaba a las…» / «Ends at…». El plazo se queda con «Hasta…» (es como se dicta).

**15 · «Recordatorios» en el panel de la tarea, «Avisos» en todo lo demás** · MEDIO · S · (TR-08)
La bienvenida enseña la ficha con «Avisos»; la tarea de verdad dice «Recordatorios» y debajo «Activar
avisos en este dispositivo». En inglés es «Reminders» en todas partes.
→ `ReminderPicker`: título «Avisos», «Quitar el aviso X».

**16 · Abreviaturas de horas distintas según el fichero** · MEDIO · S · (TR-10)
En inglés «1h», «1 hr before», «1h 30m free» en la misma pantalla; en español «1 h 30» parece una hora
del reloj.
→ Una sola `hoursLabel` en `duration.ts` usada por `reminders.ts` y `timeline.ts`: «1 h 30 min» /
«1 hr 30 min».

**17 · Lo atenuado con `opacity` baja de 2:1 y 3:1** · MEDIO · S · (TR-15)
Un aviso «antes» inactivo (1,9:1), una rutina que hoy no toca (3,0:1), la meta de una atrasada (4,0:1),
el botón «Añadir» deshabilitado (3,4:1).
→ Atenuar con `color: var(--text-3)` y borde discontinuo en vez de `opacity`; `disabled` al 0,55.

**18 · Textos explicativos fuera de la bienvenida** · MEDIO · S · (TR-17)
Ajustes › Calendario acumula tres notas con el calendario conectado; la tarjeta de sugerencias lleva dos
líneas; «Uno solo para tus tareas, aparte de los tuyos» repite el título de la opción.
→ Quitar `FeedbackDock.note`, `CalendarBlock.onNote`, `CalendarExportSheet.ownNote`; dejar en una
frase el `lead` de la exportación y `suggestNote`. Las notas justificadas (privacidad del permiso,
dónde se guardan los datos, por qué no hay avisos en la PWA, a qué hora preguntará) se quedan.

**19 · El scrim de los paneles en claro es del 30 %** · MEDIO · S · (TR-12)
La lista de detrás compite con el panel; de noche es del 55 %.
→ `--scrim: rgba(22, 29, 48, 0.42)` en claro.

**20 · «Suelta una tarea aquí» está en español también en inglés y sale sin arrastrar** · ALTO · S · (AG-02, FL-05, TR-04, visto)
Es el único literal fuera de una tabla `COPY`. Además presupone el arrastre: quien no sabe que se
mantiene pulsado no entiende qué soltar. Se ve en cada sección vacía, cada día, también en ayer.
→ A `COPY` («Drop a task here») y enseñarlo solo mientras se arrastra (`.view.is-dragging`); en reposo,
nada (la sección vacía es solo su cabecera con el «+»).

**21 · Todas las secciones salen cada día, también vacías** · ALTO · M · (AG-04, visto)
Con cuatro secciones, un martes con una tarea enseña cuatro cabeceras y cuatro «Suelta una tarea aquí».
En un día futuro sin tareas sin hora el bloque ni aparece.
→ Sección vacía = solo su cabecera (nombre + «+»); en días que no son hoy, las vacías plegadas en una
línea discreta («3 secciones vacías») que se abre al tocarla y siempre durante un arrastre.

**22 · «Nada sin hora.» con tareas sin hora debajo; «Todo tiene hora.» raro** · ALTO · S · (AG-03, TR-19)
Raíz vacía pero secciones con tareas: cabecera «Sin hora 2», debajo «Nada sin hora.», y más abajo
«Trabajo 2». Hoy sin raíz pero con secciones: «Día libre.» encima de pendientes.
→ El vacío de la raíz solo cuando todo el bloque está vacío; con `timedTasks` y raíz vacía, ninguna nota.

**23 · Avisos que no se programan: solo una coletilla en Ajustes** · ALTO · S · (TR-06, LA-18, FL-23)
Pones «mañana a las 9», la app dice que está y no suena. Para enterarse hay que ir a Ajustes › Avisos y
leer «Programados 23 · sin sincronizar», una cifra de desarrollador sin salida (y que no dice cuándo iOS
se ha quedado sin hueco de 64).
→ Toast una vez cuando `failed` pasa a `true` («No se han podido programar los avisos. Se reintenta
solo.») y nota en el panel de la tarea bajo *Avisos* mientras dure. En Ajustes, quitar «Programados» en
estado normal; con fallo, fila en ladrillo «Los avisos no se han podido programar · Reintentar».

**24 · Las tareas que no llegan al calendario no avisan** · MEDIO · S · (TR-18, LA-20)
`CalendarExportSync` traga el error. Ajustes sigue diciendo «Añadir mis tareas · Trabajo».
→ Estado `exportFailed` y nota en ladrillo bajo la fila: «No se han podido añadir al calendario. Se
volverá a intentar.» Sin toast (puede fallar en segundo plano).

**25 · Textos duplicados en varias tablas** · BAJO · S · (TR-21)
«Activa los avisos en Ajustes…», «No se ha podido abrir el mapa.», «Sin permiso: abrir Ajustes», «Nueva
rutina», «Nombre de la sección»… viven en dos o tres ficheros; al corregir uno se olvida el otro (ya ha
pasado: «Avisos» en la bienvenida, «Recordatorios» en el panel).
→ `src/lib/copy.ts` con lo compartido.

### 5.3 Escribir: barra, ficha y dictado

**26 · El destino elegido se pierde al soltar el teclado** · ALTO · S · (CO-02, AG-06)
Escribes «leche», tocas **Mañana** (se pone marino), tocas el velo para mirar la lista: las píldoras
siguen a la vista pero **Hoy** vuelve a estar elegido; la tarea va a hoy. Con el «+» de una sección es
peor: la píldora de la sección desaparece y el placeholder sigue diciendo «Añadir a Compra» (visto:
el placeholder tampoco cambia al elegir «Hoy»).
→ `chosen` y `composeSection` viven mientras haya texto, no mientras haya foco: quitarlos en `reset()` y
al vaciar el texto, no en `onBlur`. El placeholder lo calcula `Composer` a partir de `targetItem`.

**27 · Lo entendido sin día manda la tarea a la Bandeja aunque la barra diga «Añadir a hoy»** · ALTO · S · (CO-03)
«reunión de una hora» mirando el jueves → píldora «1 h», desaparecen los destinos, Intro → «reunión →
Bandeja · Ver». En el iPhone, «comprar pan al llegar a Mercadona» igual. Si abres Detalles, la ficha
dice «Sin fecha».
→ Cuando el analizador no da día, aplicar el destino (`parsed.date ?? target`), también en la ficha; y
seguir enseñando los destinos cuando lo entendido no fija día.

**28 · El «+» de una sección mezcla la sección con los días en la misma fila de píldoras** · MEDIO · S · (visto, CO-17)
Al entrar por el «+» de Trabajo la fila dice «TRABAJO · Hoy · Mañana · Sin fecha…»: no se sabe si
TRABAJO es hoy o es otra cosa, ni qué pasa al tocar «Hoy». La ficha tampoco menciona la sección
(«NUEVA TAREA · Hoy», botón «Añadir a hoy»).
→ Un solo chip «Trabajo · hoy» (la sección como etiqueta del día elegido), o la sección fija y los días
como siempre; en la ficha, «Hoy · Trabajo» y «Añadir a Trabajo».

**29 · Lo dictado no va al día que se mira y su toast no ofrece «Ver»** · ALTO · M · (CO-04)
En la Agenda del jueves, placeholder «Añadir al jueves 2», dictas «llamar al dentista»: «Llamar al
dentista · Sin fecha · Deshacer». Tecleado, habría ido al jueves.
→ `onVoice(text, interpreted, target)`; lo dictado sin día cae en el destino vigente. Toast con «Ver»
cuando lo añadido no se ve.

**30 · Mantener pulsado para mover no tiene pista ni lámina** · MEDIO · S · (AG-13, TA-02)
Se quitó el asa (buzón, 05/10) y no se sustituyó por nada. La lámina *Gestos* enseña deslizar, no
mantener. El muelle de la Bandeja y la tira como destino quedan escondidos.
→ Tercera fila en la lámina *Gestos* que se hunde sola («Mantén pulsada para moverla» / «Hold to move
it»), subiendo `PLATE_SINCE` para que la vean quienes actualizan. Y la primera vez que se arrastra en la
Bandeja, el muelle entra con un rebote más largo.

**31 · El modo «Aa»: un icono abstracto que cambia todas las filas sin decir nada** · MEDIO · S · (AG-14, TA-06, TA-07, TA-08)
Al tocarlo aparece un «1» en cada fila; si lo tocas pasa a «2» y el título crece. Nadie deduce del icono
que se arrastra. Pasar de 10 vuelve al 1 (sorpresa). Con el modo activo, el scroll con el pulgar por el
borde derecho cambia importancias (el mismo conflicto que motivó quitar el asa). 42 px.
→ Toast la primera vez («Arrastra el número: más arriba, más grande»); en 10 el toque no hace nada (o
baja a 9); el mando acepta solo arrastre horizontal (`touch-action: pan-y`); 44 px. Alternativa radical
(§6): quitar el modo y dejar la importancia solo en el panel.

**32 · El asa del mes casi no se ve** · MEDIO · S · (AG-10)
Una raya de 34 × 4 px al 20 % bajo los días, pegada al filete de avance. Solo pasa a oro con el mes
abierto.
→ Asa en `--gold-dim` siempre (y `--gold` abierta), un poco más larga; o quitarla y dejar tirar de la
tira + la flecha del mes (menos controles).

**33 · Ficha de permiso de dictado sin salida** · ALTO · S · (CO-05)
Tocas el micrófono sin querer y sube «Dictado … Continuar»: ni ×, ni velo, ni Escape. Apple exige un
solo botón en el iPhone, pero no manda en la PWA ni en el escritorio.
→ `onClose` (velo, asa, Escape) al menos cuando `!isNative`; cerrar = no pedir nada.

**34 · Con el micrófono denegado la ficha de permiso vuelve a salir en cada toque** · MEDIO · S · (CO-06)
Dos pasos para llegar al toast útil («Sin acceso al micrófono · Ajustes»), siempre.
→ Recordar que el sistema denegó (`tasks:mic-denied`) y saltar la ficha; borrar la marca cuando
`getUserMedia` vuelva a funcionar.

**35 · El micrófono se enseña aunque no pueda funcionar, y el toast manda a un sitio equivocado** · MEDIO · S · (CO-07, FL-12)
PWA sin instalar: «Activa los avisos en Ajustes para dictar» y en Ajustes no hay nada que activar (lo
que hace falta es añadir a la pantalla de inicio). Sin servidor o sin Web Speech, el micrófono está y
solo da un toast sin acción.
→ Ocultar el micrófono cuando no pueda funcionar; distinguir por `push.status`: «Para dictar, añade
Tasks a la pantalla de inicio» / «Los avisos están bloqueados en el sistema» / acción **Activar**.

**36 · La ficha enseña Importancia (10 botones) y Repetir (5 píldoras) siempre** · MEDIO · M · (CO-10)
Unos 30 controles antes del botón de añadir para «poner la cena del jueves». La importancia por defecto
es 1 y una rutina rara vez nace de la ficha.
→ Dos filas compactas al final, «Importancia · Normal» y «Repetir · No», que despliegan al tocarlas
(abiertas si ya tienen valor distinto del normal). Mismo patrón que «N hechas».

**37 · Abrir Detalles con la barra vacía deja la ficha sin foco y el teclado se va** · MEDIO · S · (CO-11)
→ Si no hay texto, foco en el título de la ficha al montarse en vez de `blur` del campo de la barra.

**38 · Con la ficha abierta, lo que se teclea después ya no se interpreta; y el estado de la ficha se queda pegado** · MEDIO · M · (CO-12, visto)
Abres Detalles, pliegas, escribes «a las 5» al final: se crea sin hora. Visto además: al sustituir el
texto entero tras plegar la ficha, la píldora dijo «Cada día · 21:30» (la hora venía de la ficha
anterior y «cada día» del texto nuevo).
→ La ficha manda, pero si el analizador detecta algo nuevo, píldora de sugerencia «Aplicar 17:00» que
lo pasa a los campos. Y al vaciar o sustituir el texto de golpe, reiniciar la ficha siempre.

**39 · Tocar la píldora de lo entendido la tacha: no se entiende qué ha pasado** · MEDIO · S · (CO-13)
El tachado significa «hecho» en el resto de la app.
→ En `is-off`, texto «Tal cual» / «As written» con borde discontinuo y toast la primera vez («Se guardará
tal cual lo escribes.»).

**40 · Errores del servidor tal cual: en minúsculas, en español con la app en inglés, con jerga** · MEDIO · S · (CO-14, TR-14)
«demasiadas peticiones, prueba más tarde», «cuerpo demasiado grande», «no autorizado», «Sin conexión con
el servidor de avisos» cuando lo que falla es dictar; «vuelve a desplegar el Worker».
→ Mapear por estado: 429 «Demasiados dictados seguidos. Espera un momento.», 413 «Ha sido demasiado
largo: dicta frases más cortas.», 401 «Hay que volver a conectar el dictado: prueba otra vez.», red
«Sin conexión. El dictado necesita internet.»; «El dictado no está disponible ahora mismo.»

**41 · Rutina creada desde la Agenda: «Ver» en vez de «Deshacer»** · ALTO · S · (AG-07, CO-08, UI-33, FL-09)
«Los lunes» entendido como rutina cuando querías «el lunes»: desde la Agenda hay que ir a la Bandeja,
buscarla y deslizarla.
→ Siempre **Deshacer**; el mensaje ya dice que es una rutina.

**42 · Lugar nuevo dictado en el iPhone: el panel del lugar tapa el «Deshacer» y deshacer deja el lugar** · MEDIO · M · (CO-09)
→ Abrir el panel del lugar tras el toast (o toast por encima, con el 7) y al deshacer borrar también los
lugares creados por esa entrada si nadie más los usa.

**43 · Mayúsculas inconsistentes: «jue 18 sept» junto a «Hoy»; «vie 16 oct» en la píldora y «Vie 16 oct» en la ficha** · BAJO · S · (CO-19, visto)
→ Capitalizar en `relativeLabel` cuando empieza píldora o frase.

**44 · «Fold», «Add to Thursday 8»** · BAJO · S · (CO-18)
→ «Collapse»; «Add to Thu, Oct 8».

**45 · La × de «quitar los detalles» se lee como borrar o cancelar** · BAJO · S · (CO-22)
→ Al final de la fila, o como última píldora «Quitar» / «Clear».

**46 · El asa de la tarjeta mide 22 px y un toque la abre** · BAJO · S · (CO-23)
Tocas el campo por su borde superior y se te despliega la ficha.
→ Que el toque sin arrastre no abra (ya está **Detalles**); el asa solo como gesto.

**47 · «+ Nueva» sección: iOS hace zoom, el nombre se pierde al tocar fuera y la sección se crea al momento** · MEDIO · S · (TA-20, CO-25, FL-25)
El input hereda 13 px (zoom de Safari); `onBlur` descarta; con Intro la sección existe aunque luego
quites la ficha.
→ `font-size: 16px`; en `onBlur` crear si hay nombre; `enterKeyHint="done"`; al quitar la ficha, borrar
la sección creada en ella si está vacía.

**48 · «Al llegar» / «Al salir» es una píldora que cambia de texto: un conmutador disfrazado de opción** · MEDIO · S · (TA-17, CO-27)
→ Dos píldoras fijas con `aria-pressed`, la elegida en marino; las de lugar con la frase entera («Al
llegar a Casa»).

**49 · Límites de la grabación invisibles** · BAJO · S · (CO-26)
1,5 s de silencio cierra; 30 s máximo corta sin aviso.
→ A los 25 s, un «5 s» junto a la onda.

**50 · La píldora de importancia en la barra es solo «7»** · BAJO · S · (CO-28)
→ «Importancia 7» o pintarlo con el tamaño que dará.

**51 · La tecla Intro dice «OK» pero añade** · BAJO · S · (CO-29)
→ `enterKeyHint={ready ? 'send' : 'done'}`.

**52 · Un aviso «Mañana 9:00» añadido en la ficha sin fecha deja la tarea en la Bandeja; escrito, la fecha se pone sola** · BAJO · S · (CO-30)
→ Que las dos vías hagan lo mismo (poner la fecha del aviso).

**53 · En la PWA, «al llegar a casa» se queda en el título sin explicar por qué** · BAJO · M · (CO-31)
→ Píldora apagada «Lugares: en la app del iPhone» la primera vez, que lleva a la pestaña Lugares.

**54 · En la PWA, dictar un lugar borra «al pasar por Mercadona» del título** · CRÍTICO (solo PWA) · S · (CO-01)
La IA separa el lugar del título y `interpret.ts` lo descarta porque la PWA no tiene lugares: queda
«Comprar pan» y nadie se entera. El analizador local, en cambio, deja la frase entera.
→ Con `places === null` y lugar devuelto, conservarlo en el título: «Comprar pan (al pasar por
Mercadona)». Añadir el caso al banco `worker/eval`.

**55 · La ficha de permiso no anticipa el diálogo de iOS** · BAJO · S · (CO-32)
→ Una línea al final: «Al continuar, el sistema te pedirá permiso para usar el micrófono.»

**56 · Títulos recortados a 500 caracteres sin aviso** · BAJO · S · (CO-33, FL-31)
→ `maxLength={500}` en la barra y los títulos.

**57 · Pasar a rutina en la ficha esconde y tira los avisos puestos** · BAJO · S · (CO-34)
→ Nota «Las rutinas avisan a su hora» cuando había avisos, o limpiarlos en `withRepeat`.

**58 · Añadir a un día pasado desde la Agenda crea una atrasada al instante** · BAJO · S · (CO-35)
→ Placeholder «Añadir al miércoles 1 (pasado)».

**59 · «Dictado agotado por hoy» se queda sin ruta** · BAJO · S · (UI-43)
→ «…Mientras, escríbela.» o acción **Escribir** que enfoca la barra.

**60 · Dictar una rutina con 50 ya: lo dicho se pierde** · BAJO · S · (FL-30)
→ Si `addRoutine` devuelve `false`, crear la tarea de hoy con el texto.

**61 · Cambiar de idioma con texto en la barra: la píldora sigue en el idioma anterior** · BAJO · S · (FL-26)
→ `language` en las dependencias de los dos `useMemo`.

**62 · Si el analizador en inglés no carga, lo escrito se queda literal sin decir nada** · BAJO · S · (TR-30)
→ Reintentar al recuperar `online` y toast una vez.

**63 · Con texto escrito y el teclado bajado, la tarjeta tapa las últimas filas; y el toast se posa sobre el campo** · BAJO · S · (CO-20, CO-21)
→ Que el compositor publique su alto real en `--dock` (ya se hace con `--kb`).

**64 · Quitar el último día de una rutina (ficha y panel) no hace nada ni lo dice** · BAJO · S · (CO-24, TA-33)
→ `haptic('warning')` y sacudida; en la ficha, que equivalga a «No se repite».

### 5.4 Agenda

**65 · Día pasado: lo pendiente con hora ni es rojo ni se puede pasar a hoy, y sobra el «tiempo libre»** · ALTO · M · (AG-05, visto)
Una tarea de ayer a las 11:00 sin hacer sale en tinta normal con «11 h 30 libres» y sin «Pasar a hoy»
(el bloque «Sin hora», que lo lleva, solo se pinta si hay tareas sin hora). Visto: en «Ayer» el
Horario dice «12 h 30 libres» entre dos rutinas hechas.
→ `TimelineTask` recibe `overdue` y pinta en ladrillo; «Pasar a hoy» de un día pasado en la cabecera del
día (junto a «Hoy»: «Pasar 2 a hoy»); sin filas de hueco cuando el día ya pasó.

**66 · Pasar de mes con el mes desplegado cambia el día elegido** · MEDIO · M · (AG-11)
Abres el mes para mirar noviembre y la cabecera y la lista cambian al 12 de noviembre; al recoger te
quedas allí. Google Calendar no cambia la selección al pasar de mes.
→ En `layout === 'month'`, deslizar solo mueve el mes visible; el día se elige al tocarlo.

**67 · Las tareas del Horario no se pueden arrastrar a otro día** · MEDIO · M · (AG-12)
Aprendes que mantener pulsado y soltar en un día mueve la tarea; con «Comida con Ana 14:00» no se coge.
→ `TimelineTask` arrastrable (no reordenable) con la tira como único destino; conserva la hora.

**68 · El «+» de una sección manda la tarea con hora al Horario sin avisar** · MEDIO · S · (AG-17)
«Añadir a Trabajo» + «presupuesto a las 12» → aparece en el Horario, no en la sección, cuyo contador no
la cuenta; sin toast porque «está a la vista».
→ Toast «Presupuesto → Horario · 12:00».

**69 · «Ver» del toast deja el velo y el teclado encima, no despliega la sección plegada ni hace scroll a la tarea** · MEDIO · S · (AG-18, AG-27, FL-08)
→ `stopComposing()` antes de `go()`; desplegar la sección destino al añadir (como hace el «+»); tras
`go`, `scrollIntoView` de `[data-flip=id]` con destello (o abrir la tarea, como el aviso).

**70 · «+ Sección»: un campo sin borde ni botón, que crea al perder el foco sin aviso y es redundante** · MEDIO · S · (AG-32, visto)
Visto: al tocar «+ Sección» aparece «Nombre de la sección» como texto suelto, sin aspecto de campo, sin
Aceptar ni Cancelar. Se crea al tocar fuera aunque te arrepientas, la última, en todos los días. El panel
de la tarea ya tiene «+ Nueva».
→ Aspecto de campo (línea inferior, como el nombre de la rutina); Intro crea, Escape o tocar fuera con
el campo vacío cancela, con texto crea con toast «Sección Casa · Deshacer»; o esconderlo tras el «…».

**71 · Tocar la pestaña Agenda vuelve a hoy pero deja el mes abierto** · BAJO · S · (AG-21)
→ `reselect('agenda')` también recoge el mes.

**72 · «Día libre.» debajo de un Horario con rutinas** · BAJO · S · (AG-22, visto)
→ Con filas en el Horario, «Sin tareas.» / «No tasks.»; «Día libre.» solo cuando no hay nada.

**73 · Los huecos del Horario miden la noche entera** · BAJO · S · (AG-31)
«11 h 30 libres» entre una cosa por la mañana y otra a las 22:30 no informa.
→ Sin cifra a partir de 6 h («Tarde libre») y nunca en días pasados.

**74 · «Horario» y «Sin hora» no se pliegan; «Atrasadas» y «Rutinas» sí** · BAJO · S · (AG-33)
→ Todos plegables o solo Atrasadas (que es un aviso) con el chevron más visible.

**75 · Atrasadas plegado se queda plegado aunque entren más** · BAJO · S · (AG-34)
Semanas después hay nueve en una cabecera roja sin ver cuáles.
→ Desplegar solo cuando suba el número respecto a la última vez que se plegó.

**76 · Soltar una tarea en un día pasado la deja atrasada sin decirlo** · BAJO · S · (AG-28)
→ Toast «Comprar pan → jue 8 oct (atrasada) · Deshacer», o no aceptar la suelta en días pasados.

**77 · El «+3» de todo el día no se vuelve a plegar** · BAJO · S · (AG-36)
→ Última cinta «Menos».

**78 · Rutinas en el Horario con el día de calendario, no con la hora de renovación** · BAJO · S · (AG-37)
Con «Se renuevan a las 04:00», a la 1:00 tachar «Leer» en el Horario la marca para hoy y en la Bandeja
sigue pendiente la de ayer.
→ En el Horario de hoy, tachar con `routineDay`.

**79 · Intro en el nombre de la sección no cierra el panel** · BAJO · S · (AG-41)
→ Intro → `close()`.

**80 · Sin vibración al cambiar de pestaña** · BAJO · S · (AG-35)
→ `haptic('selection')` en `go`.

**81 · Plegar una sección la pliega en todos los días** · BAJO · — · (AG-20)
Coherente con que la sección sea global; con el 21 se quita el motivo principal de plegar vacías.
→ Dejarlo; plegada con pendientes ese día, el contador en coñac.

**82 · Mover una tarea con plazo fuera del plazo: el toast no dice que lo pierde** · BAJO · S · (FL-18)
→ «Informe → lun 20 oct (sin plazo)».

**83 · El contador «Horario 2» con cinco filas a la vista** · BAJO · S · (visto)
Cuenta las tareas pendientes con hora, pero debajo hay hechas y rutinas: parece que no cuadra.
→ Contar todo lo pendiente del Horario (tareas y rutinas) o no poner cifra.

**84 · Los anuncios del arrastre para VoiceOver solo en español** · MEDIO · S · (AG-16)
→ `pick({ es, en })` y decir qué se cogió.

### 5.5 Bandeja

**85 · «2 hechas»: el pliegue no dice que son de otros días** · MEDIO · S · (AG-15)
Con tachadas hoy a la vista, «2 hechas» parece un total que no cuadra.
→ «2 hechas otros días» / «2 done earlier».

**86 · El bloque Rutinas vacío encabeza la Bandeja para siempre** · MEDIO · S · (AG-19)
Cabecera «Rutinas», un «+» y una caja «Nueva rutina» (dos controles para lo mismo) antes de «Tareas», y
no se puede plegar.
→ Sin rutinas, una sola línea discreta «Rutinas · Nueva» al final; con rutinas, como ahora.

**87 · «Tareas» no se pliega aunque el estado lo prevé** · BAJO · S · (AG-23)
→ `BlockHeader` con `collapsed.backlog`.

**88 · «Hecha borrada»** · BAJO · S · (AG-24)
→ «Tarea hecha borrada» / «1 done task deleted».

**89 · «Mañ» / «Tmrw» en el muelle** · BAJO · S · (AG-26, TR-20)
→ Inicial del día para todos menos «Hoy»; el número ya dice cuál es mañana.

**90 · Una «hecha» plegada se puede arrastrar a un día y queda hecha con fecha** · BAJO · S · (AG-29)
→ Filas del pliegue no arrastrables.

**91 · El número de la cabecera «Bandeja 5» no dice qué cuenta y repite «Tareas 5»** · BAJO · S · (AG-39)
→ Quitarlo o «5 pendientes» pequeño.

**92 · Tres nombres para el mismo sitio: «Sin fecha», «Bandeja», «la bandeja»** · BAJO · S · (AG-38)
El destino de la barra se llama «Sin fecha» y el toast dice «→ Bandeja».
→ Destino «Bandeja» / «Inbox»; «Sin fecha» como kicker de la pestaña.

**93 · «Sin fecha» conserva hora y duración ocultas, que reaparecen al darle día** · BAJO · S · (FL-19)
→ Decirlo: toast «X → Martes 17:00» al planificar, y nota en el panel «Tiene hora (17:00): vuelve con
el día».

### 5.6 Panel de la tarea y fila

**94 · No se puede tachar desde el panel de la tarea** · ALTO · S · (TA-09)
Solo hay «Hecha» si se abre desde un aviso. Things, Recordatorios y Todoist llevan el círculo en la
ficha.
→ El mismo `row__check` a la izquierda del título del panel; al tacharla, cerrar con el toast «Hecha: X
· Deshacer». Quitar entonces «Hecha» de la barra de posponer.

**95 · Importancia va lo primero en el panel y lo último en la ficha** · MEDIO · S · (TA-10)
Diez números grandes bajo el título empujan Cuándo y Hora fuera de la primera pantalla.
→ Mismo orden que la ficha: Cuándo, Hora, Duración, Avisos, Sección, Importancia, Acciones.

**96 · El panel enseña ~25 controles de golpe** · MEDIO · M · (TA-26, TA-25)
Lo condicional ya está bien (Hora con día, Duración con hora, Sección con día). Sobra lo que casi nunca
se cambia. La escala 1–10 son diez botones de ~33 px sin arrastre, visible también en lo hecho.
→ Importancia y Sección como filas compactas con el valor («Sección · Compra ›», «Importancia · 1 ›»)
que despliegan al tocarlas; la escala acepta arrastre con vibración por paso; atenuada en lo hecho.

**97 · La regla de la duración se lleva el scroll del panel** · ALTO · M · (TA-12)
Apoyas el pulgar en la regla para bajar: la duración salta donde cayó el dedo y se guarda al soltar.
`RoutineLog` resuelve exactamente este conflicto bien; la regla y el `Slider` del lugar no.
→ `touch-action: pan-y`; no cambiar nada en `pointerdown`; seguir el dedo solo cuando `|dx| > 10` y
claramente horizontal (o toque sin moverse). Igual en `Slider`.

**98 · Estirar la regla manteniendo el dedo no se descubre** · MEDIO · S · (TA-13)
Quien saltó la lámina cree que el máximo son dos horas.
→ Último rótulo «2 h ›» y, en el tope sin mantener, la nota pasa a «Mantén el dedo para alargar».

**99 · Un aviso se quita tocando la píldora entera, sin deshacer; la del plazo, idéntica, hace lo contrario** · ALTO · S · (TA-16)
Tocas «Mañana 9:00» para cambiarle la hora y desaparece; si era «Otra…» hay que meterlo entero.
→ La × como botón propio; el cuerpo abre el selector (para los `at`); al quitar, toast «Aviso quitado ·
Deshacer».

**100 · «+ Añadir» no se pliega, ofrece avisos a tareas hechas y al tope de 20 no hace nada** · MEDIO · S · (TA-18, FL-13)
→ Con `adding`, la primera píldora pasa a «Listo»; sin «+ Añadir» en lo hecho; al tope, nota «Como mucho
20 avisos por tarea.» y sin atajos.

**101 · Un aviso «antes» atenuado no dice por qué** · BAJO · S · (TA-19)
→ Sufijo «· sin hora» / «· pasado».

**102 · Cambiar *Cuándo* desde el panel saca la tarea de la vista sin decir adónde** · MEDIO · S · (TA-21)
Mirando el lunes tocas «Mañana» o «Sin fecha», cierras, y la fila ya no está; con «Sin fecha» pierde la
sección sin aviso.
→ Al cerrar, si el día cambió respecto a lo visible, el mismo toast que al añadir («X → Mañana · Ver»,
«· sin sección»).

**103 · Con un plazo en curso, el panel marca el día en que empezó como si fuera «su día»** · BAJO · S · (TA-22, FL-28)
«Del lunes al viernes» vista el miércoles: Cuándo dice «lun 6 oct» activo. Parece atrasada.
→ Píldora única «Del 6 al 10 oct» (`periodLabel`) que abre el selector del primer día.

**104 · Deslizar no deja pista en reposo; en una tarea hecha enseña un check pero la desmarca** · MEDIO · S · (TA-01, TA-03)
→ Una vez por instalación, la primera fila hace un «peek» de 24 px a la derecha (ya existe
`is-hint-right`); en lo hecho, círculo hueco o flecha de deshacer en lugar del check.

**105 · El subtítulo va a la derecha del título y no encoge** · BAJO · S · (TA-04)
En 320–375 px una atrasada con plazo y tramo deja el título a una palabra por línea; la rutina sí lo pone
debajo.
→ `flex-wrap` y que la meta baje a segunda línea cuando no cabe.

**106 · Quitar la hora no quita la duración (en la ficha sí)** · BAJO · S · (TA-14)
→ `task/setTime` con `null` → `duration: null`.

**107 · Elegir como hora de acabar la de empezar no hace nada, en silencio** · BAJO · S · (TA-15)
→ Toast «Tiene que acabar después de empezar».

**108 · Intro en el título de la tarea mete un salto de línea** · BAJO · S · (TA-24)
→ Intro = `blur()`; `\n` → espacio, como en la rutina.

**109 · Deshacer «Convertir en rutina» deja abierto el panel de una rutina que ya no existe; y nace «cada día» aunque la tarea fuera de un martes** · MEDIO · S · (TA-27, TA-28, FL-07)
→ Al deshacer, cerrar el panel y reabrir la tarea; nacer con el día de la semana de la tarea
(`weeklyPreset`); el toast dice «· cada día» o «· los martes».

**110 · Barra de posponer: «Hecha» con estilo de «elegido», posponer sin deshacer, falta «A hoy» en una atrasada** · MEDIO · S · (TA-29, UI-14, TA-42)
→ Con el 94, fuera «Hecha» de aquí; si no, estilo coñac. Chip «A hoy» delante cuando está atrasada.
Posponer con «Deshacer».

**111 · «Otro día» y «Elegir hora» abren un selector sin avisarlo; «Otra…» y «Hasta…» sí** · BAJO · S · (TA-40)
→ Regla: puntos suspensivos = abre algo. «Otro día…», «Elegir hora…».

**112 · Se pueden poner avisos y plazo a una tarea en el pasado** · BAJO · S · (TA-43)
→ `min = max(date + 1, today)`.

**113 · En la PWA, los avisos de lugar de una copia importada parecen activos** · BAJO · S · (FL-24)
→ `isActive` para `place` exige `isNative`.

**114 · Las filas memorizadas no cambian a medianoche** · BAJO · S · (FL-22)
«Hasta el jueves» en vez de «Último día» hasta que se toca algo.
→ Pasar `today` como prop (o un `TodayContext`).

**115 · Un id de tarea inexistente se queda guardado y el panel se abre solo más tarde** · BAJO · S · (FL-20)
→ No guardar el id si no existe; o cerrar cuando `taskId && !task`.

**116 · El panel no tiene título visible ni cierre explícito; el asa mide 28 px** · BAJO · S · (TA-23, UI-12)
→ Zona de 44 px en el asa con `::after`. Sin botón «Cerrar».

### 5.7 Rutinas

**117 · Una rutina nueva se crea al cerrar el panel, sin toast ni deshacer; «Añadir rutina» va al final del scroll bajo el teclado** · ALTO · S · (TA-30, FL-15)
Escribes «Correr», te arrepientes y bajas el panel: se crea igual (vibra `success`, sin toast). Si sí la
quieres, el botón está tapado por el teclado que subió solo. Cerrar = cancelar en cualquier panel de
iOS; aquí cerrar = guardar.
→ Botón en el pie fijo (`footer` de `Sheet`, siempre visible también con teclado); cerrar cancela (o,
como mínimo, toast «Rutina: Correr · Deshacer»). Mismo criterio para el lugar nuevo (4).

**118 · Con 50 rutinas, el panel «+» se pierde en silencio** · ALTO · S · (FL-04)
Vibración de éxito, el panel baja y no aparece nada; la barra y la ficha sí avisan.
→ Nota en el panel «Ya hay 50 rutinas: borra alguna para añadir otra.» y no cerrar; ocultar el «+» al
tope.

**119 · «A una hora» se lee como «en una hora»; la ficha dice «Elegir hora»** · MEDIO · S · (TA-32)
→ `RoutineSheet` usa el `TimeField` compartido: «Elegir hora» y, elegida, «10:00».

**120 · Constancia: nada indica que los días se tocan y se pintan** · MEDIO · S · (TA-34)
Es la función de rescate (rehacer una rutina borrada) y parece un calendario de solo lectura.
→ Los días pasados que tocaban y no se hicieron con el aro más marcado y, al abrir, el día de hoy hace
el rebote `log-ink`; o una línea «Toca un día para corregirlo».

**121 · «30 días» como rótulo de un porcentaje** · BAJO · S · (TA-35)
→ «Último mes» / «Last 30 days».

**122 · «Otro» emoji: teclear letras no hace nada y nadie dice que hace falta el teclado de emojis** · BAJO · S · (TA-36)
→ Placeholder «😊 Otro» y toast «Usa el teclado de emojis» si llega una letra.

**123 · Se puede tachar hoy una rutina que hoy no toca** · BAJO · — · (TA-37)
Inocuo («la hice aunque no tocaba»); decisión tuya (§6).
→ Si se mantiene, `haptic('tap')` sin rebote; si no, pedir el deslizamiento completo.

**124 · Los puntos de la semana son de 7 px y «no tocaba» una raya de 1,5 px** · BAJO · S · (TA-38)
→ 9 px, y «no tocaba» como punto hueco pequeño.

**125 · Las rutinas no se pueden reordenar** · BAJO · M · (TA-39)
→ Aplazable.

**126 · El placeholder del nombre de una rutina nueva («Tomar creatina») parece un valor ya puesto** · BAJO · S · (visto)
→ Placeholder genérico («Nombre de la rutina») o en gris más claro con «p. ej.».

**127 · El aviso de una rutina repite la hora que ya es** · BAJO · S · (UI-34)
A las 10:00: «Tomar creatina / 10:00 · Cada día».
→ «💊 Cada día · racha de 12».

**128 · Cambiar la hora de renovación de madrugada parece deshacer lo tachado** · BAJO · — · (FL-29)
→ Documentar; no merece la complejidad.

### 5.8 Lugares

**129 · Tocar el mapa de Lugares abre «Nuevo lugar», no el mapa** · MEDIO · S · (LA-07)
Tocas para mirar o acercar (como en Google Maps) y sube Apple Maps titulado «Nuevo lugar» con «Añadir
aquí». La esquina ⤢ promete «ver más grande», no «añadir».
→ Píldora «+ En el mapa» en lugar de la esquina, y el picker titulado «Añadir un lugar».

**130 · «Buscar o añadir un lugar» abre un formulario con el buscador en tercer lugar y sin teclado** · MEDIO · S · (LA-08)
→ En un lugar nuevo sin ubicación, el buscador primero y con foco; el nombre sube cuando hay ubicación.

**131 · «Otros nombres» se enseña en un lugar que aún no tiene nombre** · MEDIO · S · (LA-09)
→ Solo en lugares hechos, como fila plegada «Otros nombres · el piso, casa de mis padres ›».

**132 · Buscar no dice «buscando» ni «nada con ese nombre»** · MEDIO · S · (LA-10)
→ Nota «Buscando…» y «Nada con ese nombre. Elígelo en el mapa.»

**133 · Con ubicación puesta, tres controles hacen lo mismo que tocar el mapa** · MEDIO · S · (LA-11)
Mapa tocable, «Elegir en el mapa», el buscador y «Usar mi ubicación» al mismo nivel que la información.
→ Con ubicación: mapa + dirección + una fila «Cambiar ubicación ›» que despliega el resto.

**134 · El panel del lugar no tiene un orden pensado para leerlo** · MEDIO · M · (LA-45)
Suma de 130–133, 138 y 139 en un solo reordenado.
→ Existente: Nombre · mapa · dirección · «Cambiar ubicación ›» · Radio del aviso · Avisos aquí (filas
tocables) · «Otros nombres ›» · Borrar. Nuevo: buscador con foco · Elegir en el mapa · Mi ubicación ·
(con ubicación) nombre, mapa, radio · pie «Añadir lugar».

**135 · Lugares vacío en el iPhone no dice para qué sirve, y la bienvenida no tiene lámina de lugares** · MEDIO · S · (LA-12)
«0 SITIOS», un plano y la píldora. La PWA sí lleva la frase, pero ahí no se puede usar.
→ Con cero lugares, la misma frase de la PWA («Avisos al llegar o al salir de un sitio: “al pasar por
Mercadona, comprar leche”») y kicker «Sin lugares».

**136 · La distancia y el orden por cercanía no aparecen hasta reiniciar la app** · MEDIO · S · (LA-13)
Concedes el permiso al buscar y la pestaña sigue sin distancias hasta matar la app.
→ Releer en `visibilitychange` y cuando el permiso pase a concedido; no cachear el `null`.

**137 · Un lugar dictado sin ubicar no avisa de que el aviso no sonará; con Siri, nada lleva a él** · MEDIO · S · (LA-14, FL-11)
→ Al cerrar el panel sin ubicación: «Mercadona sin ubicación: el aviso no sonará · Ubicar». Al aplicar
entradas de Siri con la app delante, toast «¿Dónde está Decathlon? · Elegir».

**138 · Borrar un lugar quita avisos de las tareas sin deshacer y sin decir cuántos** · ALTO · M · (LA-05)
→ Segundo toque con la cifra («Borrar y quitar 3 avisos»); toast «Mercadona borrado · Deshacer» con
`place/restore` que devuelve el lugar y los avisos.

**139 · «Avisos aquí» lista tareas que no se pueden abrir** · BAJO · S · (LA-23)
→ `TaskRow` como en el panel del aviso de lugar.

**140 · Un rótulo «ACCIONES» para una sola fila; «RADIO» sin decir de qué** · BAJO · S · (LA-24, LA-25)
→ Fuera el rótulo; «Radio del aviso» y una línea «Avisa al entrar o salir de este círculo.»

**141 · El radio desaparece de la tarjeta cuando hay tareas** · BAJO · S · (LA-26)
→ Siempre o nunca (nunca es más limpio).

**142 · «sitio» en el kicker, «lugar» en todo lo demás** · BAJO · S · (LA-29)
→ «3 lugares» / «Sin lugares».

**143 · La pestaña Lugares en la PWA manda a la App Store también desde Android** · BAJO · S · (LA-36)
→ Botón solo en iPhone/iPad; en Android, «Por ahora, solo en la app de iPhone.»

**144 · A los 50 lugares, añadir uno no hace nada; al dictar un lugar nuevo sube un panel vacío** · MEDIO · S · (LA-38, FL-14)
→ Nota en el panel y no cerrar; no abrir el panel si no cabe; cerrar si el id no existe.

**145 · Tocar un otro nombre lo quita; añadir uno repetido no dice nada** · BAJO · S · (LA-39)
→ `haptic('selection')` al quitar; «Ya está» al repetir.

**146 · El panel del aviso de lugar repite el nombre dos veces** · BAJO · S · (LA-40)
→ Quitar el segundo o «3 pendientes aquí».

**147 · «Ya hay un lugar llamado X.» sin comillas; el mapa es un `div` tocable sin rol** · BAJO · S · (TR-28, TR-29)
→ «Ya hay un lugar llamado «Casa».»; `role="presentation"` en el mapa (la esquina ya es botón).

### 5.9 Ajustes

**148 · Cinco controles distintos para la misma clase de decisión y ~21 cosas tocables de golpe** · ALTO · M · (LA-15, LA-41, LA-31)
Tarjetas (Apariencia), lista con marca (Idioma), píldoras «No | Cada mañana» (Resumen, que además se
activa al tocar «Cada mañana» aunque se cancele la rueda), interruptor (Calendario), segmentado «No
enviar la voz | Permitido» (Dictado, con un párrafo legal). Visto: Apariencia ocupa 300 px arriba del
todo para algo que se toca una vez.
→ Un lenguaje común: `Switch` para lo sí/no y fila con valor › para lo demás. Idioma → una fila
«Idioma · Automático (Español) ›» que abre un panel. Resumen → fila con interruptor y, encendido, «Hora ·
08:30 ›». Dictado → «Dictado con IA» con interruptor y el texto plegado en «Qué se envía ›». Apariencia
se queda (las tarjetas enseñan el tema), pero puede bajar un puesto. Resultado: ~14 tocables, dos tipos
de control.

**149 · La guía del calendario promete que los eventos «salen solos» aunque no esté conectado** · ALTO · S · (LA-17)
Sin haber tocado «Ver mi calendario en la Agenda», añades Google en iOS (cinco pasos), vuelves y no sale
nada.
→ Último paso según estado: «Vuelve a Tasks y toca **Ver mi calendario en la Agenda**»; en `prompt`,
que el pie ofrezca **Conectar el calendario**.

**150 · «Añadir mis tareas · …» cuando el calendario elegido ya no existe** · MEDIO · S · (LA-19)
Y `CalendarExportSync` sigue mandando tareas a un id muerto.
→ «No encontrado» en ladrillo y nota en el panel; no enviar a un id que no existe.

**151 · «Sugerir una mejora» está al final de una página larga** · MEDIO · S · (LA-21)
Es la función que quieres que tus amigos descubran y está donde iOS pone «Acerca de».
→ Grupo «Ayuda» encima de Datos con «Sugerir una mejora» y «Soporte».

**152 · El aviso de versión nueva puede saltar mientras se escribe; apartarlo con el asa cuenta como «Ahora no» definitivo** · BAJO · S · (LA-22)
→ `paused` también con la barra o un panel abiertos; solo el botón «Ahora no» lo aparta para esa versión.

**153 · El coñac del calendario «Tasks» es el del tema claro también de noche** · BAJO · S · (LA-28, TR-24)
→ Color de `--accent` por tema (o el real del calendario si ya existe).

**154 · Textos en inglés que no suenan a inglés; «Reminders» es a la vez el grupo de Ajustes y los avisos de la tarea** · BAJO · S · (LA-30, LA-31)
«Don’t send my voice | Allowed», «One just for your tasks, apart from yours», «See the welcome».
→ Grupo «Notifications» en inglés; «A separate calendar, just for your tasks.»; «See the intro again».

**155 · «Exportar copia · .json» y, en la PWA, sin confirmación** · BAJO · S · (LA-32)
→ Fuera «.json»; en la PWA, toast «Copia guardada: tasks-2026-10-12.json».

**156 · La línea de cifras de Datos no cuenta los lugares** · BAJO · S · (LA-33)
→ «3 lugares»; «12 tareas (3 pendientes)».

**157 · La versión solo se ve en el iPhone** · BAJO · S · (LA-34)
→ En la PWA, la fecha del build.

**158 · Iconos que dicen otra cosa** · BAJO · S · (LA-35)
Campana tachada en «Ajustes de notificaciones» (abre iOS, no desactiva); una marca de verificación en
«Añadir mis tareas» (en el resto del panel significa «elegido»).
→ Flecha de salir; icono de calendario.

**159 · «Desactivar avisos» en la PWA apaga el dictado sin decirlo** · BAJO · S · (LA-37)
→ Nota «Sin avisos, el dictado usa el del navegador.»

**160 · «Añadir mis tareas» sigue activo con «En la Agenda» apagado** · BAJO · S · (LA-42)
→ Nota «Tus tareas siguen añadiéndose a «Trabajo».»

**161 · La nota de avisos bloqueados en la PWA da la ruta de iOS en cualquier navegador** · BAJO · S · (LA-43)
→ Solo en iPhone; si no, «Permítelos en los ajustes del sitio de tu navegador.»

**162 · Mientras se activan los avisos no se ve que algo pasa** · BAJO · S · (LA-44)
→ «Activando…».

**163 · «No añadirlas» borra también los eventos editados a mano, sin aviso** · BAJO · S · (FL-27)
→ Nota bajo la opción.

**164 · La nota del calendario dice «este iPhone» también en la web** · BAJO · S · (visto)
→ «este dispositivo» cuando no es nativo (o no enseñar el grupo, como en la PWA publicada).

### 5.10 Avisos, notificaciones, widget y Siri

**165 · «¿Has acabado?» dentro de la app: 4,2 s, solo «Sí» y sin «Todavía no»** · ALTO · M · (UI-04, UI-39)
Tocas el cuerpo del aviso de cierre: la app se abre con un toast que se va en 4 s sin abrir la tarea; si
se pasa, nada recuerda la pregunta y, como no hay «Todavía no», no se vuelve a preguntar nunca.
→ Abrir la tarea como cualquier aviso y que la barra de posponer enseñe «¿Has acabado?» con **Sí,
hecha** y **Todavía no** cuando la tarea tiene duración y ya acabó. Mantener el toast (con el 8, 6 s).

**166 · Tocar un aviso (o un enlace del widget) de una tarea que ya no existe no hace nada** · ALTO · S · (FL-03, UI-15, FL-21)
Tacha o borra desde la app, el aviso sigue en el centro de notificaciones, lo toca horas después: la app
se abre y nada. «+10 min» en una hecha crea un aviso que nunca sonará.
→ Toast «Esa tarea ya no está.» / «Ya estaba hecha: X»; «No queda nada atrasado.» para el resumen.

**167 · Un aviso tocado con la bienvenida de novedades pendiente pierde su toast** · MEDIO · S · (UI-05)
→ `useNotificationOpen` con `paused` mientras haya bienvenida (patrón `retainUntilConsumed`).

**168 · «Hecha» abre la app en una tarea y no en una rutina** · MEDIO · M (Swift) · (UI-16)
Mismo botón, dos comportamientos: la rutina se tacha sin abrir; la tarea abre la app y pide desbloquear.
→ Quitar `foreground` al `done` de tarea y tratarlo como «Sí, hecha» (`answerAsk` ya existe). Probar en
el iPhone.

**169 · El resumen diario tocado sin botón, y «Pasar atrasadas a hoy» desde otra pestaña, no llevan a hoy** · MEDIO · S · (FL-17)
→ `onOpenToday` (Agenda, hoy) para el resumen y tras pasar a hoy.

**170 · Los enlaces del widget y el acceso rápido no cierran los paneles abiertos** · MEDIO · S · (FL-10)
`compose` activa la barra **detrás** del panel de una tarea: lo escrito va a ciegas.
→ `closeSheets()` al principio de cada manejador; `setFocusRequest` tras un `requestAnimationFrame`.

**171 · Siri y Atajos con la app abierta: lo apuntado entra sin aviso** · MEDIO · M · (FL-11)
→ Toast «Llamar a Ana → Mañana 17:00 · Ver» al aplicar entradas con la app delante.

**172 · Los errores en toast se anuncian como estado, no como alerta** · BAJO · S · (UI-10)
→ `tone: 'error'` → `role="alert"`.

**173 · Cuerpo «Sin fecha» en el aviso de una tarea de la Bandeja** · BAJO · S · (UI-35)
→ Solo la sección, o «De la bandeja».

**174 · En inglés, AM/PM del Horario a 9 px** · MEDIO · S · (TR-16)
→ 11 px y columna más ancha solo en inglés.

### 5.11 Bienvenida

**175 · Lámina I (Escribir): la barra parece tocable y no lo es** · BAJO · S · (UI-25)
Es la primera lámina y enseña que aquí no se toca, justo lo contrario de las siguientes.
→ Quitar Detalles y el botón redondo de la lámina I, o que tocar pase a la II.

**176 · Con movimiento reducido, la mano de muestra de *Sugerencias* no existe y la portada aparece a trompicones** · BAJO · S · (UI-26, UI-27)
→ Trazo quieto al 60 % (como ya hace `feedback.css`); retardos a 0 en la portada.

**177 · «Ver la bienvenida» desde Ajustes hace esperar 1,6 s a que aparezca «Empezar»** · BAJO · S · (UI-28)
→ Coreografía corta (`is-quick`) cuando no viene del arranque.

**178 · La barra de progreso es una lista vacía para el lector de pantalla** · BAJO · S · (UI-29)
→ `role="progressbar"` con `aria-valuetext`.

**179 · Si el trozo de la bienvenida se cuelga, la app no arranca** · BAJO · S · (UI-30)
→ `Promise.race` con 8 s → `WelcomeUnavailable`.

**180 · Lámina Calendario: «Conectar mi calendario» no cambia mientras iOS pregunta; «Hoy jueves» fijo; el último botón repite «Empezar»** · BAJO · S · (UI-31, visto)
→ «Pidiendo permiso…»; día real; «Listo» como botón final.

**181 · Lámina Detalles: quitar «A la hora» no tiene vuelta** · BAJO · S · (UI-32)
→ Ofrecerlo como opción cuando no esté, igual que «30 min antes».

**182 · Lámina Rutinas: la tarjeta del widget es un botón oculto al lector** · BAJO · S · (UI-36)
→ `div` decorativo o `aria-label` propio.

### 5.12 Sugerencias

**183 · Cerrar el panel de la sugerencia tira la foto y lo rodeado** · ALTO · S · (UI-03)
Tocas fuera para soltar el teclado (el gesto que la app enseña con el velo) y hay que volver a Señalar y
rodear. El texto sí se conserva.
→ Cerrar vuelve a la fase de rodear con el trazo intacto; solo **Cancelar** o la × descartan.

**184 · La tarjeta tapa el final de la lista (y de Ajustes)** · MEDIO · S · (UI-17)
→ Relleno inferior de 112 px mientras `data-suggesting`.

**185 · No se puede comentar la barra de escribir ni su ficha** · BAJO · S · (UI-18)
→ No ocultar la barra; subir la tarjeta encima.

**186 · «Cancelar» / «Sin rodear» pisan la zona de las pestañas al rodear** · BAJO · S · (UI-19)
→ Arriba, junto a la pista «Rodea con el dedo…».

**187 · El panel enseña el texto de lo rodeado aunque no se vaya a enviar** · BAJO · S · (UI-20)
→ Sin captura, solo la ruta («Agenda · Horario»).

**188 · Cerrar el panel mientras «Enviando…»; «Enviar» deshabilitado sin decir por qué** · BAJO · S · (UI-21, UI-22)
→ Sin cierre mientras envía; «Preparando la captura…».

**189 · Salir del modo con la × tira el mensaje escrito** · BAJO · S · (UI-23)
→ Doble toque para descartar si hay texto, o borrador en `sessionStorage`.

**190 · «Mark» en inglés no promete ningún dibujo** · BAJO · S · (UI-24, TR-27)
→ «Circle it» / «Point it out».

**191 · Las superficies gestuales no tienen nombre para el lector** · BAJO · S · (UI-41)
→ `role="img" aria-label="Zona para rodear con el dedo…"`.

### 5.13 Accesibilidad y pulido restante

**192 · La barra de pestañas se presenta a VoiceOver como «Secciones»** · BAJO · S · (AG-25, TR-11)
→ «Pestañas» / «Tabs».

**193 · Las celdas de Constancia no dicen el mes** · BAJO · S · (TR-26)
→ `fullLabel(day)`.

**194 · El patrón «Sin X» no se cumple siempre: «Ninguna» (sección)** · BAJO · S · (TR-22)
→ «Sin sección» / «No section».

**195 · El halo de «mantener para estirar» no sirve con movimiento reducido; la salida del panel intercepta toques 220 ms; Escape cierra el panel con un selector nativo abierto** · BAJO · S · (TR-31, UI-37, UI-38)
→ Halo estático al 60 %; `.sheet:not(.is-open) { pointer-events: none }`; `PickerChip` para Escape.

**196 · La tira en un iPhone de 320 px deja 43 px por día** · BAJO · S · (TR-25)
→ `padding: 0 6px` bajo 330 px.

**197 · En una instalación recién hecha, la Agenda enseña el titular «Sin hora» sobre «Día libre.» y un «+ Sección»** · BAJO · S · (visto)
El primer día de alguien que acaba de cerrar la bienvenida es un bloque con nombre y nada dentro, y
una invitación a crear secciones antes que tareas.
→ En un día sin nada, solo «Día libre.» y la barra de escribir; el «+ Sección» ligado al 70.

**198 · El título que entiende el analizador no lleva la primera letra en mayúscula** · BAJO · S · (visto)
En inglés, «call mom tomorrow at 5pm» crea «call mom» (la ficha lo enseña en grande así). Comprobar
también en español con una frase en minúsculas.
→ Capitalizar la primera letra del título en `title.ts` y en el analizador en inglés.

## 6. Decisiones que te toca tomar

Cosas donde hay dos caminos razonables y la auditoría no decide por ti:

- **Modo «Aa» (31)**: arreglarlo (pista, 44 px, solo arrastre horizontal) o quitarlo y dejar la
  importancia solo en el panel de la tarea (menos controles, una cosa menos que explicar).
- **Cerrar un panel de rutina o lugar nuevos (117, 4)**: cerrar cancela y el pie crea (lo que hace iOS),
  o cerrar sigue creando pero con toast y deshacer.
- **Secciones vacías (21)**: solo cabecera con «+» cada día, o plegadas en una línea en los días que no
  son hoy.
- **Asa del mes (32)**: más visible, o fuera (quedan tirar de la tira y la flecha del mes).
- **Tachar una rutina que no toca (123)**: permitirlo como ahora (sin rebote) o pedir el gesto completo.
- **Confirmar al importar (1)**: solo deshacer, o deshacer más confirmación cuando hay datos.
- **«+ Sección» (70)**: arreglar el campo o esconderlo (ya existe «+ Nueva» en el panel y en la ficha).
- **Lámina *Gestos* (30)**: añadir «mantener pulsado» sube la versión de la bienvenida y la verá todo
  el mundo al actualizar (es una lámina, no un aviso).

## 7. Lo que está bien y no hay que tocar

- **Deshacer** en borrar tarea, borrar rutina (con su diario), borrar las N hechas, pasar a hoy (devuelve
  día, sección, puesto y plazo), mover de día desde la tira o el muelle, lo dictado y lo de Siri.
- **El aviso «adónde ha ido»** («Dentista → Mañana · Ver») cubre bien el cruce Bandeja ↔ Agenda,
  también con plazos.
- **La barra de escribir en reposo**: una píldora con el destino en el placeholder; abierta, las pestañas
  se apartan y los destinos ocupan su sitio; la píldora de lo entendido dice exactamente qué se va a
  crear, también en inglés con «5:30 PM» y «Thu, Sep 18».
- **La ficha** ya practica la revelación progresiva donde importa (Hora con día, Duración con hora,
  Sección con día, «+ Añadir» plegado) y plegar nunca pierde nada.
- **Paridad es/en al 100 %** en las 67 tablas, sin «...» ni apóstrofos rectos, comillas «» y “”,
  mayúsculas coherentes. Un solo literal fuera de tabla (20).
- **Modo oscuro** sin un color fijo fuera de `tokens.css` (las miniaturas de Apariencia, a propósito);
  contrastes de los tokens por encima de 4,5:1 en los dos temas (13,2:1 / 14:1 la tinta).
- **Todos los iconos solos con `aria-label`**, `role="slider"` con teclado en la regla, el deslizador y
  el mando, `aria-pressed`, `aria-expanded`, `aria-current`, botones ocultos «Mover» para arrastrar con
  teclado, `inert` y foco en la bienvenida.
- **Zonas seguras y teclado** contemplados en todo lo fijo (barra, dock, toast, muelle, tarjeta de
  sugerencias, paneles y su pie).
- **Calendario en Ajustes** es el grupo mejor resuelto (una acción principal por estado, lo secundario
  en paneles, el tutorial plegado) y **UpdatePrompt** un modelo de aviso que no abruma.
- **Lo que viene de fuera es idempotente** (Siri, widget, avisos) y los enlaces del widget acaban en la
  pestaña que prometen; medianoche y volver de segundo plano refrescan todo.
- **La PWA esconde lo que no puede hacer** (Sugerir, Calendario, Actualizar, avisos de lugar, Valorar) y
  explica Lugares con un enlace a la App Store.
- **Gestos**: deslizar con umbral más golpe rápido, resistencia en el lado sin acción, mantener pulsado
  que no compite con scroll ni deslizar, el panel que sigue al dedo, `PickerChip` que guarda al cerrar
  y no en cada giro.

## 8. Cómo seguir

Dime los números que apruebas (y los de §6 en los que elijas camino) y los incorporo en esta misma
conversación, por bloques, con sus tests y pasando `npm test && npm run typecheck && npm run build`
antes de cada commit. Lo que cambie Swift (168) lo compila el CI y habrá que probarlo en el iPhone.
Las capturas del recorrido están en el scratchpad de la sesión; los siete anexos, en
`docs/auditoria/anexos/`.
