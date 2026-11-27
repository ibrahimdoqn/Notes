package com.camnotlar.app.data

/**
 * packages/shared/src/html.ts içindeki htmlToPlain / noteMeta işlevlerinin Kotlin karşılığı.
 * Liste başlığı ve önizleme metni çevrimdışıyken de web ile aynı çıksın diye kullanılır.
 * (Asıl temizleme sunucuda yapılır.)
 */
object Html {
    private val DROP = Regex("<(script|style|iframe|object|template|noscript|svg|math|head|title|textarea|select)\\b[\\s\\S]*?</\\1\\s*>", RegexOption.IGNORE_CASE)
    private val COMMENT = Regex("<!--[\\s\\S]*?(-->|$)")
    private val BLOCK_END = Regex("<br\\b[^>]*>|</(div|h[1-6]|ul|ol|li|p|section|article|blockquote|pre|header|footer)\\s*>", RegexOption.IGNORE_CASE)
    private val TAG = Regex("</?[a-zA-Z][^>]*>|<![^>]*>")
    private val ENTITY = Regex("&(#\\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});")
    private val NAMED = mapOf(
        "amp" to "&", "lt" to "<", "gt" to ">", "quot" to "\"", "apos" to "'", "nbsp" to " ", "hellip" to "…",
        "mdash" to "—", "ndash" to "–", "lsquo" to "‘", "rsquo" to "’", "ldquo" to "“", "rdquo" to "”",
        "laquo" to "«", "raquo" to "»", "middot" to "·", "bull" to "•", "copy" to "©", "reg" to "®", "trade" to "™", "deg" to "°",
    )

    fun decodeEntities(s: String): String = ENTITY.replace(s) { m ->
        val e = m.groupValues[1]
        when {
            e.startsWith("#x") || e.startsWith("#X") -> codePoint(e.substring(2).toIntOrNull(16))
            e.startsWith("#") -> codePoint(e.substring(1).toIntOrNull())
            else -> NAMED[e.lowercase()] ?: m.value
        }
    }

    private fun codePoint(cp: Int?): String =
        if (cp != null && cp in 1..0x10FFFF && cp !in 0xD800..0xDFFF) String(Character.toChars(cp)) else "�"

    fun toPlain(html: String): String {
        var s = COMMENT.replace(html, "")
        s = DROP.replace(s, "")
        s = BLOCK_END.replace(s) { it.value + "\n" }
        s = TAG.replace(s, "")
        return decodeEntities(s).replace(' ', ' ')
    }

    data class Meta(val title: String, val snippet: String, val plain: String, val words: Int)

    fun meta(html: String): Meta {
        val lines = toPlain(html).split('\n').map { it.trim() }.filter { it.isNotEmpty() }
        val title = (lines.firstOrNull() ?: "Yeni Not").take(120)
        val snippet = lines.drop(1).joinToString(" ").take(140).ifEmpty { "Ek metin yok" }
        val words = lines.joinToString(" ").split(Regex("\\s+")).count { it.isNotEmpty() }
        return Meta(title, snippet, lines.joinToString("\n"), words)
    }

    fun isBlank(html: String) = toPlain(html).isBlank()

    fun escape(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")

    /** Düz metinden (paylaş menüsü) sözleşmeye uygun not HTML'i. */
    fun fromPlainText(text: String): String =
        text.trim().split('\n').joinToString("") { line -> if (line.isBlank()) "<div><br></div>" else "<div>${escape(line)}</div>" }
            .ifEmpty { "<div><br></div>" }
}
