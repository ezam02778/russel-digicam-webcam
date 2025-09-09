// digicam-webcam script
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const grainImg = document.getElementById('grain');

const cameraSelect = document.getElementById('cameraSelect');
const effectSelect = document.getElementById('effectSelect');
const intensityInput = document.getElementById('intensity');
const captureBtn = document.getElementById('captureBtn');
const recordBtn = document.getElementById('recordBtn');
const outputs = document.getElementById('outputs');
const downloadLink = document.getElementById('downloadLink');

let currentStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

// Set canvas size to match display
function fitCanvasToVideo() {
  const ratio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16/9;
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || Math.round(width / ratio);
  canvas.width = width;
  canvas.height = height;
}

// camera enumerate
async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    cameraSelect.innerHTML = '';
    cams.forEach((c, i) => {
      const opt = document.createElement('option');
      opt.value = c.deviceId;
      opt.textContent = c.label || `Camera ${i+1}`;
      cameraSelect.appendChild(opt);
    });
  } catch (e) {
    console.warn('No devices', e);
  }
}

async function startCamera(deviceId) {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
  }
  const constraints = {
    audio: true,
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user"
    }
  };
  try {
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;
    await video.play();
    fitCanvasToVideo();
    requestAnimationFrame(drawFrame);
  } catch (err) {
    alert("Gagal mengakses kamera: " + err.message);
    console.error(err);
  }
}

// Effects
function applyEffect(imageData, effect, intensity) {
  const data = imageData.data;
  const w = imageData.width;
  const h = imageData.height;

  if (effect === 'none') return imageData;

  if (effect === 'grayscale') {
    for (let i=0;i<data.length;i+=4){
      const v = 0.2126*data[i] + 0.7152*data[i+1] + 0.0722*data[i+2];
      data[i] = data[i]*(1-intensity) + v*intensity;
      data[i+1] = data[i+1]*(1-intensity) + v*intensity;
      data[i+2] = data[i+2]*(1-intensity) + v*intensity;
    }
  }

  if (effect === 'sepia' || effect === 'vintage') {
    for (let i=0;i<data.length;i+=4){
      const r = data[i], g = data[i+1], b = data[i+2];
      const outR = (r*0.393 + g*0.769 + b*0.189);
      const outG = (r*0.349 + g*0.686 + b*0.168);
      const outB = (r*0.272 + g*0.534 + b*0.131);
      data[i] = r*(1-intensity) + outR*intensity;
      data[i+1] = g*(1-intensity) + outG*intensity;
      data[i+2] = b*(1-intensity) + outB*intensity;
    }
  }

  if (effect === 'invert') {
    for (let i=0;i<data.length;i+=4){
      data[i] = data[i]*(1-intensity) + (255-data[i])*intensity;
      data[i+1] = data[i+1]*(1-intensity) + (255-data[i+1])*intensity;
      data[i+2] = data[i+2]*(1-intensity) + (255-data[i+2])*intensity;
    }
  }

  if (effect === 'rgbSplit') {
    // simple chromatic shift: draw pixels with offset reading
    // We'll implement by producing a copy buffer
    const copy = new Uint8ClampedArray(data);
    const shift = Math.round(20 * intensity);
    for (let y=0;y<h;y++){
      for (let x=0;x<w;x++){
        const idx = (y*w + x)*4;
        const sxR = Math.min(w-1, Math.max(0, x - shift));
        const sxB = Math.min(w-1, Math.max(0, x + shift));
        const idxR = (y*w + sxR)*4;
        const idxB = (y*w + sxB)*4;
        data[idx]   = copy[idxR];   // R from left
        data[idx+1] = copy[idx+1];  // G stays
        data[idx+2] = copy[idxB+2]; // B from right
      }
    }
  }

  if (effect === 'scanlines') {
    // leave pixels mostly, but we'll add darker horizontal lines and vignette later in drawing stage
    for (let y=0;y<h;y++){
      if (y % 3 === 0) {
        for (let x=0;x<w;x++){
          const idx = (y*w + x)*4;
          data[idx] *= (1 - 0.25 * intensity);
          data[idx+1] *= (1 - 0.25 * intensity);
          data[idx+2] *= (1 - 0.25 * intensity);
        }
      }
    }
  }

  // small contrast/brightness tweak for vintage
  if (effect === 'vintage') {
    const contrast = 1 + 0.3 * intensity;
    const intercept = 128*(1-contrast);
    for (let i=0;i<data.length;i+=4){
      data[i] = Math.min(255, Math.max(0, data[i]*contrast + intercept));
      data[i+1] = Math.min(255, Math.max(0, data[i+1]*contrast + intercept));
      data[i+2] = Math.min(255, Math.max(0, data[i+2]*contrast + intercept));
    }
  }

  return imageData;
}

// draw loop
function drawFrame() {
  if (video.readyState >= 2) {
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      fitCanvasToVideo();
    }
    // draw video into canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // get pixels and apply effect
    let frame = ctx.getImageData(0,0,canvas.width,canvas.height);
    frame = applyEffect(frame, effectSelect.value, parseFloat(intensityInput.value));
    ctx.putImageData(frame, 0, 0);

    // extra overlays for certain effects
    if (effectSelect.value === 'vintage' || effectSelect.value === 'scanlines'){
      // vignette
      const grd = ctx.createRadialGradient(canvas.width/2, canvas.height/2, Math.min(canvas.width, canvas.height)*0.2,
                                           canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height)/1.2);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, `rgba(0,0,0,${0.45 * parseFloat(intensityInput.value)})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0,0,canvas.width,canvas.height);
    }

    if (effectSelect.value === 'scanlines') {
      // semi-transparent grain overlay if available
      if (grainImg && grainImg.complete && grainImg.naturalWidth > 0) {
        ctx.globalAlpha = 0.12 * parseFloat(intensityInput.value);
        // tile grain image across canvas
        const gw = grainImg.naturalWidth;
        const gh = grainImg.naturalHeight;
        for (let y=0;y<canvas.height;y+=gh){
          for (let x=0;x<canvas.width;x+=gw){
            ctx.drawImage(grainImg, x, y, gw, gh);
          }
        }
        ctx.globalAlpha = 1;
      } else {
        // fallback: procedural noise
        const noise = ctx.createImageData(canvas.width, canvas.height);
        for (let i=0;i<noise.data.length;i+=4){
          const v = 255 * (Math.random()*0.6 - 0.2) * parseFloat(intensityInput.value);
          noise.data[i] = noise.data[i+1] = noise.data[i+2] = v;
          noise.data[i+3] = 20; // low alpha
        }
        ctx.putImageData(noise, 0, 0);
      }
    }

    // small timestamp / overlay to get "digicam" vibe
    const now = new Date();
    ctx.font = `${Math.max(12, Math.round(canvas.width * 0.018))}px monospace`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(10, canvas.height - 34, 190, 26);
    ctx.fillStyle = '#00ff77';
    ctx.fillText(now.toLocaleString(), 14, canvas.height - 14);
  }

  requestAnimationFrame(drawFrame);
}

// capture photo
captureBtn.addEventListener('click', () => {
  const dataURL = canvas.toDataURL('image/png');
  const img = document.createElement('img');
  img.src = dataURL;

  const container = document.createElement('div');
  container.className = 'outputItem';
  const down = document.createElement('a');
  down.href = dataURL;
  down.download = `digicam_${Date.now()}.png`;
  down.textContent = 'Download Foto';
  container.appendChild(img);
  container.appendChild(down);
  outputs.prepend(container);
});

// recording
recordBtn.addEventListener('click', () => {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
});

function startRecording(){
  if (!currentStream) {
    alert('Kamera belum aktif');
    return;
  }

  // Create a stream from the canvas for recording (so recorded has effects)
  const canvasStream = canvas.captureStream(30); // fps
  // optionally add audio from original stream
  const audioTracks = currentStream.getAudioTracks();
  if (audioTracks.length) {
    canvasStream.addTrack(audioTracks[0]);
  }

  recordedChunks = [];
  const options = { mimeType: 'video/webm;codecs=vp9' };
  try {
    mediaRecorder = new MediaRecorder(canvasStream, options);
  } catch (e) {
    mediaRecorder = new MediaRecorder(canvasStream); // fallback
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const vid = document.createElement('video');
    vid.src = url;
    vid.controls = true;
    vid.playsInline = true;
    vid.muted = false;

    const dl = document.createElement('a');
    dl.href = url;
    dl.download = `digicam_${Date.now()}.webm`;
    dl.textContent = 'Download Video';

    const container = document.createElement('div');
    container.className = 'outputItem';
    container.appendChild(vid);
    container.appendChild(dl);
    outputs.prepend(container);
  };

  mediaRecorder.start();
  isRecording = true;
  recordBtn.textContent = '⏹️ Stop';
}

// stop recording
function stopRecording(){
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.textContent = '🔴 Rekam';
  }
}

// device change
cameraSelect.addEventListener('change', () => startCamera(cameraSelect.value));
effectSelect.addEventListener('change', () => {/* effect changed */});
intensityInput.addEventListener('input', () => {/* value changed */});

// initialize
(async function init(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Browser Anda tidak mendukung getUserMedia. Gunakan browser modern (Safari/Chrome terbaru).');
    return;
  }

  await listCameras();
  // try to start with first camera or default
  const firstCam = cameraSelect.options[0] ? cameraSelect.options[0].value : undefined;
  await startCamera(firstCam);
})();
