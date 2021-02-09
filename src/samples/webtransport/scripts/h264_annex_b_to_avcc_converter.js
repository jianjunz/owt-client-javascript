'use strict';

class H264AnnexBToAVCCConverter {
  constructor() {
  }

  FindStartcode(trunk, offset) {
    if (!trunk)
      return undefined;

    if (offset + 3 >= trunk.length)
      return undefined;

    while (offset + 4 < trunk.length) {
      if (trunk[offset] == 0 && trunk[offset + 1] == 0) {
        if (trunk[offset + 2] == 1)
          return offset;
        else if (trunk[offset + 2] == 0 && trunk[offset + 3] == 1)
          return offset;
      }

      offset++;
    }

    if (offset + 3 < trunk.length) {
      if (trunk[offset] == 0 && trunk[offset + 1] == 0 && trunk[offset + 2] == 1)
        return offset;
    }

    return undefined;
  }

  FindNalu(data, offset) {
    let start_code_length = 0;
    let start_code_offset;
    let next_start_code_offset;

    start_code_offset = this.FindStartcode(data, offset);
    if (start_code_offset == undefined)
      return undefined;

    if (!start_code_length) {
      if (data[start_code_offset + 2] == 1)
        start_code_length = 3;
      else
        start_code_length = 4;
    }

    offset = start_code_offset + start_code_length;
    next_start_code_offset = this.FindStartcode(data, offset)
    if (next_start_code_offset != undefined) {
      return { nalu_start: start_code_offset + start_code_length, nalu_end: next_start_code_offset - 1 };
    } else {
      return { nalu_start: start_code_offset + start_code_length, nalu_end: data.length - 1 };
    }
  }

  GetHeader(trunk) {
    const data = new Uint8Array(trunk);
    let offset = 0;
    let nalu_info;
    let pps_info;
    let sps_info;

    //console.log("trunk length ", data.length);
    while ((nalu_info = this.FindNalu(data, offset)) != undefined) {
      const nalu_type = data[nalu_info.nalu_start] & 0x1f;
      switch (nalu_type) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          //console.log("slice nalu, length, ", nalu_info.nalu_end - nalu_info.nalu_start + 1);
          break;
        case 6:
          //console.log("sei nalu, length, ", nalu_info.nalu_end - nalu_info.nalu_start + 1);
          break;
        case 7:
          if (sps_info)
            console.log("skip multiple sps");

          sps_info = nalu_info;
          //console.log("sps nalu, length, ", nalu_info.nalu_end - nalu_info.nalu_start + 1);
          break;
        case 8:
          // if (pps_info)
          //   console.log("skip multiple sps");

          pps_info = nalu_info;
          //console.log("pps nalu, length, ", nalu_info.nalu_end - nalu_info.nalu_start + 1);
          break;
        default:
          //console.log("unkonwn nalu, length, ", nalu_info.nalu_end - nalu_info.nalu_start + 1);
          break;
      }

      offset = nalu_info.nalu_end + 1;
    }

    if (!sps_info || !pps_info) {
      //console.log("no sps or pps");
      return undefined;
    }

    let sps_length = sps_info.nalu_end - sps_info.nalu_start + 1;
    let pps_length = pps_info.nalu_end - pps_info.nalu_start + 1;

    let avcc_header_length = 0;
    avcc_header_length += 7;
    avcc_header_length += 2;
    avcc_header_length += sps_length;
    avcc_header_length += 2;
    avcc_header_length += pps_length;

    let avcc_header = new Uint8Array(avcc_header_length);
    let avcc_header_offset = 0;
    avcc_header[avcc_header_offset++] = 1;
    avcc_header[avcc_header_offset++] = data[sps_info.nalu_start + 3];
    avcc_header[avcc_header_offset++] = data[sps_info.nalu_start + 4];
    avcc_header[avcc_header_offset++] = data[sps_info.nalu_start + 5];
    avcc_header[avcc_header_offset++] = 0xff;

    avcc_header[avcc_header_offset++] = 0xe0 | 1;
    avcc_header[avcc_header_offset++] = sps_length >> 8;
    avcc_header[avcc_header_offset++] = sps_length;
    avcc_header.set(data.slice(sps_info.nalu_start, sps_info.nalu_end + 1), avcc_header_offset);
    avcc_header_offset += sps_length;

    avcc_header[avcc_header_offset++] = 1;
    avcc_header[avcc_header_offset++] = pps_length >> 8;
    avcc_header[avcc_header_offset++] = pps_length;
    avcc_header.set(data.slice(pps_info.nalu_start, pps_info.nalu_end + 1), avcc_header_offset);
    avcc_header_offset += pps_length;

    return avcc_header;
  }

  ConvertTrunk(trunk) {
    const data = new Uint8Array(trunk);
    let offset = 0;
    let nalus = [];
    let nalu_info;

    while ((nalu_info = this.FindNalu(data, offset)) != undefined) {
      offset = nalu_info.nalu_end + 1;

      const nalu_type = data[nalu_info.nalu_start] & 0x1f;
      switch (nalu_type) {
        case 7:
          continue;
        case 8:
          continue;
        default:
          break;
      }
      nalus.push(nalu_info);
    }

    if (!nalus.length) {
      console.log("no valid nalu");
      return undefined;
    }

    let index;
    let avcc_data_length = 0;
    for (index in nalus) {
      avcc_data_length += 4;
      avcc_data_length += nalus[index].nalu_end - nalus[index].nalu_start + 1;
    }

    let avcc_data = new Uint8Array(avcc_data_length);
    let avcc_data_offset = 0;
    for (index in nalus) {
      const nalu_length = nalus[index].nalu_end - nalus[index].nalu_start + 1;

      avcc_data[avcc_data_offset++] = (nalu_length >> 24) & 0xff;
      avcc_data[avcc_data_offset++] = (nalu_length >> 16) & 0xff;
      avcc_data[avcc_data_offset++] = (nalu_length >> 8) & 0xff;
      avcc_data[avcc_data_offset++] = nalu_length & 0xff;

      avcc_data.set(data.slice(nalus[index].nalu_start, nalus[index].nalu_end + 1), avcc_data_offset);
      avcc_data_offset += nalu_length;
    }

    return avcc_data;
  }
}