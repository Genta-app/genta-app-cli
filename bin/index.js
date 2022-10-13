#!/usr/bin/env node

/* eslint-disable no-constant-condition */
/* eslint-disable no-unused-vars */
/* eslint-disable no-use-before-define,no-bitwise,no-shadow
,eqeqeq,no-mixed-operators,no-await-in-loop,no-param-reassign
,no-restricted-syntax,default-case */

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

import readlineSync from 'readline-sync';
import * as fspromises from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import * as cnst from 'constants';

import * as crypto from './Crypto.js';
import * as req from './Req.js';
import { unpackValue } from './Pack.js';
import * as api from './Api.js';

const MEDIA_TYPE_VIDEO = 2;

(async () => {
  await crypto.so.ready;
  await main();
})();

function print(s) {
  console.log(s);
}

function printError(s) {
  console.error(`Genta.app CLI error: ${s}`);
}

const RDWR_EXCL = cnst.O_CREAT | cnst.O_TRUNC | cnst.O_RDWR | cnst.O_EXCL;

const generateName = (dir, defaultPrefix) => {
  const now = new Date();
  const name = [now.getFullYear(), now.getMonth(), now.getDate(),
    '-',
    process.pid,
    '-',
    (Math.random() * 0x100000000 + 1).toString(36)].join('');
  return path.join(dir, name);
};

const openSync = (affixes) => {
  const path = generateName(affixes, 'f-');
  const fd = fs.openSync(path, RDWR_EXCL, 0o600);
  return { path, fd };
};

const size_names = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

// show 3 most significant digits
export function formatSize(sz) {
  let name = '';
  let rounded_value = sz;

  for (let x = 0; x < size_names.length; x += 1) {
    const pow = 1000 ** (x + 1);
    if (sz < pow) {
      name = size_names[x];
      break;
    } else {
      rounded_value = Math.round(sz / pow * 10) / 10;
    }
  }

  let str = (`${rounded_value}`).slice(0, 4);
  str = str.slice(0, 4);
  if (str[3] == '.') {
    str = str.slice(0, 3);
  }

  return `${str} ${name}`;
}

const parseArgs = async (argv) => {
  const config_filename = `${process.env.HOME}/.genta-app-cli`;

  let config = { auth: { email: null } };

  if (fs.existsSync(config_filename)) {
    config = JSON.parse(fs.readFileSync(config_filename, 'utf8'));
  }

  let index;

  if (argv[0].endsWith('node')) {
    index = 2;
  } else {
    index = 1;
  }

  let errors = false;

  const options = {
    help: { type: 'boolean', value: false },
    email: { type: 'string', value: config.auth.email },
    password: { type: 'password', value: config.auth.password || process.env.GENTA_APP_PASSWORD },
    album: { type: 'string', value: null },
    'output-dir': { type: 'string', value: null },
  };

  if (argv[index] == '--help') {
    options.help.value = true;
    return { command: '', options, errors };
  }

  const command = argv[index];
  index += 1;

  while (index < argv.length) {
    const k = argv[index];
    const key_info = options[k.slice(2)];
    if (!k.startsWith('--') || key_info === undefined) {
      errors = true;
      break;
    }

    if (key_info.type == 'string') {
      key_info.value = argv[index + 1];
      index += 2;
    } else if (key_info.type == 'boolean') {
      key_info.value = true;
      index += 1;
    } else if (key_info.type == 'password') {
      key_info.value = readlineSync.question('Enter password: ', { hideEchoBack: true });
      index += 1;
    }
  }

  return { command, options, errors };
};

const downloadFile = async (session, album, file, output_directory, download_stats) => {
  const is_video = file.file_type == 'video';
  const is_image = file.file_type == 'image';
  const is_text = file.file_type == 'text';

  if (is_text) {
    // eslint-disable-next-line no-param-reassign
    file.name = file.identifier;
  }

  const { download_auth, download_url } = session.download_auth;
  let thumb_path;

  if (is_video) {
    thumb_path = `${output_directory}/thumbs/${file.name}.jpg`;
  } else {
    thumb_path = `${output_directory}/thumbs/${file.name}`;
  }

  if (is_video || is_image) {
    if (!fs.existsSync(thumb_path)) {
      print(`Downloading ${thumb_path}`);

      const thumb_download_url = api.getBucketURL(
        file.thumbpath,
        album.bucket_name,
        download_url,
        download_auth
      );

      const download_thumb_resp = await req.httpGetAbsolute(thumb_download_url, {}, 'arraybuffer');

      const encrypted_data = new Uint8Array(Buffer.from(download_thumb_resp.data));
      const decrypted_data = crypto.symmetricDecrypt(file.file_key, encrypted_data);
      const contents_resppack = unpackValue(decrypted_data);

      const thumb_file = await fspromises.open(thumb_path, 'w');
      await thumb_file.writeFile(contents_resppack.thumb.data);
      await thumb_file.close();

      download_stats.bytes_downloaded += contents_resppack.thumb.data.length;
      download_stats.files_downloaded += 1;
    } else {
      print(`Skipping ${thumb_path}`);
      download_stats.files_skipped += 1;
    }
  }

  let image_path;
  let video_path;

  if (is_video) {
    image_path = `${output_directory}/${file.name}.jpg`;
    video_path = `${output_directory}/${file.name}`;
  } else if (is_image) {
    image_path = `${output_directory}/${file.name}`;
  }

  if (is_video || is_image) {
    if (!fs.existsSync(image_path)) {
      print(`Downloading ${image_path}`);

      const image_download_url = api.getBucketURL(
        file.path,
        album.bucket_name,
        download_url,
        download_auth
      );

      const download_image_resp = await req.httpGetAbsolute(image_download_url, {}, 'arraybuffer');

      const encrypted_data = new Uint8Array(Buffer.from(download_image_resp.data));
      const decrypted_data = crypto.symmetricDecrypt(file.file_key, encrypted_data);
      const contents_resppack = unpackValue(decrypted_data);

      const image_file = await fspromises.open(image_path, 'w');
      await image_file.writeFile(contents_resppack.file.data);
      await image_file.close();

      download_stats.bytes_downloaded += contents_resppack.file.data.length;
      download_stats.files_downloaded += 1;
    } else {
      print(`Skipping ${image_path}`);
      download_stats.files_skipped += 1;
    }
  }

  if (is_video) {
    if (!fs.existsSync(video_path)) {
      print(`Downloading ${video_path}`);

      await api.getFileIndexInfo(session, file);
      const video_index_info = file.index_info[MEDIA_TYPE_VIDEO];

      if (video_index_info === undefined) {
        print(`Error: Invalid index while downloading ${video_path}`);
        download_stats.files_failed += 1;
        return;
      }

      const video_download_url = api.getBucketURL(
        video_index_info.large_file_bucket_path,
        album.bucket_name,
        download_url,
        download_auth
      );

      const open_info = openSync(`${output_directory}/`);
      const video_temp_path = open_info.path;
      const video_file = open_info.fd;

      let enc_range_start = 0;
      let enc_range_end = 0;

      let video_bytes = 0;

      for (const ix of video_index_info.index_list) {
        enc_range_start = enc_range_end + ix.index_info_size;
        enc_range_end = enc_range_start + ix.encrypted_part_size;

        // NOTE: HTTP range header is inclusive
        const part_resp = await req.httpGetAbsolute(video_download_url, {
          Range: `bytes=${enc_range_start}-${enc_range_end - 1}`,
        }, 'arraybuffer');

        if (part_resp.status != 206 && part_resp.status != 200) {
          print(`Error downloading ${video_path}`);
          download_stats.files_failed += 1;
          return;
        }

        const encrypted_data = new Uint8Array(Buffer.from(part_resp.data));

        const file_part = unpackValue(crypto.symmetricDecrypt(file.file_key, encrypted_data));

        fs.writeSync(video_file, file_part.data);
        video_bytes += file_part.data.length;
      }

      fs.closeSync(video_file);
      fs.renameSync(video_temp_path, video_path);

      download_stats.bytes_downloaded += video_bytes;
      download_stats.files_downloaded += 1;
    } else {
      print(`Skipping ${video_path}`);
      download_stats.files_skipped += 1;
    }
  }

  const metadata = {
    type: file.type,
    comment: file.file_comment,
    local_path: image_path,
    local_thumbpath: thumb_path,
    bucket_path: file.path,
    bucket_thumbpath: file.thumbpath,
    file_date: file.file_date,
    ordering: file.ordering,
  };

  const metadata_path = `${output_directory}/metadata/${file.name}.json`;
  if (!fs.existsSync(metadata_path)) {
    print(`Writing ${metadata_path}`);
    const meta_file = await fspromises.open(metadata_path, 'w');
    const json_str = JSON.stringify(metadata);
    await meta_file.writeFile(json_str);
    await meta_file.close();

    download_stats.bytes_downloaded += json_str.length; // likely this is length in chars
    download_stats.files_downloaded += 1;
  }
};

const downloadAlbum = async (session, album, album_dir, download_stats) => {
  await api.getDownloadAuth(session, album.identifier);

  const last_month = null;
  let last_file_identifier = null;
  let ordering = 0;
  let album_month_dir = null;

  while (true) {
    const files = await api.getFiles(session, album, last_file_identifier);

    if (files.length == 0) {
      break;
    }

    last_file_identifier = files[files.length - 1].identifier;

    for (const f of files) {
      try {
        const month = (f.file_date / 100) | 0;
        if (last_month != month) {
          album_month_dir = `${album_dir}/${month}`;
          await fspromises.mkdir(album_month_dir, { recursive: true });
          await fspromises.mkdir(`${album_month_dir}/thumbs/`, { recursive: true });
          await fspromises.mkdir(`${album_month_dir}/metadata/`, { recursive: true });
        }

        f.ordering = ordering;
        ordering += 1;
        await downloadFile(session, album, f, album_month_dir, download_stats);
      } catch (e) {
        console.error(e);
      }
    }
  }
};

const processDownloadCommand = async (email, password, album_name, output_root_dir) => {
  const session = await api.login(email, password);
  await api.getAlbums(session);

  let { albums } = session;

  if (album_name != null) {
    albums = albums.filter((a) => a.album_name == album_name);
  }

  const download_stats = {
    files_downloaded: 0,
    files_skipped: 0,
    files_failed: 0,
    bytes_downloaded: 0,
  };

  for (const album of albums) {
    const album_dir = `${output_root_dir}/${album.album_name}`;
    // recursive: true also prevents rejection if the path exists
    await downloadAlbum(session, album, album_dir, download_stats);
  }

  console.log('');
  console.log(`Files/size downloaded: ${download_stats.files_downloaded} / ${formatSize(download_stats.bytes_downloaded)}`,);
  if (download_stats.files_skipped > 0) {
    console.log(`Files skipped: ${download_stats.files_skipped}`,);
  }

  if (download_stats.files_failed > 0) {
    console.error(`Files failed: ${download_stats.files_failed}`);
  }

  console.log('DOWNLOAD FINISHED');
};

const main = async () => {
  if (process.argv.length == 1 || process.argv.length == 2 && process.argv[0].endsWith('node')) {
    print('Genta.app CLI. Use --help to get details about supported commands and options');
    return;
  }

  const argv = await parseArgs(process.argv);

  if (argv.options.help.value) {
    print(`
Genta.app CLI

Usage:
  <environment> genta <command> <command-options>

Environment variables:
  GENTA_APP_PASSWORD
    password value to use for authentication

Commands:
  download
    Download and decrypt an album from the cloud storage into a local directory.
    Only new files (images, videos, text) will be downloaded and decrypted

    command options:
      --email <string>
        authentication email

      --password
        authentication password to be read from the standard input

      --album <string>
        album name to download

      --output-dir <local-path-string>
        local output directory

Configuration:
  ~/.genta-app-cli
    Store optional authentication information: email and password (command line parameters
    when provided, have a higher priority). Use the following bash command to create the file:

    $ echo '{"auth": {"email": "your-email@example.com", "password": "secret"}}' > ~/.genta-app-cli

Examples:
  genta download --album Timeline --output-dir ~/albums/Timeline

`);

    return;
  }

  if (argv.command !== 'download') {
    printError(`unknown command: ${argv.command}`);
    return;
  }

  switch (argv.command) {
    case 'download':
      if (!argv.options.email.value) {
        printError('please provide a e-mail address');
        return;
      }
      if (!(argv.options.password.value || argv.options.pass.value)) {
        printError('please provide a password');
        return;
      }
      if (!argv.options.album.value) {
        printError('please provide an album name to download');
        return;
      }
      if (!argv.options['output-dir'].value) {
        printError('please provide an directory name for output');
        return;
      }

      await processDownloadCommand(
        argv.options.email.value,
        argv.options.password.value,
        argv.options.album.value,
        argv.options['output-dir'].value,
      );
      break;
  }
};
