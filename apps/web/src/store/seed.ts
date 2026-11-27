import { uuidv7, type Folder, type Note } from '@camnotlar/shared';

const H = 36e5;
const D = 864e5;

/** Sunucusuz ilk açılışta gösterilen örnek notlar (prototiptekilerle aynı). */
export function seed(now = Date.now()): { folders: Folder[]; notes: Note[] } {
  const mk = (name: string, i: number): Folder => ({ id: uuidv7(), name, sortOrder: i, version: 0, updatedAt: now });
  const [notlar, is, kisisel, tarif] = [mk('Notlar', 0), mk('İş', 1), mk('Kişisel', 2), mk('Tarifler', 3)] as Folder[] as [Folder, Folder, Folder, Folder];
  const list: [Folder, number, string, boolean?][] = [
    [notlar, now - 5 * 6e4, '<div>Cam Notlar’a hoş geldin</div><div>Notların otomatik kaydedilir; ilk satır her zaman başlık olur.</div><ul class="check"><li class="done">Yeni not oluştur (Alt+N)</li><li>Bir maddeyi işaretlemek için daireye dokun</li><li>Notu sabitle, klasöre taşı ya da sil</li></ul><div>Mobilde klasörler, liste ve not arasında geri okuyla gezinebilirsin. Buradaki notlar örnektir, silebilirsin.</div>', true],
    [is, now - 2 * H, '<div>Haftalık ürün toplantısı</div><h2>Gündem</h2><ol><li>Kasım metrikleri</li><li>Mobil sürüm 2.4 yayın planı</li><li>Destek talepleri</li></ol><h2>Aksiyonlar</h2><ul class="check"><li class="done">Sunumu ekiple paylaş</li><li>Beta test listesini güncelle</li><li>Cuma demo saatini netleştir</li></ul>'],
    [kisisel, now - D - 3 * H, '<div>Hafta sonu Kapadokya</div><div>Cumartesi sabah balon turu için 04:30’da kalkış.</div><ul><li>Göreme Açık Hava Müzesi</li><li>Uçhisar Kalesi’nde gün batımı</li><li>Avanos’ta çömlek atölyesi</li></ul>'],
    [tarif, now - 3 * D, '<div>Mercimek çorbası</div><div>4 kişilik · 35 dakika</div><h2>Malzemeler</h2><ul class="check"><li>1 su bardağı kırmızı mercimek</li><li>1 kuru soğan, 1 havuç</li><li>1 yemek kaşığı salça</li><li>6 su bardağı sıcak su</li></ul><h2>Yapılışı</h2><ol><li>Soğan ve havucu tereyağında kavur.</li><li>Salça ve mercimeği ekle, suyu dök.</li><li>25 dakika pişir, blenderdan geçir.</li></ol>'],
    [notlar, now - 6 * D, '<div>Okunacak kitaplar</div><ul class="check"><li class="done">Kürk Mantolu Madonna</li><li>Saatleri Ayarlama Enstitüsü</li><li>Tutunamayanlar</li></ul>'],
    [is, now - 12 * D, '<div>Tasarım fikirleri</div><div>Cam yüzeylerde metin kontrastı için zemini en az %55 opak tut. Geçişleri 400 ms altında tut, yay eğrisi kullan.</div>'],
    [kisisel, now - 40 * D, '<div>Hediye listesi</div><ul><li>Annem: seramik kupa seti</li><li>Ece: analog fotoğraf makinesi</li></ul>'],
  ];
  const notes = list.map(([f, t, html, pin]): Note => ({
    id: uuidv7(t), folderId: f.id, html, title: '', snippet: '', pinned: !!pin, createdAt: t, updatedAt: t, trashedAt: null, version: 0,
  }));
  return { folders: [notlar, is, kisisel, tarif], notes };
}
