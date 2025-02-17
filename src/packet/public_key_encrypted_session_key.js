// GPG4Browsers - An OpenPGP implementation in javascript
// Copyright (C) 2011 Recurity Labs GmbH
//
// This library is free software; you can redistribute it and/or
// modify it under the terms of the GNU Lesser General Public
// License as published by the Free Software Foundation; either
// version 3.0 of the License, or (at your option) any later version.
//
// This library is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public
// License along with this library; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA

import KeyID from '../type/keyid';
import crypto from '../crypto';
import enums from '../enums';
import util from '../util';
import { UnsupportedError } from './packet';

const VERSION = 3;

/**
 * Public-Key Encrypted Session Key Packets (Tag 1)
 *
 * {@link https://tools.ietf.org/html/rfc4880#section-5.1|RFC4880 5.1}:
 * A Public-Key Encrypted Session Key packet holds the session key
 * used to encrypt a message. Zero or more Public-Key Encrypted Session Key
 * packets and/or Symmetric-Key Encrypted Session Key packets may precede a
 * Symmetrically Encrypted Data Packet, which holds an encrypted message. The
 * message is encrypted with the session key, and the session key is itself
 * encrypted and stored in the Encrypted Session Key packet(s). The
 * Symmetrically Encrypted Data Packet is preceded by one Public-Key Encrypted
 * Session Key packet for each OpenPGP key to which the message is encrypted.
 * The recipient of the message finds a session key that is encrypted to their
 * public key, decrypts the session key, and then uses the session key to
 * decrypt the message.
 */
class PublicKeyEncryptedSessionKeyPacket {
  static get tag() {
    return enums.packet.publicKeyEncryptedSessionKey;
  }

  constructor() {
    this.version = 3;

    this.publicKeyID = new KeyID();
    this.publicKeyAlgorithm = null;

    this.sessionKey = null;
    /**
     * Algorithm to encrypt the message with
     * @type {enums.symmetric}
     */
    this.sessionKeyAlgorithm = null;

    /** @type {Object} */
    this.encrypted = {};
  }

  /**
   * Parsing function for a publickey encrypted session key packet (tag 1).
   *
   * @param {Uint8Array} bytes - Payload of a tag 1 packet
   */
  read(bytes) {
    this.version = bytes[0];
    if (this.version !== VERSION) {
      throw new UnsupportedError(`Version ${this.version} of the PKESK packet is unsupported.`);
    }
    this.publicKeyID.read(bytes.subarray(1, bytes.length));
    this.publicKeyAlgorithm = bytes[9];
    this.encrypted = crypto.parseEncSessionKeyParams(this.publicKeyAlgorithm, bytes.subarray(10));
  }

  /**
   * Create a binary representation of a tag 1 packet
   *
   * @returns {Uint8Array} The Uint8Array representation.
   */
  write() {
    const arr = [
      new Uint8Array([this.version]),
      this.publicKeyID.write(),
      new Uint8Array([this.publicKeyAlgorithm]),
      crypto.serializeParams(this.publicKeyAlgorithm, this.encrypted)
    ];

    return util.concatUint8Array(arr);
  }

  /**
   * Encrypt session key packet
   * @param {PublicKeyPacket} key - Public key
   * @throws {Error} if encryption failed
   * @async
   */
  async encrypt(key) {
    const data = util.concatUint8Array([
      new Uint8Array([enums.write(enums.symmetric, this.sessionKeyAlgorithm)]),
      this.sessionKey,
      util.writeChecksum(this.sessionKey)
    ]);
    const algo = enums.write(enums.publicKey, this.publicKeyAlgorithm);
    this.encrypted = await crypto.publicKeyEncrypt(
      algo, key.publicParams, data, key.getFingerprintBytes());
  }

  /**
   * Decrypts the session key (only for public key encrypted session key
   * packets (tag 1)
   * @param {SecretKeyPacket} key - decrypted private key
   * @throws {Error} if decryption failed
   * @async
   */
  async decrypt(key) {
    // check that session key algo matches the secret key algo
    if (this.publicKeyAlgorithm !== key.algorithm) {
      throw new Error('Decryption error');
    }
    const decoded = await crypto.publicKeyDecrypt(this.publicKeyAlgorithm, key.publicParams, key.privateParams, this.encrypted, key.getFingerprintBytes());
    const checksum = decoded.subarray(decoded.length - 2);
    const sessionKey = decoded.subarray(1, decoded.length - 2);
    if (!util.equalsUint8Array(checksum, util.writeChecksum(sessionKey))) {
      throw new Error('Decryption error');
    } else {
      this.sessionKey = sessionKey;
      this.sessionKeyAlgorithm = enums.write(enums.symmetric, decoded[0]);
    }
  }
}

export default PublicKeyEncryptedSessionKeyPacket;
