# Vincular dispositivos y cestas compartidas

Diseño de la sincronización (14/11/2026). Lo pidió el usuario: Tasks en el ordenador, vinculado al
iPhone, y cestas compartidas (la del piso con los amigos, otra con la familia). Respuestas que lo deciden:

- **Varios dispositivos**, cualquiera vinculado puede vincular otro o quitar uno (Ajustes → Dispositivos).
- **Al instante**: WebSocket con el Worker mientras la app está abierta.
- **Vincular con QR**: el dispositivo nuevo enseña un QR y el iPhone lo escanea con su cámara (o al revés:
  uno vinculado enseña una invitación y el nuevo la escanea). Sin Swift nuevo: el enlace del QR es del
  esquema de la app y llega a la web por `appUrlOpen` de `@capacitor/app`.
- **Al vincular, lo de los vinculados manda**: el dispositivo que entra se queda con lo del grupo (con aviso).
- **Conflictos**: por campo, gana lo último; entre borrar y editar a la vez, **gana la edición**.
- **Ajustes que viajan**: todos los que se puede (apariencia, idioma, resumen diario, hora de inicio de las
  rutinas, bloques plegados). No viajan: calendario, dictado, estadísticas y bienvenida (son de cada
  dispositivo: permisos y consentimientos).
- **Cestas compartidas** con dueño: quien la crea invita (QR o enlace por WhatsApp), ve los miembros y puede
  echar a alguien; los demás pueden salir. Al unirse cada uno escribe su nombre, que solo sale en la lista
  de miembros (los productos son anónimos). Solo con la app. Cada uno elige en su iPhone a qué tienda avisa
  cada cesta.
- **Caducidad**: lo que nadie abre en un año se borra del servidor.
- **Avisos en el ordenador**: elegible en cada uno (Ajustes → Avisos, el push de la PWA de siempre).

## Cifrado de extremo a extremo

El servidor guarda y reparte, pero no puede leer nada.

- Cada **sala** (el grupo de tus dispositivos o una cesta compartida) tiene una clave `K` de 32 bytes
  aleatorios que solo tienen sus miembros (base64url, 43 caracteres).
- De `K` salen con HKDF-SHA256 (sin sal) `enc` (`info = "tasks/enc"`, AES-GCM-256) y `mac`
  (`info = "tasks/mac"`, HMAC-SHA256).
- Cada registro se guarda bajo `k = base64url(HMAC(mac, clave lógica))` recortado a 22 caracteres: el
  servidor no ve ni el tipo ni el id. Su valor `v = base64url(iv[12] ‖ AES-GCM(JSON))`.
- Los nombres de los miembros también van cifrados con `enc`.
- **Emparejar** (el nuevo enseña el QR): ECDH P-256 efímero; el secreto pasa por HKDF (`info = "tasks/pair"`)
  a AES-GCM. El QR lleva la clave pública del nuevo; el iPhone responde con la suya y una caja cifrada con
  `{ room, key, invite }`. Los dos enseñan un código de 4 cifras (SHA-256 de la clave pública del nuevo) para
  comprobar que es el mismo.

## Registros (cliente)

El estado se reparte en registros con clave lógica:

| Sala | Clave | Qué |
|---|---|---|
| personal | `t:<id>` | una tarea |
| personal | `s:<id>` | una sección |
| personal | `p:<id>` | un lugar |
| personal | `r:<id>` | una rutina |
| personal | `i:<id>` / `h:<nombre>` | la cesta propia: una cosa / lo comprado otras veces |
| personal | `g:shop` | la cesta propia: su tienda (`placeId`) |
| personal | `g:settings` | ajustes que viajan |
| personal | `g:collapsed` | bloques plegados |
| personal | `b:<sala>` | una cesta compartida a la que perteneces: credenciales, tu tienda, orden |
| cesta | `i:<id>` / `h:<nombre>` | sus cosas / lo comprado otras veces |
| cesta | `g:meta` | su nombre |

Cada registro viaja **sellado** (`Stamped`): `{ key, f: { campo: [valor, t] }, x?: { t, seen } }`.

- `t` es un reloj híbrido (`max(ahora, último + 1)`, y al recibir `último = max(último, t remoto)`).
- Borrar deja una lápida `x` con su hora y la mayor `t` de los campos que se veían (`seen`). Los campos se
  conservan.
- **Mezclar**: campo a campo gana la `t` mayor (empate: el valor mayor como JSON); la lápida, la de `t` mayor.
- **Vive** si no hay lápida o algún campo es posterior a `seen`: una edición que el que borró no había visto
  devuelve la tarea.
- Lo local se detecta comparando registros antes y después de cada cambio de estado (`diff`): no hace falta
  tocar el reducer. Lo que llega se aplica con la acción `sync/apply`.

## Servidor (Worker)

Un Durable Object `Room` por sala (SQLite) y uno `Pairing` por emparejamiento (10 minutos). Todas las
respuestas con el sobre de siempre (`{ data }` / `{ error }`).

### Salas

- `POST /v1/rooms` `{ kind: 'personal' | 'basket', name }` → `201 { room, member, token }`. Quien la crea
  es dueño. `name` es el nombre cifrado del miembro (≤ 400 caracteres).
- `POST /v1/rooms/:room/invites` (dueño) `{ ttl, uses }` → `{ invite }`. `ttl` de 60 s a 7 días, `uses` de 1
  a 50. Como mucho 20 vivas.
- `POST /v1/rooms/:room/join` `{ invite, name }` → `{ member, token, kind }`. En una sala personal entra como
  dueño (todos lo son); en una cesta, como miembro. Invitación mala, caducada o gastada: 403. Como mucho 50
  miembros.
- `GET /v1/rooms/:room/members` → `{ members: [{ id, role, name, created, seen, you }] }`.
- `DELETE /v1/rooms/:room/members/:id` → 204. Uno puede quitarse a sí mismo (salir); el dueño, a cualquiera.
  Al echar a alguien de una cesta se anulan sus invitaciones vivas. Si el dueño de una cesta sale, pasa a
  serlo el miembro más antiguo; sin miembros, la sala se borra entera. Sus sockets se cierran con 4003.
- `POST /v1/rooms/:room/sync` `{ since, put: [{ k, v, d }] }` → `{ seq, recs: [{ k, v, d, s }], reset?, more? }`.
  Lo mismo que el socket, por HTTP.
- `GET /v1/rooms/:room/socket`: WebSocket (hibernación).
  - Cliente: `{ t: 'auth', token, since }` (lo primero), `{ t: 'put', id, recs }`, `{ t: 'ping' }`.
  - Servidor: `{ t: 'recs', recs, seq, more? }` para ponerse al día y para lo que suben los demás,
    `{ t: 'ready', seq, reset? }` al acabar de ponerse al día, `{ t: 'ack', id, seq }`, `{ t: 'pong' }`.
  - Cierres: 4001 sin autorizar, 4003 ya no eres miembro, 4004 la sala no existe.
- Autenticación: `Authorization: Bearer <token>` (HTTP) o el mensaje `auth` (socket). El token se guarda como
  SHA-256.

Registro: `k` de 22 caracteres base64url, `v` de 16 KB como mucho, `d` 1 si es lápida (para podar). Cada
escritura recibe un `seq` creciente; quien pide `since` recibe lo posterior. 20.000 registros por sala. Las
lápidas de más de 180 días se podan: quien venga de antes de lo podado recibe `reset: true` con todo. Sin
actividad en un año, la alarma borra la sala.

### Emparejar

- `POST /v1/pair` `{ pub }` → `{ id }`.
- `GET /v1/pair/:id` → `{ pub, reply: { pub, box } | null }`: el nuevo pregunta cada 2 s.
- `PUT /v1/pair/:id` `{ pub, box }` → 204 (409 si ya se respondió).
- A los 10 minutos, la alarma lo borra.

### Notas de la implementación (Worker, 14/11/2026)

Detalles que el contrato no fija; el cliente puede contar con ellos.

- Códigos: crear sala `201`; invitar, unirse y `sync` `200`; quitar `204`. Sala llena (50 miembros) o 20
  invitaciones vivas: `409`. Más de 20.000 registros: `507`. Un no dueño que invita o echa: `403`. Quitar a
  quien no está: `404`. Crear o unirse más de 10 veces por minuto desde la misma IP (también `POST /v1/pair`): `429`.
- `ttl` va en segundos. `name`, `v`, `pub` y `box` tienen que ser base64url (sin `=`).
- Ids de miembro: 8 caracteres base64url.
- `sync` lee antes de escribir: lo que sube uno mismo no le vuelve en la respuesta. Con `more`, `seq` es el
  cursor para la página siguiente (`since = seq`); sin `more`, es el último `seq` de la sala (ya con lo subido).
  Lo subido por HTTP también se reparte a los sockets abiertos.
- `reset` sale cuando `since > 0` y es anterior a lo podado o mayor que el último `seq` (servidor sin esos
  datos). Viene en la primera página por HTTP y en `ready` por el socket; las páginas siguientes de esa misma
  vuelta ya no lo traen. `since = 0` nunca da `reset`.
- Podar (como mucho cada 30 días, al haber actividad) mueve por encima de todo lo que quedaba por debajo de la
  lápida podada, en el mismo orden: así una vuelta con `reset` por páginas no vuelve a caer en otro. Efecto: tras
  una poda, todos reciben otra vez esos registros (mezclar lo mismo no cambia nada).
- Socket: un `put` inválido o que no cabe responde `{ t: 'error', id, status, error }` (el socket sigue abierto;
  no está en el contrato y se puede ignorar). Un mensaje que no es JSON, de tipo desconocido o un `put` sin `id`
  cierran con `1008`. Si dos registros de un `put` tienen la misma `k`, vale el último.
- El servidor no mezcla (no puede leer): el último `put` de una clave pisa al anterior. Quien recibe un registro
  y al mezclarlo con lo suyo obtiene otra cosa debe volver a subir el resultado.
- `seen` de un miembro se apunta como mucho una vez por hora; la actividad de la sala (de la que cuelga el año),
  como mucho una vez al día.

## Enlaces

- QR para emparejar (lo enseña el nuevo): `io.github.diegomolinacatala.tasks://link/<id>#<pub>`.
- Invitación (sala personal en QR; cesta en QR o enlace):
  - QR: `io.github.diegomolinacatala.tasks://join/<room>#<key>.<invite>`
  - Enlace: `https://diegomolinacatala.github.io/tasks/#join=<room>.<key>.<invite>` (WhatsApp no deja tocar
    esquemas propios). Abierto en Safari del iPhone, la web ofrece «Abrir en Tasks»; en un ordenador
    vinculado, se une desde la web.

## Límites conocidos

- **Quitar un dispositivo no rota claves.** Deja de poder conectarse a tu grupo (el servidor borra su token), pero
  conserva lo que ya tenía, y las credenciales de tus cestas compartidas siguen valiendo: si se pierde un
  dispositivo, además de quitarlo, conviene salir y volver a entrar en esas cestas (o que su dueño lo eche).
- **Emparejar**: las cifras salen de las dos claves públicas y el dispositivo nuevo no entra hasta que se
  confirman, así que quien fotografíe el QR y responda antes no consigue colarlo en su grupo. Lo que no evitan es
  que tu iPhone responda a un QR falso (le daría acceso a tu grupo durante 10 minutos y una vez): por eso el iPhone
  avisa de que solo lo haga con el QR que enseña la pantalla de su propio dispositivo.
- **Avisos del iPhone**: se programan en el iPhone; lo añadido desde otro dispositivo no suena hasta abrir la app.
- **Borrar todo o importar** con el dispositivo vinculado cambia también los demás (el panel lo avisa).
