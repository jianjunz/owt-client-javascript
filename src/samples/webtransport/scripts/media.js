// Copyright (C) <2020> Intel Corporation
//
// SPDX-License-Identifier: Apache-2.0

'use strict';

importScripts('./h264_annex_b_to_avcc_converter.js')

const annexbConverter = new H264AnnexBToAVCCConverter();

let quicTransport = null;
let sendStream = null;
let writeTask;
let sourceBuffer
let audioDecoder;
let audioContext;
let videoDecoder;
let canvas;

onmessage =
    (message) => {
      const type = message.data[0];
      if (type === 'init') {
        canvas = message.data[1].canvas;
        createSendChannel();
      }
    }

const audioDecoderConfig = {
  codec: 'opus',
  sampleRate: 48000,
  numberOfChannels: 2
};

async function createQuicTransport() {
  quicTransport = new WebTransport('quic-transport://10.239.10.117:7700/echo', {
    serverCertificateFingerprints: [{
      algorithm: 'sha-256',
      value:
          '75:E6:AB:44:32:04:40:DC:1D:17:FB:BA:97:86:6D:2C:F6:7E:8C:F4:76:09:DC:73:D2:BD:8E:E2:18:0D:7F:78'
    }]
  });
  quicTransport.onstatechange = () => {
    console.log('QuicTransport state changed.');
  };
  receiveStreams();
  return quicTransport.ready;
}

async function receiveStreams() {
  const receiveStreamReader =
      quicTransport.incomingBidirectionalStreams.getReader();
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
  let streamType = undefined;
  let bufferQueue = [];
  let frame = new Uint8Array();
  let frameSizeUsed = 0;
  let remainFrameSize = 0;
  let nextFrameLengthArray = new Uint8Array(8);
  let nextFrameLengthArrayRead = 0;
  let firstAudioFrame=false;
  while (!readingDone) {
    const {value: data, done: readingChunksDone} = await chunkReader.read();
    if (readingChunksDone) {
      readingDone = true;
      return;
    }
    // console.log('Received size: '+data.length+', remainFrameSize:
    // '+remainFrameSize+', frameSizeUsed: '+frameSizeUsed);
    let readSize = 0;
    if (!streamType) {
      // TODO: Read the first 8 bytes for stream type.
      if (data.length < 8) {
        log.error('No enough data for stream type.')
        return;
      }
      let printBytes = '';
      for (let i = 0; i < 8; i++) {
        printBytes += (data[i] + ' ');
      }
      console.log(printBytes);
      streamType = data[7];
      console.info('Stream type: ' + streamType);
      readSize = 8;
    }
    while (readSize < data.length) {
      if (remainFrameSize != 0) {
        if (data.length - readSize < remainFrameSize) {
          // Read all data to frame.
          const readNow = data.length - readSize;
          frame.set(data.slice(readSize), frameSizeUsed);
          frameSizeUsed += readNow;
          remainFrameSize -= readNow;
          readSize = data.length;
        } else {
          frame.set(
              data.slice(readSize, readSize + remainFrameSize), frameSizeUsed);
          if (streamType == 3) {  // Video.
            const extraData = annexbConverter.GetHeader(frame);
            let frameType = 'delta';
            if (!videoDecoder) {
              initVideo(extraData);
              frameType = 'key';
            }
            videoDecoder.decode(new EncodedVideoChunk({
              timestamp: Date.now(),
              data: annexbConverter.ConvertTrunk(frame),
              type: frameType
            }));
          } else if (streamType == 2) {  // Audio.
            let frameType='delta';
            if(firstAudioFrame){
              frameType='key';
              firstAudioFrame=false;
            }
            audioDecoder.decode(
                new EncodedAudioChunk({timestamp: Date.now(), data: frame, type:frameType}));
          }
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
          readSize += readNow;
        } else if (data.length < readSize + 8) {
          nextFrameLengthArray.set(
              data.slice(readSize, readSize + data.length));
          nextFrameLengthArrayRead = data.length - readSize;
          readSize = data.length;
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
        // console.log('Frame size: ' + remainFrameSize+', time:
        // '+performance.timing.navigationStart + performance.now());
        nextFrameLengthArrayRead = 0;
        frame = new Uint8Array(remainFrameSize);
      }
    }

    // console.log('Read data: ' + data);
    // if (!sourceBuffer.updating) {
    //   sourceBuffer.appendBuffer(data);
    //   console.log('appended.');
    // } else
    //   bufferQueue.push(data);
  }
}

async function createSendChannel() {
  initAudio();
  await createQuicTransport();
  // updateStatus('Created QUIC transport.');
}

async function windowOnLoad() {
  // prepareMediaSource();
  // initAudio();
  // initVideo();
  // sendStream = await quicTransport.createSendStream();
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

function initAudio() {
  audioDecoder =
      new AudioDecoder({output: audioDecoderOutput, error: audioDecoderError});
  audioDecoder.configure(audioDecoderConfig);
}

function initVideo(avccExtraData) {
  const videoDecoderConfig = {codec: 'avc1.42400a', description: avccExtraData};
  videoDecoder =
      new VideoDecoder({output: videoDecoderOutput, error: videoDecoderError});
  videoDecoder.configure(videoDecoderConfig);
}

function audioDecoderOutput(audioFrame) {
  const audioBuffer = {
    numberOfChannels: audioFrame.buffer.numberOfChannels,
    sampleRate: audioFrame.buffer.sampleRate,
    length: audioFrame.buffer.length,
    duration: audioFrame.buffer.duration,
    channelData: []
  };
  for (let i = 0; i < audioFrame.buffer.numberOfChannels; i++) {
    audioBuffer.channelData.push(audioFrame.buffer.getChannelData(i));
  }
  postMessage(['audio-frame', audioBuffer]);
}

function audioDecoderError(error) {
  console.log('Audio decoder failed to decode. ' + error);
}

async function videoDecoderOutput(videoFrame) {
  drawFrame(videoFrame);
  videoFrame.close();
}

function videoDecoderError(error) {
  console.log('Video decoder failed to decode. ' + error);
}

async function drawFrame(videoFrame) {
  const ctx = canvas.getContext('2d');
  const image = await videoFrame.createImageBitmap();
  ctx.canvas.width = image.width;
  ctx.canvas.height = image.height;
  // Observed flickering on macOS if FPS is large (>24).
  ctx.drawImage(image, 0, 0, image.width, image.height);
}