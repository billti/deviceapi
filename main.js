// @ts-check : See https://www.typescriptlang.org/docs/handbook/type-checking-javascript-files.html

/* Useful docs:
 * - https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
 * - https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
 */

const DEBUG = true;

// Sadly, Chrome and Safari don't overlap in what audio/video formats the can record to.
const chrome_audio_mimeType = "audio/webm;codecs=opus";
const safari_audio_mimeType = "audio/mp4;codecs=mp4a.40.2";
const chrome_video_mimeType = "video/webm;codecs=vp8,opus";
const safari_video_mimeType = "video/mp4;codecs=avc1.424028,mp4a.40.2";

function ConfigureLocationCapture() {
  /** @type HTMLButtonElement */
  let gps_button = document.querySelector("#gps_button");

  gps_button.onclick = () => {
    /** @type HTMLDivElement */
    let gps_location = document.querySelector("#gps_location");

    if (!navigator.geolocation) {
      gps_location.textContent = "Geolocation not available on this browser";
    } else {
      navigator.geolocation.getCurrentPosition(pos => {
        let locationText = `Current position: {Latitude: ${pos.coords.latitude}, Longitude: ${pos.coords.longitude}`;
        gps_location.textContent = locationText;
      }, err => {
        gps_location.textContent = "Failed to get current location";
      });
    }
  };
}

function ConfigureAudioCapture() {

  /** @type HTMLButtonElement */
  let audio_button = document.querySelector("#audio_button");
  let audio_constraints = { audio: true };

  // Once you get access to an audio stream, recording works by creating a MediaRecorder
  // on it, and calling start/stop methods on the recorder. Handle the events emitted by
  // the recorder as chunks of data are emitted, or when it is stopped.
  let audio_state = "stopped";
  let media_recorder = null;
  let media_chunks = [];

  /** @type MediaStream */
  let audio_stream = null;

  let on_media_recorder_error = (err) => {
    audio_state = "error";
    audio_button.textContent = "Error";
    audio_button.disabled = true;
    if (DEBUG) alert("Error: " + err);
  }

  let on_media_recorder_data = (e) => media_chunks.push(e.data);

  let on_media_recorder_stop = () => {
    // Create the audio blob from the chunks captured
    let blob = new Blob(media_chunks, { 'type': media_recorder.mimeType });
    let audioUrl = window.URL.createObjectURL(blob);

    // Note: To post a media file, see https://stackoverflow.com/a/60433611/1674945

    let audio = document.createElement('audio');
    audio.src = audioUrl;
    audio.controls = true;
    document.querySelector(".sound-clips").appendChild(audio);
    document.querySelector(".sound-clips").appendChild(document.createElement("br"));

    // The below is required to free up the device capture in the browser
    audio_stream.getTracks().forEach(track => track.stop());
    audio_stream = null;
    media_chunks = [];
    media_recorder = null;
  };

  audio_button.onclick = ev => {
    switch (audio_state) {
      case "stopped":
        navigator.mediaDevices.getUserMedia(audio_constraints).then(stream => {
          audio_stream = stream;

          // MediaRecorder isn't in the TypeScript type lib yet. This avoids errors.
          const MediaRecorder = window["MediaRecorder"];

          // Add a fallback for Safari, just for testing.
          // Hopefully Safari will add support for WebM and Opus soon.
          const audio_codec = MediaRecorder.isTypeSupported(chrome_audio_mimeType) ?
            chrome_audio_mimeType : safari_audio_mimeType;
          media_recorder = new MediaRecorder(audio_stream, {mimeType: audio_codec});
          media_recorder.onerror = on_media_recorder_error;
          media_recorder.ondataavailable = on_media_recorder_data;
          media_recorder.onstop = on_media_recorder_stop;

          media_recorder.start();
          audio_state = "recording";
          audio_button.textContent = "Stop";
          visualize_audio(audio_stream);
        }, err => {
          on_media_recorder_error(err);
          if (DEBUG) alert("Error: " + err);
        });
        break;
      case "recording":
        media_recorder.stop();  // This will fire the onstop event handler
        audio_state = "stopped";
        audio_button.textContent = "Record";
        break;
      default:
        console.log("Can't handle audio button click in state: " + audio_state);
    }
  };

  /**
   * Draws to a canvas element showing the audio pattern on a stream while recording
   * Based on MDN example at https://github.com/mdn/web-dictaphone/blob/gh-pages/scripts/app.js
   * @param {MediaStream} stream 
   */
  function visualize_audio(stream) {
    /** @type HTMLCanvasElement */
    let visualizer_canvas = document.querySelector('.visualizer');
    let canvasCtx = visualizer_canvas.getContext("2d");

    // Safari still uses a prefix for AudioContext
    const AudioContext = window.AudioContext || window["webkitAudioContext"];

    let audioCtx = new AudioContext();
    let source = audioCtx.createMediaStreamSource(stream);
    let analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    let bufferLength = analyser.frequencyBinCount;
    let dataArray = new Uint8Array(bufferLength);

    source.connect(analyser);
    draw()

    function draw() {
      const WIDTH = visualizer_canvas.width;
      const HEIGHT = visualizer_canvas.height;

      analyser.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = 'rgb(200, 200, 200)';
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

      // If no longer recording, return after clearing the background, and before
      // requesting another animation frame.
      if (audio_state !== "recording") {
        return;
      }

      requestAnimationFrame(draw);
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'rgb(0, 0, 0)';

      canvasCtx.beginPath();

      let sliceWidth = WIDTH * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        let v = dataArray[i] / 128.0;
        let y = v * HEIGHT / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(visualizer_canvas.width, visualizer_canvas.height / 2);
      canvasCtx.stroke();
    }
  }
}

function ConfigureVideoCapture() {
  /** @type HTMLButtonElement */
  let preview_button = document.querySelector("#preview_button");
  /** @type HTMLButtonElement */
  let flip_button = document.querySelector("#flip_button");
  /** @type HTMLButtonElement */
  let photo_button = document.querySelector("#photo_button");
  /** @type HTMLButtonElement */
  let video_button = document.querySelector("#video_button");

  /** @type HTMLVideoElement */
  let picture_preview = document.querySelector("#picture_preview");

  /** @type HTMLCanvasElement */
  let picture_capture = document.querySelector("#picture_capture");

  /** @type MediaStream */
  let video_stream = null;
  let picture_constraints = { video: { facingMode: "environment" }, audio: true };
  let back_camera = true;

  let media_recorder = null;
  let media_chunks = [];

  /** @type {"stopped" | "previewing" | "recording" | "error"} */
  let video_state = "stopped";
  let can_flip = false;

  let update_ui = () => {
    switch (video_state) {
      case "stopped":
        preview_button.textContent = "Preview";
        flip_button.disabled = true;
        photo_button.disabled = true;
        video_button.disabled = true;
        break;
      case "previewing":
        preview_button.textContent = "Close";
        flip_button.disabled = !can_flip;
        photo_button.disabled = false;
        video_button.disabled = false;
        break;
      case "recording":
        preview_button.textContent = "Stop";
        flip_button.disabled = true;
        photo_button.disabled = true;
        video_button.disabled = true;
        break;
      default:
        // Error condition
        preview_button.textContent = "Error";
        preview_button.disabled = true;
        flip_button.disabled = true;
        photo_button.disabled = true;
        video_button.disabled = true;
        break;
    }
  };

  let flip_camera = () => {
    if (video_state !== "previewing") throw "Invalid state";
    back_camera = !back_camera;
    picture_constraints.video.facingMode = back_camera ? "environment" : "user";
    stop_preview();
    start_preview();
  }

  let start_preview = () => {
    if (video_state !== "stopped") throw "Invalid state";
    navigator.mediaDevices.getUserMedia(picture_constraints).then(
      stream => {
        video_stream = stream;
        picture_preview.srcObject = video_stream;
        picture_preview.volume = 0; // Avoid the preview causing feedback
        video_state = "previewing";

        // Add the ability to switch cameras
        let video_capabilities = video_stream.getVideoTracks()[0].getCapabilities();
        can_flip = video_capabilities.facingMode && video_capabilities.facingMode.length > 0;
        update_ui();
      },
      err => {
        video_state = "error";
        update_ui();
        if (DEBUG) alert("Error: " + err);
      }
    );
  };

  let stop_preview = () => {
    if (video_state !== "previewing") throw "Invalid state";
    picture_preview.pause();
    video_stream.getTracks().forEach(stream => stream.stop());
    video_stream = null;

    picture_preview.srcObject = null;
    video_state = "stopped";
    update_ui();
  };

  let take_picture = () => {
    if (video_state !== "previewing") throw "Invalid state";
    // videoHeight and videoWidth are the actual stream height and width
    // clientHeight and clientWidth are the CSS display size of the content

    // Resize the canvas display size to the same as the video stream size
    let stream_width = picture_preview.videoWidth;
    let stream_height = picture_preview.videoHeight;
    picture_capture.setAttribute("width", stream_width.toString());
    picture_capture.setAttribute("height", stream_height.toString());

    let context2d = picture_capture.getContext("2d");
    context2d.drawImage(picture_preview, 0, 0);
    let image_data = picture_capture.toDataURL("image/png");

    // Add an image of the capture
    let img = document.createElement("img");
    img.style.width = "320px";
    img.style.height = Math.ceil(320 * (stream_height / stream_width)) + "px";
    img.src = image_data;
    document.querySelector("#pictures").appendChild(img);
  };

  let start_video = () => {
    if (video_state !== "previewing") throw "Invalid state";

    // MediaRecorder isn't in the TypeScript type lib yet. This avoids errors.
    const MediaRecorder = window["MediaRecorder"];

    // Add a fallback for Safari, just for testing.
    // Hopefully Safari will add support for WebM and Opus soon.
    const video_codec = MediaRecorder.isTypeSupported(chrome_video_mimeType) ?
      chrome_video_mimeType : safari_video_mimeType;
    media_recorder = new MediaRecorder(video_stream, { mimeType: video_codec });

    media_recorder.ondataavailable = (event) => {
      if (event.data) media_chunks.push(event.data);
    };

    media_recorder.onstop = save_video;
    media_recorder.onerror = (err) => {
      video_state = "error";
      update_ui();
      if (DEBUG) alert("Error: " + err);
    };

    media_recorder.start(1000); // Get in 1 second chunks

    video_state = "recording";
    update_ui();
  };

  let save_video = () => {
    if (video_state !== "recording") throw "Invalid state";

    let blob = new Blob(media_chunks, { 'type': media_recorder.mimeType });
    let videoUrl = window.URL.createObjectURL(blob);

    let video = document.createElement("video");
    video.src = videoUrl;
    video.controls = true;

    let stream_width = picture_preview.videoWidth;
    let stream_height = picture_preview.videoHeight;

    video.style.width = "320px";
    video.style.height = Math.ceil(320 * (stream_height / stream_width)) + "px";

    document.querySelector("#pictures").appendChild(video);

    media_chunks = [];
    media_recorder = null;
    video_state = "previewing";
    update_ui();
  };


  preview_button.onclick = (ev) => {
    switch (video_state) {
      case "stopped":
        start_preview();
        break;
      case "previewing":
        stop_preview();
        break;
      case "recording":
        media_recorder.stop(); // This will result in the save_video event handler
        break;
      default:
        if (DEBUG) alert("Invalid picture state: " + video_state);
        video_state = "error";
        update_ui();
        break;
    }
  };
  flip_button.onclick = flip_camera;
  photo_button.onclick = take_picture;
  video_button.onclick = start_video;
}

document.addEventListener("DOMContentLoaded", evt => {
  ConfigureLocationCapture();
  ConfigureAudioCapture();
  ConfigureVideoCapture();
});
