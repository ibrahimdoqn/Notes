package com.camnotlar.app.ui.editor

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.camnotlar.app.data.Html
import com.camnotlar.app.data.db.NoteEntity
import com.camnotlar.app.data.net.RevisionDto
import com.camnotlar.app.ui.MainViewModel
import com.camnotlar.app.ui.common.Format
import com.camnotlar.app.ui.theme.Cam

/** Not geçmişi: sunucudaki sürümler listelenir, seçilen sürümün metni gösterilir ve geri yüklenebilir. */
@Composable
fun HistorySheet(vm: MainViewModel, note: NoteEntity, onClose: () -> Unit) {
    val c = Cam.colors
    var revs by remember { mutableStateOf<List<RevisionDto>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var sel by remember { mutableIntStateOf(0) }
    LaunchedEffect(note.id) {
        vm.revisions(note.id).onSuccess { revs = it }.onFailure { error = it.message ?: "Geçmiş yüklenemedi (çevrimdışı olabilirsin)." }
    }
    val list = revs
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Not geçmişi") },
        text = {
            Column {
                when {
                    error != null -> Text(error ?: "", color = c.sub)
                    list == null -> Text("Yükleniyor…", color = c.sub)
                    list.isEmpty() -> Text("Bu not için kayıtlı sürüm yok.", color = c.sub)
                    else -> {
                        LazyColumn(Modifier.heightIn(max = 220.dp)) {
                            itemsIndexed(list) { i, r ->
                                Column(
                                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(if (i == sel) c.sel else Color.Transparent)
                                        .clickable { sel = i }.padding(horizontal = 10.dp, vertical = 8.dp),
                                ) {
                                    Text(if (i == 0) "Güncel sürüm" else "Sürüm ${r.version}", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                    Text(Format.long(r.createdAt) + (r.deviceName?.let { " · $it" } ?: ""), color = c.sub, fontSize = 12.sp)
                                }
                            }
                        }
                        list.getOrNull(sel)?.let { r ->
                            Text(
                                Html.meta(r.html).plain, color = c.ink, fontSize = 14.sp, maxLines = 12,
                                modifier = Modifier.padding(top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(c.line).padding(10.dp),
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            val r = list?.getOrNull(sel)
            TextButton(onClick = {
                if (r != null) vm.restoreRevision(note, r)
                onClose()
            }, enabled = r != null && sel > 0 && r.html != note.html) { Text("Bu sürümü geri yükle") }
        },
        dismissButton = { TextButton(onClose) { Text("Kapat") } },
        containerColor = c.glass2.copy(alpha = 0.97f),
    )
}
