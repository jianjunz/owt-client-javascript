// Copyright (C) <2021> Intel Corporation
//
// SPDX-License-Identifier: Apache-2.0

'use strict';

let webTransport, writeTask;

onmessage = (message) => {
  const type = message.data[0];
  if (type === 'init') {
    initWebTransport();
  } else if (type === 'start-sending') {
    startSending();
  } else if (type === 'stop-sending') {
    stopSending();
  } else {
    console.log('Unrecognized message type: ' + type);
  }
};

async function initWebTransport() {
  webTransport = new WebTransport('https://jianjunz-win.ccr.corp.intel.com:7700', {
    serverCertificateFingerprints: [{
      value:
          'C6:1D:36:EE:D1:F2:9D:76:F6:1E:E5:60:DE:D6:E6:B7:52:3D:2B:29:A8:5A:9F:18:D9:90:F5:22:FC:05:61:D7',
      algorithm: 'sha-256',
    }]
  });
}

async function writeData() {
  const encoder = new TextEncoder();
  const encoded = encoder.encode('message', {stream: true});
  const writer = bidirectionalStream.writable.getWriter();
  await writer.ready;
  await writer.write(new ArrayBuffer(2));
  writer.releaseLock();
  return;
}

async function startSending() {
  await webTransport.ready;
  const sendStream = webTransport.createBidirectionalStream();
  const writer = sendStream.getWriter();
  while (true) {
    await writer.ready;
    writer.write(new Uint8Array(10000));
  }
}

async function stopSending() {}