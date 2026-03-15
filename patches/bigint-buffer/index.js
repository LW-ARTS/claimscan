'use strict';

/**
 * bigint-buffer pure JS shim — drop-in replacement
 * Removes vulnerable native C++ bindings (CVE: GHSA-3gc7-fjrx-p6mg)
 * Uses only safe JS BigInt operations with bounds validation.
 */

Object.defineProperty(exports, "__esModule", { value: true });

function toBigIntLE(buf) {
  if (!Buffer.isBuffer(buf) && !(buf instanceof Uint8Array)) {
    throw new TypeError('Expected Buffer or Uint8Array');
  }
  if (buf.length === 0) return BigInt(0);
  const reversed = Buffer.from(buf);
  reversed.reverse();
  const hex = reversed.toString('hex');
  return BigInt(`0x${hex}`);
}
exports.toBigIntLE = toBigIntLE;

function toBigIntBE(buf) {
  if (!Buffer.isBuffer(buf) && !(buf instanceof Uint8Array)) {
    throw new TypeError('Expected Buffer or Uint8Array');
  }
  if (buf.length === 0) return BigInt(0);
  const hex = Buffer.from(buf).toString('hex');
  return BigInt(`0x${hex}`);
}
exports.toBigIntBE = toBigIntBE;

function toBufferLE(num, width) {
  if (typeof num !== 'bigint') throw new TypeError('Expected BigInt');
  if (typeof width !== 'number' || width <= 0) throw new RangeError('Width must be positive integer');
  const hex = num.toString(16).padStart(width * 2, '0').slice(0, width * 2);
  const buffer = Buffer.from(hex, 'hex');
  buffer.reverse();
  return buffer;
}
exports.toBufferLE = toBufferLE;

function toBufferBE(num, width) {
  if (typeof num !== 'bigint') throw new TypeError('Expected BigInt');
  if (typeof width !== 'number' || width <= 0) throw new RangeError('Width must be positive integer');
  const hex = num.toString(16).padStart(width * 2, '0').slice(0, width * 2);
  return Buffer.from(hex, 'hex');
}
exports.toBufferBE = toBufferBE;
