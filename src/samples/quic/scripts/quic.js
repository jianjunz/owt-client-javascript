// Copyright (C) <2020> Intel Corporation
//
// SPDX-License-Identifier: Apache-2.0

'use strict';

let quicTransport = null;
let sendStream = null;
let writeTask;
let sourceBuffer
let bufferQueue = [];
let jmuxter;
let frame=new Uint8Array();
let frameSizeUsed=0;
let remainFrameSize=0;
let nextFrameLengthArray=new Uint8Array(8);
let nextFrameLengthArrayRead=0;

function updateStatus(message) {
  document.getElementById('conference-status').innerHTML +=
      ('<p>' + message + '</p>');
}

async function createQuicTransport() {
  quicTransport = new QuicTransport('quic-transport://localhost:7700/echo', {
    serverCertificateFingerprints: [{
      algorithm: 'sha-256',
      value:
          '8A:22:2D:18:DB:5F:9A:48:D6:69:CA:72:CC:A2:59:76:5B:DC:AE:1C:6F:00:6D:9D:B1:E8:EE:21:F9:15:C1:5D'
    }]
  });
  quicTransport.onstatechange = () => {
    console.log('QuicTransport state changed.');
  };
  receiveStreams();
  return quicTransport.ready;
}

async function receiveStreams() {
  const receiveStreamReader = quicTransport.receiveStreams().getReader();
  console.info('Reader: ' + receiveStreamReader);
  let receivingDone = false;
  while (!receivingDone) {
    const {value: receiveStream, done: readingReceiveStreamsDone} =
        await receiveStreamReader.read();
    console.info('New stream received');
    if (readingReceiveStreamsDone) {
      receivingDone = true;
      break;
    }
    onIncomingStream(receiveStream);
  }
}

async function onIncomingStream(stream) {
  const chunkReader = stream.readable.getReader();
  let readingDone = false;
  while (!readingDone) {
    const {value: data, done: readingChunksDone} = await chunkReader.read();
    if (readingChunksDone) {
      readingDone = true;
      return;
    }
    //console.log('Received size: '+data.length+', remainFrameSize: '+remainFrameSize+', frameSizeUsed: '+frameSizeUsed);
    let readSize = 0;
    while (readSize < data.length) {
      if (remainFrameSize != 0) {
        if (data.length - readSize < remainFrameSize) {
          // Read all data to frame.
          const readNow=data.length - readSize;
          frame.set(data.slice(readSize), frameSizeUsed);
          frameSizeUsed += readNow;
          remainFrameSize -= readNow;
          readSize = data.length;
        } else {
          frame.set(
              data.slice(readSize, readSize + remainFrameSize), frameSizeUsed);
          jmuxter.feed({video: frame, duration: 0});
          readSize += remainFrameSize;
          remainFrameSize = 0;
          frameSizeUsed = 0;
        }
      }
      // Next frame.
      if (readSize != data.length) {
        if (nextFrameLengthArrayRead != 0) {
          const readNow = Math.min(data.length, 8 - nextFrameLengthArrayRead)
          nextFrameLengthArray.set(
              data.slice(readSize, readSize + readNow),
              nextFrameLengthArrayRead);
          nextFrameLengthArrayRead += readNow;
          readSize+=readNow;
        } else if (data.length < readSize + 8) {
          nextFrameLengthArray.set(
              data.slice(readSize, readSize + data.length));
          nextFrameLengthArrayRead = data.length - readSize;
          readSize=data.length;
        } else {
          nextFrameLengthArray.set(data.slice(readSize, readSize + 8));
          nextFrameLengthArrayRead = 8;
          readSize += 8;
        }
        if (nextFrameLengthArrayRead != 8) {
          continue;
        }
        remainFrameSize = 0;
        frameSizeUsed = 0;
        for (let i = 7; i >= 0; i--) {
          remainFrameSize += nextFrameLengthArray[i] * Math.pow(256, 8 - i - 1);
        }
        console.log('Frame size: ' + remainFrameSize+', time: '+performance.timing.navigationStart + performance.now());
        nextFrameLengthArrayRead = 0;
        frame = new Uint8Array(remainFrameSize);
      }
    }

    //console.log('Read data: ' + data);
    // if (!sourceBuffer.updating) {
    //   sourceBuffer.appendBuffer(data);
    //   console.log('appended.');
    // } else
    //   bufferQueue.push(data);
  }
}

async function createSendChannel() {
  await createQuicTransport();
  updateStatus('Created QUIC transport.');
}

async function windowOnLoad() {
  //prepareMediaSource();
  initJmuxer();
  //sendStream = await quicTransport.createSendStream();
}

async function writeData() {
  const encoder = new TextEncoder();
  const encoded = encoder.encode('message', {stream: true});
  const writer = sendStream.writable.getWriter();
  await writer.ready;
  await writer.write(new ArrayBuffer(2));
  writer.releaseLock();
  return;
}

function initJmuxer(){
  jmuxter=new JMuxer({node:'gaming-video', mode:'video', fps:60, flushingTime: 1, debug: false});
}

function prepareMediaSource() {
  var vidElement = document.querySelector('video');
  vidElement.addEventListener('error',(e)=>{
    console.log('Video element error: '+JSON.stringify(e));
  });

  if (window.MediaSource) {
    var mediaSource = new MediaSource();
    vidElement.src = URL.createObjectURL(mediaSource);
    mediaSource.addEventListener('sourceopen', sourceOpen);
    mediaSource.addEventListener('error', (e) => {
      console.error('Error: ' + e);
    });
  } else {
    console.log('The Media Source Extensions API is not supported.')
  }

  function sourceOpen(e) {
    URL.revokeObjectURL(vidElement.src);
    var mime = 'video/mp4; codecs="avc1.42E01E"';
    var mediaSource = e.target;
    sourceBuffer = mediaSource.addSourceBuffer(mime);
    sourceBuffer.addEventListener('updateend', () => {
      return;
      if (bufferQueue.length) {
        sourceBuffer.appendBuffer(bufferQueue.shift());
        console.log('appended.');
      }
    })
  }
}

window.addEventListener('load', () => {
  windowOnLoad();
});

document.getElementById('start-streaming').addEventListener('click', () => {
  const gamingVideoElement = document.getElementById('gaming-video');
  gamingVideoElement.play();
  gamingVideoElement.style.display = 'block';
  createSendChannel();
});