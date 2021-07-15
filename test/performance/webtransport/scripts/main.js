// Copyright (C) <2021> Intel Corporation
//
// SPDX-License-Identifier: Apache-2.0

'use strict';

const transportWorker = new Worker('./scripts/transport.js')

function updateTransportStatus(message) {
  document.getElementById('status').innerHTML += ('<p>' + message + '</p>');
}

transportWorker.onmessage = (message) => {
  const type = message.data[0];
  if (type === 'status-update') {
    updateTransportStatus(message);
  }
};

window.addEventListener('load', () => {
  transportWorker.postMessage(['init']);
});

document.getElementById('start-sending').addEventListener('click', () => {
  transportWorker.postMessage(['start-sending']);
  updateTransportStatus('Started sending.');
});

document.getElementById('stop-sending').addEventListener('click', () => {
  transportWorker.postMessage(['stop-sending']);
  updateTransportStatus('Stopped sending.');
});