package org.newai.framevault;

import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;

import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.file.Files;
import java.util.Random;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

public final class AndroidCodecTest {
    private static final Archive.Progress IGNORE = (done, total) -> {};

    @Rule public final TemporaryFolder folder = new TemporaryFolder(
            InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());

    @Test
    public void androidGeneratesPlayableVideoAndRestoresEncryptedBytes() throws Exception {
        byte[] payload = new byte[9_287];
        new Random(7).nextBytes(payload);
        char[] password = "проверка 🎬".toCharArray();
        File archive = folder.newFile();
        File video = folder.newFile("encoded.mp4");
        Archive.pack(new ByteArrayInputStream(payload), "исходник.custom", payload.length,
                archive, password, IGNORE);

        Video.encode(archive, video, IGNORE);
        MediaMetadataRetriever player = new MediaMetadataRetriever();
        try {
            player.setDataSource(video.getPath());
            Bitmap frame = player.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            assertNotNull(frame);
            assertEquals(Frames.SIDE, frame.getWidth());
            assertEquals(Frames.SIDE, frame.getHeight());
            frame.recycle();
        } finally {
            player.release();
        }

        File recovered = folder.newFile();
        Video.decode(video, recovered, folder.newFile(), IGNORE);
        File result = folder.newFile();
        assertEquals("исходник.custom", Archive.unpack(recovered, result, password, IGNORE));
        assertArrayEquals(payload, Files.readAllBytes(result.toPath()));
    }
}
