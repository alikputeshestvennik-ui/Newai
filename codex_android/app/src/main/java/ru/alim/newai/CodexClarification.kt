package ru.alim.newai

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import org.json.JSONObject

data class CodexClarification(val id: String, val questions: List<Question>) {
    data class Question(val id: String, val text: String, val options: List<Option>, val secret: Boolean)
    data class Option(val label: String, val description: String)

    companion object {
        fun fromJson(json: JSONObject?): CodexClarification? {
            val id = json?.optString("id")?.takeIf { it.isNotBlank() } ?: return null
            val questions = json.optJSONArray("questions") ?: return null
            val parsed = List(questions.length()) { index ->
                val question = questions.getJSONObject(index)
                val options = question.optJSONArray("options")?.let { array ->
                    List(array.length()) { optionIndex ->
                        val option = array.getJSONObject(optionIndex)
                        Option(option.getString("label"), option.optString("description"))
                    }
                }.orEmpty()
                Question(question.getString("id"), question.getString("question"), options, question.optBoolean("isSecret"))
            }
            return parsed.takeIf { it.isNotEmpty() }?.let { CodexClarification(id, it) }
        }
    }
}

@Composable
fun CodexClarificationDialog(
    clarification: CodexClarification,
    submitting: Boolean,
    error: String?,
    onLater: () -> Unit,
    onAnswer: (Map<String, String>) -> Unit,
) {
    val answers = remember(clarification.id) { mutableStateMapOf<String, String>() }
    val singleQuestion = clarification.questions.size == 1
    AlertDialog(
        onDismissRequest = { if (!submitting) onLater() },
        properties = DialogProperties(dismissOnClickOutside = false),
        title = { Text("Codex ждёт ответа") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (question in clarification.questions) {
                    Text(question.text, color = Ink)
                    for (option in question.options) {
                        val selected = answers[question.id] == option.label
                        val choose = {
                            answers[question.id] = option.label
                            if (singleQuestion) onAnswer(answers.toMap())
                        }
                        val label: @Composable () -> Unit = {
                            Column(Modifier.fillMaxWidth()) {
                                Text(option.label)
                                if (option.description.isNotBlank()) Text(option.description, style = body(12))
                            }
                        }
                        val modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                        if (selected) Button(choose, modifier, enabled = !submitting, content = { label() })
                        else OutlinedButton(choose, modifier, enabled = !submitting, content = { label() })
                    }
                    OutlinedTextField(
                        value = answers[question.id].orEmpty(),
                        onValueChange = { if (it.length <= 4000) answers[question.id] = it },
                        label = { Text(if (question.options.isEmpty()) "Ответ" else "Свой ответ") },
                        visualTransformation = if (question.secret) PasswordVisualTransformation() else VisualTransformation.None,
                        enabled = !submitting,
                        modifier = Modifier.fillMaxWidth(),
                        maxLines = 4,
                    )
                }
                if (error != null) Text(error, color = Danger)
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onAnswer(answers.mapValues { it.value.trim() }) },
                enabled = !submitting && clarification.questions.all { !answers[it.id].isNullOrBlank() },
            ) { Text(if (submitting) "Отправляю…" else "Ответить") }
        },
        dismissButton = { TextButton(onLater, enabled = !submitting) { Text("Позже") } },
    )
}
