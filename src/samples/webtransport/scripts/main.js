// Copyright (C) <2020> Intel Corporation
//
// SPDX-License-Identifier: Apache-2.0

'use strict';

const mediaWorker = new Worker('./scripts/media.js')

let audioContext;
let audioBufferEnd = 0;

mediaWorker.onmessage = (message) => {
  const type = message.data[0];
  if (type === 'audio-frame') {
    renderAudio(message.data[1]);
  }
};

window.addEventListener('load', () => {
  initWebAudio();
});

function initWebAudio() {
  audioContext = new AudioContext();
}

function renderAudio(audioFrameBuffer) {
  const soundSource = audioContext.createBufferSource();
  soundSource.buffer = new AudioBuffer({
    numberOfChannels: audioFrameBuffer.numberOfChannels,
    sampleRate: audioFrameBuffer.sampleRate,
    length: audioFrameBuffer.length
  });
  for (let i = 0; i < audioFrameBuffer.numberOfChannels; i++) {
    soundSource.buffer.copyToChannel(audioFrameBuffer.channelData[i], i)
  }
  soundSource.connect(audioContext.destination);
  soundSource.start(audioBufferEnd);
  audioBufferEnd += audioFrameBuffer.duration;
}

document.getElementById('start-streaming').addEventListener('click', () => {
  const gamingCanvasElement = document.getElementById('gaming-video');
  gamingCanvasElement.style.display = 'block';
  const canvas = document.getElementById('gaming-video');
  const offScreenCanvas = canvas.transferControlToOffscreen();
  mediaWorker.postMessage(
      ['init', {canvas: offScreenCanvas}], [offScreenCanvas]);
});

function updateStatus(message) {
  document.getElementById('gaming-status').innerHTML +=
      ('<p>' + message + '</p>');
}