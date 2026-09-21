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
      **Todavía no**. *Sí, hecha* abre la app con la tarea tachada y *Deshacer*.
- [ ] Repetirlo y pulsar **Todavía no**: el tramo se alarga hasta 15 min desde ese momento y, a esa
      hora, vuelve la pregunta.
- [ ] Repetirlo y **tocar** el aviso sin mantenerlo: se abre la app con *¿Has acabado prueba?* y
      **Sí** abajo; tocarlo la tacha.
- [ ] Con la app cerrada a la fuerza: *Sí, hecha* desde el aviso sigue tachándola al abrir.
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
Tantos como quieras por tarea: a la hora, antes, a una hora concreta. Márcala hecha o pospónla desde la propia notificación.

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

```
No requiere cuenta ni inicio de sesión.

Avisos por lugar: Ajustes (icono ··· arriba a la derecha) → Lugares → Añadir lugar → buscar un sitio o «Usar mi ubicación actual». Después, en cualquier tarea → Recordatorios → + Añadir → elegir el lugar. iOS muestra la notificación al entrar en el radio. La app solo pide ubicación «mientras se usa»: la vigilancia de la región la hace el sistema (UNLocationNotificationTrigger).

Dictado: botón de micrófono con la barra de texto vacía. El audio se transcribe en nuestro servidor y no se guarda.

Siri: «Apunta en Tasks» y, cuando pregunte, «llamar a Ana mañana a las 5». La tarea se crea en segundo plano, sin abrir la app, con su aviso programado. Para interpretar la frase se envía el texto (no el audio: lo transcribe Siri) a nuestro servidor, que no lo guarda.
```

Si la revisión alega la norma 4.2 (funcionalidad mínima de una web empaquetada), responde señalando
lo que solo hace la app: avisos por lugar gestionados por iOS, notificaciones locales con acciones,
Siri y App Shortcuts, accesos rápidos del icono, búsqueda en Apple Maps y vibración háptica.

## 6. Publicar en la App Store

### Antes de empezar

- Probada en el iPhone (§2).
- Rama `capacitor` unida con `main`: despliega el Worker (dictado) y publica la URL de privacidad.
  Después sale una compilación nueva: es la que se envía. Hecho el 21/09/2026: la 16.
- Capturas: las siete de `docs/capturas/` (§3), en ese orden.

### En App Store Connect → la app → pestaña **Distribución**

1. **Información de la app** (columna izquierda): subtítulo, categoría *Productividad*,
   **Clasificación por edades → Configurar** (todo *Ninguno/No* → 4+), *Derechos de contenido*:
   no usa contenido de terceros → **Guardar**. El estado de comerciante (UE) no está aquí: es de la
   cuenta, en **Negocio → Acuerdos → Cumplimiento → Digital Services Act**.
2. **Privacidad de la app**: URL de la política → **Guardar**; *Recopilación de datos* →
   **Empezar** → *Sí* → solo **Identificadores → ID de dispositivo** → uso *Funcionalidad de la
   app*, vinculado *No*, rastreo *No* → **Guardar** → **Publicar** (arriba a la derecha).
3. **Precios y disponibilidad**: precio 0 (gratis), países → **Guardar**.
4. **1.0 Preparar para el envío** (bajo *iOS App*):
   - Capturas de pantalla, descripción, palabras clave y URL de soporte (§3).
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
