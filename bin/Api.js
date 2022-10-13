/* eslint-disable no-unused-vars,no-restricted-syntax,no-param-reassign,no-await-in-loop */

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

import * as crypto from './Crypto.js';
import * as req from './Req.js';
import { packValue, unpackValue } from './Pack.js';

class Session {
  constructor(props) {
    this.props = props;
  }

  getCookies() {
    return this.props.cookies;
  }

  getCookiesString() {
    return this.getCookies().join('; ');
  }

  getPublicKey() {
    return this.props.public_key;
  }

  getPrivateKey() {
    return this.props.private_key;
  }
}

export const login = async (email, password) => {
  const email_array = new Uint8Array(Buffer.from(email.toLowerCase()));
  const auth_hash = crypto.deriveAuthKey(email_array, password);

  const pack = packValue({
    user: {
      email: email.toLowerCase(),
      auth: auth_hash,
    },
  });

  const login_resp_promise = req.httpPost(
    '/login',
    pack,
    { 'content-type': 'application/octet-stream' },
    'arraybuffer'
  );

  const master_key = crypto.deriveMasterKey(email_array, password);
  const login_resp = await login_resp_promise;

  const cookies = login_resp.headers['set-cookie'];
  const user_pack = unpackValue(login_resp.data);

  const private_key = crypto.symmetricDecrypt(
    master_key,
    user_pack.user.encrypted_private_key
  );

  return new Session({
    cookies,
    public_key: user_pack.user.public_key,
    private_key,
    master_key,
  });
};

export const getAlbums = async (session) => {
  const album_resp = await req.httpGet('/album', { cookie: session.getCookiesString() }, 'arraybuffer');

  const album_resp_data = unpackValue(album_resp.data);

  session.albums = album_resp_data.albums;

  for (const album of session.albums) {
    const private_key = session.getPrivateKey();
    const public_key = session.getPublicKey();

    album.album_key = crypto.cryptoBoxOpen(
      session.getPrivateKey(),
      session.getPublicKey(),
      album.encrypted_album_key
    );

    const data_pack = crypto.symmetricDecrypt(album.album_key, album.encrypted_data);
    const unpack_data = unpackValue(data_pack);
    album.album_name = unpack_data.album.name;
  }
};

export const getFiles = async (session, album, file_identifier) => {
  const album_param = `album=${album.identifier}`;
  const file_ident_param = file_identifier ? `&fid=${file_identifier}` : '';

  const file_resp = await req.httpGet(
    `/file?${album_param}${file_ident_param}`,
    { cookie: session.getCookiesString() },
    'arraybuffer'
  );

  const file_resp_data = unpackValue(file_resp.data);
  const files = [];

  for (const f of file_resp_data.files) {
    const file_key = crypto.symmetricDecrypt(album.album_key, f.encrypted_key);
    const file_data_pack = crypto.symmetricDecrypt(file_key, f.encrypted_data);
    const file_data = unpackValue(file_data_pack);

    let file_comment = '';
    try {
      if (f.comment.length > 0) {
        file_comment = await crypto.symmetricDecryptString(file_key, f.comment);
      }
    } catch (e) {
      console.error(e);
      file_comment = '-';
    }

    files.push({
      ...file_data.file,
      identifier: f.identifier,
      file_date: f.file_date,
      file_key,
      file_comment
    });
  }

  return files;
};

export const getFileIndexInfo = async (session, file) => {
  const file_index_resp = await req.httpGet(
    `/file-index?file=${file.identifier}`,
    { cookie: session.getCookiesString() },
    'arraybuffer'
  );

  file.index_info = {};

  const encrypted_index_info_list = unpackValue(file_index_resp.data).index_info;

  for (const info of encrypted_index_info_list) {
    const index_info_pack = crypto.symmetricDecrypt(file.file_key, info.data);
    const index_info = unpackValue(index_info_pack);
    index_info.bucket_size = info.bucket_size;
    file.index_info[index_info.large_file_media_type] = index_info;
  }
};

export const getDownloadAuth = async (session, album_identifier) => {
  const pack = packValue({
    album: {
      identifier: album_identifier,
    }
  });

  const resp = await req.httpPost(
    '/album-download-token',
    pack,
    {
      'content-type': 'application/octet-stream',
      cookie: session.getCookiesString(),
    },
    'arraybuffer'
  );

  const resppack = unpackValue(resp.data);
  session.download_auth = resppack.album;
};

export const getBucketURL = (bucket_path, album_bucket_name, download_url, download_auth) => `${download_url}/file/${album_bucket_name}/${bucket_path
}?Authorization=${download_auth}`;
