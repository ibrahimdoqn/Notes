package com.camnotlar.app.data.prefs

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/** Cihazlar arası eşitlenen görünüm ayarları (packages/shared/src/settings.ts ile aynı). */
@Serializable
data class Prefs(
    val mode: String = "auto",
    val from: String = "20:00",
    val to: String = "07:00",
    val oled: Boolean = false,
    val theme: String = "amber",
    val glass: String = "bal",
    val motion: Boolean = true,
    val font: String = "sys",
    val size: String = "m",
    val sort: String = "up",
    val group: Boolean = true,
    val preview: Boolean = true,
) {
    companion object {
        val MODES = listOf("auto", "light", "dark", "sched")
        val THEMES = listOf("amber", "ocean", "forest", "rose", "lav", "graphite")
        val GLASS = listOf("mat", "bal", "clear")
        val FONTS = listOf("sys", "serif", "mono")
        val SIZES = listOf("s", "m", "l")
        val SORTS = listOf("up", "cr", "ttl")
        private val TIME = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")
        private val json = Json { ignoreUnknownKeys = true }

        /** Bilinmeyen anahtarları atar, geçersiz değerleri varsayılana çeker. */
        fun normalize(o: JsonObject?): Prefs {
            val d = Prefs()
            if (o == null) return d
            fun str(k: String, allowed: List<String>, def: String) =
                o[k]?.jsonPrimitive?.contentOrNull?.takeIf { it in allowed } ?: def
            fun time(k: String, def: String) = o[k]?.jsonPrimitive?.contentOrNull?.takeIf { TIME.matches(it) } ?: def
            fun bool(k: String, def: Boolean) = runCatching { o[k]?.jsonPrimitive?.booleanOrNull }.getOrNull() ?: def
            return Prefs(
                mode = str("mode", MODES, d.mode), from = time("from", d.from), to = time("to", d.to),
                oled = bool("oled", d.oled), theme = str("theme", THEMES, d.theme), glass = str("glass", GLASS, d.glass),
                motion = bool("motion", d.motion), font = str("font", FONTS, d.font), size = str("size", SIZES, d.size),
                sort = str("sort", SORTS, d.sort), group = bool("group", d.group), preview = bool("preview", d.preview),
            )
        }

        fun parse(s: String?): Prefs = if (s == null) Prefs() else runCatching { normalize(json.parseToJsonElement(s) as JsonObject) }.getOrDefault(Prefs())
    }
}
