// Hidden recorder page. Two kinds:
//   screen: the screen (picked by the main process) + computer sound where
//           available + microphone, mixed into one video file.
//   sound:  only the microphone (the sound around you), as an audio file.

(async () => {
  const kind = window.macshot.kind;
  let screenStream, micStream, recorder, audioCtx;
  let chain = Promise.resolve();

  function cleanup() {
    for (const s of [screenStream, micStream]) s && s.getTracks().forEach((t) => t.stop());
    if (audioCtx) audioCtx.close();
  }

  try {
    let stream, formats, bitrate;
    if (kind === 'sound') {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
      stream = micStream;
      formats = [
        ['audio/mp4;codecs=mp4a.40.2', 'm4a'],
        ['audio/mp4', 'm4a'],
        ['audio/webm;codecs=opus', 'webm'],
        ['audio/webm', 'webm'],
      ];
      bitrate = { audioBitsPerSecond: 128_000 };
    } else {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true, // the computer's sound, when the OS allows it (Windows)
      });
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: true },
        });
      } catch {
        micStream = null; // no microphone or not allowed: record without it
      }
      const audioSources = [screenStream, micStream].filter((s) => s && s.getAudioTracks().length);
      const tracks = [...screenStream.getVideoTracks()];
      if (audioSources.length) {
        audioCtx = new AudioContext();
        const mix = audioCtx.createMediaStreamDestination();
        for (const s of audioSources) audioCtx.createMediaStreamSource(s).connect(mix);
        tracks.push(...mix.stream.getAudioTracks());
      }
      stream = new MediaStream(tracks);
      formats = [
        ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
        ['video/mp4', 'mp4'],
        ['video/webm;codecs=vp9,opus', 'webm'],
        ['video/webm', 'webm'],
      ];
      bitrate = { videoBitsPerSecond: 8_000_000 };
      // If the screen share ends by itself (screen unplugged, etc.), save what we have.
      screenStream.getVideoTracks()[0].onended = () => recorder && recorder.state !== 'inactive' && recorder.stop();
    }

    const [mimeType, ext] = formats.find(([m]) => MediaRecorder.isTypeSupported(m)) || ['', 'webm'];
    recorder = new MediaRecorder(stream, { mimeType: mimeType || undefined, ...bitrate });
    // Chunks are written one after another, in order.
    recorder.ondataavailable = (e) => {
      if (e.data.size) chain = chain.then(() => e.data.arrayBuffer()).then((buf) => window.macshot.chunk(buf));
    };
    recorder.onstop = async () => {
      await chain;
      cleanup();
      window.macshot.stopped(null);
    };

    await window.macshot.started(ext);
    recorder.start(1000); // hand over data every second, so long recordings use little memory
    window.macshot.onStop(() => recorder.state !== 'inactive' && recorder.stop());
  } catch (err) {
    cleanup();
    window.macshot.stopped(String(err && err.message ? err.message : err));
  }
})();
