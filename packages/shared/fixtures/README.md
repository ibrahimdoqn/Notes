# HTML sözleşmesi örnekleri

Bu klasördeki her `.html` dosyası sözleşmeye tam uyan bir not içeriğidir.
Web, sunucu ve Android testleri şu kuralı doğrular:

- `sanitizeNoteHtml(x) === x` (geçerli içerik temizlemede değişmez)
- Android editörüne yüklenip geri alınan HTML birebir aynı kalır.

`dirty/` altındaki dosyalar ise beklenen temiz çıktılarıyla (`*.expected.html`) eşleşir.
