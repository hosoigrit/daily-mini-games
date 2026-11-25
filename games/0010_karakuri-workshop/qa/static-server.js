'use strict';

const {createServer} = require('node:http');

function startFixtureServer({html, modules}) {
  const resources = new Map([['/', {type: 'text/html; charset=utf-8', bytes: Buffer.from(html)}]]);
  for (const [path, bytes] of Object.entries(modules)) {
    if (!/^\/(src|vendor)\/[a-z0-9./-]+\.m?js$/u.test(path) || path.split('/').includes('..')) {
      throw new Error(`Invalid fixture module: ${path}`);
    }
    resources.set(path, {type: 'text/javascript; charset=utf-8', bytes});
  }

  const server = createServer((request, response) => {
    const resource = request.method === 'GET' && resources.get(request.url);
    if (!resource) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {'Content-Type': resource.type, 'Cache-Control': 'no-store'});
    response.end(resource.bytes);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      resolve({url: `http://127.0.0.1:${port}/`, close: () =>
        new Promise((finished, failed) => server.close(error => error ? failed(error) : finished()))});
    });
  });
}

module.exports = {startFixtureServer};
