/* eslint-disable no-param-reassign */

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

import axios from 'axios';

const USER_AGENT_STRING = 'genta.app/1.0 CLI';
const API_BASE_URL = process.env.GENTA_APP_BASEURL || 'https://genta.app/api/v1';
const HTTP_AUTH = process.env.GENTA_HTTP_AUTH;

const preprocessHeaders = (headers) => {
  headers = { ...headers };
  headers['user-agent'] = USER_AGENT_STRING;

  if (HTTP_AUTH) {
    headers.authorization = HTTP_AUTH;
  }

  return headers;
};

export function httpPost(url, body, headers, responseType) {
  return axios.post(API_BASE_URL + url, body, {
    headers: preprocessHeaders(headers),
    responseType,
  });
}

export function httpGetAbsolute(url, headers, response_type) {
  return axios.get(url, {
    headers: preprocessHeaders(headers),
    responseType: response_type,
  });
}

export function httpGet(url, headers_map, response_type) {
  return httpGetAbsolute(API_BASE_URL + url, headers_map, response_type);
}
