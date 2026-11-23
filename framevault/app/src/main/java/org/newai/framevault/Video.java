package org.newai.framevault;

import android.graphics.Rect;
import android.media.Image;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Objects;

final class Video {
    private static final long POLL_US = 10_000;
    private static final long STALL_NS = 30_000_000_000L;
    private static final int COLOR = MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible;

    private Video() {}

    static void encode(File archive, File output, Archive.Progress progress) throws IOException {
        int side = Frames.SIDE;
        MediaFormat format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, side, side);
        format.setInteger(MediaFormat.KEY_COLOR_FORMAT, COLOR);
        format.setInteger(MediaFormat.KEY_BIT_RATE, 4_000_000);
        format.setInteger(MediaFormat.KEY_FRAME_RATE, Frames.FPS);
        format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1);
        format.setInteger(MediaFormat.KEY_COLOR_RANGE, MediaFormat.COLOR_RANGE_LIMITED);

        MediaCodec encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
        try (Frames.Source packets = new Frames.Source(archive)) {
            encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            encoder.start();
            MediaMuxer muxer = new MediaMuxer(output.getPath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            try {
                writeVideo(encoder, muxer, packets, Frames.videoPackets(archive.length()), progress);
            } finally {
                muxer.release();
            }
        } finally {
            encoder.release();
        }
    }

    private static void writeVideo(MediaCodec encoder, MediaMuxer muxer, Frames.Source packets,
                                   long total, Archive.Progress progress) throws IOException {
        Frames.VisualCodec visual = new Frames.VisualCodec();
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        byte[] pixels = null;
        byte[] gray = new byte[Frames.SIDE / 2];
        Arrays.fill(gray, (byte) 128);
        int track = -1;
        long frame = 0;
        long lastActivity = System.nanoTime();
        boolean inputEnded = false;

        while (true) {
            progress.update(frame / Frames.HOLD, total);
            if (!inputEnded) {
                int input = encoder.dequeueInputBuffer(POLL_US);
                if (input >= 0) {
                    if (frame % Frames.HOLD == 0) {
                        Frames.Packet packet = packets.next();
                        pixels = packet == null ? null : visual.render(packet);
                    }
                    long time = frame * 1_000_000 / Frames.FPS;
                    if (pixels == null) {
                        encoder.queueInputBuffer(input, 0, 0, time, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                        inputEnded = true;
                    } else {
                        try (Image image = encoder.getInputImage(input)) {
                            if (image == null) throw new IOException("Encoder has no YUV input");
                            Image.Plane[] planes = image.getPlanes();
                            fill(planes[0], Frames.SIDE, Frames.SIDE, pixels, false);
                            fill(planes[1], Frames.SIDE / 2, Frames.SIDE / 2, gray, true);
                            fill(planes[2], Frames.SIDE / 2, Frames.SIDE / 2, gray, true);
                        }
                        int length = Frames.SIDE * Frames.SIDE * 3 / 2;
                        encoder.queueInputBuffer(input, 0, length, time, 0);
                        frame++;
                    }
                    lastActivity = System.nanoTime();
                }
            }

            int output = encoder.dequeueOutputBuffer(info, inputEnded ? POLL_US : 0);
            if (output == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                track = muxer.addTrack(encoder.getOutputFormat());
                muxer.start();
                lastActivity = System.nanoTime();
            } else if (output >= 0) {
                try {
                    if (info.size > 0 && (info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
                        if (track < 0) throw new IOException("Video track missing");
                        ByteBuffer buffer = Objects.requireNonNull(encoder.getOutputBuffer(output));
                        buffer.position(info.offset);
                        buffer.limit(info.offset + info.size);
                        muxer.writeSampleData(track, buffer, info);
                    }
                } finally {
                    encoder.releaseOutputBuffer(output, false);
                }
                lastActivity = System.nanoTime();
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) break;
            }
            requireActivity(lastActivity);
        }
        if (track < 0) throw new IOException("Video track missing");
        muxer.stop();
    }

    private static void fill(Image.Plane plane, int width, int height, byte[] values, boolean repeat) {
        ByteBuffer buffer = plane.getBuffer();
        int start = buffer.position();
        int pixelStride = plane.getPixelStride();
        for (int y = 0; y < height; y++) {
            int row = start + y * plane.getRowStride();
            int source = repeat ? 0 : y * width;
            if (pixelStride == 1) {
                buffer.position(row);
                buffer.put(values, source, width);
            } else {
                for (int x = 0; x < width; x++) {
                    buffer.put(row + x * pixelStride, values[source + x]);
                }
            }
        }
    }

    static void decode(File video, File output, File parity, Archive.Progress progress)
            throws IOException {
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(video.getPath());
            for (int track = 0; track < extractor.getTrackCount(); track++) {
                MediaFormat format = extractor.getTrackFormat(track);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime == null || !mime.startsWith("video/")) continue;
                extractor.selectTrack(track);
                format.setInteger(MediaFormat.KEY_COLOR_FORMAT, COLOR);
                MediaCodec decoder = MediaCodec.createDecoderByType(mime);
                try (Frames.Collector packets = new Frames.Collector(output, parity)) {
                    decoder.configure(format, null, null, 0);
                    decoder.start();
                    long duration = format.containsKey(MediaFormat.KEY_DURATION)
                            ? format.getLong(MediaFormat.KEY_DURATION) : -1;
                    readVideo(extractor, decoder, packets, duration, progress);
                    packets.finish();
                    return;
                } finally {
                    decoder.release();
                }
            }
            throw new Frames.MissingPackets();
        } finally {
            extractor.release();
        }
    }

    private static void readVideo(MediaExtractor extractor, MediaCodec decoder,
                                  Frames.Collector packets, long duration, Archive.Progress progress)
            throws IOException {
        Frames.VisualCodec visual = new Frames.VisualCodec();
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean inputEnded = false;
        long lastActivity = System.nanoTime();
        long time = 0;
        while (true) {
            progress.update(time, duration);
            if (!inputEnded) {
                int input = decoder.dequeueInputBuffer(POLL_US);
                if (input >= 0) {
                    ByteBuffer buffer = Objects.requireNonNull(decoder.getInputBuffer(input));
                    int length = extractor.readSampleData(buffer, 0);
                    if (length < 0) {
                        decoder.queueInputBuffer(input, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                        inputEnded = true;
                    } else {
                        decoder.queueInputBuffer(input, 0, length, extractor.getSampleTime(), 0);
                        extractor.advance();
                    }
                    lastActivity = System.nanoTime();
                }
            }

            int output = decoder.dequeueOutputBuffer(info, inputEnded ? POLL_US : 0);
            if (output >= 0) {
                try {
                    if (info.size > 0) {
                        time = Math.max(time, info.presentationTimeUs);
                        try (Image image = decoder.getOutputImage(output)) {
                            if (image == null) throw new IOException("Decoder has no YUV output");
                            Frames.Packet packet = readImage(visual, image);
                            if (packet != null && packets.accept(packet)) return;
                        }
                    }
                } finally {
                    decoder.releaseOutputBuffer(output, false);
                }
                lastActivity = System.nanoTime();
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return;
            }
            requireActivity(lastActivity);
        }
    }

    private static Frames.Packet readImage(Frames.VisualCodec visual, Image image) {
        Rect crop = image.getCropRect();
        Image.Plane yPlane = image.getPlanes()[0];
        ByteBuffer yBuffer = yPlane.getBuffer();
        int start = yBuffer.position() + crop.top * yPlane.getRowStride()
                + crop.left * yPlane.getPixelStride();
        Frames.Luma samples = (x, y) -> yBuffer.get(start + y * yPlane.getRowStride()
                + x * yPlane.getPixelStride()) & 255;
        Frames.Packet packet = visual.read(crop.width(), crop.height(), samples);
        if (packet != null || crop.width() == crop.height()) return packet;

        int square = Math.min(crop.width(), crop.height());
        int left = (crop.width() - square) / 2;
        int top = (crop.height() - square) / 2;
        return visual.read(square, square, (x, y) -> samples.get(left + x, top + y));
    }

    private static void requireActivity(long updated) throws IOException {
        if (System.nanoTime() - updated > STALL_NS) throw new IOException("Video codec timed out");
    }
}
