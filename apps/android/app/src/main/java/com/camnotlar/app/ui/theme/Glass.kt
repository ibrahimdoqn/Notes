package com.camnotlar.app.ui.theme

import android.os.Build
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.max

/**
 * Arka plandaki yavaşça kayan üç renkli ışık (web'deki .bg). Işıklar zaten yumuşak radyal
 * geçişlerdir; Android 12+ cihazlarda üstüne gerçek bulanıklık eklenir, eskilerde düz kalır.
 */
@Composable
fun GlassBackground(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val c = Cam.colors
    val t = if (c.motion) {
        rememberInfiniteTransition(label = "drift").animateFloat(
            0f, 1f, infiniteRepeatable(tween(26_000, easing = LinearEasing), RepeatMode.Reverse), label = "t",
        ).value
    } else 0f
    Box(modifier.fillMaxSize().background(c.bg)) {
        Canvas(
            Modifier.fillMaxSize().let { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) it.blur(40.dp) else it },
        ) {
            val m = max(size.width, size.height)
            val shift = Offset(0.06f * m * t, 0.05f * m * t)
            fun blob(color: Color, center: Offset, r: Float, a: Float) = drawCircle(
                Brush.radialGradient(listOf(color.copy(alpha = a), color.copy(alpha = 0f)), center + shift, r), r, center + shift,
            )
            blob(c.b1, Offset(0.1f * size.width, 0.05f * size.height), 0.55f * m, 0.85f)
            blob(c.b2, Offset(0.95f * size.width, 0.95f * size.height), 0.5f * m, 0.85f)
            blob(c.b3, Offset(0.65f * size.width, 0.0f), 0.38f * m, 0.6f)
            if (c.dark && c.bg == Color.Black) drawRect(Color.Black.copy(alpha = 0.62f))
        }
        content()
    }
}

/** Buzlu cam yüzey: yarı saydam dolgu + ince kenar. */
fun Modifier.glass(color: Color, line: Color, shape: Shape = RoundedCornerShape(22.dp), border: Dp = 1.dp): Modifier =
    this.clip(shape).background(color, shape).border(border, line, shape)
