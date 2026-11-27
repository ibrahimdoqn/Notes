package com.camnotlar.app.ui.editor

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.DriveFileMove
import androidx.compose.material.icons.automirrored.rounded.FormatListBulleted
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.rounded.FormatListNumbered
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.camnotlar.app.ui.MainViewModel
import com.camnotlar.app.ui.common.ChoiceDialog
import com.camnotlar.app.ui.common.ConfirmDialog
import com.camnotlar.app.ui.common.Format
import com.camnotlar.app.ui.common.IconBtn
import com.camnotlar.app.ui.common.TopBar
import com.camnotlar.app.ui.theme.Cam

private fun Color.css() = "#%06x".format(toArgb() and 0xFFFFFF)

@Composable
fun EditorScreen(vm: MainViewModel, noteId: String, backLabel: String, showBack: Boolean, focusNew: Boolean, onBack: () -> Unit) {
    val note by vm.note(noteId).collectAsState(initial = null)
    val folders by vm.folders.collectAsState()
    val session by vm.session.collectAsState()
    val c = Cam.colors
    val ctx = LocalContext.current
    var active by remember { mutableStateOf(emptySet<String>()) }
    var move by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var history by remember { mutableStateOf(false) }
    var lastSent by remember { mutableStateOf<String?>(null) }

    val web = remember {
        EditorWebView(ctx).apply {
            setup(EditorBridge(onChange = { html ->
                lastSent = html
                vm.saveHtml(noteId, html)
            }, onState = { active = it }))
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            web.current { html ->
                vm.finishEditing(noteId, html, dropEmpty = false)
                web.destroy()
            }
        }
    }

    // Tema ve yazı ayarları editöre CSS değişkenleri olarak geçer.
    LaunchedEffect(c) {
        web.theme(mapOf(
            "ink" to c.ink.css(), "sub" to c.sub.css(), "acc" to c.acc.css(), "fs" to "${c.editorSize.value.toInt()}px",
            "edf" to when (c.editorFont) { FontFamily.Serif -> "Georgia,'Noto Serif',serif"; FontFamily.Monospace -> "'Roboto Mono',monospace"; else -> "system-ui,Roboto,sans-serif" },
        ))
    }
    // Not yüklenince ya da başka cihazdan değişince içerik güncellenir (kendi yazdığımız geri yazılmaz).
    var loaded by remember { mutableStateOf(false) }
    LaunchedEffect(note?.html, note?.trashedAt) {
        val n = note ?: return@LaunchedEffect
        if (n.html != lastSent) web.load(n.html, n.trashedAt == null, Format.long(n.updatedAt))
        else web.setStamp(Format.long(n.updatedAt))
        if (!loaded) {
            loaded = true
            if (focusNew) web.focusEnd()
        }
    }

    fun leave() {
        web.current { html -> vm.finishEditing(noteId, html) }
        onBack()
    }
    BackHandler(enabled = showBack) { leave() }

    val n = note
    Column(Modifier.fillMaxSize().statusBarsPadding().imePadding()) {
        TopBar(back = if (showBack) backLabel else null, onBack = ::leave) {
            if (n != null && n.trashedAt == null) {
                IconBtn(Icons.Outlined.PushPin, "Sabitle", on = n.pinned) { vm.togglePin(n) }
                IconBtn(Icons.AutoMirrored.Rounded.DriveFileMove, "Klasöre taşı") { move = true }
                if (session?.mode == "server" && n.version > 0) IconBtn(Icons.Outlined.History, "Not geçmişi") { history = true }
                IconBtn(Icons.Outlined.ContentCopy, "Metni kopyala") {
                    (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText(n.title, n.plain))
                    vm.toast("Metin panoya kopyalandı")
                }
                IconBtn(Icons.Outlined.Delete, "Sil") {
                    vm.trash(n)
                    vm.toast("Son Silinenler’e taşındı")
                    onBack()
                }
            }
        }
        if (n?.trashedAt != null) {
            Row(Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.sel).padding(horizontal = 14.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Bu not Son Silinenler’de.", color = c.ink, fontSize = 14.sp, modifier = Modifier.weight(1f))
                TextButton({ vm.restore(n) }) { Text("Geri Al", color = c.accInk, fontWeight = FontWeight.SemiBold) }
                TextButton({ confirmDelete = true }) { Text("Kalıcı Sil", color = c.red, fontWeight = FontWeight.SemiBold) }
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            AndroidView({ web }, Modifier.fillMaxSize())
        }
        if (n?.trashedAt == null) FormatBar(active) { web.fmt(it) }
    }

    if (move && n != null) ChoiceDialog("Klasöre taşı", folders.map { it.id to it.name }, n.folderId) { id ->
        move = false
        if (id != null) vm.move(n, id)
    }
    if (confirmDelete && n != null) ConfirmDialog("Kalıcı olarak silinsin mi?", "“${n.title}” geri alınamayacak şekilde silinecek.", "Sil") { ok ->
        confirmDelete = false
        if (ok) {
            vm.deleteForever(n)
            onBack()
        }
    }
    if (history && n != null) HistorySheet(vm, n) { history = false }
}

@Composable
private fun FormatBar(active: Set<String>, onFmt: (String) -> Unit) {
    val c = Cam.colors
    Row(
        Modifier.fillMaxWidth().background(c.glass2).navigationBarsPadding().horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        @Composable
        fun T(cmd: String, text: String, weight: FontWeight = FontWeight.Normal, style: FontStyle = FontStyle.Normal, deco: TextDecoration? = null) {
            Box(
                Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(if (cmd in active) c.sel else Color.Transparent).clickable { onFmt(cmd) },
                contentAlignment = Alignment.Center,
            ) { Text(text, color = if (cmd in active) c.accInk else c.ink, fontSize = 18.sp, fontWeight = weight, fontStyle = style, textDecoration = deco) }
        }
        @Composable
        fun I(cmd: String, icon: androidx.compose.ui.graphics.vector.ImageVector, label: String) =
            IconBtn(icon, label, on = cmd in active, tint = if (cmd in active) c.accInk else c.ink) { onFmt(cmd) }

        T("h", "Aa", FontWeight.Bold)
        Spacer(Modifier.width(1.dp).height(20.dp).background(c.line))
        T("bold", "B", FontWeight.ExtraBold)
        T("italic", "I", style = FontStyle.Italic)
        T("underline", "U", deco = TextDecoration.Underline)
        T("strikeThrough", "S", deco = TextDecoration.LineThrough)
        Spacer(Modifier.width(1.dp).height(20.dp).background(c.line))
        I("check", Icons.Outlined.CheckCircle, "Kontrol listesi")
        I("insertUnorderedList", Icons.AutoMirrored.Rounded.FormatListBulleted, "Madde işaretli liste")
        I("insertOrderedList", Icons.Rounded.FormatListNumbered, "Numaralı liste")
    }
}
