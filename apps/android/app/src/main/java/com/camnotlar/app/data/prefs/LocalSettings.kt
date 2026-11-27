package com.camnotlar.app.data.prefs

import android.content.Context

/** Yalnızca bu cihaza ait ayarlar (sunucuyla eşitlenmez). */
object LocalSettings {
    private fun p(ctx: Context) = ctx.getSharedPreferences("camnotlar.local", Context.MODE_PRIVATE)
    fun biometric(ctx: Context) = p(ctx).getBoolean("biometric", false)
    fun setBiometric(ctx: Context, v: Boolean) = p(ctx).edit().putBoolean("biometric", v).apply()
    fun syncMinutes(ctx: Context) = p(ctx).getInt("syncMinutes", 15)
    fun setSyncMinutes(ctx: Context, v: Int) = p(ctx).edit().putInt("syncMinutes", v).apply()
}
