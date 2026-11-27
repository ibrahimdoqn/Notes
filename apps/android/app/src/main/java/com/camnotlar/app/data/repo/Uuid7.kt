package com.camnotlar.app.data.repo

import java.security.SecureRandom

/** UUIDv7: zamana göre sıralı, çevrimdışı üretilebilen kimlik (packages/shared/src/uuid.ts ile aynı düzen). */
object Uuid7 {
    private val rnd = SecureRandom()
    private var lastMs = 0L
    private var seq = 0

    @Synchronized
    fun next(nowMs: Long = System.currentTimeMillis()): String {
        val b = ByteArray(16).also { rnd.nextBytes(it) }
        var now = nowMs
        if (now <= lastMs) {
            seq++
            if (seq > 0xfff) {
                lastMs++
                seq = 0
            }
            now = lastMs
        } else {
            lastMs = now
            seq = (b[6].toInt() shl 3) and 0x7ff
        }
        var ms = now
        for (i in 5 downTo 0) {
            b[i] = (ms and 0xff).toByte()
            ms = ms shr 8
        }
        b[6] = (0x70 or (seq shr 8)).toByte()
        b[7] = (seq and 0xff).toByte()
        b[8] = (0x80 or (b[8].toInt() and 0x3f)).toByte()
        val h = b.joinToString("") { "%02x".format(it) }
        return "${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}"
    }
}
