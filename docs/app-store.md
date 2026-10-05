# App de iPhone: TestFlight y App Store

Todo lo que hace falta para pasar de la rama `capacitor` a la app instalada, publicarla y sacar
actualizaciones. Los pasos marcados con **(tú)** necesitan tu cuenta de Apple o de GitHub.

| Paso | Estado (28/09/2026) |
|---|---|
| 1.1–1.4 Identificador, app, clave y secretos | Hecho. App **Tasks: tareas y lugares**, Apple ID `6812776586`, Team ID `APD54YM4F3` |
| 1.5 Compilación en TestFlight | Hecho. La 9 trae el widget, la 10 la acción de Atajos y la 12 apuntar sin abrir la app (§2.1) y la 13 el sonido de los avisos por hora |
| 1.6 Instalarla | Hecho |
| 1.7 App Group del widget | Hecho |
| 2 Probar en el iPhone | A grandes rasgos: «funciona medio decente». Widget, Siri, tres toques atrás y aviso al salir de un lugar, bien. Falta el resto de la lista |
| Unir `capacitor` con `main` | Hecho (17/09/2026). El Worker se despliega solo desde `main` |
| 6 Publicar en la App Store | Hecho. En la App Store desde el 27/09/2026: la 1.0 con la compilación 24, tras dos rechazos (§7 y §8) |
| 9 Actualizaciones | 1.3 aprobada (compilación 30). Versión en curso: 1.4, se envía la compilación 35 (§9.6) |

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
- [ ] Mantener pulsado el icono: *Nueva tarea* enfoca la barra; *Agenda* abre la agenda.
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
      *Atrasadas* lo sube a hoy (cada una arriba de su sección) con *Deshacer*; en la *Agenda*, cada
      día pasado con pendientes tiene el suyo.
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
      píldora dice *Hoy HH:MM–HH:MM* y la fila, el tramo. En el panel, la regla de *Duración* marca
      **5 min**, arriba *HH:MM → HH:MM* y debajo *A las … te pregunto si has acabado*.
- [ ] **Regla de la duración** (desde la 1.3): arrastrarla (vibra en cada paso de 5 min) sin que se
      mueva el panel; mantener el dedo al final: se llena el halo de oro, vibra y pasa a 4 h; seguir
      manteniendo, 8 h. Al soltar con algo corto vuelve a la de 2 h. A la izquierda del todo, sin
      duración; tocar la hora de acabar abre la rueda.
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
| URL de soporte | https://diegomolinacatala.github.io/tasks/soporte.html |
| URL de privacidad | https://diegomolinacatala.github.io/tasks/privacidad.html |
| Precio | Gratis, sin compras dentro de la app |
| Estado DSA (UE) | No comerciante |

**Palabras clave** (100 caracteres, sin marcas ajenas: Apple rechaza nombres de otras empresas):

```
recordatorios,pendientes,lista,rutinas,hábitos,ubicación,dictado,voz,siri,agenda,widget,calendario
```

(98 caracteres. Hasta la 1.1: `recordatorios,pendientes,lista,to-do,ubicación,lugar,dictado,voz,siri,agenda,semana,avisos`;
"lugar" y "avisos" ya están en el nombre y el subtítulo, que Apple también indexa.)

**Descripción** (desde la 1.4; ordenada como las capturas: primero lo que la hace distinta)

```
Apunta tus tareas como las dirías y olvídate de configurar nada. Sin cuentas: todo se queda en tu iPhone.

Escribe «cena con Carlota el viernes a las 9» y Tasks pone el día, la hora y el aviso. Escribe «comprar pan al pasar por Mercadona» y te avisa cuando llegas.

ESCRIBE O DICTA, COMO HABLAS
Una frase basta: el día, la hora, la duración y los avisos salen solos. Toca el micrófono y dilo de corrido. «Cada día a las 10» la convierte en rutina.

TE AVISA DONDE TOCA
Guarda tus sitios buscándolos en Mapas o con tu ubicación actual. El iPhone te avisa al llegar o al salir, aunque la app esté cerrada, y lo repite cada vez hasta que la taches.

TU DÍA, DE UN VISTAZO
La agenda pone en un horario lo que tiene hora, con el tiempo libre entre medias, y en su lista lo demás. Tira de la semana hacia abajo y se abre el mes entero para saltar a cualquier fecha.

HÁBITOS DE UN TOQUE
Lo que se repite —«tomar creatina cada día», «gimnasio los lunes y jueves»— va aparte, con su emoji y su racha. Cada día amanecen sin tachar, a la hora que tú elijas, y se tachan de un toque, también desde la pantalla de bloqueo.

SIN ABRIR LA APP
Widgets de Hoy, de la Bandeja y de tus rutinas para tachar desde la pantalla de inicio. «Oye Siri, apunta en Tasks» y dilo de corrido, incluso con el iPhone bloqueado.

TÁCHALA DESDE EL AVISO
Dile cuánto dura —«gimnasio a las 7 durante una hora»— y al terminar te pregunta si has acabado. Un toque en «Sí, hecha» y listo. Marca o pospón cualquier aviso desde la propia notificación.

TODO, ANTES DE AÑADIR
Toca Detalles y decide en una sola ficha el día, la hora, cuánto dura, los avisos, la sección, si se repite y lo importante que es.

LO IMPORTANTE, MÁS GRANDE
Sin etiquetas ni colores: lo importante se ve más grande. Lo que quedó sin hacer ayer pasa a hoy de un toque, desde la app, el widget o Siri.

DE DÍA Y DE NOCHE
Papel marfil de día y azul de medianoche de noche, o que siga a tu iPhone. En español y en inglés.

TU OPINIÓN CUENTA
Desde Ajustes, rodea con el dedo cualquier parte de la app y cuéntanos qué cambiarías.

PRIVADA
Sin registro, sin publicidad, sin analítica. Tus tareas, tus lugares y tu ubicación se quedan en tu iPhone.
```

**Texto promocional** (170 caracteres; se cambia sin versión nueva)

```
Nuevo: rodea cualquier parte de la app para sugerir mejoras, widget de la Bandeja, rutinas que se renuevan a tu hora y también en inglés.
```

### 3.1 Ficha en inglés (desde la 1.4)

La app habla inglés desde la 1.4, así que la ficha puede tenerlo también: quien tenga el iPhone en
inglés (o la tienda de un país de habla inglesa) la verá así.

**Cómo añadirla (tú, en App Store Connect):**

1. La app → pestaña **Distribución** → en la versión 1.4, arriba a la derecha, el desplegable del idioma
   (pone *Español (España)*) → **Añadir idioma** → **English (U.S.)**.
2. En *English (U.S.)* rellena los campos de la tabla de abajo, la descripción, las palabras clave y las
   novedades (§9.6), y sube las capturas de `docs/capturas/en/` (si no, Apple usaría las españolas).
3. **Información de la app** (columna izquierda) → idioma **English (U.S.)** → **Nombre** y
   **Subtítulo** de la tabla, y las URL de privacidad. **Guardar**.

| Campo | Valor |
|---|---|
| Name | Tasks: to-dos & places |
| Subtitle | Reminders by time and place |
| Support URL | https://diegomolinacatala.github.io/tasks/support.html |
| Privacy Policy URL | https://diegomolinacatala.github.io/tasks/privacy.html |

**Keywords** (99 caracteres):

```
reminders,to-do,todo,list,routines,habits,location,dictation,voice,siri,planner,widget,calendar,day
```

**Description**

```
Jot down your tasks the way you’d say them, with nothing to set up. No accounts: everything stays on your iPhone.

Type “dinner with Carlota on Friday at 9pm” and Tasks sets the day, the time and the reminder. Type “buy bread when I get to the supermarket” and it reminds you as you arrive.

TYPE OR DICTATE, THE WAY YOU TALK
One sentence is enough: the day, the time, how long it lasts and the reminders fill themselves in. Tap the microphone and say it in one go. “Every day at 10” turns it into a routine.

REMINDS YOU RIGHT THERE
Save your places by searching Maps or with your current location. Your iPhone reminds you when you arrive or leave, even with the app closed, every time until you check it off.

YOUR DAY AT A GLANCE
The agenda puts everything with a time on a schedule, with your free time in between, and everything else in its list. Pull the week down to open the whole month and jump to any date.

HABITS, ONE TAP AWAY
What repeats —“take creatine every day”, “gym on Mondays and Thursdays”— goes apart, with its emoji and its streak. Every day they start unchecked, at the time you choose, and you check them off with one tap, even from the Lock Screen.

NO NEED TO OPEN IT
Today, Inbox and Routines widgets to check things off from your Home Screen. “Hey Siri, add to Tasks” and say it in one go, even with your iPhone locked.

CHECK IT OFF FROM THE ALERT
Tell it how long it lasts —“gym at 7 for an hour”— and when it ends it asks if you’re done. One tap on “Yes, done” and that’s it. Mark or snooze any reminder right from the notification.

EVERYTHING, BEFORE ADDING
Tap Details and decide the day, time, duration, reminders, section, repeat and importance in a single sheet.

WHAT MATTERS, BIGGER
No labels, no colors: important things just look bigger. Whatever was left undone yesterday moves to today with one tap, from the app, the widget or Siri.

DAY AND NIGHT
Ivory paper by day and midnight blue by night, or let it follow your iPhone. In English and Spanish.

YOUR SAY
From Settings, circle any part of the app and tell us what you’d change.

PRIVATE
No sign-up, no ads, no analytics. Your tasks, places and location stay on your iPhone.
```

**Promotional Text** (opcional)

```
New: circle any part of the app to suggest an improvement, an Inbox widget, routines that reset at your time, and English.
```

**Capturas** (desde la 1.4): Apple exige al menos las de iPhone de 6,9" (1320 × 2868 px). Hay dos
juegos de diez, a ese tamaño exacto y numerados en el orden en que se suben: en español en
[`docs/capturas/`](capturas/) y en inglés en [`docs/capturas/en/`](capturas/en/). Las tres primeras son
las que salen en la búsqueda, así que dicen lo que hace la app distinta, no la lista de funciones:

1. `01-escribir`: «Escríbelo como lo dices.» La frase con Carlota en la barra y la tarea que sale de
   ella, flotando, con su día y su aviso; y «o díctalo».
2. `02-lugares`: «Te avisa donde toca.» El mapa de Lugares y el aviso de Mercadona al llegar.
3. `03-agenda`: «Tu día, de un vistazo.» El horario con el tiempo libre.
4. `04-rutinas`: «Hábitos de un toque.» Las rutinas con su racha y la pantalla de bloqueo.
5. `05-widgets`: «Sin abrir la app.» Widgets de Hoy, Bandeja y Rutinas, y Siri.
6. `06-has-acabado`: «Táchala desde el aviso.» El «¿Has acabado?» con sus botones.
7. `07-detalles`: «Todo, antes de añadir.» La ficha del compositor, con la regla de la duración.
8. `08-mes`: «De la semana al mes.»
9. `09-importancia`: «Lo importante, más grande.»
10. `10-privada`: «Tuyas. Solo tuyas.» La app en modo oscuro y lo que no hace: cuentas, anuncios.

Los titulares son cortos para que se lean en la miniatura de la búsqueda; los textos de las dos
versiones están en `scripts/store-copy.mjs`. Los emojis son los de Windows (se generan en el portátil):
en el iPhone salen los de Apple.

Cada una es la app real con datos de ejemplo dentro de un iPhone, con titular y un detalle que sale
del marco. Se regeneran cuando cambie la interfaz con `node scripts/app-store-shots.mjs` y
`node scripts/app-store-shots.mjs --en` (compila la web con `--mode shots`, que enseña la pestaña
Lugares con el plano dibujado, y fija el reloj de la página a las 11:20; usa Edge sin ventana; las
plantillas están en `scripts/store-frames.mjs` y `scripts/store-widgets.mjs`, y los datos de ejemplo,
en los dos idiomas, en `scripts/sample-state.mjs`). La letra es Inter y Source Serif 4, lo más parecido
a San Francisco y New York que se puede usar fuera de Apple.

## 4. Privacidad en App Store Connect

*App Privacy* → **Data collection**: *Yes, we collect data* → **Identifiers → Device ID** y, desde la
1.4, **User Content → Customer Support** (*Contenido del usuario → Atención al cliente*). Los dos igual:

- Uso: *App Functionality*
- Vinculado a la identidad: **No**
- Rastreo: **No**

Motivo: el Worker guarda un identificador aleatorio por dispositivo para limitar el dictado, y las
sugerencias que alguien decide enviar desde Ajustes (mensaje, captura opcional y datos técnicos) hasta
que se leen. El audio se procesa al momento y no se conserva, así que según la definición de Apple no se
recopila. La ubicación, las tareas y los lugares nunca salen del iPhone (salvo lo que se ve en la captura
de una sugerencia, si se deja). Debe coincidir con `ios/App/App/PrivacyInfo.xcprivacy`.

**Cómo añadir *Atención al cliente*** (tú, una vez, antes de enviar la 1.4): App Store Connect → la app
→ columna izquierda, **Privacidad de la app** → **Editar** junto a los tipos de datos → marca **Atención
al cliente** (en *Contenido del usuario*) → **Guardar** → en su tarjeta, **Configurar**: *Funcionalidad de
la app* → ¿vinculado a la identidad? **No** → ¿para rastrear? **No** → **Guardar** → arriba a la derecha,
**Publicar**.

**Cifrado**: `ITSAppUsesNonExemptEncryption = false` en `Info.plist` (solo HTTPS y cifrado estándar del
sistema), así que TestFlight no pregunta por la exportación.

## 5. Notas para la revisión de Apple

En inglés: quien revisa no tiene por qué saber español. Van en **Información para la revisión →
Notas** (máximo 4000 caracteres; estas son unas 3990: van justas, con la bienvenida, los destinos de la barra y
el mes de la 1.2). Son lo mismo que pidió Apple en el rechazo del
22/09/2026 (§7), sin el vídeo, con el aviso del dictado como quedó tras el rechazo del 23/09/2026 (§8).

```
No account or login is needed. Tasks and places are stored only on the device. The interface follows the device language, Spanish or English (also Ajustes → Idioma). Spanish names below: "Bandeja" = Inbox, "Lugares" = Places, "Ajustes" = Settings.

PURPOSE AND AUDIENCE
A simple daily to-do list for Spanish-speaking iPhone users who want to jot tasks down quickly and be reminded at the right time or place, without signing up. You write or say a task the way you would say it and the app sets the day, time and reminder.

HOW TO TEST
- First launch shows a short welcome: "Empezar" then "Continuar", or "Saltar" (Skip). The app starts empty.
- Add: tap the bar at the bottom, type "llamar a Ana mañana a las 5" (call Ana tomorrow at 5) and press Return or the round arrow. A chip shows the detected day and time and a reminder is scheduled; notification permission is requested the first time a reminder exists. With no date in the text, the chips under the bar ("Hoy", "Mañana" = Tomorrow, "Sin fecha" = No date) choose where it goes. Tap outside the bar to close the keyboard.
- Swipe a task right to complete it, left to delete it (Undo appears). Drag the handle on the right to reorder, or onto a day of the week strip to move it. Swipe the strip to change week; pull it down (or tap the month name) to open the whole month.
- Tap a task to edit date, time, duration, reminders and importance. The "A" button (top right) is importance mode: drag the number on a task; more important tasks get a larger title.
- Routines: type "tomar creatina todos los días a las 10" (take creatine every day at 10). It appears in Bandeja → Rutinas with an emoji; tick it for today and it resets the next day. The "Rutinas" Lock Screen widget ticks it with one tap.
- Duration: "gimnasio hoy a las 18:00 durante una hora" (gym today at 6 pm for one hour). When it ends, a notification asks "¿Has acabado?" (Are you done?) with "Sí, hecha" / "Todavía no" (long-press the notification).
- Location reminders: Lugares → search a place (Apple Maps) or use the current location ("while using" only). Then a task → Recordatorios → Añadir → the place. iOS delivers it on arrival or departure (UNLocationNotificationTrigger), even with the app closed.
- Dictation: with the bar empty, tap the microphone. The first time, a notice explains that the audio is sent to our server and processed by Cloudflare Workers AI; its only button, "Continuar", leads to the iOS microphone permission request. Example: "cena hoy a las nueve y recuérdamelo media hora antes" (dinner today at 9, remind me half an hour before).
- Siri (Spanish): "Apunta en Tasks", then the task. It is added without opening the app. Same actions in the Shortcuts app ("Añadir tarea", "Pasar atrasadas a hoy"). Also: "Hoy" widget and Home Screen quick actions.
- Ajustes: light or dark appearance; export or import a JSON backup.

EXTERNAL SERVICES
- Our own backend on Cloudflare Workers, used for dictation. It receives the audio (from Siri, only the text) plus the device's local date and time; the audio is transcribed with Whisper and the text interpreted with NVIDIA Nemotron, both on Cloudflare Workers AI. Nothing is stored or logged, and Cloudflare does not use it to train models. It is sent only after the user has seen that notice and granted microphone access (off in Ajustes → Dictado). Otherwise nothing is sent and Siri input is parsed on the device.
- The backend keeps only a random device ID and a hash of its token, for rate limiting.
- Suggestions (Ajustes → Sugerir una mejora): sent only when the user taps Send (message, optional screenshot, app version); only the developer reads them.
- Apple Maps (MapKit search), iOS local notifications and region monitoring.
- No analytics, advertising, tracking, third-party SDKs, payments or authentication services.

REGIONAL DIFFERENCES
None. Spanish and English, chosen by the device language or in Ajustes.

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
- Capturas: las de `docs/capturas/` (§3), en ese orden.

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
   - Capturas de pantalla, descripción, palabras clave y URL de soporte (§3; GitHub Issues no vale: §8). La página enseña el
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

Versiones posteriores: §9.

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
- Add: in the bar at the bottom type "llamar a Ana mañana a las 5" and press Return. A chip shows the detected day and time and a reminder is scheduled; notification permission is requested the first time a reminder exists.
- Swipe a task right to complete it, left to delete it (Undo appears). Drag the handle on the right to reorder, or onto a day of the week strip to move it. Swipe the week strip to change week.
- Tap a task to edit date, time, duration, reminders and importance. The "A" button (top right) is importance mode: drag the number on a task; more important tasks get a larger title.
- Routines: type "tomar creatina todos los días a las 10" (take creatine every day at 10). It appears in Bandeja → Rutinas; tick it for today and it resets the next day. The "Rutinas" Lock Screen widget ticks it with one tap.
- Duration: "gimnasio hoy a las 18:00 durante una hora" (gym today at 6 pm for one hour). When it ends, a notification asks "¿Has acabado?" (Are you done?) with "Sí, hecha" / "Todavía no" (long-press the notification).
- Location reminders: Lugares → "Buscar o añadir un lugar" → search a place (Apple Maps) or "Usar mi ubicación actual". Location is requested "while using" only. Then open a task → Recordatorios → Añadir → the place. iOS delivers the notification on arrival or departure (UNLocationNotificationTrigger), even with the app closed.
- Dictation: with the bar empty, tap the microphone. The first time, a sheet explains that the audio is sent to our server and processed by Cloudflare Workers AI, and asks for permission ("Permitir"); then iOS asks for the microphone. Example: "cena hoy a las nueve y recuérdamelo media hora antes" (dinner today at 9, remind me half an hour before).
- Siri (Spanish): "Apunta en Tasks", then the task. It is added in the background without opening the app. The same actions are in the Shortcuts app ("Añadir tarea", "Pasar atrasadas a hoy"). Also: "Hoy" widget and Home Screen quick actions (long-press the icon).
- Ajustes: light or dark appearance; export or import a JSON backup.

4. EXTERNAL SERVICES
- Our own backend on Cloudflare Workers, used for dictation. It receives the audio (from Siri, only the text) plus the device's local date and time; the audio is transcribed with OpenAI Whisper and the text is interpreted with NVIDIA Nemotron, both running on Cloudflare Workers AI. Nothing is stored or logged, and Cloudflare does not use this data to train models. This happens only after the user explicitly allows it in the app, and the permission can be withdrawn in Ajustes → Dictado. Without it nothing is sent and Siri input is parsed on the device.
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

## 8. Rechazo del 23/09/2026: 5.1.1(iv) y 1.5

Apple revisó la compilación 20 (en un iPad Air, con la app de iPhone ampliada) y señaló dos cosas:

- **5.1.1(iv), permiso del micrófono.** El panel del dictado salía antes de la petición del micrófono
  con **Permitir** y **Ahora no**. Apple no admite que un aviso previo pida permiso por su cuenta ni que
  deje aplazar la petición del sistema: pide un botón tipo *Continuar* y que siempre lleve a ella.
  Ahora el panel tiene solo **Continuar**, no se cierra de otra forma (ni tocando fuera ni deslizando)
  y lleva directo al permiso de iOS, que es quien decide. El permiso del dictado queda dado cuando iOS
  concede el micrófono; si lo deniega, no se envía nada, el panel vuelve la próxima vez y un aviso
  *Sin acceso al micrófono* lleva a **Ajustes** (lo que sugiere Apple). El texto de iOS
  (`NSMicrophoneUsageDescription`) nombra también la IA de Cloudflare, para cumplir la 5.1.2(i).
- **1.5, URL de soporte.** GitHub Issues no cuenta como web de soporte (pide cuenta y no tiene
  información). Ahora es `https://diegomolinacatala.github.io/tasks/soporte.html`: correo de contacto
  (`diegomolinacatala+tasks@gmail.com`), preguntas frecuentes en español, un resumen en inglés y la
  política de privacidad. La política también da ya ese correo.

### 8.1 Responder y reenviar (tú, en App Store Connect)

1. Esperar a que la compilación nueva (la primera después de la 20) salga en *TestFlight* sin el
   aviso *Procesando*. Llega un correo de Apple cuando está lista.
2. **Distribución** → columna izquierda, **1.0 Rechazado** (bajo *App para iOS*):
   - **URL de soporte**: borrar la de GitHub y pegar `https://diegomolinacatala.github.io/tasks/soporte.html`.
   - **Compilación**: pasar el ratón por la 20 → **−** (o la papelera) → **Añadir compilación** → la
     nueva → **Listo**. Si pregunta por el cifrado: *Ninguno de los algoritmos mencionados*.
   - **Información para la revisión → Notas**: borrar lo que haya y pegar el bloque del §5.
   - **Guardar** (arriba a la derecha).
3. Columna izquierda → **Revisión de apps** → el envío del *martes, 11:14* → abajo del todo, en el
   mensaje de Apple, **Responder** → pegar la respuesta del §8.2 cambiando `[N]` por el número de la
   compilación nueva → **Enviar**.
4. Arriba a la derecha, **Volver a enviar a revisión de apps**.

### 8.2 Respuesta para Apple

```
Hello, and thank you for the detailed feedback.

Both issues are resolved in build 1.0 ([N]), which is now selected for review.

Guideline 5.1.1(iv) - Microphone permission
The notice shown before the microphone permission request no longer has "Permitir" (Allow) or "Ahora no" (Not now). Its only button is "Continuar" (Continue) and it cannot be dismissed in any other way, so the user always proceeds to the iOS microphone permission request, where they decide. The notice only explains where the audio goes (our server and Cloudflare Workers AI), which guideline 5.1.2(i) requires us to disclose; the microphone purpose string says the same. If microphone access is denied, nothing is sent, dictation stays off and the app shows a message with a button that opens the app's page in Settings. Typing tasks works without the microphone.

Guideline 1.5 - Support URL
The Support URL is now https://diegomolinacatala.github.io/tasks/soporte.html, a support page with a contact email address, frequently asked questions (in Spanish, with a summary in English) and a link to the privacy policy.

Thank you,
Diego Molina Catalá
```

## 9. Actualizaciones

La 1.0 está en la App Store desde el 27/09/2026 (compilación 24):
https://apps.apple.com/es/app/tasks-tareas-y-lugares/id6812776586. La app lleva la web dentro
(`dist-native/`), así que un cambio en `src/`, `ios/` o `public/` solo llega a quien la instaló con una
versión nueva y su revisión. Lo demás sigue igual:

- Un push a `main` publica la web al momento y, si toca la app, sube una compilación a TestFlight, que
  solo ves tú.
- El Worker se despliega al momento y atiende también a la versión de la App Store que cada uno tenga
  instalada: sus cambios, siempre compatibles hacia atrás.

### 9.1 Número de versión

`MARKETING_VERSION` (`ios/App/App.xcodeproj/project.pbxproj`, cuatro veces: app y widget, Debug y
Release) es la versión que se publica y tiene que ser mayor que la última aprobada: App Store Connect
rechaza las compilaciones de una versión ya aprobada y el CI falla al subir (`ITMS-90186`,
`ITMS-90062`), también la ejecución programada del día 1. Por eso, **en cuanto Apple apruebe una
versión, se sube** (1.4 → 1.5…) antes del siguiente push que toque la app. Ahora es la 1.4.

### 9.2 Probar la compilación (tú, en el iPhone)

1. Tras el push, *Actions* → **iOS** en verde; entre 5 y 30 minutos después TestFlight enseña
   **1.4 (N)**.
2. *TestFlight* → Tasks → **Actualizar**, y probar.

En el iPhone solo cabe una: la de TestFlight (punto naranja junto al nombre) sustituye a la de la App
Store, y al revés. Las tareas suelen conservarse, pero Apple no lo garantiza: antes de cambiar de una a
otra, **···** → *Exportar copia* → *Guardar en Archivos*.

### 9.3 Enviar a revisión (tú, en App Store Connect)

1. **Distribución** → columna izquierda, **+** junto a *App para iOS* → versión `1.2` (la misma que
   `MARKETING_VERSION`) → **Crear**. La versión nueva copia de la anterior las capturas, la
   descripción, las palabras clave, las URL y la información para la revisión. Si la anterior sigue
   *Pendiente de publicación del desarrollador*, hay que publicarla antes (**Publicar esta versión**):
   mientras tanto el **+** no sale.
2. **Novedades de esta versión** (obligatorio en una actualización): lo nuevo, en pocas líneas. Es
   lo que se lee en la App Store. El texto de la 1.2 está en §9.4 (el de la 1.1 fue *«Diseño nuevo,
   en papel marfil y tinta azul marino, con icono nuevo y una apertura más cuidada. Corregido: al
   elegir una hora a mano podía guardarse otra.»*). Si cambian las capturas, en esa misma página
   **Capturas de pantalla** → borrar las antiguas del tamaño de 6,9" y arrastrar las de
   `docs/capturas/` en orden.
3. **Compilación** → **Añadir compilación** → la **1.2 (N)** probada → **Listo**.
4. Solo si hace falta: si cambia lo que se recoge (§4), **Privacidad de la app** y
   `PrivacyInfo.xcprivacy`; si hay algo nuevo que Apple necesite saber para probarlo, las **Notas** (§5).
5. **Publicación de la versión**: *automáticamente* (sale en cuanto la aprueben; *manualmente* si
   se quiere elegir el día). Si aparece la publicación por fases, desactivada: a todos a la vez.
6. **Guardar** → **Añadir para revisión** → **Enviar a App Review**. Llega un correo en cada cambio
   de estado; una actualización suele revisarse en menos de un día.
7. Aprobada: subir `MARKETING_VERSION` a la siguiente (§9.1). Quien tenga activadas las
   actualizaciones automáticas la recibe sola.

### 9.4 La 1.2 (30/09/2026)

La primera actualización grande: cuatro pestañas, agenda con horario, rutinas, modo oscuro, el mes
desplegable, los emojis, la barra de escribir nueva y la bienvenida. Compilación: la **1.2 (29)**, de
`capacitor` (commit `14fe2f2`); publicada el 30/09/2026. Cambia casi toda la ficha, así que además de
los pasos de §9.3:

- **Capturas**: borrar las que haya en 6,9" y subir las nueve de `docs/capturas/`, de `1-agenda` a
  `9-widget`, en ese orden.
- **Descripción** y **Palabras clave**: las de §3 (la descripción solo se puede cambiar con una
  versión nueva: es ahora o en la siguiente).
- **Notas para la revisión**: las de §5, que ya cuentan la bienvenida, los destinos de la barra y el
  mes. Quien revisa instala de cero y lo primero que ve es la bienvenida.
- **Privacidad**: sin cambios (no se recoge nada nuevo).

**Novedades de esta versión**

```
Tasks se ha rehecho de arriba abajo.

• Agenda: tu día en un horario, con el tiempo libre entre medias. Tira de la semana hacia abajo y se abre el mes entero.
• Rutinas: lo que se repite, con su emoji y su racha. Se tachan de un toque, también desde el widget de la pantalla de bloqueo.
• Barra de escribir nueva: al tocarla eliges adónde va (hoy, mañana o sin fecha) y puedes apuntar varias seguidas.
• Modo oscuro: claro, oscuro o automático.
• Lugares con mapa y radio ajustable.
• Una bienvenida para quien llega de nuevas.
• Deslizar las tareas va más fino.
```

**Texto promocional** (opcional, 170 caracteres; se puede cambiar sin versión nueva)

```
Nuevo: agenda con horario, rutinas con emoji que se tachan desde la pantalla de bloqueo, el mes entero de un tirón y modo oscuro.
```

### 9.5 La 1.3 (01/10/2026, compilación 30)

Aprobada: el 03/10/2026, al subir lo siguiente, App Store Connect respondió que la 1.3 ya no admite
compilaciones (*train version '1.3' is closed*). Comprobar en App Store Connect si está publicada o
*Pendiente de publicación del desarrollador* (entonces, **Publicar esta versión**).

La ficha del compositor y la bienvenida también al actualizar. **Detalles** (o tirar del asa de la barra
de escribir) la despliega en una ficha con todo lo de una tarea antes de añadirla; y la bienvenida, que
en la 1.2 solo salía en una instalación nueva, sale ahora también a quien actualiza (a todos los que
vienen de la 1.2 o antes, entera; después, solo las láminas nuevas). Pasos de §9.3; la ficha de la
tienda no cambia salvo, si se quiere, una captura de la ficha.

**Novedades de esta versión**

```
• Detalles al escribir: toca Detalles (o tira de la barra hacia arriba) y elige el día, la hora, la duración, los avisos, la sección, la importancia o si se repite antes de añadir la tarea.
• Duración en una regla: arrastra para elegir cuánto dura y mantén el dedo al final para alargarla, hasta medio día.
• La bienvenida sale también al actualizar, con lo nuevo de cada versión.
```

### 9.6 La 1.4 (03/10/2026)

Lo nuevo: el **inglés** (Ajustes → Idioma), el **widget de la Bandeja**, una app **más fluida en iPhone
antiguos**, las **sugerencias** (Ajustes → *Sugerir una mejora*: rodear cualquier parte de la app y
escribir qué cambiarías; llegan al buzón, ver CLAUDE.md, "Sugerencias"), la **hora a la que se renuevan
las rutinas** y una lámina nueva en la bienvenida (*Sugerencias*, con la cena con Carlota). Se envía la
compilación **1.4 (35)**. Cambian las capturas, la descripción, la privacidad y las notas: todo está en
este documento, en el orden en que se hace.

**Antes (en el iPhone, 5 minutos)**

1. *TestFlight* → Tasks → **Actualizar** a la 1.4 (35) y abrirla: como ya viste la bienvenida de la 1.3,
   tiene que salir *Hay cosas nuevas* → **Ver lo nuevo** → la lámina *Sugerencias*: rodear una fila con el
   dedo y tocar *Enviar*.

**En App Store Connect** (https://appstoreconnect.apple.com → **Apps** → *Tasks: tareas y lugares*)

2. Si la 1.3 sale como *Pendiente de publicación del desarrollador*: ábrela → **Publicar esta versión**.
   Mientras no esté publicada no se puede crear la siguiente.
3. **Distribución** → columna izquierda, **+** junto a *App para iOS* → escribe `1.4` → **Crear**. La
   versión nueva copia la ficha de la anterior.
4. **Capturas** (ficha en *Español (España)*, arriba a la derecha):
   1. En *Vista previa y capturas de pantalla*, la pestaña **iPhone** → tamaño **6,9"**.
   2. Pasa el ratón por cada captura antigua → **×** (son nueve) hasta dejarlo vacío.
   3. Abre `docs/capturas/` en el Explorador de archivos, selecciona las diez (`01-escribir` …
      `10-privada`) y arrástralas juntas al hueco. Salen en orden por el nombre; si no, se ordenan
      arrastrándolas.
5. **Texto promocional**: el de §3 (empieza por «Nuevo: rodea…»).
6. **Descripción**: la de §3, entera (la anterior se borra). **Palabras clave**: sin cambios.
7. **Novedades de esta versión**: las de abajo.
8. Baja hasta **Compilación** → **Añadir compilación** → **1.4 (35)** → **Listo**. Si pregunta por el
   cifrado: *Ninguno de los algoritmos mencionados*.
9. **Información para la revisión de la app** → **Notas**: borra lo que haya y pega las de §5 (cambiaron:
   ahora dicen que la app también está en inglés y cuentan las sugerencias).
10. **Publicación de la versión**: *Publicar automáticamente esta versión*.
11. Arriba a la derecha, **Guardar**.

**La ficha en inglés** (la primera vez; las siguientes, solo sus novedades)

12. Arriba a la derecha, el desplegable del idioma (pone *Español (España)*) → **Añadir idioma** →
    **English (U.S.)**. Se abre la ficha en inglés de la 1.4, vacía.
13. Rellena con lo de §3.1: **Promotional Text**, **Description**, **Keywords**, **Support URL**
    (`https://diegomolinacatala.github.io/tasks/support.html`) y **What’s New** (abajo).
14. Capturas: igual que en el paso 4, pero arrastrando las diez de `docs/capturas/en/`.
15. **Guardar**.
16. Columna izquierda, **Información de la app** → desplegable del idioma → **English (U.S.)** → **Name**
    `Tasks: to-dos & places`, **Subtitle** `Reminders by time and place`, **Privacy Policy URL**
    `https://diegomolinacatala.github.io/tasks/privacy.html` → **Guardar**.

**La privacidad** (una vez; Apple puede rechazarla sin esto, porque las sugerencias salen del iPhone)

17. Columna izquierda, **Privacidad de la app** → **Editar** junto a los tipos de datos → marca **Atención
    al cliente** (en *Contenido del usuario*) → **Guardar** → en su tarjeta, **Configurar**: *Funcionalidad
    de la app* → ¿vinculado a la identidad? **No** → ¿para rastrear? **No** → **Guardar** → arriba a la
    derecha, **Publicar**.

**Enviar**

18. Vuelve a **Distribución** → *1.4 Preparar para el envío* → arriba a la derecha, **Añadir para
    revisión** → **Enviar a App Review**. Llega un correo con cada cambio de estado; una actualización
    suele revisarse en menos de un día.
19. Cuando la aprueben, dímelo: hay que subir `MARKETING_VERSION` a 1.5 antes de la siguiente
    compilación (§9.1) y, si quieres, unir `capacitor` a `main` para que la web pública lleve lo mismo.

**Novedades de esta versión**

```
• Ahora también en inglés: Ajustes → Idioma.
• Widget nuevo de la Bandeja: lo que aún no tiene fecha, para tacharlo sin abrir la app.
• Sugerencias: en Ajustes, rodea con el dedo cualquier parte de la app y cuéntanos qué cambiarías.
• Las rutinas se renuevan a la hora que elijas: tócala bajo tus rutinas, en la Bandeja.
• Más fluida en iPhone antiguos.
```

**What’s New in This Version** (la ficha en inglés)

```
• Now in English and Spanish: Settings → Language.
• New Inbox widget: check off what doesn’t have a date yet, without opening the app.
• Suggestions: in Settings, circle any part of the app and tell us what you’d change.
• Routines reset at the time you choose: tap it under your routines, in the Inbox.
• Smoother on older iPhones.
```
