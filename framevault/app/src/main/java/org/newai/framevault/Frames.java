package org.newai.framevault;

import com.google.zxing.common.reedsolomon.GenericGF;
import com.google.zxing.common.reedsolomon.ReedSolomonDecoder;
import com.google.zxing.common.reedsolomon.ReedSolomonEncoder;
import com.google.zxing.common.reedsolomon.ReedSolomonException;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.CRC32;

final class Frames {
    static final int SIDE = 720;
    static final int FPS = 24;
    static final int HOLD = 3;
    static final int GROUP = 8;
    static final int PAYLOAD = 640;
    private static final int GRID = 80;
    private static final int CELL = 8;
    private static final int ORIGIN = (SIDE - GRID * CELL) / 2;
    private static final int BLOCKS = 4;
    private static final int SYMBOLS = 200;
    private static final int CHECK = 32;
    private static final int MAGIC = 0x46564631;
    private static final int HEADER = 28;
    private static final int CRC_OFFSET = HEADER + PAYLOAD;
    private static final int LIGHT = 235;
    private static final int DARK = 16;

    record Packet(long id, long size, int count, int index, byte[] data) {}

    interface Luma {
        int get(int x, int y);
    }

    static long packetCount(long bytes) {
        return (bytes - 1) / PAYLOAD + 1;
    }

    static long videoPackets(long bytes) {
        long data = packetCount(bytes);
        return data + (data + GROUP - 1) / GROUP;
    }

    static final class VisualCodec {
        private final ReedSolomonEncoder encoder = new ReedSolomonEncoder(GenericGF.QR_CODE_FIELD_256);
        private final ReedSolomonDecoder decoder = new ReedSolomonDecoder(GenericGF.QR_CODE_FIELD_256);
        private byte[] lastValidCells;
        private Packet lastValidPacket;

        byte[] render(Packet packet) {
            byte[] cells = code(packet);
            byte[] pixels = new byte[SIDE * SIDE];
            Arrays.fill(pixels, (byte) DARK);
            for (int y = ORIGIN - 2 * CELL; y < SIDE - ORIGIN + 2 * CELL; y++) {
                int row = y * SIDE;
                Arrays.fill(pixels, row + ORIGIN - 2 * CELL, row + SIDE - ORIGIN + 2 * CELL,
                        (byte) LIGHT);
            }
            for (int row = 0; row < GRID; row++) {
                int firstPixel = (ORIGIN + row * CELL) * SIDE + ORIGIN;
                for (int col = 0; col < GRID; col++) {
                    int index = row * GRID + col;
                    if ((cells[index / 8] & (0x80 >>> (index % 8))) == 0) continue;
                    for (int y = 0; y < CELL; y++) {
                        int start = firstPixel + y * SIDE + col * CELL;
                        Arrays.fill(pixels, start, start + CELL, (byte) DARK);
                    }
                }
            }
            return pixels;
        }

        Packet read(int width, int height, Luma image) {
            if (width < 160 || height < 160) return null;
            int dark = sample(width, height, image, 12, SIDE / 2);
            int light = sample(width, height, image, ORIGIN - CELL, SIDE / 2);
            if (light - dark < 32) return null;
            int threshold = (light + dark) / 2;
            byte[] cells = new byte[BLOCKS * SYMBOLS];
            for (int row = 0; row < GRID; row++) {
                int y = ORIGIN + row * CELL + CELL / 2;
                for (int col = 0; col < GRID; col++) {
                    int x = ORIGIN + col * CELL + CELL / 2;
                    int index = row * GRID + col;
                    if (sample(width, height, image, x, y) < threshold) {
                        cells[index / 8] |= (byte) (0x80 >>> (index % 8));
                    }
                }
            }
            if (Arrays.equals(cells, lastValidCells)) return lastValidPacket;
            Packet packet = decode(cells);
            if (packet != null) {
                lastValidCells = cells;
                lastValidPacket = packet;
            }
            return packet;
        }

        private int sample(int width, int height, Luma image, int x, int y) {
            return image.get((int) ((long) x * width / SIDE), (int) ((long) y * height / SIDE));
        }

        private byte[] code(Packet packet) {
            byte[] bytes = ByteBuffer.allocate(BLOCKS * (SYMBOLS - CHECK))
                    .putInt(MAGIC).putLong(packet.id()).putLong(packet.size())
                    .putInt(packet.count()).putInt(packet.index()).put(packet.data()).array();
            ByteBuffer.wrap(bytes).putInt(CRC_OFFSET, checksum(bytes));
            byte[] cells = new byte[BLOCKS * SYMBOLS];
            for (int block = 0; block < BLOCKS; block++) {
                int[] symbols = new int[SYMBOLS];
                for (int i = 0; i < SYMBOLS - CHECK; i++) {
                    symbols[i] = bytes[i * BLOCKS + block] & 255;
                }
                encoder.encode(symbols, CHECK);
                for (int i = 0; i < SYMBOLS; i++) {
                    cells[i * BLOCKS + block] = (byte) symbols[i];
                }
            }
            return cells;
        }

        private Packet decode(byte[] cells) {
            byte[] bytes = new byte[BLOCKS * (SYMBOLS - CHECK)];
            for (int block = 0; block < BLOCKS; block++) {
                int[] symbols = new int[SYMBOLS];
                for (int i = 0; i < SYMBOLS; i++) {
                    symbols[i] = cells[i * BLOCKS + block] & 255;
                }
                try {
                    decoder.decode(symbols, CHECK);
                } catch (ReedSolomonException e) {
                    return null;
                }
                for (int i = 0; i < SYMBOLS - CHECK; i++) {
                    bytes[i * BLOCKS + block] = (byte) symbols[i];
                }
            }
            ByteBuffer buffer = ByteBuffer.wrap(bytes);
            if (buffer.getInt() != MAGIC || buffer.getInt(CRC_OFFSET) != checksum(bytes)) return null;
            long id = buffer.getLong();
            long size = buffer.getLong();
            int count = buffer.getInt();
            int index = buffer.getInt();
            if (size <= 0 || count <= 0 || count != packetCount(size)) return null;
            if (index >= count || (index < 0 && (~index >= count || ~index % GROUP != 0))) return null;
            byte[] data = new byte[PAYLOAD];
            buffer.get(data);
            return new Packet(id, size, count, index, data);
        }

        private int checksum(byte[] bytes) {
            CRC32 crc = new CRC32();
            crc.update(bytes, 0, CRC_OFFSET);
            return (int) crc.getValue();
        }
    }

    static final class Source implements AutoCloseable {
        private final RandomAccessFile archive;
        private final long size;
        private final int count;
        private final long id = new SecureRandom().nextLong();
        private byte[] parity = new byte[PAYLOAD];
        private int index;
        private boolean parityDue;

        Source(File file) throws IOException {
            size = file.length();
            long packets = packetCount(size);
            if (size <= 0 || packets > Integer.MAX_VALUE) throw new IOException("Invalid archive size");
            count = (int) packets;
            archive = new RandomAccessFile(file, "r");
        }

        Packet next() throws IOException {
            if (parityDue) {
                int groupStart = (index - 1) / GROUP * GROUP;
                Packet packet = new Packet(id, size, count, ~groupStart, parity);
                parity = new byte[PAYLOAD];
                parityDue = false;
                return packet;
            }
            if (index == count) return null;
            byte[] bytes = new byte[PAYLOAD];
            int length = (int) Math.min(PAYLOAD, size - (long) index * PAYLOAD);
            archive.readFully(bytes, 0, length);
            xor(parity, bytes);
            Packet packet = new Packet(id, size, count, index++, bytes);
            parityDue = index == count || index % GROUP == 0;
            return packet;
        }

        @Override
        public void close() throws IOException {
            archive.close();
        }
    }

    static final class MissingPackets extends IOException {
        MissingPackets() {
            super("Video is missing FrameVault packets");
        }
    }

    static final class Collector implements AutoCloseable {
        private final RandomAccessFile archive;
        private final RandomAccessFile parity;
        private final Set<Integer> received = new HashSet<>();
        private final Set<Integer> recovery = new HashSet<>();
        private long id;
        private long size;
        private int count;

        Collector(File output, File parityFile) throws IOException {
            archive = new RandomAccessFile(output, "rw");
            try {
                parity = new RandomAccessFile(parityFile, "rw");
            } catch (IOException e) {
                archive.close();
                throw e;
            }
        }

        boolean accept(Packet packet) throws IOException {
            if (count == 0) {
                id = packet.id();
                size = packet.size();
                count = packet.count();
            }
            if (id != packet.id() || size != packet.size() || count != packet.count()) {
                return false;
            }
            int index = packet.index();
            if (index < 0) {
                int group = ~index / GROUP;
                if (recovery.add(group)) write(parity, group, packet.data());
            } else if (received.add(index)) {
                write(archive, index, packet.data());
            }
            return received.size() == count;
        }

        void finish() throws IOException {
            if (count == 0 || count - received.size() > recovery.size()) throw new MissingPackets();
            byte[] recovered = new byte[PAYLOAD];
            byte[] known = new byte[PAYLOAD];
            for (long group = 0; received.size() < count && group < count; group += GROUP) {
                int start = (int) group;
                int end = (int) Math.min(group + GROUP, count);
                int missing = -1;
                for (int index = start; index < end; index++) {
                    if (received.contains(index)) continue;
                    if (missing != -1) throw new MissingPackets();
                    missing = index;
                }
                if (missing == -1) continue;
                if (!recovery.contains(start / GROUP)) throw new MissingPackets();
                read(parity, start / GROUP, recovered);
                for (int index = start; index < end; index++) {
                    if (index == missing) continue;
                    read(archive, index, known);
                    xor(recovered, known);
                }
                write(archive, missing, recovered);
                received.add(missing);
            }
            archive.setLength(size);
        }

        private void write(RandomAccessFile file, int index, byte[] data) throws IOException {
            file.seek((long) index * PAYLOAD);
            file.write(data);
        }

        private void read(RandomAccessFile file, int index, byte[] data) throws IOException {
            file.seek((long) index * PAYLOAD);
            file.readFully(data);
        }

        @Override
        public void close() throws IOException {
            try {
                archive.close();
            } finally {
                parity.close();
            }
        }
    }

    private static void xor(byte[] left, byte[] right) {
        for (int i = 0; i < left.length; i++) {
            left[i] ^= right[i];
        }
    }

    private Frames() {}
}
