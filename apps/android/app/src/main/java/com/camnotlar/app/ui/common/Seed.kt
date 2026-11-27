package com.camnotlar.app.ui.common

import com.camnotlar.app.data.db.FolderEntity
import com.camnotlar.app.data.repo.NotesRepository

/** Sunucusuz ilk açılışta örnek notlar (web'deki store/seed.ts ile aynı içerik). */
object Seed {
    private const val H = 3_600_000L
    private const val D = 86_400_000L

    suspend fun build(repo: NotesRepository): Int {
        val now = System.currentTimeMillis()
        val folders = listOf("Notlar", "İş", "Kişisel", "Tarifler").map { repo.makeFolder(it) }
        val (notlar, isF, kisisel, tarif) = folders
        val items = listOf<Triple<FolderEntity, Long, String>>(
            Triple(notlar, now - 5 * 60_000, "<div>Cam Notlar’a hoş geldin</div><div>Notların otomatik kaydedilir; ilk satır her zaman başlık olur.</div><ul class=\"check\"><li class=\"done\">Yeni not oluştur</li><li>Bir maddeyi işaretlemek için daireye dokun</li><li>Notu sabitle, klasöre taşı ya da sil</li></ul><div>Buradaki notlar örnektir, silebilirsin.</div>"),
            Triple(isF, now - 2 * H, "<div>Haftalık ürün toplantısı</div><h2>Gündem</h2><ol><li>Kasım metrikleri</li><li>Mobil sürüm 2.4 yayın planı</li><li>Destek talepleri</li></ol><h2>Aksiyonlar</h2><ul class=\"check\"><li class=\"done\">Sunumu ekiple paylaş</li><li>Beta test listesini güncelle</li><li>Cuma demo saatini netleştir</li></ul>"),
            Triple(kisisel, now - D - 3 * H, "<div>Hafta sonu Kapadokya</div><div>Cumartesi sabah balon turu için 04:30’da kalkış.</div><ul><li>Göreme Açık Hava Müzesi</li><li>Uçhisar Kalesi’nde gün batımı</li><li>Avanos’ta çömlek atölyesi</li></ul>"),
            Triple(tarif, now - 3 * D, "<div>Mercimek çorbası</div><div>4 kişilik · 35 dakika</div><h2>Malzemeler</h2><ul class=\"check\"><li>1 su bardağı kırmızı mercimek</li><li>1 kuru soğan, 1 havuç</li><li>1 yemek kaşığı salça</li><li>6 su bardağı sıcak su</li></ul><h2>Yapılışı</h2><ol><li>Soğan ve havucu tereyağında kavur.</li><li>Salça ve mercimeği ekle, suyu dök.</li><li>25 dakika pişir, blenderdan geçir.</li></ol>"),
            Triple(notlar, now - 6 * D, "<div>Okunacak kitaplar</div><ul class=\"check\"><li class=\"done\">Kürk Mantolu Madonna</li><li>Saatleri Ayarlama Enstitüsü</li><li>Tutunamayanlar</li></ul>"),
        )
        items.forEachIndexed { i, (f, t, html) ->
            val n = repo.newNote(f.id, pinned = i == 0, html = html)
            repo.saveNote(n.copy(createdAt = t, updatedAt = t))
        }
        return items.size
    }
}
