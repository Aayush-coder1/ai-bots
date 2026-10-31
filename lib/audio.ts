import type { Sandbox } from "@daytona/sdk"

// VNC carries only the picture. The desktop's sound goes to PulseAudio's
// "daytona_output" sink; its monitor is a capture of everything that plays,
// which ffmpeg encodes to MP3 and serves over HTTP on this port. The browser
// plays it next to the VNC view.
export const AUDIO_PORT = 6090
export const AUDIO_PATH = "/stream.mp3"

const PULSE_SERVER = "unix:/tmp/daytona-pulse/native"
const SCRIPT = "/tmp/daytona-audio-stream.sh"

// ffmpeg's HTTP server takes one listener at a time and exits when it leaves,
// so the loop starts it again for the next one.
const STREAM_SCRIPT = `#!/bin/bash
export PULSE_SERVER=${PULSE_SERVER}
while true; do
  ffmpeg -hide_banner -loglevel error -f pulse -i daytona_output.monitor \\
    -ac 2 -ar 44100 -c:a libmp3lame -b:a 128k -flush_packets 1 \\
    -f mp3 -content_type audio/mpeg -listen 1 http://0.0.0.0:${AUDIO_PORT}${AUDIO_PATH}
  sleep 0.5
done
`

/** Environment for programs that should play sound, such as a browser. */
export const AUDIO_ENV = { PULSE_SERVER }

/** Starts the sandbox's audio stream, unless it is already running. */
export async function ensureAudioStream(sandbox: Sandbox) {
  const running = await sandbox.process.executeCommand(
    `pgrep -f ${SCRIPT} > /dev/null`
  )
  if (running.exitCode === 0) {
    return
  }

  await sandbox.fs.uploadFile(Buffer.from(STREAM_SCRIPT), SCRIPT)
  // Started this way it outlives the command; wrapped differently it doesn't.
  await sandbox.process.executeCommand(
    `bash -c 'chmod +x ${SCRIPT} && nohup ${SCRIPT} > /tmp/daytona-audio.log 2>&1 &'`
  )
}
