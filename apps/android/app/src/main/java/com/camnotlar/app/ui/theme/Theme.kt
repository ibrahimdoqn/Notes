package com.camnotlar.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.camnotlar.app.data.prefs.Prefs
import kotlinx.coroutines.delay
import java.util.Calendar

/** Web'deki CSS değişkenlerinin (tokens.css) karşılığı. */
@Immutable
data class CamColors(
    val dark: Boolean,
    val bg: Color,
    val ink: Color,
    val sub: Color,
    val line: Color,
    val glass: Color,
    val glass2: Color,
    val acc: Color,
    val accInk: Color,
    val accOn: Color,
    val sel: Color,
    val hl: Color,
    val red: Color,
    val b1: Color,
    val b2: Color,
    val b3: Color,
    val motion: Boolean,
    val editorFont: FontFamily,
    val editorSize: TextUnit,
    val preview: Boolean,
)

private data class Accent(
    val acc: Long, val inkL: Long, val inkD: Long, val selL: Color, val selD: Color, val hl: Long, val on: Long,
    val b1L: Long, val b1D: Long, val b2L: Long, val b2D: Long, val b3L: Long, val b3D: Long,
)

private fun c(v: Long) = Color(v or 0xFF000000)

private val ACCENTS = mapOf(
    "amber" to Accent(0xe8a900, 0xa37400, 0xffcc40, Color(0x33e8a900), Color(0x2effcc40), 0xf6c43c, 0x1c1c1e, 0xffc94d, 0x8a5a00, 0xff9d7e, 0x7a2f22, 0x8fd0ff, 0x123f66),
    "ocean" to Accent(0x0a84ff, 0x0062cc, 0x64b5ff, Color(0x290a84ff), Color(0x3d0a84ff), 0xa9d4ff, 0xffffff, 0x7cc4ff, 0x0b3a6b, 0x9eefdf, 0x0d4a44, 0xbcd6ff, 0x1a2f66),
    "forest" to Accent(0x30b15b, 0x1d7a3c, 0x62d68e, Color(0x2930b15b), Color(0x3d30b15b), 0xb2e8c2, 0x1c1c1e, 0xa6e3a1, 0x16432a, 0xffe08a, 0x4a3a0c, 0x8fd6c8, 0x0f3d38),
    "rose" to Accent(0xff4f7b, 0xc42a55, 0xff86a5, Color(0x26ff4f7b), Color(0x38ff4f7b), 0xffbccd, 0xffffff, 0xffb3c6, 0x5c1a2c, 0xffcf9e, 0x5a2e12, 0xffd9e8, 0x3d1730),
    "lav" to Accent(0x8e6cf0, 0x5e3fc9, 0xbba5ff, Color(0x298e6cf0), Color(0x428e6cf0), 0xd3c6ff, 0xffffff, 0xc9b8ff, 0x2e2366, 0xffc2e0, 0x4d1d3d, 0xa8d8ff, 0x173a5c),
    "graphite" to Accent(0x8e8e93, 0x3a3a3c, 0xd1d1d6, Color(0x14000000), Color(0x1fffffff), 0xd6d6db, 0xffffff, 0xdcdce1, 0x2a2a30, 0xc9ccd3, 0x1f2228, 0xe8e3da, 0x2b2924),
)

private fun minutes(s: String) = s.split(":").let { (it.getOrNull(0)?.toIntOrNull() ?: 0) * 60 + (it.getOrNull(1)?.toIntOrNull() ?: 0) }

fun isNight(p: Prefs, cal: Calendar = Calendar.getInstance()): Boolean {
    val m = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    val a = minutes(p.from)
    val b = minutes(p.to)
    return if (a <= b) m in a until b else m >= a || m < b
}

fun camColors(p: Prefs, dark: Boolean): CamColors {
    val a = ACCENTS[p.theme] ?: ACCENTS.getValue("amber")
    val ga = when (p.glass) { "mat" -> 0.84f; "clear" -> 0.26f; else -> 0.52f }
    val oled = dark && p.oled
    return CamColors(
        dark = dark,
        bg = if (dark) (if (oled) Color.Black else Color(0xFF0B0C10)) else Color(0xFFF4EFE4),
        ink = if (dark) Color(0xFFF2F2F7) else Color(0xFF1C1C1E),
        sub = if (dark) Color(0xFF98989F) else Color(0xFF6E6E73),
        line = if (dark) Color.White.copy(alpha = 0.09f) else Color.Black.copy(alpha = 0.08f),
        glass = if (dark) (if (oled) Color.Black.copy(alpha = (ga + 0.2f).coerceAtMost(1f)) else Color(0xFF1C1C22).copy(alpha = ga)) else Color.White.copy(alpha = ga),
        glass2 = if (dark) (if (oled) Color(0xFF121214) else Color(0xFF2C2C34)).copy(alpha = (ga + 0.1f).coerceAtMost(1f)) else Color.White.copy(alpha = (ga + 0.18f).coerceAtMost(1f)),
        acc = c(a.acc),
        accInk = c(if (dark) a.inkD else a.inkL),
        accOn = c(a.on),
        sel = if (dark) a.selD else a.selL,
        hl = c(a.hl),
        red = Color(0xFFFF3B30),
        b1 = c(if (dark) a.b1D else a.b1L).let { if (oled) it.copy(alpha = 0.4f) else it },
        b2 = c(if (dark) a.b2D else a.b2L).let { if (oled) it.copy(alpha = 0.4f) else it },
        b3 = c(if (dark) a.b3D else a.b3L).let { if (oled) it.copy(alpha = 0.4f) else it },
        motion = p.motion,
        editorFont = when (p.font) { "serif" -> FontFamily.Serif; "mono" -> FontFamily.Monospace; else -> FontFamily.Default },
        editorSize = when (p.size) { "s" -> 15.sp; "l" -> 20.sp; else -> 17.sp },
        preview = p.preview,
    )
}

val LocalCam = staticCompositionLocalOf { camColors(Prefs(), false) }

object Cam {
    val colors: CamColors @Composable get() = LocalCam.current
}

@Composable
fun resolveDark(p: Prefs): Boolean {
    val system = isSystemInDarkTheme()
    // Zamanlı modda dakikada bir yeniden değerlendirilir.
    var tick by remember { mutableLongStateOf(0L) }
    LaunchedEffect(p.mode) {
        while (p.mode == "sched") {
            delay(60_000)
            tick++
        }
    }
    return when (p.mode) {
        "light" -> false
        "dark" -> true
        "sched" -> tick >= 0 && isNight(p)
        else -> system
    }
}

@Composable
fun CamTheme(prefs: Prefs, content: @Composable () -> Unit) {
    val dark = resolveDark(prefs)
    val cc = camColors(prefs, dark)
    val scheme = if (dark) {
        darkColorScheme(primary = cc.acc, onPrimary = cc.accOn, background = cc.bg, surface = cc.glass2, onSurface = cc.ink, onBackground = cc.ink, error = cc.red)
    } else {
        lightColorScheme(primary = cc.acc, onPrimary = cc.accOn, background = cc.bg, surface = cc.glass2, onSurface = cc.ink, onBackground = cc.ink, error = cc.red)
    }
    CompositionLocalProvider(LocalCam provides cc) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
