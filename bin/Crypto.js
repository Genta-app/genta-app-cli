//
// Copyright (c) 2022 Digital Five Pty Ltd
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import sha1 from 'js-sha1';
import {Blob} from 'node:buffer';

import {createRequire} from 'module';

const require = createRequire(import.meta.url);

export const so = require('libsodium-wrappers-sumo');
(async () => {
    await so.ready;
})();

// random sequences

const byte_to_hex =
    Array.from(Array(256).keys()).map((x, index) => index.toString(16).padStart(2, "0"));

export function randomHexString() {
    return Array.from(so.randombytes_buf(8)).map(value => byte_to_hex[value]).join("");
}

// key derivation

export function deriveDirectLinkKey(password) {
    const STATIC_SALT = "oyMCTXn6A2CTqeJUx5AGPEJut7SLYUBl";

    const salt = so.crypto_generichash(
        so.crypto_pwhash_argon2id_SALTBYTES,
        STATIC_SALT);

    const key = so.crypto_pwhash(
        so.crypto_secretbox_KEYBYTES,
        password,
        salt,
        so.crypto_pwhash_OPSLIMIT_MIN,
        so.crypto_pwhash_MEMLIMIT_MIN,
        so.crypto_pwhash_ALG_ARGON2ID13);

    return key;
}

function deriveKey(email, password, site_static_salt) {
    /*
        salt choice justification:
        - email makes the salt user-specific. if multiple users use the
          same password, they still get a different salt.
        - password makes the salt change when the user changes password
        - site_specific_salt will protect from user reusing the same username/password
          across multiple sites

        alternative is a ransom salt saved to server
    */
    const salt = so.crypto_generichash(
        so.crypto_pwhash_argon2id_SALTBYTES,
        email + password + site_static_salt);

    const key = so.crypto_pwhash(
        so.crypto_secretbox_KEYBYTES,
        password,
        salt,
        so.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        so.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        so.crypto_pwhash_ALG_ARGON2ID13);

    return key;
}

export function deriveMasterKey(email, password) {
    const CONTENT_SALT = "hWEItdE7hk5GrsjocSkCg8JDoMS9MAA8";
    return deriveKey(email, password, CONTENT_SALT);
}

export function deriveAuthKey(email, password) {

    const AUTH_SALT = "9o5v4nfadljWlXeOd3Ru60jqloa8sRQy";
    return deriveKey(email, password, AUTH_SALT);
}

// misc

export function generateDirectFilePassword() {
    return so.randombytes_buf(16);
}

// public key crypto

export function generateKeys() {
    const content_keys = so.crypto_box_keypair();
    return [content_keys.privateKey, content_keys.publicKey];
}

export function cryptoBox(
    sender_private_key /*Uint8Array*/,
    receiver_public_key /*Uint8Array*/,
    data /*Uint8Array*/) {
    const nonce = so.randombytes_buf(so.crypto_box_NONCEBYTES);
    const encrypted_data = so.crypto_box_easy(data, nonce,
        receiver_public_key, sender_private_key);

    const encrypted_blob = new Uint8Array(nonce.length + encrypted_data.length);
    encrypted_blob.set(nonce);
    encrypted_blob.set(encrypted_data, nonce.length);
    return encrypted_blob;
}

export function cryptoBoxOpen(
    receiver_private_key /*Uint8Array*/,
    sender_public_key /*Uint8Array*/,
    encrypted_blob /*Uint8Array*/
) {
    const nonce = encrypted_blob.subarray(0, so.crypto_box_NONCEBYTES);
    const encrypted_data = encrypted_blob.subarray(so.crypto_box_NONCEBYTES);
    const data = so.crypto_box_open_easy(
        encrypted_data, nonce, sender_public_key, receiver_private_key);
    return data;
}

// symmetric crypto

export function symmetricGenerateKey() {
    const key = so.randombytes_buf(so.crypto_secretbox_KEYBYTES);
    return key;
}

export function symmetricEncrypt(key, data /*Uint8Array*/) {
    const nonce = so.randombytes_buf(so.crypto_secretbox_NONCEBYTES);
    const encrypted_data = so.crypto_secretbox_easy(data, nonce, key);
    const encrypted_blob = new Uint8Array(nonce.length + encrypted_data.length);
    encrypted_blob.set(nonce);
    encrypted_blob.set(encrypted_data, nonce.length);
    return encrypted_blob;
}

export function symmetricDecrypt(key, encrypted_blob) {
    const nonce = encrypted_blob.subarray(0, so.crypto_secretbox_NONCEBYTES);
    const encrypted_data = encrypted_blob.subarray(so.crypto_secretbox_NONCEBYTES);
    const data = so.crypto_secretbox_open_easy(encrypted_data, nonce, key);
    return data;
}

export async function symmetricDecryptString(key, encrypted_blob) {
    const nonce = encrypted_blob.subarray(0, so.crypto_secretbox_NONCEBYTES);
    const encrypted_data = encrypted_blob.subarray(so.crypto_secretbox_NONCEBYTES);
    const data = so.crypto_secretbox_open_easy(encrypted_data, nonce, key);
    return await (new Blob([data]).text());
}

// sha1

export function digestSHA1(data /*Uin8Array*/) {
    const hash = sha1.create();
    hash.update(data);
    const digest = hash.hex();
    return digest;
}
