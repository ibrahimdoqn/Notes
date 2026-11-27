package com.camnotlar.app.ui.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.automirrored.outlined.StickyNote2
import androidx.compose.material.icons.rounded.EditNote
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.camnotlar.app.data.db.NoteEntity
import com.camnotlar.app.data.sync.SyncState
import com.camnotlar.app.ui.MainViewModel
import com.camnotlar.app.ui.Views
import com.camnotlar.app.ui.common.Caption
import com.camnotlar.app.ui.common.Divider
import com.camnotlar.app.ui.common.Format
import com.camnotlar.app.ui.common.GroupCard
import com.camnotlar.app.ui.common.Hint
import com.camnotlar.app.ui.common.IconBtn
import com.camnotlar.app.ui.common.LargeTitle
import com.camnotlar.app.ui.common.SearchField
import com.camnotlar.app.ui.common.TopBar
import com.camnotlar.app.ui.inView
import com.camnotlar.app.ui.theme.Cam
import com.camnotlar.app.ui.theme.resolveDark
import kotlinx.coroutines.delay

fun viewName(v: String, folders: Map<String, String>) = when (v) {
    Views.ALL -> "Tüm Notlar"
    Views.PINNED -> "Sabitlenmiş"
    Views.TRASH -> "Son Silinenler"
    else -> folders[v] ?: "Notlar"
}

@Composable
fun NotesScreen(
    vm: MainViewModel, view: String, selected: String?, showBack: Boolean,
    onBack: () -> Unit, onOpen: (String) -> Unit, onNew: () -> Unit, onSettings: () -> Unit,
) {
    val notes by vm.notes.collectAsState()
    val folders by vm.folders.collectAsState()
    val prefs by vm.prefs.collectAsState()
    var q by rememberSaveable { mutableStateOf("") }
    val names = folders.associate { it.id to it.name }
    val key: (NoteEntity) -> Long = if (prefs.sort == "cr") ({ it.createdAt }) else ({ it.updatedAt })
    val query = q.trim().lowercase()
    val list = notes.filter { inView(it, view) && (query.isEmpty() || it.plain.lowercase().contains(query)) }
        .let { l -> if (prefs.sort == "ttl") l.sortedBy { it.title.lowercase() } else l.sortedByDescending(key) }
    val pins = if (view == Views.TRASH || view == Views.PINNED) emptyList() else list.filter { it.pinned }
    val byDate = prefs.group && prefs.sort != "ttl"
    val groups = buildList<Pair<String, List<NoteEntity>>> {
        if (pins.isNotEmpty()) add("Sabitlenmiş" to pins)
        val rest = list.filter { it !in pins }
        if (byDate) rest.groupBy { Format.group(key(it)) }.forEach { (g, l) -> add(g to l) }
        else if (rest.isNotEmpty()) add((if (pins.isNotEmpty()) "Notlar" else "") to rest)
    }
    val dark = resolveDark(prefs)
    val showFolder = view == Views.ALL || view == Views.PINNED || view == Views.TRASH

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        TopBar(back = if (showBack) "Klasörler" else null, onBack = onBack) {
            IconBtn(if (dark) Icons.Outlined.LightMode else Icons.Outlined.DarkMode, "Gece modu") {
                vm.updatePrefs(prefs.copy(mode = if (dark) "light" else "dark"))
            }
            IconBtn(Icons.Outlined.Settings, "Ayarlar", onClick = onSettings)
        }
        LargeTitle(viewName(view, names))
        SearchField(q) { q = it }
        LazyColumn(Modifier.weight(1f)) {
            if (list.isEmpty()) {
                item { EmptyList(if (q.isNotEmpty()) "“$q” için sonuç yok" else if (view == Views.TRASH) "Son Silinenler boş" else "Bu klasörde henüz not yok", showNew = q.isEmpty() && view != Views.TRASH, onNew) }
            } else if (view == Views.TRASH) item { Hint("Silinen notlar 30 gün burada kalır; istediğin zaman geri alabilirsin.") }
            groups.forEach { (g, l) ->
                if (g.isNotEmpty()) item(key = "cap-$g") { Caption(g) }
                item(key = "grp-$g") {
                    GroupCard {
                        l.forEachIndexed { i, n ->
                            if (i > 0) Divider()
                            NoteRow(n, key(n), if (showFolder) names[n.folderId] ?: "Notlar" else null, prefs.preview, n.id == selected) { onOpen(n.id) }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Spacer(Modifier.width(44.dp))
            Text(if (list.isEmpty()) "Not yok" else "${list.size} not", color = Cam.colors.sub, fontSize = 13.sp, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            IconBtn(Icons.Rounded.EditNote, "Yeni not", onClick = onNew)
        }
    }
}

@Composable
private fun NoteRow(n: NoteEntity, time: Long, folder: String?, preview: Boolean, selected: Boolean, onClick: () -> Unit) {
    val c = Cam.colors
    Column(Modifier.fillMaxWidth().background(if (selected) c.sel else androidx.compose.ui.graphics.Color.Transparent).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 11.dp)) {
        Text(n.title, color = c.ink, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Row {
            Text(Format.short(time), color = c.sub, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            if (preview) Text("  ${n.snippet}", color = c.sub, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (folder != null) Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 3.dp)) {
            Icon(Icons.Outlined.Folder, null, tint = c.sub, modifier = Modifier.size(13.dp))
            Text(" $folder", color = c.sub, fontSize = 12.sp)
        }
    }
}

@Composable
private fun EmptyList(text: String, showNew: Boolean, onNew: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 60.dp, start = 24.dp, end = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.AutoMirrored.Outlined.StickyNote2, null, tint = Cam.colors.sub, modifier = Modifier.size(44.dp))
        Text(text, color = Cam.colors.sub)
        if (showNew) Button(onNew, colors = ButtonDefaults.buttonColors(containerColor = Cam.colors.acc, contentColor = Cam.colors.accOn)) { Text("Yeni Not", fontWeight = FontWeight.SemiBold) }
    }
}

/** "Eşitlendi · şimdi", "Çevrimdışı — 3 değişiklik bekliyor" göstergesi. */
@Composable
fun SyncLine(vm: MainViewModel) {
    val st by vm.syncState.collectAsState()
    val pending by vm.pending.collectAsState()
    var tick by remember { mutableLongStateOf(0L) }
    LaunchedEffect(Unit) { while (true) { delay(30_000); tick++ } }
    val (offline, text) = when (val s = st) {
        SyncState.Local -> return
        SyncState.Syncing -> false to "Eşitleniyor…"
        is SyncState.Synced -> false to (if (pending > 0) "$pending değişiklik bekliyor" else "Eşitlendi · ${Format.rel(s.at + tick * 0)}")
        is SyncState.Offline -> true to (if (s.pending > 0) "Çevrimdışı — ${s.pending} değişiklik bekliyor" else "Çevrimdışı")
        is SyncState.Error -> true to "Eşitlenemedi${if (s.pending > 0) " — ${s.pending} değişiklik bekliyor" else ""}"
        SyncState.AuthLost -> true to "Oturum kapandı — giriş yap"
    }
    Row(
        Modifier.padding(horizontal = 14.dp).clip(RoundedCornerShape(10.dp)).clickable { vm.syncNow() }.padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (offline) Icons.Outlined.CloudOff else Icons.Outlined.CloudDone, null, tint = if (st is SyncState.Error) Cam.colors.red else Cam.colors.sub, modifier = Modifier.size(15.dp))
        Box(Modifier.width(6.dp))
        Text(text, color = if (st is SyncState.Error) Cam.colors.red else Cam.colors.sub, fontSize = 12.sp)
    }
}
