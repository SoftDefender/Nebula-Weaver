
import JSZip from 'jszip';

/**
 * Creates a Google/Android Motion Photo (Micro Video).
 * Format: JPEG file + Appended MP4 file.
 * Metadata: XMP metadata injected into JPEG header pointing to the video offset.
 */
export const createAndroidMotionPhoto = async (imageBlob: Blob, videoBlob: Blob): Promise<Blob> => {
  // 1. Construct XMP Metadata
  // GCamera:MicroVideoOffset is the bytes from the END of the file to the start of the video.
  // Since we append video at the end, Offset = Video Size.
  const videoSize = videoBlob.size;
  const xmpData = `
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.1.0-jc003">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:GCamera="http://ns.google.com/photos/1.0/camera/"
        GCamera:MotionPhoto="1"
        GCamera:MicroVideo="1"
        GCamera:MicroVideoVersion="1"
        GCamera:MicroVideoOffset="${videoSize}" />
  </rdf:RDF>
</x:xmpmeta>`;

  // 2. Construct APP1 Segment (Marker + Size + Namespace + XMP)
  // Standard JPEG APP1 Structure: [FF E1] [Size (2 bytes)] [Namespace ("http://ns.adobe.com/xap/1.0/\0")] [XMP String]
  const namespace = "http://ns.adobe.com/xap/1.0/\0";
  // Size includes the 2 size bytes themselves
  const payloadLength = 2 + namespace.length + xmpData.length;
  
  const buffer = new ArrayBuffer(4 + namespace.length + xmpData.length);
  const view = new DataView(buffer);
  
  view.setUint8(0, 0xFF);
  view.setUint8(1, 0xE1); // APP1 Marker
  view.setUint16(2, payloadLength); // Size
  
  // Write Namespace
  for(let i=0; i<namespace.length; i++) {
    view.setUint8(4+i, namespace.charCodeAt(i));
  }
  // Write XMP
  for(let i=0; i<xmpData.length; i++) {
    view.setUint8(4+namespace.length+i, xmpData.charCodeAt(i));
  }
  
  const xmpBlob = new Blob([buffer], {type: 'application/octet-stream'});

  // 3. Patch JPEG
  // We assume the standard JPEG from canvas starts with FF D8 (SOI). 
  // We insert our APP1 block right after FF D8.
  
  const imageBuffer = await imageBlob.arrayBuffer();
  const imageView = new Uint8Array(imageBuffer);
  
  // Check for valid JPEG SOI
  let startSlice: Blob;
  let endSlice: Blob;

  if (imageView[0] === 0xFF && imageView[1] === 0xD8) {
      startSlice = imageBlob.slice(0, 2); // FF D8
      endSlice = imageBlob.slice(2); // Rest of image
  } else {
      console.warn("Invalid JPEG header detected, appending data without insertion.");
      startSlice = new Blob([]);
      endSlice = imageBlob;
  }
  
  // Final Layout: [SOI] [APP1 XMP] [Rest of JPEG] [Video Data]
  return new Blob([startSlice, xmpBlob, endSlice, videoBlob], { type: 'image/jpeg' });
};

/**
 * Creates an iOS Live Photo Bundle (ZIP).
 * Contains: IMG_xxxx.JPG and IMG_xxxx.MOV.
 * Note: Authentic iOS Live Photos require matching 'ContentIdentifier' UUIDs in both files.
 * Since parsing and writing binary QuickTime atoms in JS is heavy, we provide a clean ZIP 
 * bundle as a standard export format.
 */
export const createIOSLivePhotoZip = async (imageBlob: Blob, videoBlob: Blob, filename: string): Promise<Blob> => {
   const zip = new JSZip();
   
   // Clean filename
   const cleanName = filename.replace(/[^a-z0-9]/gi, '_');
   
   zip.file(`${cleanName}.JPG`, imageBlob);
   zip.file(`${cleanName}.MOV`, videoBlob);
   
   return await zip.generateAsync({ type: 'blob' });
};
