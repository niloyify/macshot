// Records the screen (picked by the main process), the computer's sound where
// available, and the microphone, mixed into one video file.

(async () => {
  let screenStream, micStream, recorder, audioCtx;
  let chain = Promise.resolve();

  function cleanup() {
    for (const s of [screenStream, micStream]) s && s.getTracks().forEach((t) => t.stop());
    if (audioCtx) audioCtx.close();
  }

  try {
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

    // Mix every audio source into one track.
    const audioSources = [screenStream, micStream].filter((s) => s && s.getAudioTracks().length);
    const tracks = [...screenStream.getVideoTracks()];
    if (audioSources.length) {
      audioCtx = new AudioContext();
      const mix = audioCtx.createMediaStreamDestination();
      for (const s of audioSources) audioCtx.createMediaStreamSource(s).connect(mix);
      tracks.push(...mix.stream.getAudioTracks());
    }

    // MP4 where the built-in recorder supports it, WebM otherwise.
    const formats = [
      ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
      ['video/mp4', 'mp4'],
      ['video/webm;codecs=vp9,opus', 'webm'],
      ['video/webm', 'webm'],
    ];
    const [mimeType, ext] = formats.find(([m]) => MediaRecorder.isTypeSupported(m)) || ['', 'webm'];

    recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 8_000_000,
    });
    // Chunks are written one after another, in order.
    recorder.ondataavailable = (e) => {
      if (e.data.size) chain = chain.then(() => e.data.arrayBuffer()).then((buf) => window.shotkit.chunk(buf));
    };
    recorder.onstop = async () => {
      await chain;
      cleanup();
      window.shotkit.stopped(null);
    };
    // If the screen share ends by itself (screen unplugged, etc.), save what we have.
    screenStream.getVideoTracks()[0].onended = () => recorder.state !== 'inactive' && recorder.stop();

    await window.shotkit.started(ext);
    recorder.start(1000); // hand over data every second, so long recordings use little memory
    window.shotkit.onStop(() => recorder.state !== 'inactive' && recorder.stop());
  } catch (err) {
    cleanup();
    window.shotkit.stopped(String(err && err.message ? err.message : err));
  }
})();
