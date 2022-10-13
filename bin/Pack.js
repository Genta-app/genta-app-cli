/* eslint-disable no-use-before-define,no-underscore-dangle,no-restricted-syntax,guard-for-in,
no-param-reassign,eqeqeq,no-undef,no-plusplus */

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

import { assert } from './Assert.js';

import * as crypto from './Crypto.js';

const PACK_FORMAT_VERSION = 42;
const TYPE_STR = 1;
const TYPE_INT32 = 2;
const TYPE_BYTES = 3;
const TYPE_LIST = 4;
const TYPE_MAP = 5;
const TYPE_INT64 = 6;

// TODO: global text encoder

export function packAndSymmetricEncryptValue(key, value) {
  const pack = packValue(value);
  const encrypted_pack = crypto.symmetricEncrypt(key, pack);
  return encrypted_pack;
}

export function packValue(value) {
  const sz = _size_for_value(value) + 4;
  const arr = new ArrayBuffer(sz);
  const view = new DataView(arr);

  let offset = 0;

  offset += _naked_int32_to_array(view, offset, PACK_FORMAT_VERSION);
  _value_to_array(view, offset, value);
  return new Uint8Array(arr);
}

function _size_for_value(value) {
  const t = typeof (value);

  if (t == 'number') {
    return 12; // type + value
  }
  if (t == 'string') {
    return 8 + (new TextEncoder()).encode(value).length;
  }
  if (value.constructor != undefined && value.constructor == Uint8Array) {
    return 8 + value.length;
  }
  if (Array.isArray(value)) {
    let sz = 8;
    for (const item of value) {
      sz += _size_for_value(item);
    }
    return sz;
  }
  // assume it's a "dict"
  let sz = 8;

  for (const key in value) {
    sz += 4 + (new TextEncoder()).encode(key).length;
    sz += _size_for_value(value[key]);
  }
  return sz;
}

function _value_to_array(view, offset, value) {
  const t = typeof (value);

  if (t == 'number') {
    offset = _int64_to_array(view, offset, value);
  } else if (t == 'string') {
    offset = _str_to_array(view, offset, value);
  } else if (value.constructor != undefined && value.constructor == Uint8Array) {
    offset = _bytes_to_array(view, offset, value);
  } else if (Array.isArray(value)) {
    offset = _list_to_array(view, offset, value);
  } else {
    // assume it's a "dict"
    offset = _dict_to_array(view, offset, value);
  }
  return offset;
}

function _naked_int32_to_array(view, offset, value) {
  view.setInt32(offset, value, false);
  return offset + 4;
}

function _naked_int64_to_array(view, offset, value) {
  view.setBigInt64(offset, BigInt(value), false);
  return offset + 8;
}

function _naked_str_to_array(view, offset, value) {
  const str_array = new Uint8Array((new TextEncoder()).encode(value));
  const byte_len = str_array.length;
  offset = _naked_int32_to_array(view, offset, byte_len);
  (new Uint8Array(view.buffer)).set(str_array, offset);
  offset += byte_len;
  return offset;
}

function _int64_to_array(view, offset, value) {
  offset = _naked_int32_to_array(view, offset, TYPE_INT64);
  offset = _naked_int64_to_array(view, offset, value);
  return offset;
}

export function _bytes_to_array(view, offset, value) {
  offset = _naked_int32_to_array(view, offset, TYPE_BYTES);
  offset = _naked_int32_to_array(view, offset, value.length);
  const arr = new Uint8Array(view.buffer);
  arr.set(value, offset);
  offset += value.length;
  return offset;
}

function _str_to_array(view, offset, value) {
  offset = _naked_int32_to_array(view, offset, TYPE_STR);
  offset = _naked_str_to_array(view, offset, value);
  return offset;
}

function _list_to_array(view, offset, value) {
  offset = _naked_int32_to_array(view, offset, TYPE_LIST);
  const list_len = value.length;
  offset = _naked_int32_to_array(view, offset, list_len);
  for (const item of value) {
    offset = _value_to_array(view, offset, item);
  }
  return offset;
}

function _dict_to_array(view, offset, value) {
  offset = _naked_int32_to_array(view, offset, TYPE_MAP);
  const dict_len = Object.keys(value).length;
  offset = _naked_int32_to_array(view, offset, dict_len);
  for (const key in value) {
    offset = _naked_str_to_array(view, offset, key);
    offset = _value_to_array(view, offset, value[key]);
  }
  return offset;
}

export function unpackValue(arr) {
  const view = new DataView((new Uint8Array(arr)).buffer);

  const offset = { offset: 0 };
  const pack_format_version = _int32_from_array(view, offset);
  assert(pack_format_version == PACK_FORMAT_VERSION);
  return _value_from_array(view, offset);
}

function _value_from_array(view, offset) {
  const t = _int32_from_array(view, offset);

  let value;

  switch (t) {
    case TYPE_INT32:
      value = _int32_from_array(view, offset);
      break;
    case TYPE_INT64:
      value = _int64_from_array(view, offset);
      break;
    case TYPE_STR:
      value = _str_from_array(view, offset);
      break;
    case TYPE_BYTES:
      value = _bytes_from_array(view, offset);
      break;
    case TYPE_LIST:
      value = _list_from_array(view, offset);
      break;
    case TYPE_MAP:
      value = _dict_from_array(view, offset);
      break;
    default:
      assert(false);
  }
  return value;
}

function _int32_from_array(view, offset) {
  const value = view.getInt32(offset.offset, false);
  offset.offset += 4;
  return value;
}

function _int64_from_array(view, offset) {
  const value = view.getBigInt64(offset.offset, false);
  offset.offset += 8;
  return Number(value);
}

function _str_from_array(view, offset) {
  const len = _int32_from_array(view, offset);
  const decoder = new TextDecoder('utf-8');
  const str = decoder.decode(new DataView(view.buffer, offset.offset, len));
  offset.offset += len;
  return str;
}

function _bytes_from_array(view, offset) {
  const len = _int32_from_array(view, offset);
  const bytes = new Uint8Array(view.buffer, offset.offset, len);
  offset.offset += len;
  return bytes;
}

function _list_from_array(view, offset) {
  const count = _int32_from_array(view, offset);
  const list = [];

  for (let x = 0; x < count; x++) {
    const item = _value_from_array(view, offset);
    list.push(item);
  }

  return list;
}

function _dict_from_array(view, offset) {
  const count = _int32_from_array(view, offset);
  const dict = {};

  for (let x = 0; x < count; x++) {
    const key = _str_from_array(view, offset);
    const item = _value_from_array(view, offset);
    dict[key] = item;
  }

  return dict;
}
