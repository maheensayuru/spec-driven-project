export type DocumentSecurityScanStatus = 'clean' | 'blocked';

export interface DocumentSecurityScanResult {
  status: DocumentSecurityScanStatus;
  threatFound?: string;
  reason?: string;
  scannedAt: Date;
}

export interface DocumentSecurityScanner {
  scan(content: Buffer, filename?: string): Promise<DocumentSecurityScanResult>;
}

/**
 * MockDocumentSecurityScanner
 *
 * Deterministic mock security scanner intended strictly for testing and development environments.
 * It inspects byte content and filenames for well-known test virus signatures (EICAR),
 * executable binary headers (DOS PE MZ, ELF, Mach-O), shell scripts, and HTML/script tags.
 *
 * NOTE: This is a deterministic mock scanner and must NOT be used as a production antivirus replacement.
 */
export class MockDocumentSecurityScanner implements DocumentSecurityScanner {
  async scan(content: Buffer, filename?: string): Promise<DocumentSecurityScanResult> {
    const scannedAt = new Date();

    if (!content || content.length === 0) {
      return {
        status: 'clean',
        scannedAt,
      };
    }

    const contentLatin1 = content.toString('latin1');

    // 1. EICAR standard antivirus test signature
    if (contentLatin1.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
      return {
        status: 'blocked',
        threatFound: 'EICAR_STANDARD_TEST_VIRUS',
        reason: 'Blocked: EICAR standard antivirus test signature detected',
        scannedAt,
      };
    }

    // 2. Executable / binary headers:
    // DOS / Windows PE executable header (MZ)
    if (content.length >= 2 && content[0] === 0x4d && content[1] === 0x5a) {
      return {
        status: 'blocked',
        threatFound: 'EXECUTABLE_DOS_PE_HEADER',
        reason: 'Blocked: Windows PE / DOS MZ executable header detected',
        scannedAt,
      };
    }

    // Linux ELF binary header (\x7fELF)
    if (
      content.length >= 4 &&
      content[0] === 0x7f &&
      content[1] === 0x45 &&
      content[2] === 0x4c &&
      content[3] === 0x46
    ) {
      return {
        status: 'blocked',
        threatFound: 'EXECUTABLE_ELF_HEADER',
        reason: 'Blocked: Linux ELF executable binary header detected',
        scannedAt,
      };
    }

    // Mach-O binary headers
    if (content.length >= 4) {
      const b0 = content[0];
      const b1 = content[1];
      const b2 = content[2];
      const b3 = content[3];
      if (
        (b0 === 0xfe && b1 === 0xed && b2 === 0xfa && (b3 === 0xce || b3 === 0xcf)) ||
        (b0 === 0xce && b1 === 0xfa && b2 === 0xed && b3 === 0xfe) ||
        (b0 === 0xcf && b1 === 0xfa && b2 === 0xed && b3 === 0xfe)
      ) {
        return {
          status: 'blocked',
          threatFound: 'EXECUTABLE_MACHO_HEADER',
          reason: 'Blocked: Mach-O executable binary header detected',
          scannedAt,
        };
      }
    }

    // 3. Embedded scripts / polyglot tags
    if (/<script[\s>]/i.test(contentLatin1) || /<\/script>/i.test(contentLatin1)) {
      return {
        status: 'blocked',
        threatFound: 'SCRIPT_TAG_INJECTION',
        reason: 'Blocked: Embedded HTML script tag detected in document content',
        scannedAt,
      };
    }

    // 4. Shell script shebang
    if (
      contentLatin1.startsWith('#!/bin/sh') ||
      contentLatin1.startsWith('#!/bin/bash') ||
      contentLatin1.startsWith('#!/usr/bin/env')
    ) {
      return {
        status: 'blocked',
        threatFound: 'SHELL_SCRIPT_PAYLOAD',
        reason: 'Blocked: Shell script execution marker detected',
        scannedAt,
      };
    }

    // 5. Embedded ZIP polyglots in documents not claiming to be ZIP
    const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const zipOffset = content.indexOf(zipMagic);
    if (zipOffset > 0) {
      return {
        status: 'blocked',
        threatFound: 'POLYGLOT_ZIP_PAYLOAD',
        reason: 'Blocked: Embedded ZIP archive polyglot header detected',
        scannedAt,
      };
    }

    // 6. Filename check for dangerous extensions if filename is provided
    if (filename) {
      const lower = filename.toLowerCase();
      const dangerousExtensions = [
        '.exe',
        '.bat',
        '.cmd',
        '.sh',
        '.ps1',
        '.vbs',
        '.js',
        '.scr',
        '.com',
      ];
      for (const ext of dangerousExtensions) {
        if (lower.endsWith(ext)) {
          return {
            status: 'blocked',
            threatFound: `DANGEROUS_FILE_EXTENSION_${ext.slice(1).toUpperCase()}`,
            reason: `Blocked: Filename has forbidden executable extension '${ext}'`,
            scannedAt,
          };
        }
      }
    }

    return {
      status: 'clean',
      scannedAt,
    };
  }
}

export const documentSecurityScanner: DocumentSecurityScanner = new MockDocumentSecurityScanner();
