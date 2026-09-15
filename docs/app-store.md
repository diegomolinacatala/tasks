# App de iPhone: TestFlight y App Store

Todo lo que hace falta para pasar de la rama `capacitor` a la app instalada y, cuando se quiera,
publicada. Los pasos marcados con **(tú)** necesitan tu cuenta de Apple o de GitHub.

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

*Actions* → **iOS** → *Run workflow* → rama `capacitor`. Tarda unos 10 minutos; después App Store
Connect la procesa entre 5 y 30 minutos más.

A partir de ahí, cada push a `main` que toque la app sube una compilación nueva, y el día 1 de cada
dos meses se sube otra sola para que TestFlight no caduque (90 días).

### 1.6 Instalarla (tú)

1. App Store Connect → la app → *TestFlight* → *Internal Testing* → **+** → crea un grupo y añádete.
2. Instala **TestFlight** desde la App Store en el iPhone y acepta la invitación que llega por correo.
3. Antes de desinstalar la web de la pantalla de inicio: en la web, *Ajustes → Exportar copia*; en la
   app, *Ajustes → Importar copia*. No comparten almacenamiento.

> El dictado de la app necesita el Worker desplegado con los cambios de esta rama (alta de
> dispositivos solo para dictar y el origen `capacitor://localhost`). Se despliega solo al unir la
> rama con `main`.

## 2. Qué probar en el iPhone

- [ ] Avisos: permiso, aviso por hora, botones *Hecha* y *+10 min*, resumen diario, número del icono.
- [ ] Lugares: crear uno desde Ajustes buscando «Mercadona»; «usar mi ubicación actual»; radio.
- [ ] Escribir *«comprar pan al pasar por mercadona»*: píldora *Al llegar a Mercadona*.
- [ ] Dictar *«recuérdame al llegar a la universidad que tengo que reunirme con José»* con la
      universidad sin guardar: se crea la tarea y se abre el editor del lugar.
- [ ] Ir físicamente a un lugar guardado (o salir de él) y que salte el aviso con la app cerrada.
- [ ] Aviso de un lugar con varias tareas: al tocarlo se abren todas juntas.
- [ ] Siri: *«Oye Siri, añade una tarea en Tasks»*.
- [ ] Mantener pulsado el icono: *Nueva tarea* enfoca la barra; *Semana* abre la semana.
- [ ] Exportar copia: se abre la hoja de compartir.
- [ ] Cerrar la app a la fuerza y volver: las tareas siguen ahí.

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

SIRI Y ATAJOS
«Oye Siri, añade una tarea en Tasks».

PRIVADA
Tus tareas, lugares y ubicación se quedan en tu iPhone. Sin registro, sin publicidad, sin analítica.
```

**Capturas**: Apple exige al menos las de iPhone de 6,9" (1320 × 2868 px). Si tu iPhone es de otro
tamaño, App Store Connect indica qué medidas acepta al subirlas.

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

Siri: «Añade una tarea en Tasks».
```

Si la revisión alega la norma 4.2 (funcionalidad mínima de una web empaquetada), responde señalando
lo que solo hace la app: avisos por lugar gestionados por iOS, notificaciones locales con acciones,
Siri y App Shortcuts, accesos rápidos del icono, búsqueda en Apple Maps y vibración háptica.
