package com.camnotlar.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.camnotlar.app.ui.auth.AuthScreen
import com.camnotlar.app.ui.editor.EditorScreen
import com.camnotlar.app.ui.folders.FoldersScreen
import com.camnotlar.app.ui.notes.NotesScreen
import com.camnotlar.app.ui.notes.viewName
import com.camnotlar.app.ui.settings.SettingsScreen
import com.camnotlar.app.ui.theme.Cam
import com.camnotlar.app.ui.theme.CamTheme
import com.camnotlar.app.ui.theme.GlassBackground
import com.camnotlar.app.ui.theme.glass
import kotlinx.coroutines.launch

/** Dışarıdan gelen istek: paylaş menüsü, kısayol ya da widget. */
sealed interface Launch {
    data class NewNote(val html: String? = null, val files: List<android.net.Uri> = emptyList()) : Launch
    data class OpenNote(val id: String) : Launch
}

/** Telefonda tek ekran yığını (klasörler → liste → not); tablette (≥ 840 dp) üç bölme. */
@Composable
fun CamApp(vm: MainViewModel, launch: Launch?, onLaunchHandled: () -> Unit) {
    val prefs by vm.prefs.collectAsState()
    val session by vm.session.collectAsState()
    val authLost by vm.authLost.collectAsState()
    var connecting by rememberSaveable { mutableStateOf(false) }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(Unit) { vm.toast.collect { snack.showSnackbar(it) } }

    CamTheme(prefs) {
        GlassBackground {
            when {
                session == null || authLost || connecting -> AuthScreen(
                    vm, fromLocal = connecting, message = if (authLost) "Oturumun sona erdi; yeniden giriş yap." else null,
                    onLocal = { vm.useLocal() }, onDone = { connecting = false },
                )
                else -> BoxWithConstraints {
                    if (maxWidth >= 840.dp) WideLayout(vm, launch, onLaunchHandled) { connecting = true }
                    else PhoneLayout(vm, launch, onLaunchHandled) { connecting = true }
                }
            }
            if (connecting) BackHandler { connecting = false }
            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).padding(bottom = 72.dp))
        }
    }
}

private sealed interface Screen {
    data object Folders : Screen
    data class List(val view: String) : Screen
    data class Note(val id: String, val view: String, val fresh: Boolean) : Screen
    data object Settings : Screen
}

private fun depth(s: Screen) = when (s) { Screen.Folders -> 0; is Screen.List -> 1; is Screen.Note -> 2; Screen.Settings -> 3 }

@Composable
private fun PhoneLayout(vm: MainViewModel, launch: Launch?, onLaunchHandled: () -> Unit, onConnect: () -> Unit) {
    val scope = rememberCoroutineScope()
    var stack by remember { mutableStateOf(listOf<Screen>(Screen.Folders, Screen.List(Views.ALL))) }
    val top = stack.last()
    fun push(s: Screen) { stack = stack + s }
    fun pop() { if (stack.size > 1) stack = stack.dropLast(1) }
    fun currentView() = (stack.lastOrNull { it is Screen.List } as? Screen.List)?.view ?: Views.ALL
    fun newNote(html: String? = null, files: List<android.net.Uri> = emptyList()) = scope.launch {
        val n = vm.createNoteWith(currentView(), html, files)
        push(Screen.Note(n.id, currentView(), fresh = html == null && files.isEmpty()))
    }
    LaunchedEffect(launch) {
        when (launch) {
            is Launch.NewNote -> newNote(launch.html, launch.files)
            is Launch.OpenNote -> push(Screen.Note(launch.id, currentView(), false))
            null -> return@LaunchedEffect
        }
        onLaunchHandled()
    }
    BackHandler(enabled = stack.size > 1 && top !is Screen.Note) { pop() }
    val folders by vm.folders.collectAsState()
    val names = folders.associate { it.id to it.name }

    AnimatedContent(top, transitionSpec = {
        val forward = depth(targetState) >= depth(initialState)
        (slideInHorizontally(tween(420)) { if (forward) it else -it / 3 } + fadeIn(tween(420)))
            .togetherWith(slideOutHorizontally(tween(420)) { if (forward) -it / 3 else it } + fadeOut(tween(420)))
    }, label = "nav") { s ->
        Box(Modifier.fillMaxSize()) {
            when (s) {
                Screen.Folders -> FoldersScreen(vm, onOpen = { stack = listOf(Screen.Folders, Screen.List(it)) }, onNewNote = { newNote() }, onSettings = { push(Screen.Settings) })
                is Screen.List -> NotesScreen(vm, s.view, null, showBack = true, onBack = { stack = listOf(Screen.Folders) },
                    onOpen = { push(Screen.Note(it, s.view, false)) }, onNew = { newNote() }, onSettings = { push(Screen.Settings) })
                is Screen.Note -> EditorScreen(vm, s.id, viewName(s.view, names), showBack = true, focusNew = s.fresh, onBack = { pop() })
                Screen.Settings -> SettingsScreen(vm, onConnect = onConnect, onClose = { pop() })
            }
        }
    }
}

@Composable
private fun WideLayout(vm: MainViewModel, launch: Launch?, onLaunchHandled: () -> Unit, onConnect: () -> Unit) {
    val scope = rememberCoroutineScope()
    var view by rememberSaveable { mutableStateOf(Views.ALL) }
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    var fresh by remember { mutableStateOf(false) }
    var settings by rememberSaveable { mutableStateOf(false) }
    val folders by vm.folders.collectAsState()
    val c = Cam.colors
    fun newNote(html: String? = null, files: List<android.net.Uri> = emptyList()) = scope.launch {
        val n = vm.createNoteWith(view, html, files)
        fresh = html == null && files.isEmpty()
        selected = n.id
    }
    LaunchedEffect(launch) {
        when (launch) {
            is Launch.NewNote -> newNote(launch.html, launch.files)
            is Launch.OpenNote -> selected = launch.id
            null -> return@LaunchedEffect
        }
        onLaunchHandled()
    }
    Row(Modifier.fillMaxSize().padding(12.dp)) {
        Box(Modifier.width(260.dp).fillMaxHeight().glass(c.glass, c.line)) {
            FoldersScreen(vm, onOpen = { view = it; selected = null }, onNewNote = { newNote() }, onSettings = { settings = true })
        }
        Box(Modifier.padding(horizontal = 12.dp).width(340.dp).fillMaxHeight().glass(c.glass, c.line)) {
            NotesScreen(vm, view, selected, showBack = false, onBack = {}, onOpen = { fresh = false; selected = it }, onNew = { newNote() }, onSettings = { settings = true })
        }
        Box(Modifier.weight(1f).fillMaxHeight().glass(c.glass, c.line)) {
            val id = selected
            if (id != null) androidx.compose.runtime.key(id) {
                EditorScreen(vm, id, viewName(view, folders.associate { it.id to it.name }), showBack = false, focusNew = fresh, onBack = { selected = null })
            }
        }
    }
    if (settings) Box(Modifier.fillMaxSize().padding(48.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.width(560.dp).fillMaxHeight().glass(c.glass2, c.line)) {
            SettingsScreen(vm, onConnect = { settings = false; onConnect() }, onClose = { settings = false })
        }
        BackHandler { settings = false }
    }
}
