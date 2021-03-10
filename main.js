// @ts-check

document.addEventListener("DOMContentLoaded", evt => {

  /********** GPS location handling code *********/

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

  /********** Audio recording handling code *********/

  /** @type HTMLButtonElement */
  let audio_button = document.querySelector("#audio_button");
  let audio_constraints = { audio: true };

  // Once you get access to an audio stream, recording works by creating a MediaRecorder
  // on it, and calling start/stop methods on the recorder. Handle the events emitted by
  // the recorder as chunks of data are emitted, or when it is stopped.
  let audio_state = "stopped";
  let media_recorder = null;
  let media_chunks = [];

  let on_media_recorder_error = (err) => {
    audio_state = "error";
    audio_button.textContent = "Error";
    audio_button.disabled = true;
    console.log("Error recording audio: " + err);
  }

  let on_media_recorder_data = (e) => media_chunks.push(e.data);

  let on_media_recorder_stop = () => {
    // Create the audio blob from the chunks captured
    let blob = new Blob(media_chunks, { 'type': 'audio/ogg; codecs=opus' });
    let audioUrl = window.URL.createObjectURL(blob);

    let audio = document.createElement('audio');
    audio.src = audioUrl;
    audio.controls = true;
    document.querySelector(".sound-clips").appendChild(audio);
    // TODO: Add the clip "delete" and "post" buttons

    media_chunks = [];
    media_recorder = null;
  };

  audio_button.onclick = ev => {
    switch (audio_state) {
      case "stopped":
        // Docs: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
        // Docs: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
        navigator.mediaDevices.getUserMedia(audio_constraints).then(stream => {
          // @ts-ignore : MediaRecorder is not in the default TypeScript type library
          media_recorder = new MediaRecorder(stream);
          media_recorder.onerror = on_media_recorder_error;
          media_recorder.ondataavailable = on_media_recorder_data;
          media_recorder.onstop = on_media_recorder_stop;

          media_recorder.start();
          audio_state = "recording";
          audio_button.textContent = "Stop";
          visualize_audio(stream);
        }, err => {
          on_media_recorder_error(err);
        });
        break;
      case "recording":
        media_recorder.stop();
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

  /********** Video and picture handling code *********/

  /** @type HTMLButtonElement */
  let picture_button = document.querySelector("#picture_button");

  /** @type HTMLVideoElement */
  let picture_preview = document.querySelector("#picture_preview");

  /** @type HTMLCanvasElement */
  let picture_capture = document.querySelector("#picture_capture");

  let picture_constraints = { video: {width: 1280, height: 960, facingMode: "environment"}, audio: false };
  let picture_state = "stopped";

  picture_button.onclick = (ev) => {
    switch (picture_state) {
      case "stopped":
        navigator.mediaDevices.getUserMedia(picture_constraints).then(
          stream => {
            picture_preview.srcObject = stream;
            picture_preview.play();
            picture_button.textContent = "Take";
            picture_state = "preview";

            picture_preview.addEventListener("canplay", ev => {
              // Fired when the preview starts

              // videoHeight and videoWidth are the actual stream height and width
              // clientHeight and clientWidth are the CSS display size of the content

              // Resize the canvas display size to the same as the video stream size
              let stream_width = picture_preview.videoWidth;
              let stream_height = picture_preview.videoHeight;
              picture_capture.setAttribute("width", stream_width.toString());
              picture_capture.setAttribute("height", stream_height.toString());
            });
          },
          err => {
            console.log("Failed to open camera with error: " + err);
          }
        );
        break;
      case "preview":
        let context2d = picture_capture.getContext("2d");
        context2d.drawImage(picture_preview, 0, 0);
        let image_data = picture_capture.toDataURL("image/png");

        // Add an image of the capture
        let img = document.createElement("img");
        img.style.width = "320px";
        img.style.height = "240px";
        img.src = image_data;
        document.querySelector("#pictures").appendChild(img);

        picture_preview.pause();
        picture_preview.srcObject = null;
        picture_button.textContent = "Preview";
        picture_state = "stopped";
        break;
      default:
        console.log("Invalid picture state: " + picture_state);
        picture_button.textContent = "Error";
        picture_button.disabled = true;
        break;
    }
  };
});