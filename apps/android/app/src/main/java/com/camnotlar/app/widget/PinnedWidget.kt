package com.camnotlar.app.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.camnotlar.app.CamApp
import com.camnotlar.app.MainActivity

/** Ana ekran widget'ı: sabitlenmiş notlar ve "Yeni not" düğmesi. */
class PinnedWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val notes = (context.applicationContext as CamApp).container.db.notes().pinned(5)
        provideContent {
            Content(context, notes.map { it.id to it.title })
        }
    }

    @Composable
    private fun Content(context: Context, notes: List<Pair<String, String>>) {
        val ink = ColorProvider(Color(0xFF1C1C1E))
        val sub = ColorProvider(Color(0xFF6E6E73))
        Column(GlanceModifier.fillMaxSize().background(Color(0xE6FFFBF2)).cornerRadius(22.dp).padding(14.dp)) {
            Row(GlanceModifier.fillMaxWidth()) {
                Text("Sabitlenmiş", style = TextStyle(color = sub, fontSize = 13.sp, fontWeight = FontWeight.Medium), modifier = GlanceModifier.defaultWeight())
                Text(
                    "+ Yeni not",
                    style = TextStyle(color = ColorProvider(Color(0xFFA37400)), fontSize = 14.sp, fontWeight = FontWeight.Bold),
                    modifier = GlanceModifier.clickable(actionStartActivity(Intent(context, MainActivity::class.java).setAction(MainActivity.ACTION_NEW_NOTE))),
                )
            }
            Spacer(GlanceModifier.height(8.dp))
            if (notes.isEmpty()) Text("Sabitlenmiş not yok", style = TextStyle(color = sub, fontSize = 14.sp))
            notes.forEach { (id, title) ->
                Text(
                    title, maxLines = 1,
                    style = TextStyle(color = ink, fontSize = 15.sp, fontWeight = FontWeight.Medium),
                    modifier = GlanceModifier.fillMaxWidth().padding(vertical = 5.dp).clickable(
                        actionStartActivity(Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_NOTE_ID, id).setAction("open:$id")),
                    ),
                )
            }
        }
    }
}

class PinnedWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = PinnedWidget()
}
