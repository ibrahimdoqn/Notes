package com.camnotlar.app

import com.camnotlar.app.data.Html
import com.camnotlar.app.data.prefs.Prefs
import com.camnotlar.app.data.repo.Uuid7
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Ortak HTML sözleşmesi örnekleri (packages/shared/fixtures) ile web'deki noteMeta aynı sonucu vermeli. */
class HtmlTest {
    private fun fixture(name: String) = javaClass.classLoader!!.getResource(name)!!.readText().trim()

    @Test
    fun basicFixtureMeta() {
        val m = Html.meta(fixture("basic.html"))
        assertEquals("Haftalık ürün toplantısı", m.title)
        assertEquals("Gündem Kasım metrikleri Mobil sürüm 2.4 yayın planı", m.snippet)
    }

    @Test
    fun checklistFixtureMeta() {
        val m = Html.meta(fixture("checklist.html"))
        assertEquals("Okunacak kitaplar", m.title)
        assertEquals("Kürk Mantolu Madonna Saatleri Ayarlama Enstitüsü Tutunamayanlar", m.snippet)
    }

    @Test
    fun entitiesAndBlank() {
        assertEquals("A & B < C", Html.meta(fixture("inline.html")).plain.lines().last())
        assertEquals("Yeni Not", Html.meta("<div><br></div>").title)
        assertTrue(Html.isBlank("<div><br></div><script>alert(1)</script>"))
    }

    @Test
    fun plainTextToHtml() {
        assertEquals("<div>Alışveriş</div><div>süt &amp; ekmek</div>", Html.fromPlainText("Alışveriş\nsüt & ekmek"))
    }

    @Test
    fun prefsNormalize() {
        val o = Json.parseToJsonElement("""{"theme":"rose","mode":"zzz","from":"25:00","oled":"evet","x":1}""") as JsonObject
        val p = Prefs.normalize(o)
        assertEquals("rose", p.theme)
        assertEquals("auto", p.mode)
        assertEquals("20:00", p.from)
        assertEquals(false, p.oled)
    }

    @Test
    fun uuid7SortedAndValid() {
        val ids = List(500) { Uuid7.next() }
        assertEquals(ids.sorted(), ids)
        assertTrue(ids.all { Regex("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$").matches(it) })
    }
}
