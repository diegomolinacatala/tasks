import AppIntents
import SwiftUI
import WidgetKit

/**
 * El micrófono: un toque abre Tasks ya escuchando, para dictar una tarea sin buscar nada. En la
 * pantalla de inicio (pequeño), en la de bloqueo (redondo, rectangular y en línea) y, con iOS 18,
 * como control (`DictateControl`): en el centro de control, en los dos botones de abajo de la
 * pantalla de bloqueo (en lugar de la linterna o la cámara) y en el botón de acción.
 *
 * iOS no deja escuchar desde el propio widget: el micrófono solo se abre con la app delante. Así que
 * el widget abre la app (con Face ID por medio si el iPhone está bloqueado) y la barra de escribir
 * empieza a grabar sola (`<esquema>://dictate` → `SceneDelegate` → `NativeActions` → `dictate`).
 */
struct DictateWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetStore.dictateKind, provider: DictateProvider()) { entry in
            DictateWidgetView(entry: entry)
                .containerBackground(for: .widget) { Palette.background }
        }
        .configurationDisplayName(WidgetText.current.dictateName)
        .description(WidgetText.current.dictateDescription)
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct DictateEntry: TimelineEntry {
    let date: Date
    var text = WidgetText.current
}

/** No cambia con el tiempo: una sola entrada, que se rehace cuando la app escribe la foto (el idioma). */
struct DictateProvider: TimelineProvider {
    func placeholder(in context: Context) -> DictateEntry {
        DictateEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (DictateEntry) -> Void) {
        completion(DictateEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DictateEntry>) -> Void) {
        completion(Timeline(entries: [DictateEntry(date: Date())], policy: .never))
    }
}

struct DictateWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var colorScheme
    let entry: DictateEntry

    var body: some View {
        content
            .widgetURL(WidgetLink.dictate)
            .environment(\.colorScheme, lockScreen ? .dark : colorScheme)
            .environment(\.widgetText, entry.text)
    }

    /** En la pantalla de bloqueo, la paleta de noche (como el widget de hoy). */
    private var lockScreen: Bool {
        family == .accessoryCircular || family == .accessoryRectangular || family == .accessoryInline
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryCircular:
            DictateCircular()
        case .accessoryRectangular:
            DictateRectangular()
        case .accessoryInline:
            DictateInline()
        default:
            DictateSmall()
        }
    }
}

/** Pantalla de bloqueo, redondo: el micrófono en su aro. */
struct DictateCircular: View {
    @Environment(\.widgetText) var text

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            Image(systemName: "mic.fill")
                .font(.system(size: 22, weight: .medium))
                .widgetAccentable()
        }
        .accessibilityLabel(Text(verbatim: text.dictate))
    }
}

/** Pantalla de bloqueo, rectangular: el micrófono y qué hace. */
struct DictateRectangular: View {
    @Environment(\.widgetText) var text

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "mic.fill")
                .font(.system(size: 24, weight: .medium))
                .widgetAccentable()
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: text.dictate)
                    .font(.headline)
                    .lineLimit(1)
                Text(verbatim: text.dictateHint)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/** Pantalla de bloqueo, en línea (encima del reloj). */
struct DictateInline: View {
    @Environment(\.widgetText) var text

    var body: some View {
        Label(text.dictate, systemImage: "mic.fill")
    }
}

/** Pantalla de inicio: el micrófono grande en un sello de coñac, sobre el papel. */
struct DictateSmall: View {
    @Environment(\.widgetText) var text

    var body: some View {
        VStack(spacing: 0) {
            Text(verbatim: text.dictateCaps)
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.4)
                .foregroundStyle(Palette.accent)
                .frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 0)
            ZStack {
                Circle()
                    .fill(Palette.accentDim)
                Circle()
                    .strokeBorder(Palette.accent.opacity(0.35), lineWidth: 1)
                Image(systemName: "mic.fill")
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(Palette.accent)
            }
            .frame(width: 72, height: 72)
            .widgetAccentable()
            Spacer(minLength: 0)
            Text(verbatim: text.dictateHint)
                .font(.system(size: 13))
                .foregroundStyle(Palette.text3)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: text.dictate))
    }
}

// MARK: - Control (iOS 18)

/**
 * El mismo micrófono como control: en el centro de control, en los dos botones de abajo de la
 * pantalla de bloqueo (Ajustes → Fondo de pantalla → Personalizar) y en el botón de acción. Un
 * toque abre la app escuchando; con el iPhone bloqueado, iOS lo desbloquea antes con Face ID.
 */
@available(iOS 18.0, *)
struct DictateControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: WidgetStore.dictateControlKind) {
            ControlWidgetButton(action: DictateIntent()) {
                Label("Dictar tarea", systemImage: "mic.fill")
            }
        }
        .displayName("Dictar en Tasks")
        .description("Abre Tasks escuchando: di la tarea y listo.")
    }
}

// El intent del control (`DictateIntent`) va en `DictateIntent.swift`, compilado en la app y en el widget.
