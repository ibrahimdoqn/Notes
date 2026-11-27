package com.camnotlar.app.ui.common

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Web'deki lib/format.ts ile aynı Türkçe tarih biçimleri. */
object Format {
    private val tr = Locale.forLanguageTag("tr-TR")
    private const val D = 86_400_000L

    private fun startOfDay(t: Long): Long = Calendar.getInstance().apply {
        timeInMillis = t
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    private fun ago(t: Long) = ((startOfDay(System.currentTimeMillis()) - startOfDay(t)) / D.toDouble()).let { Math.round(it).toInt() }
    private fun fmt(p: String, t: Long) = SimpleDateFormat(p, tr).format(Date(t))

    fun group(t: Long): String {
        val d = ago(t)
        return when {
            d < 1 -> "Bugün"
            d < 2 -> "Dün"
            d < 7 -> "Önceki 7 gün"
            d < 30 -> "Önceki 30 gün"
            else -> fmt("LLLL yyyy", t).replaceFirstChar { it.titlecase(tr) }
        }
    }

    fun short(t: Long): String {
        val d = ago(t)
        return when {
            d < 1 -> fmt("HH:mm", t)
            d < 2 -> "Dün"
            d < 7 -> fmt("EEEE", t).replaceFirstChar { it.titlecase(tr) }
            else -> fmt("d MMM yyyy", t)
        }
    }

    fun long(t: Long): String = fmt("d MMMM yyyy HH:mm", t)

    fun rel(t: Long): String {
        val s = (System.currentTimeMillis() - t) / 1000
        return when {
            s < 45 -> "şimdi"
            s < 3600 -> "${Math.round(s / 60.0)} dk önce"
            s < 12 * 3600 -> fmt("HH:mm", t)
            else -> short(t)
        }
    }
}
