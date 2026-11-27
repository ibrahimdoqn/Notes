package com.camnotlar.app.ui.folders

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.automirrored.outlined.StickyNote2
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.EditNote
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.camnotlar.app.data.db.FolderEntity
import com.camnotlar.app.ui.MainViewModel
import com.camnotlar.app.ui.Views
import com.camnotlar.app.ui.common.Caption
import com.camnotlar.app.ui.common.ConfirmDialog
import com.camnotlar.app.ui.common.Divider
import com.camnotlar.app.ui.common.GroupCard
import com.camnotlar.app.ui.common.Hint
import com.camnotlar.app.ui.common.IconBtn
import com.camnotlar.app.ui.common.LargeTitle
import com.camnotlar.app.ui.common.TextPromptDialog
import com.camnotlar.app.ui.common.TopBar
import com.camnotlar.app.ui.inView
import com.camnotlar.app.ui.notes.SyncLine
import com.camnotlar.app.ui.theme.Cam

@Composable
fun FoldersScreen(vm: MainViewModel, onOpen: (String) -> Unit, onNewNote: () -> Unit, onSettings: () -> Unit) {
    val notes by vm.notes.collectAsState()
    val folders by vm.folders.collectAsState()
    var editing by remember { mutableStateOf(false) }
    var newFolder by remember { mutableStateOf(false) }
    var rename by remember { mutableStateOf<FolderEntity?>(null) }
    var remove by remember { mutableStateOf<FolderEntity?>(null) }
    fun count(v: String) = notes.count { inView(it, v) }

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        TopBar {
            IconBtn(Icons.Outlined.Settings, "Ayarlar", onClick = onSettings)
            TextButton({ editing = !editing }) { Text(if (editing) "Bitti" else "Düzenle", color = Cam.colors.accInk, fontSize = 16.sp) }
        }
        LazyColumn(Modifier.weight(1f)) {
            item { LargeTitle("Klasörler") }
            item {
                GroupCard {
                    FolderRow(Icons.AutoMirrored.Outlined.StickyNote2, "Tüm Notlar", count(Views.ALL)) { onOpen(Views.ALL) }
                    Divider()
                    FolderRow(Icons.Outlined.PushPin, "Sabitlenmiş", count(Views.PINNED)) { onOpen(Views.PINNED) }
                }
            }
            item { Caption("Klasörlerim") }
            item {
                if (folders.isEmpty()) Hint("Henüz klasör yok.")
                else GroupCard {
                    folders.forEachIndexed { i, f ->
                        if (i > 0) Divider()
                        FolderRow(Icons.Outlined.Folder, f.name, count(f.id), trailing = if (editing) {
                            {
                                IconBtn(Icons.Outlined.Edit, "Yeniden adlandır", tint = Cam.colors.sub) { rename = f }
                                IconBtn(Icons.Outlined.Delete, "Klasörü sil", tint = Cam.colors.red) { remove = f }
                            }
                        } else null) { onOpen(f.id) }
                    }
                }
            }
            item { Spacer(Modifier.padding(top = 20.dp)) }
            item {
                GroupCard { FolderRow(Icons.Outlined.Delete, "Son Silinenler", count(Views.TRASH), iconTint = Cam.colors.sub) { onOpen(Views.TRASH) } }
            }
        }
        SyncLine(vm)
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton({ newFolder = true }) {
                Icon(Icons.Rounded.CreateNewFolder, null, tint = Cam.colors.accInk)
                Spacer(Modifier.width(6.dp))
                Text("Yeni Klasör", color = Cam.colors.accInk, fontSize = 16.sp)
            }
            Spacer(Modifier.weight(1f))
            IconBtn(Icons.Rounded.EditNote, "Yeni not", onClick = onNewNote)
        }
    }

    if (newFolder) TextPromptDialog("Yeni Klasör", "", "Oluştur", "Bu klasör için bir ad gir.") { name ->
        newFolder = false
        if (!name.isNullOrBlank()) vm.newFolder(name) { onOpen(it) }
    }
    rename?.let { f ->
        TextPromptDialog("Klasörü yeniden adlandır", f.name, "Kaydet") { name ->
            rename = null
            if (!name.isNullOrBlank()) vm.renameFolder(f, name)
        }
    }
    remove?.let { f ->
        val k = notes.count { it.folderId == f.id && it.trashedAt == null }
        ConfirmDialog("“${f.name}” silinsin mi?", if (k > 0) "$k not Son Silinenler’e taşınacak." else "Bu klasör boş.", "Klasörü Sil") { ok ->
            remove = null
            if (ok) vm.deleteFolder(f)
        }
    }
}

@Composable
private fun FolderRow(
    icon: ImageVector, name: String, count: Int, iconTint: androidx.compose.ui.graphics.Color = Cam.colors.accInk,
    trailing: (@Composable () -> Unit)? = null, onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 50.dp).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = iconTint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(12.dp))
        Text(name, color = Cam.colors.ink, fontSize = 17.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        trailing?.invoke()
        Text("$count  ›", color = Cam.colors.sub, fontSize = 15.sp)
    }
}
