package org.newai.framevault;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

final class Archive {
    private static final int MAGIC = 0x46564131;
    private static final int CHUNK_BYTES = 64 * 1024;
    private static final int NAME_BYTES = 1024;
    private static final int HASH_BYTES = 32;
    private static final int TAG_BYTES = 16;
    private static final int SALT_BYTES = 16;
    private static final int NONCE_PREFIX_BYTES = 8;
    private static final int ITERATIONS = 600_000;

    interface Progress {
        void update(long completed, long total) throws IOException;
    }

    static final class InvalidArchive extends IOException {
        InvalidArchive() {
            super("Invalid FrameVault archive");
        }
    }

    static final class PasswordRequired extends IOException {
        PasswordRequired() {
            super("Password required");
        }
    }

    private Archive() {}

    static void pack(InputStream input, String name, long size, File output, char[] password,
                     Progress progress) throws IOException, GeneralSecurityException {
        byte[] nameBytes = safeName(name).getBytes(StandardCharsets.UTF_8);
        if (nameBytes.length > NAME_BYTES) {
            nameBytes = "restored-file".getBytes(StandardCharsets.UTF_8);
        }
        boolean encrypted = password.length != 0;
        byte[] salt = new byte[SALT_BYTES];
        byte[] noncePrefix = new byte[NONCE_PREFIX_BYTES];
        if (encrypted) {
            SecureRandom random = new SecureRandom();
            random.nextBytes(salt);
            random.nextBytes(noncePrefix);
        }
        byte[] header = header(encrypted, salt, noncePrefix);
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        SecretKeySpec key = encrypted ? key(password, salt) : null;
        try (DataOutputStream out = new DataOutputStream(
                new BufferedOutputStream(new FileOutputStream(output)))) {
            out.write(header);
            writeRecord(out, key, header, noncePrefix, 0, nameBytes.length, nameBytes, nameBytes.length);
            hash.update(ByteBuffer.allocate(4).putInt(nameBytes.length).array());
            hash.update(nameBytes);
            byte[] buffer = new byte[CHUNK_BYTES];
            int record = 1;
            long completed = 0;
            InputStream source = new BufferedInputStream(input);
            int length;
            while ((length = readChunk(source, buffer)) != 0) {
                if (record == Integer.MAX_VALUE) throw new IOException("Archive is too large");
                writeRecord(out, key, header, noncePrefix, record++, length, buffer, length);
                hash.update(buffer, 0, length);
                completed += length;
                progress.update(completed, size);
            }
            writeRecord(out, key, header, noncePrefix, record, -1, hash.digest(), HASH_BYTES);
        }
    }

    static String unpack(File input, File output, char[] password, Progress progress)
            throws IOException, GeneralSecurityException {
        try (DataInputStream in = new DataInputStream(
                    new BufferedInputStream(new FileInputStream(input)));
             BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(output))) {
            if (in.readInt() != MAGIC) throw new InvalidArchive();
            int mode = in.readUnsignedByte();
            if (mode > 1) throw new InvalidArchive();
            if (mode == 1 && password.length == 0) throw new PasswordRequired();
            byte[] salt = new byte[SALT_BYTES];
            byte[] noncePrefix = new byte[NONCE_PREFIX_BYTES];
            in.readFully(salt);
            in.readFully(noncePrefix);
            byte[] header = header(mode == 1, salt, noncePrefix);
            SecretKeySpec key = mode == 1 ? key(password, salt) : null;
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            int nameLength = in.readInt();
            if (nameLength < 1 || nameLength > NAME_BYTES) throw new InvalidArchive();
            byte[] nameBytes = readRecord(in, key, header, noncePrefix, 0, nameLength, nameLength);
            hash.update(ByteBuffer.allocate(4).putInt(nameBytes.length).array());
            hash.update(nameBytes);
            long completed = header.length + 4L + nameLength + (key == null ? 0 : TAG_BYTES);
            long total = input.length();
            for (int record = 1; ; record++) {
                int length = in.readInt();
                if (length == -1) {
                    byte[] expected = readRecord(in, key, header, noncePrefix, record, -1, HASH_BYTES);
                    if (!MessageDigest.isEqual(expected, hash.digest()) || in.read() != -1) {
                        throw new InvalidArchive();
                    }
                    return safeName(new String(nameBytes, StandardCharsets.UTF_8));
                }
                if (length < 1 || length > CHUNK_BYTES || record == Integer.MAX_VALUE) {
                    throw new InvalidArchive();
                }
                byte[] chunk = readRecord(in, key, header, noncePrefix, record, length, length);
                hash.update(chunk);
                out.write(chunk);
                completed += 4L + length + (key == null ? 0 : TAG_BYTES);
                progress.update(completed, total);
            }
        }
    }

    private static int readChunk(InputStream in, byte[] buffer) throws IOException {
        int size = 0;
        while (size < buffer.length) {
            int length = in.read(buffer, size, buffer.length - size);
            if (length < 0) break;
            size += length;
        }
        return size;
    }

    private static byte[] header(boolean encrypted, byte[] salt, byte[] noncePrefix) {
        return ByteBuffer.allocate(5 + SALT_BYTES + NONCE_PREFIX_BYTES)
                .putInt(MAGIC).put((byte) (encrypted ? 1 : 0)).put(salt).put(noncePrefix).array();
    }

    private static SecretKeySpec key(char[] password, byte[] salt) throws GeneralSecurityException {
        PBEKeySpec spec = new PBEKeySpec(password, salt, ITERATIONS, 256);
        try {
            byte[] raw = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                    .generateSecret(spec).getEncoded();
            try {
                return new SecretKeySpec(raw, "AES");
            } finally {
                Arrays.fill(raw, (byte) 0);
            }
        } finally {
            spec.clearPassword();
        }
    }

    private static Cipher cipher(int mode, SecretKeySpec key, byte[] header, byte[] noncePrefix,
                                 int record, int lengthTag) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        byte[] nonce = ByteBuffer.allocate(12).put(noncePrefix).putInt(record).array();
        cipher.init(mode, key, new GCMParameterSpec(128, nonce));
        cipher.updateAAD(header);
        cipher.updateAAD(ByteBuffer.allocate(8).putInt(record).putInt(lengthTag).array());
        return cipher;
    }

    private static void writeRecord(DataOutputStream out, SecretKeySpec key, byte[] header,
                                    byte[] noncePrefix, int record, int lengthTag, byte[] body,
                                    int length) throws IOException, GeneralSecurityException {
        out.writeInt(lengthTag);
        if (key == null) {
            out.write(body, 0, length);
        } else {
            out.write(cipher(Cipher.ENCRYPT_MODE, key, header, noncePrefix, record, lengthTag)
                    .doFinal(body, 0, length));
        }
    }

    private static byte[] readRecord(DataInputStream in, SecretKeySpec key, byte[] header,
                                     byte[] noncePrefix, int record, int lengthTag, int length)
            throws IOException, GeneralSecurityException {
        byte[] body = new byte[length + (key == null ? 0 : TAG_BYTES)];
        in.readFully(body);
        if (key == null) return body;
        return cipher(Cipher.DECRYPT_MODE, key, header, noncePrefix, record, lengthTag).doFinal(body);
    }

    private static String safeName(String name) {
        String cleaned = name.replaceAll("[\\p{Cntrl}/\\\\]", "_").trim();
        if (cleaned.isEmpty() || cleaned.equals(".") || cleaned.equals("..")) return "restored-file";
        return cleaned;
    }
}
