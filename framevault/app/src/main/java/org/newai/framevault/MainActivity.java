package org.newai.framevault;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.text.format.Formatter;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Locale;

public final class MainActivity extends Activity {
    private static final int PICK = 1;
    private static final int EXPORT = 2;
    private static final int INK = 0xff172b24;
    private static final int SECONDARY = 0xff486155;
    private static final int GREEN = 0xff183a31;
    private static final int MINT = 0xffb9f2bb;
    private static final int BACKGROUND = 0xfff5f8f3;
    private static final int BORDER = 0xffdce6dd;
    private static final int ERROR = 0xff9d3035;

    private static final class Session {
        final Conversion conversion;
        boolean encode = true;
        Uri source;
        String name;
        long size = -1;

        Session(Activity activity) {
            conversion = new Conversion(activity);
        }
    }

    private Session session;
    private Button encodeTab;
    private Button decodeTab;
    private Button choose;
    private Button action;
    private Button cancel;
    private Button save;
    private Button open;
    private TextView details;
    private TextView title;
    private TextView tip;
    private TextView status;
    private EditText password;
    private ProgressBar progress;
    private boolean cancellationRequested;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Session previous = (Session) getLastNonConfigurationInstance();
        session = previous == null ? new Session(this) : previous;
        if (previous == null && state != null) {
            session.encode = state.getBoolean("encode", true);
            String uri = state.getString("source");
            session.source = uri == null ? null : Uri.parse(uri);
            session.name = state.getString("name");
            session.size = state.getLong("size", -1);
        }
        showScreen();
        session.conversion.attach(this::refresh);
        refresh();
    }

    @Override
    public Object onRetainNonConfigurationInstance() {
        return session;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putBoolean("encode", session.encode);
        if (session.source != null) {
            out.putString("source", session.source.toString());
            out.putString("name", session.name);
            out.putLong("size", session.size);
        }
    }

    @Override
    protected void onDestroy() {
        session.conversion.detach();
        if (!isChangingConfigurations()) session.conversion.dispose();
        super.onDestroy();
    }

    private void showScreen() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BACKGROUND);
        if (Build.VERSION.SDK_INT >= 35) {
            scroll.setOnApplyWindowInsetsListener((view, window) -> {
                android.graphics.Insets bars = window.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = window.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
        }

        LinearLayout outer = column();
        outer.setGravity(Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        outer.setPadding(dp(20), dp(24), dp(20), dp(24));
        scroll.addView(outer, new ScrollView.LayoutParams(-1, -2));

        LinearLayout content = column();
        content.setFocusableInTouchMode(true);
        int width = getResources().getConfiguration().screenWidthDp >= 610 ? dp(560) : -1;
        outer.addView(content, new LinearLayout.LayoutParams(width, -2));

        LinearLayout header = column();
        header.setPadding(dp(22), dp(18), dp(22), dp(19));
        header.setBackground(shape(GREEN, 22, GREEN));
        TextView name = label(32, Color.WHITE, true);
        name.setText(R.string.app_name);
        add(header, name, 0);
        TextView subtitle = label(16, MINT, false);
        subtitle.setText(R.string.subtitle);
        add(header, subtitle, 2);
        add(content, header, 0);

        LinearLayout tabs = new LinearLayout(this);
        tabs.setPadding(dp(4), dp(4), dp(4), dp(4));
        tabs.setBackground(shape(0xffe5ede5, 16, 0xffe5ede5));
        encodeTab = button(R.string.encode, false);
        decodeTab = button(R.string.decode, false);
        tabs.addView(encodeTab, new LinearLayout.LayoutParams(0, -2, 1));
        tabs.addView(decodeTab, new LinearLayout.LayoutParams(0, -2, 1));
        encodeTab.setOnClickListener(v -> setMode(true));
        decodeTab.setOnClickListener(v -> setMode(false));
        add(content, tabs, 16);

        LinearLayout input = column();
        input.setPadding(dp(16), dp(14), dp(16), dp(14));
        input.setBackground(shape(Color.WHITE, 16, BORDER));
        title = label(17, INK, true);
        add(input, title, 0);
        details = label(14, SECONDARY, false);
        add(input, details, 4);
        choose = button(R.string.choose_file, false);
        choose.setOnClickListener(v -> choose());
        add(input, choose, 12);
        add(content, input, 12);

        TextView passwordLabel = label(14, INK, true);
        passwordLabel.setText(R.string.password_label);
        int inputId = View.generateViewId();
        passwordLabel.setLabelFor(inputId);
        add(content, passwordLabel, 16);
        password = new EditText(this);
        password.setId(inputId);
        password.setSaveEnabled(false);
        password.setSingleLine(true);
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        password.setTextColor(INK);
        password.setHintTextColor(SECONDARY);
        password.setTextSize(15);
        password.setPadding(dp(14), dp(8), dp(14), dp(8));
        password.setMinHeight(dp(50));
        password.setBackground(shape(Color.WHITE, 12, BORDER));
        add(content, password, 6);

        action = button(R.string.start_encode, true);
        action.setOnClickListener(v -> start());
        add(content, action, 14);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setProgressTintList(ColorStateList.valueOf(GREEN));
        progress.setIndeterminateTintList(ColorStateList.valueOf(GREEN));
        add(content, progress, 10);
        status = label(14, INK, false);
        add(content, status, 8);
        cancel = button(R.string.cancel, false);
        cancel.setOnClickListener(v -> {
            cancellationRequested = true;
            session.conversion.cancel();
            refresh();
        });
        add(content, cancel, 8);
        save = button(R.string.save, true);
        save.setOnClickListener(v -> export());
        add(content, save, 8);
        open = button(R.string.open, false);
        open.setOnClickListener(v -> open());
        add(content, open, 8);

        tip = label(13, SECONDARY, false);
        add(content, tip, 14);
        setContentView(scroll);
        content.requestFocus();
    }

    private void setMode(boolean encode) {
        if (session.encode == encode) return;
        session.encode = encode;
        session.source = null;
        session.name = null;
        session.size = -1;
        password.getText().clear();
        session.conversion.clear();
    }

    private void choose() {
        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        picker.addCategory(Intent.CATEGORY_OPENABLE);
        picker.setType(session.encode ? "*/*" : "video/*");
        launch(picker, PICK);
    }

    private void export() {
        Conversion.Result result = session.conversion.result;
        if (result == null) return;
        Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        picker.addCategory(Intent.CATEGORY_OPENABLE);
        picker.setType(result.video() ? "video/mp4" : "application/octet-stream");
        picker.putExtra(Intent.EXTRA_TITLE, result.name());
        launch(picker, EXPORT);
    }

    private void launch(Intent intent, int request) {
        try {
            startActivityForResult(intent, request);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_picker, Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (request == PICK) {
            try {
                getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (SecurityException ignored) {
                // A temporary grant is sufficient while this activity is open.
            }
            readSource(uri);
            session.conversion.clear();
        } else if (request == EXPORT) {
            session.conversion.save(uri);
        }
    }

    private void readSource(Uri uri) {
        session.source = uri;
        session.name = getString(R.string.source_default);
        session.size = -1;
        String[] columns = {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        try (Cursor cursor = getContentResolver().query(uri, columns, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) return;
            int name = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
            int size = cursor.getColumnIndex(OpenableColumns.SIZE);
            if (name >= 0 && !cursor.isNull(name) && !cursor.getString(name).isEmpty()) {
                session.name = cursor.getString(name);
            }
            if (size >= 0 && !cursor.isNull(size)) session.size = cursor.getLong(size);
        } catch (RuntimeException ignored) {
            // Some providers do not expose document metadata.
        }
    }

    private void start() {
        if (session.source == null || session.conversion.busy) return;
        cancellationRequested = false;
        char[] secret = new char[password.length()];
        password.getText().getChars(0, secret.length, secret, 0);
        InputMethodManager keyboard = getSystemService(InputMethodManager.class);
        if (keyboard != null) keyboard.hideSoftInputFromWindow(password.getWindowToken(), 0);
        session.conversion.start(session.source, session.name, session.size, session.encode, secret);
    }

    private void open() {
        Uri uri = session.conversion.savedUri;
        if (uri == null) return;
        Intent intent = new Intent(Intent.ACTION_VIEW);
        if (session.conversion.result.video()) {
            intent.setDataAndType(uri, "video/mp4");
        } else {
            String name = session.conversion.result.name();
            int dot = name.lastIndexOf('.');
            String extension = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
            String mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
            intent.setDataAndType(uri, mime == null ? "application/octet-stream" : mime);
        }
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException e) {
            Toast.makeText(this, R.string.no_viewer, Toast.LENGTH_SHORT).show();
        }
    }

    private void refresh() {
        Conversion state = session.conversion;
        tab(encodeTab, session.encode);
        tab(decodeTab, !session.encode);
        title.setText(session.encode ? R.string.file_input : R.string.video_input);
        choose.setText(session.encode ? R.string.choose_file : R.string.choose_video);
        action.setText(session.encode ? R.string.start_encode : R.string.start_decode);
        password.setHint(session.encode ? R.string.password_placeholder : R.string.password_decode);
        tip.setText(session.encode ? R.string.tip_encode : R.string.tip_decode);
        if (session.source == null) {
            details.setText(session.encode ? R.string.file_empty : R.string.video_empty);
        } else if (session.size < 0) {
            details.setText(session.name);
        } else {
            String size = Formatter.formatFileSize(this, session.size);
            if (session.encode) size = getString(R.string.size_duration, size, Conversion.duration(session.size + 128));
            details.setText(getString(R.string.result_status, session.name, size));
        }

        encodeTab.setEnabled(!state.busy);
        decodeTab.setEnabled(!state.busy);
        choose.setEnabled(!state.busy);
        password.setEnabled(!state.busy);
        action.setEnabled(!state.busy && session.source != null);
        action.setAlpha(action.isEnabled() ? 1f : 0.48f);
        visible(progress, state.busy);
        progress.setIndeterminate(state.percent < 0);
        if (state.percent >= 0) progress.setProgress(state.percent);
        visible(cancel, state.busy && state.stage != Conversion.Stage.SAVE);
        cancel.setEnabled(!cancellationRequested);
        cancel.setText(cancellationRequested ? R.string.cancel_wait : R.string.cancel);
        visible(save, !state.busy && state.result != null);
        visible(open, !state.busy && state.savedUri != null);

        int message = switch (state.stage) {
            case IDLE -> 0;
            case PACK -> R.string.pack;
            case ENCODE -> R.string.encode_stage;
            case COPY_VIDEO -> R.string.copy_video;
            case DECODE -> R.string.decode_stage;
            case UNPACK -> R.string.unpack;
            case READY -> R.string.ready;
            case SAVE -> R.string.saving;
            case SAVED -> R.string.saved;
            case CANCELLED -> R.string.cancelled;
            case MISSING_DATA -> R.string.missing_data;
            case PASSWORD_REQUIRED -> R.string.password_required;
            case BAD_PASSWORD -> R.string.bad_password;
            case DAMAGED -> R.string.damaged;
            case FAILED -> R.string.failed;
            case SAVE_FAILED -> R.string.save_failed;
        };
        boolean error = switch (state.stage) {
            case MISSING_DATA, PASSWORD_REQUIRED, BAD_PASSWORD, DAMAGED, FAILED, SAVE_FAILED -> true;
            default -> false;
        };
        status.setTextColor(error ? ERROR : SECONDARY);
        visible(status, message != 0);
        if (message != 0) {
            String info = getString(message);
            if (state.busy && state.percent >= 0) info = getString(R.string.percent, info, state.percent);
            if (!state.busy && state.result != null) {
                info = getString(R.string.result_status, info, state.result.name());
            }
            status.setText(info);
            status.setAccessibilityLiveRegion(state.busy
                    ? View.ACCESSIBILITY_LIVE_REGION_NONE : View.ACCESSIBILITY_LIVE_REGION_POLITE);
        }
    }

    private LinearLayout column() {
        LinearLayout view = new LinearLayout(this);
        view.setOrientation(LinearLayout.VERTICAL);
        return view;
    }

    private TextView label(int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        return view;
    }

    private Button button(int text, boolean primary) {
        Button view = new Button(this);
        view.setText(text);
        view.setAllCaps(false);
        view.setTextSize(15);
        view.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        view.setTextColor(primary ? Color.WHITE : GREEN);
        view.setMinHeight(dp(48));
        view.setPadding(dp(10), dp(4), dp(10), dp(4));
        view.setStateListAnimator(null);
        view.setBackground(shape(primary ? GREEN : 0xffedf3ed, 12, primary ? GREEN : BORDER));
        return view;
    }

    private void tab(Button button, boolean selected) {
        button.setSelected(selected);
        button.setBackground(shape(selected ? Color.WHITE : Color.TRANSPARENT, 12, Color.TRANSPARENT));
        button.setTextColor(selected ? GREEN : SECONDARY);
    }

    private GradientDrawable shape(int fill, int radius, int stroke) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radius));
        if (stroke != Color.TRANSPARENT) drawable.setStroke(dp(1), stroke);
        return drawable;
    }

    private void add(LinearLayout parent, View child, int margin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(margin);
        parent.addView(child, params);
    }

    private void visible(View view, boolean visible) {
        view.setVisibility(visible ? View.VISIBLE : View.GONE);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
