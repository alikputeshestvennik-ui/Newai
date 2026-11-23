package org.newai.framevault;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import java.io.EOFException;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

final class Conversion {
    enum Stage {
        IDLE, PACK, ENCODE, COPY_VIDEO, DECODE, UNPACK, READY, SAVE, SAVED,
        CANCELLED, MISSING_DATA, PASSWORD_REQUIRED, BAD_PASSWORD, DAMAGED, FAILED, SAVE_FAILED
    }

    record Result(File file, String name, boolean video) {}

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean cancelled = new AtomicBoolean();
    private Runnable listener;
    private boolean disposed;
    private long lastUpdate;
    Stage stage = Stage.IDLE;
    int percent = -1;
    boolean busy;
    Result result;
    Uri savedUri;

    Conversion(Context context) {
        this.context = context.getApplicationContext();
    }

    void attach(Runnable listener) {
        this.listener = listener;
    }

    void detach() {
        listener = null;
    }

    void clear() {
        discard(result);
        result = null;
        savedUri = null;
        stage = Stage.IDLE;
        percent = -1;
        notifyListener();
    }

    void start(Uri uri, String name, long size, boolean encode, char[] password) {
        clear();
        begin(encode ? Stage.PACK : Stage.COPY_VIDEO);
        executor.execute(() -> {
            File archive = null;
            File video = null;
            File parity = null;
            File output = null;
            Result completed = null;
            Stage outcome = Stage.FAILED;
            try {
                archive = temp();
                output = temp();
                if (encode) {
                    try (InputStream input = open(uri)) {
                        Archive.pack(input, name, size, archive, password, progress(Stage.PACK));
                    }
                    Video.encode(archive, output, progress(Stage.ENCODE));
                    completed = new Result(output, context.getString(R.string.result_name, name), true);
                } else {
                    video = temp();
                    parity = temp();
                    try (InputStream input = open(uri); OutputStream target = new FileOutputStream(video)) {
                        copy(input, target, size, progress(Stage.COPY_VIDEO));
                    }
                    Video.decode(video, archive, parity, progress(Stage.DECODE));
                    String restoredName = Archive.unpack(archive, output, password, progress(Stage.UNPACK));
                    completed = new Result(output, restoredName, false);
                }
                outcome = Stage.READY;
            } catch (InterruptedIOException e) {
                outcome = cancelled.get() ? Stage.CANCELLED : Stage.FAILED;
            } catch (Frames.MissingPackets e) {
                outcome = Stage.MISSING_DATA;
            } catch (Archive.PasswordRequired e) {
                outcome = Stage.PASSWORD_REQUIRED;
            } catch (javax.crypto.AEADBadTagException e) {
                outcome = Stage.BAD_PASSWORD;
            } catch (Archive.InvalidArchive | EOFException e) {
                outcome = Stage.DAMAGED;
            } catch (IOException | GeneralSecurityException | RuntimeException e) {
                android.util.Log.w("FrameVault", "Conversion failed", e);
            } finally {
                Arrays.fill(password, '\0');
                erase(archive);
                erase(video);
                erase(parity);
                if (completed == null) erase(output);
            }
            Result ready = completed;
            Stage finished = outcome;
            main.post(() -> {
                if (disposed) {
                    discard(ready);
                } else if (cancelled.get()) {
                    discard(ready);
                    end(Stage.CANCELLED);
                } else {
                    result = ready;
                    end(finished);
                }
            });
        });
    }

    void save(Uri destination) {
        Result ready = result;
        if (ready == null) return;
        begin(Stage.SAVE);
        executor.execute(() -> {
            boolean saved;
            try {
                writeResult(ready, destination);
                saved = true;
            } catch (IOException | RuntimeException e) {
                saved = false;
            }
            boolean exported = saved;
            main.post(() -> {
                if (disposed) {
                    discard(ready);
                    return;
                }
                if (exported) {
                    savedUri = destination;
                    end(Stage.SAVED);
                } else {
                    end(Stage.SAVE_FAILED);
                }
            });
        });
    }

    private void writeResult(Result ready, Uri destination) throws IOException {
        try (InputStream input = new java.io.FileInputStream(ready.file());
             OutputStream output = context.getContentResolver().openOutputStream(destination, "wt")) {
            if (output == null) throw new IOException("Destination unavailable");
            copy(input, output, ready.file().length(), progress(Stage.SAVE));
        }
    }

    void cancel() {
        cancelled.set(true);
    }

    void dispose() {
        disposed = true;
        detach();
        cancel();
        if (!busy) discard(result);
        executor.shutdown();
    }

    private void begin(Stage stage) {
        this.stage = stage;
        percent = -1;
        busy = true;
        lastUpdate = 0;
        cancelled.set(false);
        notifyListener();
    }

    private void end(Stage stage) {
        busy = false;
        this.stage = stage;
        percent = -1;
        notifyListener();
    }

    private Archive.Progress progress(Stage stage) {
        lastUpdate = 0;
        return (completed, total) -> {
            if (cancelled.get() && stage != Stage.SAVE) throw new InterruptedIOException();
            long now = System.nanoTime();
            if (now - lastUpdate < 160_000_000L) return;
            lastUpdate = now;
            int value = total > 0 ? (int) Math.max(0, Math.min(100, 100.0 * completed / total)) : -1;
            main.post(() -> {
                if (disposed) return;
                this.stage = stage;
                percent = value;
                notifyListener();
            });
        };
    }

    private void notifyListener() {
        if (listener != null) listener.run();
    }

    private InputStream open(Uri uri) throws IOException {
        ContentResolver resolver = context.getContentResolver();
        InputStream input = resolver.openInputStream(uri);
        if (input == null) throw new IOException("Source unavailable");
        return input;
    }

    private File temp() throws IOException {
        return File.createTempFile("framevault-", ".tmp", context.getCacheDir());
    }

    private static void copy(InputStream input, OutputStream output, long total, Archive.Progress progress)
            throws IOException {
        byte[] buffer = new byte[256 * 1024];
        long copied = 0;
        int size;
        progress.update(0, total);
        while ((size = input.read(buffer)) != -1) {
            output.write(buffer, 0, size);
            copied += size;
            progress.update(copied, total);
        }
    }

    private static void discard(Result result) {
        if (result != null) erase(result.file());
    }

    private static void erase(File file) {
        if (file != null) file.delete();
    }

    static String duration(long bytes) {
        long seconds = (Frames.videoPackets(bytes) * Frames.HOLD + Frames.FPS - 1) / Frames.FPS;
        if (seconds < 60) return String.format(Locale.ROOT, "≈ %d с", seconds);
        if (seconds < 3600) return String.format(Locale.ROOT, "≈ %d мин %02d с", seconds / 60, seconds % 60);
        return String.format(Locale.ROOT, "≈ %d ч %02d мин", seconds / 3600, seconds / 60 % 60);
    }
}
