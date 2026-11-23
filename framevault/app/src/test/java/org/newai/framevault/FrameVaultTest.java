package org.newai.framevault;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Random;
import java.util.concurrent.TimeUnit;

import javax.crypto.AEADBadTagException;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assume.assumeTrue;

public class FrameVaultTest {
    private static final Archive.Progress IGNORE = (done, total) -> {};
    private static final String NAME = "файл 🚋.custom";
    private static final char[] PASSWORD = "тестовая фраза 🔑".toCharArray();

    @Rule public final TemporaryFolder folder = new TemporaryFolder();

    @Test
    public void encryptedArchiveChecksPasswordAndTampering() throws Exception {
        byte[] bytes = data(180_017);
        File archive = pack(bytes, PASSWORD);
        File output = folder.newFile();
        assertThrows(Archive.PasswordRequired.class, () -> Archive.unpack(archive, output, new char[0], IGNORE));
        assertThrows(AEADBadTagException.class, () -> Archive.unpack(archive, output, "wrong".toCharArray(), IGNORE));
        assertEquals(NAME, Archive.unpack(archive, output, PASSWORD, IGNORE));
        assertArrayEquals(bytes, Files.readAllBytes(output.toPath()));

        byte[] encrypted = Files.readAllBytes(archive.toPath());
        encrypted[encrypted.length - 1] ^= 1;
        Files.write(archive.toPath(), encrypted);
        assertThrows(AEADBadTagException.class, () -> Archive.unpack(archive, output, PASSWORD, IGNORE));
    }

    @Test
    public void emptyFileRoundTripsWithoutPassword() throws Exception {
        File archive = pack(new byte[0], new char[0]);
        File output = folder.newFile();
        assertEquals(NAME, Archive.unpack(archive, output, new char[0], IGNORE));
        assertEquals(0, output.length());
    }

    @Test
    public void visualCodeRepairsABurstAndParityRejectsTwoMissingPackets() throws Exception {
        File archive = pack(data(8_441), new char[0]);
        try (Frames.Source source = new Frames.Source(archive);
             Frames.Collector collector = new Frames.Collector(folder.newFile(), folder.newFile())) {
            Frames.VisualCodec codec = new Frames.VisualCodec();
            Frames.Packet first = source.next();
            byte[] pixels = codec.render(first);
            // Four rows of simultaneous cell errors, distributed across the four RS blocks.
            for (int row = 6; row < 10; row++) {
                for (int col = 0; col < 80; col++) {
                    int at = (44 + row * 8) * Frames.SIDE + 44 + col * 8;
                    pixels[at] = (byte) (255 - (pixels[at] & 255));
                }
            }
            Frames.Packet repaired = read(codec, pixels, Frames.SIDE);
            assertNotNull(repaired);
            assertArrayEquals(first.data(), repaired.data());
            Frames.Packet packet;
            while ((packet = source.next()) != null) {
                if (packet.index() != 2) collector.accept(packet);
            }
            assertThrows(Frames.MissingPackets.class, collector::finish);
        }
    }

    @Test
    public void survivesAvcRecompressionScalingFrameRateChangeAndADeletedPacket() throws Exception {
        assumeTrue("FFmpeg is required for the video integration test", ffmpegAvailable());
        byte[] original = data(12_341);
        File archive = pack(original, PASSWORD);
        File luma = folder.newFile();
        Frames.VisualCodec codec = new Frames.VisualCodec();
        try (Frames.Source packets = new Frames.Source(archive);
             BufferedOutputStream frames = new BufferedOutputStream(new FileOutputStream(luma))) {
            Frames.Packet packet;
            while ((packet = packets.next()) != null) {
                if (packet.index() == 2 || packet.index() == 10) continue;
                byte[] pixels = codec.render(packet);
                for (int copy = 0; copy < Frames.HOLD; copy++) {
                    frames.write(pixels);
                }
            }
        }

        File source = folder.newFile("source.mp4");
        ffmpeg("-f", "rawvideo", "-pixel_format", "gray", "-video_size", "720x720", "-framerate", "24",
                "-i", luma.getPath(), "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-preset", "ultrafast", "-b:v", "4M", source.getPath());
        verifyTranscode(source, original, 360, 20, 36);
        verifyTranscode(source, original, 240, 15, 36);
    }

    private void verifyTranscode(File source, byte[] original, int side, int fps, int crf) throws Exception {
        File reencoded = folder.newFile(side + ".mp4");
        File decoded = folder.newFile();
        ffmpeg("-i", source.getPath(), "-vf", "scale=" + side + ":" + side + ",fps=" + fps,
                "-c:v", "libx264", "-preset", "fast", "-crf", String.valueOf(crf), reencoded.getPath());
        ffmpeg("-i", reencoded.getPath(), "-f", "rawvideo", "-pix_fmt", "gray", decoded.getPath());

        File recovered = folder.newFile();
        Frames.VisualCodec codec = new Frames.VisualCodec();
        try (Frames.Collector collector = new Frames.Collector(recovered, folder.newFile());
             BufferedInputStream input = new BufferedInputStream(Files.newInputStream(decoded.toPath()))) {
            byte[] pixels = new byte[side * side];
            while (input.readNBytes(pixels, 0, pixels.length) == pixels.length) {
                Frames.Packet packet = read(codec, pixels, side);
                if (packet != null) collector.accept(packet);
            }
            collector.finish();
        }
        File restored = folder.newFile();
        assertEquals(NAME, Archive.unpack(recovered, restored, PASSWORD, IGNORE));
        assertArrayEquals(original, Files.readAllBytes(restored.toPath()));
    }

    private File pack(byte[] data, char[] password) throws Exception {
        File archive = folder.newFile();
        try (ByteArrayInputStream input = new ByteArrayInputStream(data)) {
            Archive.pack(input, NAME, data.length, archive, password, IGNORE);
        }
        return archive;
    }

    private Frames.Packet read(Frames.VisualCodec codec, byte[] pixels, int side) {
        return codec.read(side, side, (x, y) -> pixels[y * side + x] & 255);
    }

    private static byte[] data(int size) {
        byte[] bytes = new byte[size];
        new Random(2026).nextBytes(bytes);
        return bytes;
    }

    private boolean ffmpegAvailable() throws InterruptedException {
        try {
            Process process = new ProcessBuilder("ffmpeg", "-version")
                    .redirectErrorStream(true).redirectOutput(folder.newFile()).start();
            return process.waitFor(5, TimeUnit.SECONDS) && process.exitValue() == 0;
        } catch (IOException e) {
            return false;
        }
    }

    private void ffmpeg(String... args) throws Exception {
        File log = folder.newFile();
        String[] command = new String[args.length + 5];
        command[0] = "ffmpeg";
        command[1] = "-hide_banner";
        command[2] = "-loglevel";
        command[3] = "error";
        command[4] = "-y";
        System.arraycopy(args, 0, command, 5, args.length);
        Process process = new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(log).start();
        if (!process.waitFor(60, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new AssertionError("FFmpeg timed out");
        }
        String output = new String(Files.readAllBytes(log.toPath()), StandardCharsets.UTF_8);
        assertEquals(output, 0, process.exitValue());
    }
}
