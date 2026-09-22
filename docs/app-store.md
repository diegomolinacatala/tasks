# App de iPhone: TestFlight y App Store

Todo lo que hace falta para pasar de la rama `capacitor` a la app instalada y, cuando se quiera,
publicada. Los pasos marcados con **(tú)** necesitan tu cuenta de Apple o de GitHub.

| Paso | Estado (17/09/2026) |
|---|---|
| 1.1–1.4 Identificador, app, clave y secretos | Hecho. App **Tasks: tareas y lugares**, Apple ID `6812776586`, Team ID `APD54YM4F3` |
| 1.5 Compilación en TestFlight | Hecho. La 9 trae el widget, la 10 la acción de Atajos y la 12 apuntar sin abrir la app (§2.1) y la 13 el sonido de los avisos por hora |
| 1.6 Instalarla | Hecho |
| 1.7 App Group del widget | Hecho |
| 2 Probar en el iPhone | A grandes rasgos: «funciona medio decente». Widget, Siri, tres toques atrás y aviso al salir de un lugar, bien. Falta el resto de la lista |
| Unir `capacitor` con `main` | Hecho (17/09/2026). El Worker se despliega solo desde `main` |
| 6 Publicar en la App Store | Pendiente (faltan capturas) |

## 1. Primera compilación en TestFlight

### 1.1 Registrar el identificador de la app (tú)

[developer.apple.com/account](https://developer.apple.com/account) → *Certificates, Identifiers & Profiles* →
*Identifiers* → **+** → *App IDs* → *App*:

- Description: `Tasks`
- Bundle ID: **Explicit** → `io.github.diegomolinacatala.tasks`
- Capabilities: ninguna extra (los avisos son locales y Siri usa App Intents, que no piden permiso).

Anota también tu **Team ID**: *Membership details* → *Team ID* (10 caracteres).

### 1.2 Crear la app en App Store Connect (tú)

[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → *Apps* → **+** → *New App*:

- Platform: iOS
- Name: `Tasks: tareas y lugares` (el nombre tiene que ser único en toda la App Store; si está
  cogido, prueba otra variante; el icono en el iPhone seguirá diciendo *Tasks*)
- Primary language: Spanish (Spain)
- Bundle ID: el del paso anterior
- SKU: `tasks-ios`
- User access: Full access

### 1.3 Clave de la API para GitHub Actions (tú)

App Store Connect → *Users and Access* → *Integrations* → *App Store Connect API* → *Team Keys* →
**Generate API Key**:

- Name: `GitHub Actions`
- Access: **Admin** (hace falta para que la nube cree el certificado de distribución)

Descarga el `.p8` (**solo se puede descargar una vez**) y copia el **Key ID** y el **Issuer ID**.

### 1.4 Secretos en GitHub (tú)

Repo → *Settings* → *Secrets and variables* → *Actions*:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `ASC_KEY_ID` | Key ID |
| Secret | `ASC_ISSUER_ID` | Issuer ID |
| Secret | `ASC_KEY_P8` | contenido completo del `.p8`, con las líneas `BEGIN` y `END` |
| Variable | `APPLE_TEAM_ID` | Team ID |

Los secretos no aparecen en los registros ni llegan a los forks, aunque el repo sea público.
Después de pegarlo, borra el `.p8` del ordenador o guárdalo en un gestor de contraseñas.

### 1.5 Lanzar la compilación

*Actions* → **iOS** → *Run workflow* (el botón solo aparece porque el workflow ya está en `main`). También
firma y sube una compilación cada push a `main` o a `capacitor` que toque la app. Tarda unos 10 minutos;
después App Store Connect la procesa entre 5 y 30 minutos más.

A partir de ahí, cada push a `main` que toque la app sube una compilación nueva, y el día 1 de cada
dos meses se sube otra sola para que TestFlight no caduque (90 días).

Lo que pasó la primera vez, por si vuelve a aparecer:

- *"No profiles… Your team has no devices"*: firmar al archivar usa el modo desarrollo. El
  workflow archiva sin firmar y firma al exportar con el certificado de la nube.
- Correo **ITMS-90683** (*Missing purpose string*): alguna librería menciona una API de ubicación.
  Es un aviso: la compilación sirve, pero hay que corregirlo antes de publicar.

### 1.6 Instalarla (tú)

1. App Store Connect → la app → *TestFlight* → en la columna izquierda, **+** junto a
   *PRUEBAS INTERNAS* → nombre `Yo`, con distribución automática → **Crear**.
2. En el grupo: *Testers* → **+** → márcate → **Añadir**. En *Compilaciones*, si no está la
   última: **+** → elígela → **Añadir**.
3. En el iPhone, instala **TestFlight** desde la App Store. Si al abrirla pide **canjear un
   código**, abre en el iPhone el correo de invitación y pulsa *View in TestFlight*; en el
   ordenador, ese mismo botón enseña un código de 8 caracteres para escribirlo allí. Si no llega
   el correo, en el grupo pasa el ratón por tu fila de *Testers* → *Reenviar invitación*.
4. **Aceptar** → **Instalar**.
5. Antes de desinstalar la web de la pantalla de inicio: en la web, **···** → *Exportar copia* →
   compartir → *Guardar en Archivos*; en la app, **···** → *Importar copia* → ese fichero. No
   comparten almacenamiento.

> El dictado de la app necesita el Worker con el alta de dispositivos solo para dictar y el origen
> `capacitor://localhost`. Ya está desplegado, y el CI lo vuelve a desplegar en cada push a `main`
> que toque `worker/`.

### 1.7 App Group para el widget (tú)

La app y el widget comparten las tareas por un *App Group*. Apple tiene que conocerlo antes de que
GitHub Actions pueda firmar. En [developer.apple.com/account](https://developer.apple.com/account) →
*Certificates, Identifiers & Profiles* → *Identifiers*:

1. **Crear el grupo.** Botón **+** (junto al título *Identifiers*) → marca **App Groups** →
   **Continue** → *Description*: `Tasks`, *Identifier*: `group.io.github.diegomolinacatala.tasks` →
   **Continue** → **Register**.
2. **Dárselo a la app.** Arriba a la derecha, el desplegable que pone *App IDs* → vuelve a *App IDs*
   → pulsa **Tasks** (`io.github.diegomolinacatala.tasks`) → en la lista de *Capabilities* marca
   **App Groups** → en esa misma fila, **Configure** → marca `group.io.github.diegomolinacatala.tasks`
   → **Continue** → **Save** (arriba a la derecha) → si pregunta *Modify App Capabilities*,
   **Confirm**.
3. **Identificador del widget.** **+** → **App IDs** → **Continue** → **App** → **Continue**:
   - Description: `Tasks Widget`
   - Bundle ID: **Explicit** → `io.github.diegomolinacatala.tasks.widget`
   - Capabilities: marca **App Groups**

   **Continue** → **Register**. Después pulsa **Tasks Widget** en la lista → fila **App Groups** →
   **Configure** → marca el grupo → **Continue** → **Save** → **Confirm**.

Para comprobarlo: en *Identifiers*, con el desplegable en *App Groups* aparece el grupo; al abrir
**Tasks** y **Tasks Widget**, *App Groups* está marcado y dice *1 App Group*.

Si una compilación falla en *Firmar y subir a TestFlight* con *"No profiles for
'io.github.diegomolinacatala.tasks.widget' were found"* y *"Authentication failed"* (o con *"doesn't
include the com.apple.security.application-groups entitlement"*), falta alguno de estos pasos: la
clave de la API no puede crear el grupo ni asignarlo, solo los perfiles.

## 2. Qué probar en el iPhone

- [ ] Avisos: permiso, aviso por hora **con sonido** (desde la 13), botones *Hecha* y *+10 min*,
      resumen diario, número del icono.
- [ ] Lugares: crear uno desde Ajustes buscando «Mercadona»; «usar mi ubicación actual»; radio.
- [ ] Escribir *«comprar pan al pasar por mercadona»*: píldora *Al llegar a Mercadona*.
- [ ] Dictar *«recuérdame al llegar a la universidad que tengo que reunirme con José»* con la
      universidad sin guardar: se crea la tarea y se abre el editor del lugar.
- [x] Ir físicamente a un lugar guardado (o salir de él) y que salte el aviso con la app cerrada.
      Probado al salir; falta al llegar.
- [ ] Aviso de un lugar con varias tareas: al tocarlo se abren todas juntas.
- [x] Siri: *«Oye Siri, añade una tarea en Tasks»*.
- [ ] Apuntar sin abrir la app (§2.1): *«Oye Siri, apunta en Tasks»* → *«cena hoy a las 9 y
      recuérdamelo media hora antes»*. Siri responde *«Apuntada: Cena, hoy 21:00, 30 min antes»*, la
      app **no** se abre y el aviso suena a las 20:30 aunque no se abra en ningún momento.
- [ ] Lo mismo con el iPhone bloqueado.
- [ ] Atajo *Dictar tarea* (§2.1) desde tocar atrás, el botón de acción (si lo hay), la pantalla de
      bloqueo y el widget de Atajos: escucha al momento y apunta sin abrir la app.
- [ ] Tras apuntar así, el widget *Hoy* y el número del icono ya cuentan la tarea; al abrir la app
      está en su sitio una sola vez.
- [ ] Apuntar con la app abierta (tocar atrás mientras se usa): la tarea aparece en la lista.
- [ ] Tocar el aviso de una tarea apuntada con Siri con la app cerrada: se abre esa tarea.
- [ ] Mantener pulsado el icono: *Nueva tarea* enfoca la barra; *Semana* abre la semana.
- [x] Tres toques atrás: crear en **Atajos** un atajo con la acción *Nueva tarea* de Tasks, asignarlo
      en **Ajustes → Accesibilidad → Tocar → Tocar atrás → Triple toque** y que, con la app cerrada o
      desde otra app, se abra Tasks con el teclado fuera.
- [x] Widget: abrir la app una vez, añadir el widget *Hoy* (mantener pulsada la pantalla de inicio →
      **Editar** → **Añadir widget** → Tasks) y que salgan las tareas de hoy y las atrasadas en rojo.
- [ ] Tocar el círculo en el widget: se marca sin abrir la app; al abrirla, la tarea está hecha y su
      aviso ya no suena. Si se desmarca en el widget, al abrir la app su aviso vuelve a programarse.
- [ ] Tocar una tarea del widget abre esa tarea; el **+** abre la barra de escribir.
- [ ] Widget al día siguiente sin abrir la app: lo de ayer pasa a atrasado.
- [ ] **Pasar a hoy** (desde la 14): con algo atrasado, *Pasar a hoy* en la cabecera de
      *Atrasadas* lo sube arriba de *Hoy* (cada una a su sección) con *Deshacer*; en *Semana*, cada día
      pasado con pendientes tiene el suyo.
- [ ] Widget con algo atrasado: sale **A hoy**. Tocarlo con la app cerrada: el widget las pasa a hoy
      sin abrir nada, y el aviso de una atrasada con hora (p. ej. ayer a las 17:00 con aviso 15 min
      antes) suena hoy a las 16:45 aunque no se abra la app. Al abrirla, están en *Hoy* una sola vez.
- [ ] Siri: *«Oye Siri, pasa lo atrasado a hoy en Tasks»* → *«2 tareas pasadas a hoy»*, sin abrir la
      app. Opcional, cada mañana sola (§2.2).
- [ ] Resumen diario con algo atrasado: mantener pulsado el aviso → *Pasar atrasadas a hoy*. Un aviso
      pospuesto a mañana (de una tarea de hoy) trae *Hecha*, *Pasar a hoy* y *+10 min*.
- [ ] **Importancia**: tocar **Aa** arriba; cada tarea cambia el asa por un número. Arrastrarlo hacia
      arriba agranda el título (vibra en cada punto) y hacia abajo lo encoge; tocarlo sube uno. En el
      panel de la tarea, la escala del 1 al 10. Al completarla vuelve al tamaño normal.
- [ ] Widget: las importantes salen más grandes; en la pantalla de bloqueo, las dos más importantes.
- [ ] **Aviso de cierre** (desde la 15): abrir la app una vez (registra los botones). Escribir
      *«prueba hoy a las HH:MM durante 5 minutos»* con una hora dentro de dos o tres minutos: la
      píldora dice *Hoy HH:MM–HH:MM* y la fila, el tramo. En el panel, *Duración* con *5 min* no
      existe como atajo: sale **Hasta HH:MM** marcado y debajo *A las … te pregunto si has acabado*.
- [ ] Al acabar llega *«prueba / ¿Has acabado? · HH:MM–HH:MM»*. Mantenerlo pulsado: **Sí, hecha** y
      **Todavía no**. *Sí, hecha* **no abre la app**: el aviso se va, el número del icono baja y el
      widget la enseña tachada. Al abrir la app, la tarea está tachada.
- [ ] Repetirlo y pulsar **Todavía no** (tampoco abre la app): a los 15 min vuelve la pregunta, y en
      la app el tramo acaba 15 min después de cuando se respondió.
- [ ] Lo mismo con el **iPhone bloqueado**: desde la pantalla de bloqueo, mantener pulsado el aviso y
      pulsar **Sí, hecha**; no pide Face ID.
- [ ] Repetirlo y **tocar** el aviso sin mantenerlo: se abre la app con *¿Has acabado prueba?* y
      **Sí** abajo; tocarlo la tacha.
- [ ] Con la app cerrada a la fuerza: *Sí, hecha* desde el aviso la tacha igual (icono y widget al
      momento) y al abrir sigue tachada.
- [ ] Siri: *«Oye Siri, apunta en Tasks»* → *«reunión con Jorge mañana de 5 a 6»*: responde
      *«Apuntada: Reunión con Jorge, mañana 17:00–18:00»*.
- [ ] Exportar copia: se abre la hoja de compartir.
- [ ] Cerrar la app a la fuerza y volver: las tareas siguen ahí.

### 2.1 Apuntar sin abrir la app (tú, una vez)

iOS no deja a ninguna app encender el micrófono sin abrirse; quien escucha es el sistema (Siri o
*Dictar texto*) y Tasks recibe el texto en segundo plano. Con **Siri** no hay que preparar nada:
*«Oye Siri, apunta en Tasks»*. Para un solo gesto, un atajo:

1. App **Atajos** → pestaña *Atajos* → **+** arriba a la derecha.
2. Buscar la acción **Dictar texto** y tocarla. Tocar la flecha **›** de la acción y dejar *Idioma*
   en **Español (España)** y *Dejar de escuchar* en **Tras una pausa**.
3. Buscar **Añadir tarea** (de Tasks) y tocarla: queda *Apuntar [Texto dictado] en Tasks*. Si en vez
   de *Texto dictado* pone *Tarea*, tocar *Tarea* → **Texto dictado**.
4. Arriba, tocar el nombre → **Cambiar nombre** → `Dictar tarea`. En el mismo menú, **Elegir icono**
   → el micrófono. **OK**.

Dónde ponerlo:

- **Tocar atrás**: *Ajustes → Accesibilidad → Tocar → Tocar atrás → Doble toque* → *Dictar tarea*.
- **Botón de acción** (iPhone 15 Pro y posteriores): *Ajustes → Botón de acción* → deslizar hasta
  *Atajo* → **Elegir un atajo** → *Dictar tarea*.
- **Pantalla de bloqueo**: mantener pulsada la pantalla bloqueada → **Personalizar** → *Pantalla de
  bloqueo* → tocar el **−** de la linterna o de la cámara → **+** → buscar **Atajo** → elegirlo →
  *Dictar tarea*. Queda como botón abajo; se mantiene pulsado para lanzarlo.
- **Centro de control**: deslizar desde la esquina superior derecha → **+** arriba a la izquierda →
  **Añadir un control** → **Atajo** → *Dictar tarea*.
- **Widget**: mantener pulsada la pantalla de inicio → **Editar** → **Añadir widget** → **Atajos** →
  el pequeño → **Añadir**. Mantenerlo pulsado → **Editar widget** → *Atajo* → *Dictar tarea*.

### 2.2 Pasar lo atrasado a hoy cada mañana (opcional)

Lo que otras apps llaman *arrastrar lo pendiente*: que lo que quedó sin hacer amanezca en hoy.

1. App **Atajos** → pestaña **Automatización** → **+** → **Hora del día**.
2. Elegir la hora (p. ej. **7:00**) y **Diariamente**; marcar que se ejecute sin preguntar
   (**Ejecutar de inmediato**). **Siguiente**.
3. Buscar **Pasar atrasadas a hoy** (de Tasks) y tocarla. **OK**.

No abre la app: el widget, el número del icono y los avisos quedan al día solos.

## 3. Ficha de la App Store

| Campo | Valor |
|---|---|
| Nombre | Tasks: tareas y lugares |
| Subtítulo | Avisos por hora y al llegar |
| Categoría | Productividad |
| Edad | 4+ |
| URL de soporte | https://github.com/diegomolinacatala/tasks/issues |
| URL de privacidad | https://diegomolinacatala.github.io/tasks/privacidad.html |
| Precio | Gratis, sin compras dentro de la app |
| Estado DSA (UE) | No comerciante |

**Palabras clave** (100 caracteres, sin marcas ajenas: Apple rechaza nombres de otras empresas):

```
recordatorios,pendientes,lista,to-do,ubicación,lugar,dictado,voz,siri,agenda,semana,avisos
```

**Descripción**

```
Tus tareas del día, sin cuentas y sin nada que configurar.

Escribe como hablas: «llamar a Ana mañana a las 5» pone el día, la hora y el aviso. «Comprar pan al pasar por Mercadona» te avisa cuando llegas.

AVISOS AL LLEGAR O SALIR
Guarda tus sitios buscándolos en Mapas o con tu ubicación actual. El iPhone te avisa al llegar o al salir, aunque la app esté cerrada, y lo repite cada vez hasta que marques la tarea.

DICTADO
Toca el micrófono y dilo de corrido: «recuérdame al llegar a la universidad que tengo que reunirme con José».

RECORDATORIOS
Tantos como quieras por tarea: a la hora, antes, a una hora concreta. Márcala hecha o posponla desde la propia notificación.

AL ACABAR, UNA PREGUNTA
Dile cuánto dura —«gimnasio a las 7 durante una hora», «reunión de 5 a 6»— y al terminar te pregunta si has acabado. Un toque en «Sí» y queda tachada, sin abrir la app.

TU DÍA DE UN VISTAZO
Lo importante se ve más grande. Lo que se quedó sin hacer ayer pasa a hoy de un toque, desde la app, el widget o Siri.

SIRI Y ATAJOS
«Oye Siri, apunta en Tasks» y dilo de corrido, sin abrir la app y con el iPhone bloqueado. Con un atajo, también desde tocar atrás, el botón de acción o la pantalla de bloqueo.

PRIVADA
Tus tareas, lugares y ubicación se quedan en tu iPhone. Sin registro, sin publicidad, sin analítica.
```

**Capturas**: Apple exige al menos las de iPhone de 6,9" (1320 × 2868 px). Ya están hechas en
[`docs/capturas/`](capturas/), a ese tamaño exacto y en el orden en que se suben (las tres primeras
son las que salen en la búsqueda): el día, la duración con su pregunta, el aviso al llegar a un
sitio, «¿Has acabado?», escribir como se habla, la semana y el modo importancia. Son la app real
con tareas de ejemplo; se regeneran con `scripts/app-store-shots.mjs` (instrucciones dentro) cuando
cambie la interfaz. La letra es Inter, lo más parecido a San Francisco que se puede usar fuera de
Apple; si se prefieren con la del iPhone, hacerlas en él (botón lateral + subir volumen).

## 4. Privacidad en App Store Connect

*App Privacy* → **Data collection**: *Yes, we collect data* → solo **Identifiers → Device ID**:

- Uso: *App Functionality*
- Vinculado a la identidad: **No**
- Rastreo: **No**

Motivo: el Worker guarda un identificador aleatorio por dispositivo para limitar el dictado. El audio
se procesa al momento y no se conserva, así que según la definición de Apple no se recopila. La
ubicación, las tareas y los lugares nunca salen del iPhone. Debe coincidir con
`ios/App/App/PrivacyInfo.xcprivacy`.

**Cifrado**: `ITSAppUsesNonExemptEncryption = false` en `Info.plist` (solo HTTPS y cifrado estándar del
sistema), así que TestFlight no pregunta por la exportación.

## 5. Notas para la revisión de Apple

En inglés: quien revisa no tiene por qué saber español. Van en **Información para la revisión →
Notas** (máximo 4000 caracteres; estas son unas 3500). Son lo mismo que pidió Apple en el rechazo del
22/09/2026 (§7), sin el vídeo.

```
No account or login is needed. Tasks and places are stored only on the device. The interface is in Spanish; labels used below: "Hoy" = Today, "Atrasadas" = Overdue, "Sin fecha" = No date, "Semana" = Week, "Ajustes" (··· button, top right) = Settings, "Lugares" = Places, "Recordatorios" = Reminders, "Permitir" = Allow.

PURPOSE AND AUDIENCE
A simple daily to-do list for Spanish-speaking iPhone users who want to jot tasks down quickly and be reminded at the right time or place, without signing up or setting anything up. You write or say a task the way you would say it and the app sets the day, time and reminder.

HOW TO TEST
- Add: in the "Añadir tarea" bar at the bottom type "llamar a Ana mañana a las 5" (call Ana tomorrow at 5) and press Return. A chip shows the detected day and time and a reminder is scheduled; notification permission is requested the first time a reminder exists.
- Swipe a task right to complete it, left to delete it (Undo appears). Drag the handle on the right to reorder; in "Semana" (bottom bar) drag a task to another day.
- Tap a task to edit date, time, duration, reminders and importance. "Aa" (top right) is importance mode: drag the number on a task up or down; more important tasks get a larger title.
- Duration: "gimnasio hoy a las 18:00 durante una hora" (gym today at 6 pm for one hour). When it ends, a notification asks "¿Has acabado?" (Are you done?) with "Sí, hecha" / "Todavía no" (long-press the notification).
- Location reminders: Ajustes → Lugares → Añadir lugar → search a place (Apple Maps) or "Usar mi ubicación actual". Location is requested "while using" only. Then open a task → Recordatorios → Añadir → the place. iOS delivers the notification on arrival or departure (UNLocationNotificationTrigger), even with the app closed.
- Dictation: with the bar empty, tap the microphone. The first time, a sheet explains that the audio is sent to our server and processed by Cloudflare Workers AI, and asks for permission ("Permitir"); then iOS asks for the microphone. Example: "cena hoy a las nueve y recuérdamelo media hora antes" (dinner today at 9, remind me half an hour before).
- Siri (Spanish): "Apunta en Tasks", then the task. It is added in the background without opening the app. The same actions are in the Shortcuts app ("Añadir tarea", "Pasar atrasadas a hoy"). Also: "Hoy" widget and Home Screen quick actions (long-press the icon).
- Ajustes → Datos: export or import a JSON backup.

EXTERNAL SERVICES
- Our own backend on Cloudflare Workers, used only for dictation. It receives the audio (from Siri, only the text) plus the device's local date and time; the audio is transcribed with Whisper and the text interpreted with NVIDIA Nemotron, both on Cloudflare Workers AI. Nothing is stored or logged, and Cloudflare does not use it to train models. It is sent only after the user allows it in the app; it can be withdrawn in Ajustes → Dictado. Without that permission nothing is sent and Siri input is parsed on the device.
- The backend keeps only a random device ID and a hash of its token, for rate limiting.
- Apple Maps (MapKit search), iOS local notifications and region monitoring.
- No analytics, advertising, tracking, third-party SDKs, payments or authentication services.

REGIONAL DIFFERENCES
None: the app works the same in every region. Its interface and language parsing are in Spanish.

REGULATED INDUSTRY OR THIRD-PARTY MATERIAL
Not applicable.
```

Si la revisión alega la norma 4.2 (funcionalidad mínima de una web empaquetada), responde señalando
lo que solo hace la app: avisos por lugar gestionados por iOS, notificaciones locales con acciones,
Siri y App Shortcuts, accesos rápidos del icono, búsqueda en Apple Maps y vibración háptica.

## 6. Publicar en la App Store

### Antes de empezar

- Probada en el iPhone (§2).
- Rama `capacitor` unida con `main`: despliega el Worker (dictado) y publica la URL de privacidad.
  Después sale una compilación nueva: es la que se envía. Hecho el 21/09/2026: la más reciente
  desde `main` es la 18.
- Capturas: las siete de `docs/capturas/` (§3), en ese orden.

### En App Store Connect → la app → pestaña **Distribución**

1. **Información de la app** (columna izquierda): subtítulo, categoría *Productividad*,
   **Clasificación por edades → Configurar** (todo *Ninguno/No* → 4+), *Derechos de contenido*:
   no usa contenido de terceros → **Guardar** arriba a la derecha (la primera vez la categoría no se
   guardó y *Añadir a revisión* lo reclamó). El estado de comerciante (UE) no está aquí: es de la
   cuenta, en **Negocio → Acuerdos → Cumplimiento → Digital Services Act**.
2. **Privacidad de la app**: URL de la política → **Guardar**; *Recopilación de datos* →
   **Empezar** → *Sí* → solo **Identificadores → ID de dispositivo** → uso *Funcionalidad de la
   app*, vinculado *No*, rastreo *No* → **Guardar** → **Publicar** (arriba a la derecha).
3. **Precios y disponibilidad**: precio 0 (gratis), países → **Guardar**.
4. **1.0 Preparar para el envío** (bajo *iOS App*):
   - Capturas de pantalla, descripción, palabras clave y URL de soporte (§3). La página enseña el
     hueco de 6,5", que no acepta las de 6,9": se suben con **Ver todos los tamaños en "Gestor de
     recursos multimedia"** → *6,9"*, y el de 6,5" queda *Usando Pantalla de 6,9"*.
   - **Compilación → Añadir compilación** → la más reciente.
   - Copyright: `2026 Diego Molina Catalá`.
   - **Información para la revisión**: desmarcar *Se requiere iniciar sesión*; nombre, teléfono y
     correo de contacto; notas del §5.
   - **Publicación de la versión**: *manualmente*.
   - **Guardar** → **Añadir para revisión** → **Enviar a App Review**.
5. Revisión en 24–48 h: *Esperando revisión* → *En revisión* → *Pendiente de publicación del
   desarrollador* → **Publicar esta versión**. Si la rechazan, el motivo llega al *Centro de
   resoluciones*: se corrige, se sube otra compilación y se reenvía.

Versiones posteriores: subir `MARKETING_VERSION` en `ios/App/App.xcodeproj/project.pbxproj` (1.1…),
esperar la compilación y repetir el punto 4 con la versión nueva.

## 7. Rechazo del 22/09/2026: 2.1 *Information Needed*

Apple rechazó la 1.0 (compilación 18) con *Guideline 2.1 – Information Needed*: es lo que pide a toda
cuenta nueva sin historial. No señaló ningún fallo; quiere un **vídeo grabado en un iPhone** con la
última versión de iOS y las respuestas a seis preguntas, en una respuesta en App Store Connect y
también en las **Notas** de la revisión (§5).

Como el punto 4 pide nombrar los servicios de IA, antes de responder se añadió el permiso explícito
que exige la norma 5.1.2(i) para compartir datos con una IA de terceros: la primera vez que se toca el
micrófono, un panel explica adónde va el audio y pide **Permitir**; sin permiso no sale nada del
iPhone (Siri usa el analizador local). Se retira en Ajustes → *Dictado*. La política de privacidad
lo cuenta. Va en la compilación siguiente a la 18, que es la que se envía y la que sale en el vídeo.

### 7.1 Grabar el vídeo (tú, en el iPhone)

**Antes**

1. *Ajustes → General → Actualización de software*: si hay una versión de iOS nueva, instalarla
   (Apple pide la última).
2. *TestFlight* → Tasks → **Actualizar** a la compilación nueva.
3. Recomendado, para que el vídeo enseñe los permisos y no tus tareas: en Tasks, **···** →
   *Exportar copia* → *Guardar en Archivos*. Borrar la app (mantener pulsado el icono → *Eliminar
   app*) e instalarla otra vez desde TestFlight. Después de grabar: **···** → *Importar copia*.
4. Si el Centro de control no tiene el botón de grabar: deslizar desde la esquina superior derecha →
   **+** arriba a la izquierda → **Añadir un control** → buscar **Grabación de pantalla**.
5. Mirar la hora y pensar una **dos o tres minutos por delante** (en el guion, `HH:MM`).

**Guion** (unos 3 minutos; el micrófono de la grabación puede ir apagado)

1. En la pantalla de inicio: Centro de control → **Grabar pantalla** → cuenta atrás → cerrar el
   Centro de control.
2. Tocar el icono de **Tasks** (el vídeo tiene que empezar abriendo la app).
3. En *Añadir tarea*: `Llamar a Ana hoy a las HH:MM` → sale la píldora con la hora → **Intro**.
   Aparece el permiso de notificaciones → **Permitir**.
4. Escribir `Comprar pan` → tocar la píldora **Hoy**.
5. Deslizar *Comprar pan* a la derecha (hecha). Escribir `Prueba`, **Intro**, deslizarla a la
   izquierda (borrada) → **Deshacer**.
6. Tocar *Llamar a Ana*: enseñar el panel (hora, duración, recordatorios, importancia) y cerrarlo
   deslizando hacia abajo.
7. **Aa** arriba → arrastrar hacia arriba el número de una tarea (se agranda) → **Aa** otra vez.
8. **Semana** abajo → enseñar la semana → **Tareas**.
9. **···** → *Lugares* → *Añadir lugar* → en *Buscar en Mapas*, un sitio cercano (p. ej.
   `Mercadona`) → permiso de ubicación → **Permitir al usar la app** → tocar un resultado → cerrar el
   panel deslizándolo hacia abajo (se guarda solo) → cerrar Ajustes.
10. Escribir `Comprar leche al pasar por Mercadona` (el nombre del lugar guardado) → píldora *Al
    llegar a…* → **Intro**.
11. Con la barra vacía, **micrófono** → panel *Dictado* → **Permitir** → permiso del micrófono →
    **Permitir** → decir *«cena hoy a las nueve y recuérdamelo media hora antes»* → sale la tarea.
12. Ir a la pantalla de inicio y esperar al aviso de *Llamar a Ana* a las `HH:MM` → mantenerlo
    pulsado → **Hecha** → se abre Tasks con la tarea tachada.
13. Opcional: *«Oye Siri, apunta en Tasks»* → *«comprar fruta mañana»* → Siri responde *Apuntada*.
14. Parar: tocar el indicador rojo arriba a la izquierda → **Detener**. El vídeo queda en *Fotos*.

**Pasarlo al portátil**: cable USB → en el iPhone, **Confiar** → Explorador de archivos → *Apple
iPhone* → *Internal Storage* → *DCIM* → la carpeta más reciente → el `.MOV` más nuevo. Si no se deja,
subirlo a Google Drive desde la app de Drive y bajarlo en el portátil.

### 7.2 Responder y reenviar (tú, en App Store Connect)

1. **Distribución** → *1.0 Rechazado* → en *Información para la revisión*, **Notas**: borrar lo que
   haya y pegar el bloque del §5. Si hay **Archivo adjunto**, subir ahí también el vídeo.
2. En **Compilación**: quitar la 18 (icono **−** o papelera junto a ella) → **Añadir compilación** →
   la nueva → **Listo**. Si pregunta por el cifrado: *Ninguno de los algoritmos mencionados*.
3. **Guardar** (arriba a la derecha).
4. Columna izquierda → **Revisión de apps** → el envío *21 sep, 23:29* → abajo, **Responder al
   equipo de revisión de apps** → pegar la respuesta del §7.3 cambiando `[MODELO]`, `[VERSIÓN]` y
   `[N]` por los tuyos → adjuntar el `.MOV` (si no deja por tamaño: subirlo a Google Drive,
   *Compartir → Cualquier persona con el enlace*, y poner el enlace en lugar de *Attached*) →
   **Enviar**.
5. Arriba a la derecha, **Volver a enviar a revisión de apps**.

### 7.3 Respuesta para Apple

```
Hello, and thank you for reviewing Tasks.

Below is the information you requested. It has also been added to the Notes field of App Review Information.

1. SCREEN RECORDING
Attached. It was recorded on an [MODELO] running iOS [VERSIÓN] with build 1.0 ([N]), the build now selected for review. It starts by launching the app from the Home Screen and shows the typical flow: adding tasks by typing in natural language (with the notification permission prompt), completing and deleting with swipes, the task details, importance mode, the week view, saving a place and adding a location reminder (with the location permission prompt), dictation (with our consent sheet and the microphone permission prompt), and a reminder notification with its actions.
The app has no account registration, login or account deletion (there are no accounts), no user-generated content shared with other people, and no paid content or in-app purchases.

2. PURPOSE AND TARGET AUDIENCE
Tasks is a simple daily to-do list for Spanish-speaking iPhone users who want to jot tasks down quickly and be reminded at the right time or place, without signing up or setting anything up. It removes the friction of typical to-do apps: you write or say a task the way you would say it, for example "llamar a Ana mañana a las 5" (call Ana tomorrow at 5), and the app sets the day, the time and the reminder. Tasks and places are stored only on the device.

3. HOW TO ACCESS THE MAIN FEATURES
No login, credentials or sample files are needed. The interface is in Spanish; labels used below: "Hoy" = Today, "Atrasadas" = Overdue, "Sin fecha" = No date, "Semana" = Week, "Ajustes" (··· button, top right) = Settings, "Lugares" = Places, "Recordatorios" = Reminders, "Permitir" = Allow.
- Add: in the "Añadir tarea" bar at the bottom type "llamar a Ana mañana a las 5" and press Return. A chip shows the detected day and time and a reminder is scheduled; notification permission is requested the first time a reminder exists.
- Swipe a task right to complete it, left to delete it (Undo appears). Drag the handle on the right to reorder; in "Semana" (bottom bar) drag a task to another day.
- Tap a task to edit date, time, duration, reminders and importance. "Aa" (top right) is importance mode: drag the number on a task up or down; more important tasks get a larger title.
- Duration: "gimnasio hoy a las 18:00 durante una hora" (gym today at 6 pm for one hour). When it ends, a notification asks "¿Has acabado?" (Are you done?) with "Sí, hecha" / "Todavía no" (long-press the notification).
- Location reminders: Ajustes → Lugares → Añadir lugar → search a place (Apple Maps) or "Usar mi ubicación actual". Location is requested "while using" only. Then open a task → Recordatorios → Añadir → the place. iOS delivers the notification on arrival or departure (UNLocationNotificationTrigger), even with the app closed.
- Dictation: with the bar empty, tap the microphone. The first time, a sheet explains that the audio is sent to our server and processed by Cloudflare Workers AI, and asks for permission ("Permitir"); then iOS asks for the microphone. Example: "cena hoy a las nueve y recuérdamelo media hora antes" (dinner today at 9, remind me half an hour before).
- Siri (Spanish): "Apunta en Tasks", then the task. It is added in the background without opening the app. The same actions are in the Shortcuts app ("Añadir tarea", "Pasar atrasadas a hoy"). Also: "Hoy" widget and Home Screen quick actions (long-press the icon).
- Ajustes → Datos: export or import a JSON backup.

4. EXTERNAL SERVICES
- Our own backend on Cloudflare Workers, used only for dictation. It receives the audio (from Siri, only the text) plus the device's local date and time; the audio is transcribed with OpenAI Whisper and the text is interpreted with NVIDIA Nemotron, both running on Cloudflare Workers AI. Nothing is stored or logged, and Cloudflare does not use this data to train models. This happens only after the user explicitly allows it in the app, and the permission can be withdrawn in Ajustes → Dictado. Without it nothing is sent and Siri input is parsed on the device.
- The backend keeps only a random device ID and a hash of its access token, for rate limiting.
- Apple Maps (MapKit local search) to find places; iOS local notifications and region monitoring for reminders.
- No analytics, advertising, tracking, third-party SDKs, payment or authentication services.

5. REGIONAL DIFFERENCES
None. The app works the same in every region where it is available. Its interface and language parsing are in Spanish.

6. REGULATED INDUSTRY OR PROTECTED THIRD-PARTY MATERIAL
Not applicable: the app does not operate in a regulated industry and does not include third-party protected material.

Thank you,
Diego Molina Catalá
```
